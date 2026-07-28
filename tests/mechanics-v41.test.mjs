import assert from "node:assert/strict";
import test from "node:test";
import {
  beginGameV4,
  bendRoll,
  castTurn,
  createRoomV4,
  giveOxygen,
  publicRoomV4,
  seatPlayerV4,
  selectIntent,
  settleExpiredPhase,
  submitPrediction,
} from "../server/game-v4.mjs";

function setup(playerCount = 3, seed = 12345, bots = []) {
  const room = createRoomV4("MECHS", 100, undefined, { seed });
  const players = [];
  for (let seat = 0; seat < playerCount; seat += 1) {
    players.push(
      seatPlayerV4(
        room,
        {
          name: `Traveler ${seat + 1}`,
          token: `token-${seat}`,
          bot: bots.includes(seat),
        },
        100 + seat,
      ),
    );
  }
  beginGameV4(room, players[0].token, 1_000);
  return { room, players };
}

test("public turn state carries truthful Intent previews and BIND dossiers", () => {
  const { room, players } = setup(3);
  players[1].echoes = 5;
  players[1].keys = 1;
  const state = publicRoomV4(room, 1_050);
  const previews = state.turn.intentPreviews;
  assert.ok(previews);
  assert.match(previews.annotations.claim.light, /\+1 extra Echo/i);
  assert.match(previews.annotations.claim.teeth, /\+1 Static/i);
  assert.match(previews.annotations.bind.teeth, /first claim on Give Oxygen/i);
  assert.match(previews.annotations.shelter.teeth, /harm/i);

  const dossier = previews.bindTargets.find((target) => target.seat === 1);
  assert.ok(dossier);
  assert.equal(dossier.echoes, 5);
  assert.equal(dossier.needs.echoes, 8);
  assert.equal(dossier.needs.keys, 0);
  assert.equal(dossier.needs.circuits, 1);
  assert.equal(dossier.threadStrength, 0);

  // Fracture law truthfully changes the CLAIM/TEETH projection.
  room.fractureModifier = { id: "sixth-wall", title: "The Sixth Wall" };
  const walled = publicRoomV4(room, 1_060);
  assert.match(walled.turn.intentPreviews.annotations.claim.teeth, /\+2 Static/);
});

test("a BIND target holds exclusive first claim on Give Oxygen", () => {
  const { room, players } = setup(3);
  players[0].position = 3;
  selectIntent(room, players[0].token, "bind", 2, { now: 1_100 });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
  bendRoll(room, players[0].token, 0, { now: 1_300, rng: () => 0 });
  assert.equal(room.phase, "reaction");
  const reaction = room.pendingReaction;
  assert.equal(reaction.priority.seat, 2);
  assert.ok(reaction.priority.until > reaction.openedAt);

  // The unbound helper is refused while the window holds.
  assert.throws(
    () => giveOxygen(room, players[1].token, { now: reaction.openedAt + 500 }),
    /first claim/i,
  );
  assert.equal(room.pendingReaction.helperSeat, null);

  // The bound traveler rescues inside their window.
  giveOxygen(room, players[2].token, { now: reaction.openedAt + 900 });
  assert.equal(players[2].statistics.oxygenGiven, 1);
  assert.equal(players[2].goldenThreads, 1);
});

test("after the priority window expires, any eligible helper may rescue", () => {
  const { room, players } = setup(3);
  players[0].position = 3;
  selectIntent(room, players[0].token, "bind", 2, { now: 1_100 });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
  bendRoll(room, players[0].token, 0, { now: 1_300, rng: () => 0 });
  const reaction = room.pendingReaction;
  giveOxygen(room, players[1].token, {
    now: reaction.priority.until + 100,
  });
  assert.equal(players[1].statistics.oxygenGiven, 1);
});

test("bot helpers honor a human BIND priority window", () => {
  const { room, players } = setup(3, 12345, [1]);
  players[0].position = 3;
  selectIntent(room, players[0].token, "bind", 2, { now: 1_100 });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
  bendRoll(room, players[0].token, 0, { now: 1_300, rng: () => 0 });
  const reaction = room.pendingReaction;
  assert.equal(reaction.priority.seat, 2);

  // Priority active: the bot must wait even though 800ms have passed.
  assert.equal(
    settleExpiredPhase(room, reaction.openedAt + 1_200, { rng: () => 0 }),
    false,
  );
  assert.equal(room.pendingReaction.helperSeat, null);

  // Priority expired: the bot rescues.
  assert.equal(
    settleExpiredPhase(room, reaction.priority.until + 200, { rng: () => 0 }),
    true,
  );
  assert.equal(players[1].statistics.oxygenGiven, 1);
  assert.equal(room.telemetry.oxygen.rescues, 1);
  assert.ok(room.telemetry.oxygen.windows >= 1);
  assert.equal(room.telemetry.oxygen.priorityWindows, 1);
});

test("a correct bold Witness on a minority class earns an Echo with the Focus", () => {
  const { room, players } = setup(3);
  // From position 0 the six roads are LIGHT ×4 and TEETH ×2 — TEETH is the
  // minority. Natural 4 lands on the Snare (TEETH).
  submitPrediction(room, players[1].token, "teeth", { now: 1_100, bold: true });
  submitPrediction(room, players[2].token, "teeth", { now: 1_101 });
  selectIntent(room, players[0].token, "shelter", null, { now: 1_150 });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0.5 });
  assert.equal(room.turn.naturalRoll, 4);

  assert.equal(players[1].focus, 2);
  assert.equal(players[1].echoes, 1);
  assert.equal(players[1].statistics.boldWitness, 1);
  assert.equal(players[2].focus, 2);
  assert.equal(players[2].echoes, 0);
  assert.ok(room.events.some((event) => event.type === "bold-witness"));
});

test("a bold call on the majority class pays only the ordinary Focus", () => {
  const { room, players } = setup(3);
  submitPrediction(room, players[1].token, "light", { now: 1_100, bold: true });
  selectIntent(room, players[0].token, "shelter", null, { now: 1_150 });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
  assert.equal(room.turn.naturalRoll, 1);
  assert.equal(players[1].focus, 2);
  assert.equal(players[1].echoes, 0);
  assert.equal(players[1].statistics.boldWitness || 0, 0);
});

test("Council stones carry state-aware projections before the secret vote", () => {
  const { room, players } = setup(2);
  players[0].position = 7;
  room.signal = 7;
  selectIntent(room, players[0].token, "shelter", null, { now: 1_100 });
  castTurn(room, players[0].token, { now: 1_200, rng: () => 0 });
  bendRoll(room, players[0].token, 0, { now: 1_300, rng: () => 0 });
  assert.equal(room.phase, "council-vote");
  const state = publicRoomV4(room, 1_400);
  const choices = state.pendingCouncil.event.choices;
  const watch = choices.find((choice) => choice.id === "watch");
  const knot = choices.find((choice) => choice.id === "knot");
  assert.match(watch.projection, /Static 7 → 4/);
  assert.match(knot.projection, /gain 1 Echo now/i);
});

test("public state reads authority phase budgets instead of client constants", () => {
  const { room } = setup(2);
  const state = publicRoomV4(room, 1_050);
  assert.equal(state.phaseBudgets.intent, 61);
  assert.equal(state.phaseBudgets.bend, 12);
  assert.equal(state.phaseBudgets.reaction, 8);
  assert.equal(state.phaseBudgets["council-reveal"], 0.65);
  assert.ok(state.telemetry.oxygen);
});
