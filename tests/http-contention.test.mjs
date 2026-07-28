import assert from "node:assert/strict";
import test from "node:test";
import {
  beginGameV4,
  bendRoll,
  castTurn,
  createRoomV4,
  seatPlayerV4,
  selectIntent,
} from "../server/game-v4.mjs";
import { handleAuthorityRequest } from "../server/http-authority.mjs";

/**
 * A miniature D1 with real compare-and-swap semantics. Every read waits one
 * timer tick, so a Promise.all of simultaneous commands is guaranteed to load
 * the SAME row version before any of them writes — the worst-case pileup the
 * production authority must absorb by retrying server-side.
 */
class FakeD1 {
  constructor() {
    this.rows = new Map();
    this.conflicts = 0;
  }

  prepare(sql) {
    const statement = (args) => ({
      run: async () => this.run(sql, args),
      first: async () => this.first(sql, args),
    });
    return {
      bind: (...args) => statement(args),
      run: async () => this.run(sql, []),
      first: async () => this.first(sql, []),
    };
  }

  async first(sql, args) {
    // Snapshot at call time, deliver after a timer tick: simultaneous
    // requests therefore all observe the SAME row version before any of
    // them writes, exactly like racing reads against a remote D1.
    const [code, now] = args;
    const row = this.rows.get(code);
    const snapshot =
      !row || row.expires_at <= now
        ? null
        : { state: row.state, version: row.version };
    await new Promise((resolve) => setTimeout(resolve, 1));
    return snapshot;
  }

  async run(sql, args) {
    if (sql.includes("CREATE TABLE")) return { meta: { changes: 0 } };
    if (sql.trim().startsWith("DELETE")) {
      for (const [code, row] of this.rows) {
        if (row.expires_at <= args[0]) this.rows.delete(code);
      }
      return { meta: { changes: 0 } };
    }
    if (sql.trim().startsWith("INSERT")) {
      const [code, state, expiresAt, updatedAt] = args;
      if (this.rows.has(code)) {
        throw new Error("UNIQUE constraint failed: obscur_rooms.code");
      }
      this.rows.set(code, {
        state,
        version: 1,
        expires_at: expiresAt,
        updated_at: updatedAt,
      });
      return { meta: { changes: 1 } };
    }
    if (sql.trim().startsWith("UPDATE")) {
      const [state, expiresAt, updatedAt, code, version] = args;
      const row = this.rows.get(code);
      if (!row || row.version !== version) {
        this.conflicts += 1;
        return { meta: { changes: 0 } };
      }
      row.state = state;
      row.version = version + 1;
      row.expires_at = expiresAt;
      row.updated_at = updatedAt;
      return { meta: { changes: 1 } };
    }
    throw new Error(`FakeD1 does not understand: ${sql}`);
  }
}

function storeRoom(db, room) {
  db.rows.set(room.code, {
    state: JSON.stringify({
      ...room,
      spectators: Array.from(room.spectators || []),
    }),
    version: 1,
    expires_at: Date.now() + 24 * 60 * 60_000,
    updated_at: Date.now(),
  });
}

function craftTable(code, seed) {
  const now = Date.now();
  const room = createRoomV4(code, now - 10_000, undefined, { seed });
  const tokens = [];
  for (let seat = 0; seat < 6; seat += 1) {
    tokens.push(
      seatPlayerV4(
        room,
        { name: `Traveler ${seat + 1}`, token: `contend-${code}-${seat}` },
        now - 9_000,
      ).token,
    );
  }
  beginGameV4(room, tokens[0], now - 1_000);
  return { room, tokens, now };
}

