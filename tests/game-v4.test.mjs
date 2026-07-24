import assert from "node:assert/strict";
import test from "node:test";
import {
  activateMaskPower,
  advanceCouncilReveal,
  answerChoiceV4,
  beginGameV4,
  bendRoll,
  castCouncilVoteV4,
  castTurn,
  checkQualifications,
  createRoomV4,
  executeGameCommand,
  finishTurnV4,
  giveOxygen,
  migrateRoomState,
  omenFromVideoId,
  publicRoomV4,
  reconnectPlayerV4,
  releaseSeat,
  registerSpectator,
  resolveFracture,
  seatPlayerV4,
  selectIntent,
  settleExpiredPhase,
  submitPrediction,
} from "../server/game-v4.mjs";

function setup(playerCount = 2, seed = 12345) {
  const room = createRoomV4("VFOUR", 100, undefined, { seed });
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

function castAndAccept(room, player, {
  intent = "shelter",
  targetSeat,
  rng = () => 0,
  now = 2_000,
} = {}) {
  selectIntent(room, player.token, intent, targetSeat, { now });
  castTurn(room, player.token, { now: now + 10, rng });
  return bendRoll(room, player.token, 0, { now: now + 20, rng });
}

function advanceToSeat(room, seat, now = 1_050) {
  while (room.currentSeat !== seat) {
    finishTurnV4(room, now);
    now += 1;
  }
}

test("v4 public snapshots are versioned and never expose bearer tokens", () => {
  const { room, players } = setup();
  const state = publicRoomV4(room, 1_000);
  assert.equal(state.rulesVersion, 4);
  assert.equal(state.phase, "intent");
  assert.equal(state.players.length, 6);
  assert.equal("token" in state.players[0], false);
  assert.equal(JSON.stringify(state).includes(players[0].token), false);
  assert.ok(state.features.includes("golden-threads"));
});

test("older snapshots receive explicit v4 defaults without losing progress", () => {
  const legacy = {
    code: "OLDER",
    status: "playing",
    players: Array(6).fill(null),
    currentSeat: 0,
    turnNumber: 7,
    signal: 5,
    collapseCount: 1,
    spectators: [],
    youtubeChannel: createRoomV4("TEMP").youtubeChannel,
  };
  legacy.players[0] = {
    id: "p",
    token: "secret",
    name: "Old Traveler",
    seat: 0,
    position: 12,
    echoes: 9,
    keys: 1,
    laps: 0,
    focus: 2,
    resolve: 1,
    relics: [],
    vow: { progress: 1, complete: false },
  };
  migrateRoomState(legacy, 5_000);
  assert.equal(legacy.rulesVersion, 4);
  assert.equal(legacy.players[0].echoes, 9);
  assert.equal(legacy.fractures, 1);
  assert.ok(legacy.turn);
  assert.equal(legacy.events.at(-1).type, "rules-migrated");
});

test("CLAIM creates upside without unconditional Static per cast", () => {
  const { room, players } = setup();
  castAndAccept(room, players[0], { intent: "claim" });
  assert.equal(players[0].position, 1);
  assert.equal(players[0].echoes, 4);
  assert.equal(room.signal, 2);
  assert.equal(room.currentSeat, 1);
});

test("Witness predictions remain hidden until cast and reward once per round", () => {
  const { room, players } = setup(3);
  submitPrediction(room, players[1].token, "light", { now: 1_100 });
  submitPrediction(room, players[2].token, "light", { now: 1_101 });
  const before = publicRoomV4(room, 1_102);
  assert.equal(before.turn.predictionSummary.revealed, false);
  assert.equal(before.players[1].predictionSubmitted, true);
  assert.equal(JSON.stringify(before).includes('"prediction":"light"'), false);
  selectIntent(room, players[0].token, "claim", null, { now: 1_200 });
  castTurn(room, players[0].token, { now: 1_210, rng: () => 0 });
  assert.equal(players[1].focus, 2);
  assert.equal(players[2].focus, 2);
  assert.equal(room.turn.predictionSummary.correct, 2);
});

test("Bend happens after the natural die and spends Focus only then", () => {
  const { room, players } = setup();
  players[0].position = 2;
  selectIntent(room, players[0].token, "claim", null, { now: 1_100 });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
  assert.equal(room.phase, "bend");
  assert.equal(room.turn.naturalRoll, 1);
  bendRoll(room, players[0].token, 1, { now: 1_300, rng: () => 0 });
  assert.equal(players[0].focus, 0);
  assert.equal(room.lastRoll.naturalDie, 1);
  assert.equal(room.lastRoll.die, 2);
  assert.equal(room.lastRoll.to, 4);
});

test("Give Oxygen is first-valid, once per round, and forms a Golden Thread", () => {
  const { room, players } = setup();
  players[0].position = 3;
  selectIntent(room, players[0].token, "claim", null, { now: 1_100 });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
  bendRoll(room, players[0].token, 0, { now: 1_300, rng: () => 0 });
  assert.equal(room.phase, "reaction");
  giveOxygen(room, players[1].token, { now: 1_400, rng: () => 0 });
  assert.equal(players[1].resolve, 1);
  assert.equal(players[1].goldenThreads, 1);
  assert.equal(players[1].oxygenUsedRound, 1);
  assert.equal(players[0].position, 4);
  assert.ok(room.events.some((event) => event.type === "oxygen"));
});

test("video IDs map deterministically across all six Omens", () => {
  assert.equal(omenFromVideoId("abc123"), omenFromVideoId("abc123"));
  const found = new Set();
  for (let index = 0; index < 10_000 && found.size < 6; index += 1) {
    found.add(omenFromVideoId(`video-${index}`));
  }
  assert.deepEqual(
    [...found].sort(),
    ["door", "flame", "mirror", "moth", "static", "thread"].sort(),
  );
});

test("DOOR grants a free Bend and MOTH reveals the exact natural event", () => {
  const { room, players } = setup();
  players[0].focus = 0;
  room.turn.omen = "door";
  selectIntent(room, players[0].token, "shelter", null, { now: 1_100 });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
  bendRoll(room, players[0].token, 1, { now: 1_300, rng: () => 0 });
  assert.equal(players[0].focus, 0);

  const next = room.players[room.currentSeat];
  room.turn.omen = "moth";
  selectIntent(room, next.token, "shelter", null, { now: 1_400 });
  castTurn(room, next.token, { now: 1_500, rng: () => 0 });
  assert.ok(room.turn.revealedEvents[1]);
});

test("FLAME amplifies a reward, MIRROR prevents harm, and STATIC doubles the edge", () => {
  {
    const { room, players } = setup();
    room.turn.omen = "flame";
    castAndAccept(room, players[0], { intent: "claim" });
    assert.equal(players[0].echoes, 5);
    assert.equal(room.lastEvent.omenApplied, "flame");
  }
  {
    const { room, players } = setup();
    players[0].position = 3;
    room.turn.omen = "mirror";
    const values = [0, 0.3, 0];
    const rng = () => values.shift() ?? 0;
    selectIntent(room, players[0].token, "claim", null, { now: 1_100 });
    castTurn(room, players[0].token, { now: 1_200, rng });
    bendRoll(room, players[0].token, 0, { now: 1_300, rng });
    assert.equal(room.phase, "reaction");
    assert.equal(room.pendingReaction.event.deltaEchoes, -1);
    assert.equal(room.pendingReaction.event.prevented, 1);
    assert.equal(room.pendingReaction.event.omenApplied, "mirror");
  }
  {
    const { room, players } = setup();
    room.turn.omen = "static";
    castAndAccept(room, players[0], { intent: "claim" });
    assert.equal(players[0].echoes, 5);
    assert.equal(room.signal, 3);
    assert.equal(room.lastEvent.omenApplied, "static");
  }
});

test("THREAD makes Oxygen free and grants both travelers a Thread", () => {
  const { room, players } = setup();
  players[0].position = 3;
  room.turn.omen = "thread";
  selectIntent(room, players[0].token, "claim", null, { now: 1_100 });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
  bendRoll(room, players[0].token, 0, { now: 1_300, rng: () => 0 });
  giveOxygen(room, players[1].token, { now: 1_400, rng: () => 0 });
  assert.equal(players[1].resolve, 2);
  assert.equal(players[1].goldenThreads, 1);
  assert.equal(players[0].goldenThreads, 1);
});

test("Fractures install visible round modifiers and the third gives the House victory", () => {
  const { room, players } = setup();
  players[0].position = 4;
  room.signal = 11;
  castAndAccept(room, players[0], { intent: "claim" });
  assert.equal(room.phase, "fracture");
  assert.equal(room.fractures, 1);
  assert.equal(room.signal, 3);
  assert.ok(room.fractureModifier);
  resolveFracture(room, room.deadline + 1);

  room.fractures = 2;
  room.collapseCount = 2;
  room.signal = 11;
  const active = room.players[room.currentSeat];
  active.position = 4;
  castAndAccept(room, active, { intent: "claim", now: 4_000 });
  assert.equal(room.status, "finished");
  assert.equal(room.houseVictory, true);
  assert.equal(room.fractures, 3);
});

test("qualification finishes the round, then gives every traveler one Final Orbit turn", () => {
  const { room, players } = setup();
  players[0].echoes = 14;
  players[0].keys = 1;
  players[0].laps = 1;
  checkQualifications(room, 2_000, "test");
  assert.equal(room.endgame.mode, "qualification-pending");
  finishTurnV4(room, 2_100);
  finishTurnV4(room, 2_200);
  assert.equal(room.endgame.mode, "final-orbit");
  assert.equal(room.roundState.participantSeats.length, 2);
  finishTurnV4(room, 2_300);
  finishTurnV4(room, 2_400);
  assert.equal(room.status, "finished");
  assert.equal(room.winnerSeat, 0);
  assert.equal(room.chronicle.winnerMask, "EMBER");
});

test("round twelve always opens one mandatory final round and then the House wins", () => {
  const { room } = setup();
  room.round = 12;
  room.roundState = { participantSeats: [0, 1], takenSeats: [1] };
  room.currentSeat = 0;
  finishTurnV4(room, 2_000);
  assert.equal(room.endgame.mode, "hard-final");
  assert.equal(room.round, 13);
  finishTurnV4(room, 2_100);
  finishTurnV4(room, 2_200);
  assert.equal(room.status, "finished");
  assert.equal(room.houseVictory, true);
  assert.ok(room.chronicle.highlights.length > 0);
});

test("Moon, Ember, Thorn, Veil, Moss, and Ash all have authoritative timing", () => {
  {
    const { room, players } = setup(6);
    advanceToSeat(room, 3);
    activateMaskPower(
      room,
      players[3].token,
      { results: [1, 2] },
      { now: 1_100, rng: () => 0 },
    );
    assert.equal(Object.keys(room.turn.revealedEvents).length, 2);
  }
  {
    const { room, players } = setup();
    selectIntent(room, players[0].token, "claim", null, { now: 1_100 });
    castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
    activateMaskPower(room, players[0].token, {}, { now: 1_300, rng: () => 0 });
    assert.equal(players[0].position, 3);
    assert.equal(players[0].maskCharge, 0);
  }
  {
    const { room, players } = setup(6);
    advanceToSeat(room, 2);
    selectIntent(room, players[2].token, "claim", null, { now: 1_100 });
    castTurn(room, players[2].token, { now: 1_200, rng: () => 0 });
    activateMaskPower(
      room,
      players[2].token,
      { delta: 1 },
      { now: 1_300, rng: () => 0 },
    );
    assert.equal(players[2].position, 2);
  }
  {
    const { room, players } = setup(6);
    advanceToSeat(room, 5);
    room.lastResolvedEvent = {
      id: "kept-event",
      title: "Kept Event",
      body: "The prior event remains.",
      tone: "quiet",
      deltaEchoes: 1,
    };
    activateMaskPower(room, players[5].token, {}, { now: 1_100 });
    selectIntent(room, players[5].token, "shelter", null, { now: 1_200 });
    castTurn(room, players[5].token, { now: 1_300, rng: () => 0 });
    bendRoll(room, players[5].token, 0, {
      now: 1_400,
      rng: () => 0,
      useAshEvent: true,
    });
    assert.equal(room.events.some((event) => event.title === "Kept Event"), true);
  }
  {
    const { room, players } = setup(6);
    players[0].position = 3;
    selectIntent(room, players[0].token, "claim", null, { now: 1_100 });
    castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
    bendRoll(room, players[0].token, 0, { now: 1_300, rng: () => 0 });
    activateMaskPower(room, players[1].token, {}, { now: 1_400, rng: () => 0 });
    assert.equal(players[1].maskCharge, 0);
  }
  {
    const { room, players } = setup(6);
    players[0].position = 3;
    selectIntent(room, players[0].token, "claim", null, { now: 1_100 });
    castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
    bendRoll(room, players[0].token, 0, { now: 1_300, rng: () => 0 });
    activateMaskPower(room, players[4].token, {}, { now: 1_400, rng: () => 0 });
    assert.equal(players[4].goldenThreads, 1);
  }
});

test("Council votes stay secret and reveal in deterministic seat order", () => {
  const { room, players } = setup();
  players[0].position = 7;
  castAndAccept(room, players[0], { intent: "shelter" });
  assert.equal(room.phase, "council-vote");
  castCouncilVoteV4(room, players[0].token, "watch", 2_100);
  let state = publicRoomV4(room, 2_100);
  assert.deepEqual(state.pendingCouncil.votedSeats, [0]);
  assert.equal("votes" in state.pendingCouncil, false);
  castCouncilVoteV4(room, players[1].token, "open", 2_200);
  state = publicRoomV4(room, 2_200);
  assert.equal(state.phase, "council-reveal");
  assert.deepEqual(state.pendingCouncil.revealedVotes, []);
  advanceCouncilReveal(room, 2_300);
  assert.deepEqual(publicRoomV4(room, 2_300).pendingCouncil.revealedVotes, [
    { seat: 0, choiceId: "watch" },
  ]);
  advanceCouncilReveal(room, 2_400);
  assert.equal(room.pendingCouncil, null);
});

test("Oracle choices can attach visible future costs", () => {
  const { room, players } = setup();
  players[0].position = 8;
  castAndAccept(room, players[0], { intent: "claim" });
  assert.equal(room.phase, "oracle");
  const first = room.pendingChoice.event.choices[0];
  answerChoiceV4(room, players[0].token, first.id, { now: 2_100 });
  assert.ok(players[0].burdens.length >= 1);
});

test("spectator predictions are registered, rate-limited, and token-private", () => {
  const { room } = setup();
  const spectator = registerSpectator(room, {
    name: "Audience",
    token: "spectator-secret",
  });
  submitPrediction(room, spectator.token, "light", { now: 1_100 });
  assert.throws(
    () => submitPrediction(room, spectator.token, "teeth", { now: 1_200 }),
    /already spoken/i,
  );
  assert.equal(JSON.stringify(publicRoomV4(room)).includes(spectator.token), false);
});

test("command IDs make retried mutations idempotent", () => {
  const { room, players } = setup();
  const payload = {
    token: players[0].token,
    commandId: "intent-1",
    intent: "claim",
  };
  const first = executeGameCommand(room, "select_intent", payload, { now: 1_100 });
  const eventCount = room.events.length;
  const second = executeGameCommand(room, "select_intent", payload, { now: 1_101 });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(room.events.length, eventCount);
});

test("human phase timeouts choose safe defaults and bot turns settle without waiting", () => {
  const { room } = setup();
  const firstDeadline = room.deadline;
  assert.equal(settleExpiredPhase(room, firstDeadline, { rng: () => 0 }), true);
  assert.equal(room.phase, "bend");
  assert.equal(room.turn.intent, "shelter");
  assert.equal(settleExpiredPhase(room, room.deadline, { rng: () => 0 }), true);
  assert.equal(room.currentSeat, 1);

  const botRoom = createRoomV4("BOTS", 100, undefined, { seed: 7 });
  const host = seatPlayerV4(
    botRoom,
    { name: "Host", token: "host-token" },
    100,
  );
  seatPlayerV4(
    botRoom,
    { name: "Echo", token: "bot-token", bot: true },
    101,
  );
  beginGameV4(botRoom, host.token, 1_000);
  finishTurnV4(botRoom, 1_100);
  assert.equal(botRoom.players[botRoom.currentSeat].bot, true);
  assert.equal(settleExpiredPhase(botRoom, 1_101, { rng: () => 0 }), true);
  assert.equal(botRoom.phase, "bend");
  assert.ok(botRoom.turn.intent);
});

test("reconnect preserves the active phase and an emptied round returns safely to lobby", () => {
  const { room, players } = setup();
  selectIntent(room, players[0].token, "bind", players[1].seat, {
    now: 1_100,
  });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
  const before = publicRoomV4(room, 1_250);
  reconnectPlayerV4(room, players[0].token, "socket-returned", 1_260);
  const after = publicRoomV4(room, 1_270);
  assert.equal(before.phase, "bend");
  assert.equal(after.phase, "bend");
  assert.equal(after.turn.id, before.turn.id);
  assert.equal(after.players[0].online, true);

  releaseSeat(room, players[0].token, 1_300);
  releaseSeat(room, players[1].token, 1_400);
  assert.equal(room.status, "lobby");
  assert.equal(room.phase, "lobby");
  assert.equal(room.currentSeat, null);
});

test("spectators may Witness but can never exercise player authority", () => {
  const { room } = setup();
  const spectator = registerSpectator(room, {
    name: "Witness",
    token: "witness-only",
  });
  submitPrediction(room, spectator.token, "light", { now: 1_100 });
  assert.throws(
    () => selectIntent(room, spectator.token, "claim", null, { now: 1_200 }),
    /turn|seat|occupied/i,
  );
  assert.equal(room.turn.intent, null);
});

test("all six behavioral vows complete through their authored behavior and restore charge", () => {
  {
    const { room, players } = setup(6);
    players[0].vow.progress = 2;
    players[0].position = 4;
    castAndAccept(room, players[0], { intent: "claim" });
    assert.equal(players[0].vow.complete, true);
    assert.equal(players[0].maskCharge, 1);
  }
  {
    const { room, players } = setup(6);
    advanceToSeat(room, 1);
    players[1].vow.progress = 2;
    players[1].position = 3;
    selectIntent(room, players[1].token, "claim", null, { now: 1_100 });
    castTurn(room, players[1].token, { now: 1_200, rng: () => 0 });
    bendRoll(room, players[1].token, 0, { now: 1_300, rng: () => 0 });
    assert.equal(players[1].vow.complete, true);
    assert.equal(players[1].maskCharge, 1);
  }
  {
    const { room, players } = setup(6);
    advanceToSeat(room, 2);
    players[2].vow.progress = 1;
    players[2].position = 7;
    selectIntent(room, players[2].token, "claim", null, { now: 1_100 });
    castTurn(room, players[2].token, { now: 1_200, rng: () => 0 });
    activateMaskPower(
      room,
      players[2].token,
      { delta: 1 },
      { now: 1_300, rng: () => 0 },
    );
    const choice = room.pendingChoice.event.choices[0];
    answerChoiceV4(room, players[2].token, choice.id, {
      now: 1_400,
      rng: () => 0,
    });
    assert.equal(players[2].vow.complete, true);
    assert.equal(players[2].maskCharge, 1);
  }
  {
    const { room, players } = setup(6);
    advanceToSeat(room, 3);
    players[3].vow.progress = 2;
    activateMaskPower(
      room,
      players[3].token,
      { results: [1, 2] },
      { now: 1_100, rng: () => 0 },
    );
    selectIntent(room, players[3].token, "shelter", null, { now: 1_200 });
    castTurn(room, players[3].token, { now: 1_300, rng: () => 0 });
    bendRoll(room, players[3].token, 1, { now: 1_400, rng: () => 0 });
    assert.equal(players[3].vow.complete, true);
    assert.equal(players[3].maskCharge, 1);
  }
  {
    const { room, players } = setup(6);
    players[4].vow.progress = 1;
    players[0].position = 3;
    selectIntent(room, players[0].token, "claim", null, { now: 1_100 });
    castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
    bendRoll(room, players[0].token, 0, { now: 1_300, rng: () => 0 });
    giveOxygen(room, players[4].token, { now: 1_400, rng: () => 0 });
    assert.equal(players[4].vow.complete, true);
    assert.equal(players[4].maskCharge, 1);
  }
  {
    const { room, players } = setup(6);
    advanceToSeat(room, 5);
    players[5].vow.progress = 1;
    room.lastResolvedEvent = {
      id: "remembered-light",
      title: "Remembered Light",
      body: "A harmless event remains.",
      tone: "quiet",
      deltaEchoes: 1,
      staticDelta: 0,
      sourceKind: "echo",
      sourceClass: "light",
    };
    activateMaskPower(room, players[5].token, {}, { now: 1_100 });
    selectIntent(room, players[5].token, "shelter", null, { now: 1_200 });
    castTurn(room, players[5].token, { now: 1_300, rng: () => 0 });
    bendRoll(room, players[5].token, 0, {
      now: 1_400,
      rng: () => 0,
      useAshEvent: true,
    });
    assert.equal(players[5].vow.complete, true);
    assert.equal(players[5].maskCharge, 1);
  }

  assert.deepEqual(
    setup(6).players.map((player) => player.vow.target),
    [3, 3, 2, 3, 2, 2],
  );
});

test("finished public state exposes a token-free Chronicle with decisive highlights", () => {
  const { room } = setup();
  room.round = 12;
  room.roundState = { participantSeats: [0, 1], takenSeats: [1] };
  room.currentSeat = 0;
  finishTurnV4(room, 2_000);
  finishTurnV4(room, 2_100);
  finishTurnV4(room, 2_200);
  const state = publicRoomV4(room, 2_300);
  assert.equal(state.status, "finished");
  assert.equal(state.chronicle.outcome, "house");
  assert.equal(state.chronicle.rulesVersion, 4);
  assert.ok(state.chronicle.decisiveTurn);
  assert.ok(state.chronicle.highlights.length > 0);
  assert.equal(JSON.stringify(state.chronicle).includes("token-"), false);
});
