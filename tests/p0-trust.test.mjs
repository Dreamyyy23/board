import assert from "node:assert/strict";
import test from "node:test";
import {
  activateMaskPower,
  activateRelicV4,
  beginGameV4,
  bendRoll,
  castTurn,
  createRoomV4,
  executeGameCommand,
  finishTurnV4,
  seatPlayerV4,
  selectIntent,
  settleExpiredPhase,
} from "../server/game-v4.mjs";

function setup(playerCount = 2, seed = 12345) {
  const room = createRoomV4("TRUST", 100, undefined, { seed });
  const players = [];
  for (let seat = 0; seat < playerCount; seat += 1) {
    players.push(
      seatPlayerV4(
        room,
        { name: `Traveler ${seat + 1}`, token: `token-${seat}` },
        100 + seat,
      ),
    );
  }
  beginGameV4(room, players[0].token, 1_000);
  return { room, players };
}

function reachBend(room, player, { rng = () => 0, intent = "shelter" } = {}) {
  selectIntent(room, player.token, intent, null, { now: 1_100 });
  castTurn(room, player.token, { now: 1_200, rng });
  assert.equal(room.phase, "bend");
}

test("a paid Bend that cannot change the result is rejected before Focus is spent", () => {
  {
    const { room, players } = setup();
    reachBend(room, players[0], { rng: () => 0 });
    assert.equal(room.turn.naturalRoll, 1);
    const focusBefore = players[0].focus;
    const eventsBefore = room.events.length;
    assert.throws(
      () => bendRoll(room, players[0].token, -1, { now: 1_300, rng: () => 0 }),
      /no lower edge/i,
    );
    assert.equal(players[0].focus, focusBefore);
    assert.equal(players[0].statistics.bends, 0);
    assert.equal(room.events.length, eventsBefore);
    assert.equal(room.phase, "bend");
    assert.equal(room.turn.finalRoll, 1);
    // The legal +1 still works and costs exactly one Focus.
    bendRoll(room, players[0].token, 1, { now: 1_310, rng: () => 0 });
    assert.equal(players[0].focus, focusBefore - 1);
  }
  {
    const { room, players } = setup();
    reachBend(room, players[0], { rng: () => 0.999 });
    assert.equal(room.turn.naturalRoll, 6);
    const focusBefore = players[0].focus;
    assert.throws(
      () =>
        bendRoll(room, players[0].token, 1, { now: 1_300, rng: () => 0.999 }),
      /no higher edge/i,
    );
    assert.equal(players[0].focus, focusBefore);
    assert.equal(room.phase, "bend");
  }
});

test("a DOOR-Omen free Bend is not consumed by an impossible edge", () => {
  const { room, players } = setup();
  room.turn.omen = "door";
  players[0].focus = 0;
  reachBend(room, players[0], { rng: () => 0 });
  assert.throws(
    () => bendRoll(room, players[0].token, -1, { now: 1_300, rng: () => 0 }),
    /no lower edge/i,
  );
  assert.equal(room.turn.freeBendUsed, false);
  bendRoll(room, players[0].token, 1, { now: 1_310, rng: () => 0 });
  assert.equal(players[0].focus, 0);
});

test("Thorn's Crooked Road rejects edge no-ops and keeps its only charge", () => {
  const { room, players } = setup(6);
  let clock = 1_050;
  while (room.currentSeat !== 2) {
    finishTurnV4(room, clock);
    clock += 1;
  }
  assert.equal(room.currentSeat, 2);
  const thorn = players[2];
  reachBend(room, thorn, { rng: () => 0 });
  assert.equal(room.turn.naturalRoll, 1);
  assert.equal(thorn.maskCharge, 1);
  assert.throws(
    () =>
      activateMaskPower(
        room,
        thorn.token,
        { delta: -1 },
        { now: 1_300, rng: () => 0 },
      ),
    /cannot bend past the road's edge/i,
  );
  assert.equal(thorn.maskCharge, 1);
  assert.equal(room.phase, "bend");
  activateMaskPower(room, thorn.token, { delta: 1 }, { now: 1_310, rng: () => 0 });
  assert.equal(thorn.maskCharge, 0);
});

test("bot settlement never attempts a paid no-op at either die edge", () => {
  for (const roll of [() => 0, () => 0.999]) {
    const room = createRoomV4("BOTSA", 100, undefined, { seed: 3 });
    const host = seatPlayerV4(room, { name: "Host", token: "host" }, 100);
    seatPlayerV4(room, { name: "Echo", token: "bot-a", bot: true }, 101);
    beginGameV4(room, host.token, 1_000);
    // Host turn settles by timeout, then the bot turn runs at both extremes.
    assert.equal(settleExpiredPhase(room, room.deadline, { rng: roll }), true);
    assert.equal(settleExpiredPhase(room, room.deadline, { rng: roll }), true);
    let guard = 0;
    while (room.players[room.currentSeat]?.bot && guard < 12) {
      assert.doesNotThrow(() =>
        settleExpiredPhase(room, room.deadline ?? Date.now(), { rng: roll }),
      );
      guard += 1;
    }
  }
});

