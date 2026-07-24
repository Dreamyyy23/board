import assert from "node:assert/strict";
import test from "node:test";
import {
  FOXY_ALCHEMY_VIDEOS,
  SIGNAL_MAX,
  TURN_MS,
  answerChoice,
  beginGame,
  castCouncilVote,
  claimSeat,
  createRoom,
  publicRoom,
  rollTurn,
  seatPlayer,
  tuneRoll,
  useRelic,
} from "../server/game-core.mjs";

test("a room exposes six seats without leaking reconnect tokens", () => {
  const room = createRoom("NORTH", 100);
  const player = seatPlayer(room, { name: "<Fox> Dreamer" });
  const state = publicRoom(room, 100);
  assert.equal(state.players.length, 6);
  assert.equal(state.players[0].name, "Fox Dreamer");
  assert.equal("token" in state.players[0], false);
  assert.ok(player.token);
});

test("one operator may occupy all six seats through six independent sessions", () => {
  const room = createRoom("SIXES", 100);
  for (let seat = 0; seat < 6; seat += 1) {
    seatPlayer(room, {
      name: "Same Operator",
      token: `independent-session-${seat}`,
    });
  }

  assert.equal(room.players.filter(Boolean).length, 6);
  assert.equal(new Set(room.players.map((player) => player.name)).size, 1);
  assert.throws(
    () =>
      seatPlayer(room, {
        name: "Seventh Session",
        token: "independent-session-6",
      }),
    /all six seats/i,
  );
});

test("only the active seat can roll and the server owns the die", () => {
  const room = createRoom("EMBER", 100);
  const first = seatPlayer(room, { name: "First" });
  const second = seatPlayer(room, { name: "Second" });
  beginGame(room, first.token, 1_000);
  assert.equal(room.deadline, 1_000 + TURN_MS);
  assert.throws(() => rollTurn(room, second.token), /not your turn/i);
  const result = rollTurn(room, first.token, {
    now: 2_000,
    rng: () => 0,
  });
  assert.equal(result.die, 1);
  assert.equal(first.position, 1);
  assert.equal(room.currentSeat, 1);
});

test("oracle answers remain owned by the player who landed there", () => {
  const room = createRoom("ORACL", 100);
  const first = seatPlayer(room, { name: "First" });
  const second = seatPlayer(room, { name: "Second" });
  beginGame(room, first.token, 1_000);
  first.position = 8;
  const result = rollTurn(room, first.token, {
    now: 2_000,
    rng: () => 0,
  });
  assert.equal(result.pending, true);
  assert.throws(
    () => answerChoice(room, second.token, "truth"),
    /not yours/i,
  );
  answerChoice(room, first.token, "truth", { now: 3_000 });
  assert.equal(first.echoes, 3);
  assert.equal(room.currentSeat, 1);
});

test("an expired turn can be resolved only through the authority path", () => {
  const room = createRoom("CLOCK", 100);
  const player = seatPlayer(room, { name: "Late Traveler" });
  beginGame(room, player.token, 1_000);
  assert.throws(
    () => rollTurn(room, "not-the-player", { now: 1_000 + TURN_MS }),
    /not your turn/i,
  );
  const automatic = rollTurn(room, null, {
    automated: true,
    now: 1_000 + TURN_MS,
    rng: () => 0,
  });
  assert.equal(automatic.die, 1);
  assert.equal(player.position, 1);
});

test("travelers can claim an empty asymmetric mask before the game", () => {
  const room = createRoom("MASKS", 100);
  const player = seatPlayer(room, { name: "Mask Keeper" });
  claimSeat(room, player.token, 4);
  assert.equal(room.players[0], null);
  assert.equal(room.players[4].mask.id, "moss");
  assert.match(room.players[4].mask.passive, /Hearth/i);
});

test("focus tunes the server-owned die by exactly one edge", () => {
  const room = createRoom("FOCUS", 100);
  const player = seatPlayer(room, { name: "Tuner" });
  beginGame(room, player.token, 1_000);
  tuneRoll(room, player.token, 1);
  const result = rollTurn(room, player.token, {
    now: 2_000,
    rng: () => 0,
  });
  assert.equal(result.die, 2);
  assert.equal(room.lastRoll.naturalDie, 1);
  assert.equal(room.lastRoll.tuning, 1);
  assert.equal(player.focus, 0);
});

test("a council waits for every occupied human mask and resolves the vote", () => {
  const room = createRoom("VOTES", 100);
  const first = seatPlayer(room, { name: "Caller" });
  const second = seatPlayer(room, { name: "Witness" });
  beginGame(room, first.token, 1_000);
  first.position = 7;
  const result = rollTurn(room, first.token, {
    now: 2_000,
    rng: () => 0,
  });
  assert.equal(result.council, true);
  assert.ok(room.pendingCouncil);
  assert.equal(castCouncilVote(room, first.token, "stabilize", 2_100), false);
  assert.equal(castCouncilVote(room, second.token, "stabilize", 2_200), true);
  assert.equal(room.pendingCouncil, null);
  assert.equal(room.currentSeat, 1);
});