async function post(env, action, payload) {
  const request = new Request("https://authority.test/api/authority", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const response = await handleAuthorityRequest(request, env);
  return { status: response.status, body: await response.json() };
}

test("five simultaneous Witness submissions each record exactly once", async () => {
  const db = new FakeD1();
  const { room, tokens } = craftTable("WITNS", 11);
  storeRoom(db, room);
  const env = { DB: db };

  const replies = await Promise.all(
    [1, 2, 3, 4, 5].map((seat) =>
      post(env, "submit_prediction", {
        code: room.code,
        token: tokens[seat],
        prediction: ["light", "threshold", "teeth"][seat % 3],
        commandId: `witness-${seat}`,
      }),
    ),
  );

  for (const reply of replies) {
    assert.equal(reply.status, 200);
    assert.equal(reply.body.ok, true);
  }
  assert.ok(db.conflicts > 0, "the fake D1 must actually produce contention");

  const state = await post(env, "get_state", { code: room.code });
  const submitted = state.body.state.players.filter(
    (player) => player && player.predictionSubmitted,
  );
  assert.equal(submitted.length, 5);
  assert.equal(state.body.state.turn.predictionSummary.total, 5);
  assert.equal(state.body.state.turn.predictionSummary.revealed, false);
});

test("six simultaneous Council votes each record exactly once and open the reveal", async () => {
  const db = new FakeD1();
  const { room, tokens, now } = craftTable("COUNC", 23);
  // Walk seat 0 onto the Council space (position 7 + natural 1 = 8).
  room.players[0].position = 7;
  selectIntent(room, tokens[0], "shelter", null, { now: now - 900 });
  castTurn(room, tokens[0], { now: now - 800, rng: () => 0 });
  bendRoll(room, tokens[0], 0, { now: now - 700, rng: () => 0 });
  assert.equal(room.phase, "council-vote");
  storeRoom(db, room);
  const env = { DB: db };

  const choices = ["watch", "open", "knot"];
  const replies = await Promise.all(
    [0, 1, 2, 3, 4, 5].map((seat) =>
      post(env, "vote_council", {
        code: room.code,
        token: tokens[seat],
        choiceId: choices[seat % 3],
        commandId: `stone-${seat}`,
      }),
    ),
  );

  for (const reply of replies) {
    assert.equal(reply.status, 200);
    assert.equal(reply.body.ok, true);
  }

  const state = await post(env, "get_state", { code: room.code });
  const council = state.body.state.pendingCouncil;
  assert.ok(council, "the Council must survive all six stones");
  assert.equal(council.stage, "reveal");
  assert.equal(new Set(council.votedSeats).size, 6);
  assert.equal("votes" in council, false);
});

test("an Oxygen race produces one winner and calm already-resolved replies", async () => {
  const db = new FakeD1();
  const { room, tokens, now } = craftTable("OXYGN", 31);
  // Walk seat 0 onto a Snare (position 3 + natural 1 = 4) and open the
  // five-second reaction window for every other traveler.
  room.players[0].position = 3;
  selectIntent(room, tokens[0], "claim", null, { now: now - 900 });
  castTurn(room, tokens[0], { now: now - 800, rng: () => 0 });
  bendRoll(room, tokens[0], 0, { now: now - 700, rng: () => 0 });
  assert.equal(room.phase, "reaction");
  assert.equal(room.pendingReaction.victimSeat, 0);
  storeRoom(db, room);
  const env = { DB: db };

  const replies = await Promise.all(
    [1, 2, 3, 4, 5].map((seat) =>
      post(env, "give_oxygen", {
        code: room.code,
        token: tokens[seat],
        commandId: `oxygen-${seat}`,
      }),
    ),
  );

  const winners = replies.filter((reply) => reply.body.ok === true);
  const losers = replies.filter((reply) => reply.body.ok === false);
  assert.equal(winners.length, 1, "exactly one helper wins the race");
  assert.equal(losers.length, 4);
  for (const loser of losers) {
    assert.notEqual(loser.status, 400, "contention is never a generic 400");
    assert.equal(loser.body.alreadyResolved, true);
    assert.ok(loser.body.state, "losers receive the current table state");
    assert.ok(loser.body.error);
  }

  const state = await post(env, "get_state", { code: room.code });
  const oxygenEvents = state.body.state.events.filter(
    (event) => event.type === "oxygen",
  );
  assert.equal(oxygenEvents.length, 1, "the rescue happened exactly once");
});

test("retried duplicates of a saved command stay idempotent across contention", async () => {
  const db = new FakeD1();
  const { room, tokens } = craftTable("DUPLI", 47);
  storeRoom(db, room);
  const env = { DB: db };

  const payload = {
    code: room.code,
    token: tokens[0],
    intent: "claim",
    commandId: "intent-once",
  };
  const [first, second] = await Promise.all([
    post(env, "select_intent", payload),
    post(env, "select_intent", payload),
  ]);
  const bodies = [first.body, second.body];
  const applied = bodies.filter((body) => body.ok && !body.duplicate);
  const duplicates = bodies.filter((body) => body.ok && body.duplicate);
  assert.equal(applied.length, 1);
  assert.equal(duplicates.length, 1);

  const state = await post(env, "get_state", { code: room.code });
  assert.equal(state.body.state.turn.intent, "claim");
  const intentEvents = state.body.state.events.filter(
    (event) => event.type === "intent",
  );
  assert.equal(intentEvents.length, 1);
});