test("the first accepted Intent is immutable for the turn", () => {
  const { room, players } = setup();
  selectIntent(room, players[0].token, "claim", null, { now: 1_100 });
  const eventsBefore = room.events.length;
  assert.throws(
    () => selectIntent(room, players[0].token, "shelter", null, { now: 1_150 }),
    /already locked/i,
  );
  assert.throws(
    () =>
      selectIntent(room, players[0].token, "bind", players[1].seat, {
        now: 1_160,
      }),
    /already locked/i,
  );
  assert.equal(room.turn.intent, "claim");
  assert.equal(room.turn.bindTargetSeat, null);
  assert.equal(players[0].statistics.intents.claim, 1);
  assert.equal(players[0].statistics.intents.shelter, 0);
  assert.equal(players[0].statistics.intents.bind, 0);
  assert.equal(room.events.length, eventsBefore);
});

test("a different second Intent command is rejected while an identical retry stays idempotent", () => {
  const { room, players } = setup();
  const first = executeGameCommand(
    room,
    "select_intent",
    { token: players[0].token, commandId: "intent-a", intent: "claim" },
    { now: 1_100 },
  );
  assert.equal(first.duplicate, false);
  const retry = executeGameCommand(
    room,
    "select_intent",
    { token: players[0].token, commandId: "intent-a", intent: "claim" },
    { now: 1_110 },
  );
  assert.equal(retry.duplicate, true);
  assert.throws(
    () =>
      executeGameCommand(
        room,
        "select_intent",
        { token: players[0].token, commandId: "intent-b", intent: "shelter" },
        { now: 1_120 },
      ),
    /already locked/i,
  );
  assert.equal(players[0].statistics.intents.claim, 1);
  assert.equal(players[0].statistics.intents.shelter, 0);
});

test("an Oracle SHELTER oath cannot be consumed and then replaced", () => {
  const { room, players } = setup();
  players[0].burdens.push({ id: "must-shelter", title: "Oracle Oath" });
  assert.throws(
    () => selectIntent(room, players[0].token, "claim", null, { now: 1_100 }),
    /oath requires shelter/i,
  );
  selectIntent(room, players[0].token, "shelter", null, { now: 1_110 });
  assert.equal(
    players[0].burdens.some((burden) => burden.id === "must-shelter"),
    false,
  );
  // The oath is spent, but the lock keeps CLAIM/BIND out for the turn.
  assert.throws(
    () => selectIntent(room, players[0].token, "claim", null, { now: 1_120 }),
    /already locked/i,
  );
  assert.equal(room.turn.intent, "shelter");
});

test("Mirror Shard answers during the owner's own reaction window", () => {
  const { room, players } = setup();
  players[0].relics = ["mirror-shard"];
  players[0].position = 3;
  selectIntent(room, players[0].token, "claim", null, { now: 1_100 });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
  bendRoll(room, players[0].token, 0, { now: 1_300, rng: () => 0 });
  assert.equal(room.phase, "reaction");
  assert.equal(room.pendingReaction.victimSeat, 0);
  const harmBefore = ["deltaEchoes", "deltaResolve", "move"]
    .map((field) =>
      Math.max(0, -Number(room.pendingReaction.event[field] || 0)),
    )
    .reduce((total, amount) => total + amount, 0);
  assert.ok(harmBefore > 0);
  activateRelicV4(room, players[0].token, "mirror-shard", {
    now: 1_400,
    rng: () => 0,
  });
  assert.equal(players[0].relics.includes("mirror-shard"), false);
  assert.equal(room.pendingReaction, null);
  assert.ok(
    room.events.some(
      (event) => event.type === "relic" && /mirror shard/i.test(event.title),
    ),
  );
});

test("Quiet Bell and Foxfire Lens stay Intent-only; Mirror Shard wards during Intent", () => {
  {
    const { room, players } = setup();
    players[0].relics = ["quiet-bell"];
    players[0].position = 3;
    selectIntent(room, players[0].token, "claim", null, { now: 1_100 });
    castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
    bendRoll(room, players[0].token, 0, { now: 1_300, rng: () => 0 });
    assert.equal(room.phase, "reaction");
    assert.throws(
      () =>
        activateRelicV4(room, players[0].token, "quiet-bell", { now: 1_400 }),
      /quiet during this phase/i,
    );
    assert.deepEqual(players[0].relics, ["quiet-bell"]);
  }
  {
    const { room, players } = setup();
    players[0].relics = ["mirror-shard"];
    activateRelicV4(room, players[0].token, "mirror-shard", { now: 1_100 });
    assert.equal(players[0].warded, true);
  }
  {
    const { room, players } = setup();
    players[0].relics = ["foxfire-lens"];
    activateRelicV4(room, players[0].token, "foxfire-lens", {
      now: 1_100,
      results: [2, 5],
      rng: () => 0,
    });
    assert.equal(Object.keys(room.turn.revealedEvents).length, 2);
  }
});