test("relics are consumed through the active-seat authority path", () => {
  const room = createRoom("RELIC", 100);
  const player = seatPlayer(room, { name: "Carrier" });
  beginGame(room, player.token, 1_000);
  player.relics.push("quiet-bell");
  room.signal = 9;
  useRelic(room, player.token, "quiet-bell");
  assert.equal(room.signal, 5);
  assert.equal(player.relics.length, 0);
  assert.equal(player.resolve, 3);
});

test("Static collapse hits every unwarded mask and consumes a ward", () => {
  const room = createRoom("STATIC", 100);
  const first = seatPlayer(room, { name: "Unwarded" });
  const second = seatPlayer(room, { name: "Warded" });
  beginGame(room, first.token, 1_000);
  first.echoes = 5;
  second.echoes = 5;
  second.warded = true;
  room.signal = SIGNAL_MAX - 1;

  rollTurn(room, first.token, { now: 2_000, rng: () => 0 });

  // Ember gains three Echoes on this deterministic Echo event, then loses two.
  assert.equal(first.echoes, 6);
  assert.equal(second.echoes, 5);
  assert.equal(second.warded, false);
  assert.equal(room.signal, 4);
  assert.equal(room.collapseCount, 1);
  assert.equal(room.hazard.title, "SIGNAL COLLAPSE");
});

test("the Veil ignores only the first Snare in each circuit", () => {
  const room = createRoom("VEILS", 100);
  const player = seatPlayer(room, { name: "Veil Walker" });
  claimSeat(room, player.token, 1);
  beginGame(room, player.token, 1_000);

  player.position = 3;
  rollTurn(room, player.token, { now: 2_000, rng: () => 0 });
  assert.equal(player.position, 4);

  player.position = 3;
  rollTurn(room, player.token, { now: 3_000, rng: () => 0 });
  assert.equal(player.position, 2);
});

test("the Ash mask cancels the normal Static rise of a safe landing", () => {
  const room = createRoom("ASHES", 100);
  const player = seatPlayer(room, { name: "Last Witness" });
  claimSeat(room, player.token, 5);
  beginGame(room, player.token, 1_000);

  rollTurn(room, player.token, { now: 2_000, rng: () => 0 });

  assert.equal(room.signal, 2);
  assert.equal(player.mask.id, "ash");
});

test("fulfilling a personal Vow grants its one-time progression reward", () => {
  const room = createRoom("VOWED", 100);
  const player = seatPlayer(room, { name: "Bent Walker" });
  beginGame(room, player.token, 1_000);

  for (let turn = 0; turn < 3; turn += 1) {
    player.position = 4;
    rollTurn(room, player.token, {
      now: 2_000 + turn * 1_000,
      rng: () => 0,
    });
  }

  assert.equal(player.vow.complete, true);
  assert.equal(player.vow.progress, 3);
  assert.equal(player.echoes, 5);
  assert.equal(player.focus, 2);
});

test("a keyed traveler with thirteen Echoes wins on completing a circuit", () => {
  const room = createRoom("RETURN", 100);
  const player = seatPlayer(room, { name: "Homecomer" });
  beginGame(room, player.token, 1_000);
  player.position = 35;
  player.echoes = 12;
  player.keys = 1;

  const result = rollTurn(room, player.token, {
    now: 2_000,
    rng: () => 0,
  });

  assert.equal(result.won, true);
  assert.equal(player.position, 0);
  assert.equal(player.laps, 1);
  assert.equal(player.echoes, 13);
  assert.equal(room.status, "finished");
  assert.equal(room.winnerSeat, player.seat);
});

test("every landing receives a random Foxy Alchemy transmission", () => {
  const room = createRoom("VIDEO", 100);
  const player = seatPlayer(room, { name: "Receiver" });
  beginGame(room, player.token, 1_000);

  const ordinary = rollTurn(room, player.token, {
    now: 2_000,
    rng: () => 0,
  });

  assert.equal(ordinary.event.videoId, FOXY_ALCHEMY_VIDEOS[0]);
  assert.equal(
    ordinary.event.videoUrl,
    `https://www.youtube.com/watch?v=${FOXY_ALCHEMY_VIDEOS[0]}`,
  );
  assert.equal(ordinary.event.videoSource, "Foxy Alchemy Studio");
  assert.equal(ordinary.event.landingSeat, player.seat);

  player.position = 7;
  const council = rollTurn(room, player.token, {
    now: 3_000,
    rng: () => 0,
  });
  assert.equal(council.council, true);
  assert.equal(council.event.videoId, FOXY_ALCHEMY_VIDEOS[0]);
  assert.equal(council.event.landingSeat, player.seat);
});
