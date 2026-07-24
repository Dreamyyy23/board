#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  activateMaskPower,
  activateRelicV4,
  advanceCouncilReveal,
  answerChoiceV4,
  beginGameV4,
  bendRoll,
  castCouncilVoteV4,
  castTurn,
  createRoomV4,
  giveOxygen,
  resolveFracture,
  resolveReaction,
  seatPlayerV4,
  selectIntent,
  settleExpiredPhase,
  submitPrediction,
} from "../server/game-v4.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILES = Object.freeze([
  "six-basic",
  "six-heuristic",
  "mixed",
  "solo-plus-bots",
  "independent-six",
  "timeout-defaults",
]);
const CLASSES = Object.freeze(["light", "threshold", "teeth"]);
const COUNCIL_CHOICES = Object.freeze(["watch", "open", "knot"]);
const MAX_ACTIONS_PER_MATCH = 720;

function parseArguments(argv) {
  const result = {
    matches: 10_000,
    players: 6,
    seed: 12_345,
    profile: "all",
    json: null,
    quiet: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--quiet") {
      result.quiet = true;
      continue;
    }
    const [inlineName, inlineValue] = argument.split("=", 2);
    const name = inlineName.replace(/^--/, "");
    const value = inlineValue ?? argv[index + 1];
    if (!inlineValue && argument.startsWith("--")) index += 1;
    if (name === "matches") result.matches = Number(value);
    else if (name === "players") result.players = Number(value);
    else if (name === "seed") result.seed = Number(value);
    else if (name === "profile") result.profile = String(value);
    else if (name === "json") result.json = String(value);
    else throw new Error(`Unknown simulation option: ${argument}`);
  }
  if (!Number.isInteger(result.matches) || result.matches < 1) {
    throw new Error("--matches must be a positive integer.");
  }
  if (!Number.isInteger(result.players) || result.players < 1 || result.players > 6) {
    throw new Error("--players must be an integer from 1 through 6.");
  }
  if (!Number.isInteger(result.seed)) {
    throw new Error("--seed must be an integer.");
  }
  if (result.profile !== "all" && !PROFILES.includes(result.profile)) {
    throw new Error(`--profile must be all or one of: ${PROFILES.join(", ")}.`);
  }
  return result;
}

function increment(record, key, amount = 1) {
  record[key] = (record[key] || 0) + amount;
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function rounded(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function quantile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function distribution(values) {
  if (!values.length) {
    return { mean: 0, median: 0, p10: 0, p90: 0, p95: 0 };
  }
  return {
    mean: rounded(values.reduce((total, value) => total + value, 0) / values.length, 2),
    median: rounded(quantile(values, 0.5), 2),
    p10: rounded(quantile(values, 0.1), 2),
    p90: rounded(quantile(values, 0.9), 2),
    p95: rounded(quantile(values, 0.95), 2),
  };
}

function utilityForDestination(destination, player, room) {
  if (!destination) return -99;
  const classValue = { light: 4, threshold: 2, teeth: -1 }[destination.class] || 0;
  const kindValue = {
    key: player.keys ? 1 : 8,
    oracle: 3,
    council: 2,
    echo: 3,
    hearth: player.position + destination.roll >= 36 ? 7 : 1,
    snare: -3,
    rift: -2,
  }[destination.kind] || 0;
  const danger = room.signal >= 9 && destination.class === "teeth" ? -4 : 0;
  return classValue + kindValue + danger;
}

function controllerFor(profile, seat) {
  if (profile === "timeout-defaults") return "timeout";
  if (profile === "six-basic") return "basic";
  if (profile === "six-heuristic") return "heuristic";
  if (profile === "mixed") return seat % 2 ? "basic" : "heuristic";
  if (profile === "solo-plus-bots") {
    return seat === 0 ? "human-heuristic" : "heuristic";
  }
  return ["greedy", "safe", "social", "heuristic", "greedy", "social"][seat];
}

function isHeuristic(controller) {
  return !["basic", "timeout"].includes(controller);
}

function predictionFor(room, seat, controller) {
  if (controller === "basic") {
    return CLASSES[(room.turnNumber + seat) % CLASSES.length];
  }
  const counts = room.turn.reachable.reduce(
    (summary, destination) => {
      summary[destination.class] += 1;
      return summary;
    },
    { light: 0, threshold: 0, teeth: 0 },
  );
  return [...CLASSES].sort(
    (left, right) =>
      counts[right] - counts[left] ||
      ((room.turnNumber + seat + CLASSES.indexOf(left)) % 3) -
        ((room.turnNumber + seat + CLASSES.indexOf(right)) % 3),
  )[0];
}

function bindTarget(room, activeSeat) {
  return room.players
    .filter((player) => player && player.seat !== activeSeat)
    .sort(
      (left, right) =>
        left.resolve - right.resolve ||
        left.echoes - right.echoes ||
        left.seat - right.seat,
    )[0]?.seat ?? null;
}

function intentFor(room, player, controller) {
  const otherSeat = bindTarget(room, player.seat);
  if (player.burdens.some((burden) => burden.id === "must-shelter")) {
    return { intent: "shelter", targetSeat: null };
  }
  if (controller === "basic") {
    const basicRotation = (room.turnNumber + player.seat) % 3;
    if (basicRotation === 0) return { intent: "claim", targetSeat: null };
    if (basicRotation === 1 || otherSeat === null) {
      return { intent: "shelter", targetSeat: null };
    }
    return { intent: "bind", targetSeat: otherSeat };
  }
  if (controller === "greedy" && room.signal < 10) {
    return { intent: "claim", targetSeat: null };
  }
  if (controller === "safe" || player.resolve <= 1 || room.signal >= 9) {
    return { intent: "shelter", targetSeat: null };
  }
  if (controller === "social" && otherSeat !== null) {
    return { intent: "bind", targetSeat: otherSeat };
  }
  const rotation = (room.round + player.seat + room.turnNumber) % 3;
  if (rotation === 0) return { intent: "claim", targetSeat: null };
  if (rotation === 1 || otherSeat === null) {
    return { intent: "shelter", targetSeat: null };
  }
  return { intent: "bind", targetSeat: otherSeat };
}

function bendFor(room, player, controller) {
  if (!isHeuristic(controller)) return 0;
  const candidates = [-1, 0, 1]
    .map((delta) => ({
      delta,
      roll: Math.max(1, Math.min(6, room.turn.naturalRoll + delta)),
    }))
    .filter(
      (candidate, index, all) =>
        all.findIndex((other) => other.roll === candidate.roll) === index,
    )
    .map((candidate) => ({
      ...candidate,
      destination: room.turn.reachable.find(
        (destination) => destination.roll === candidate.roll,
      ),
    }))
    .sort(
      (left, right) =>
        utilityForDestination(right.destination, player, room) -
          utilityForDestination(left.destination, player, room) ||
        Math.abs(left.delta) - Math.abs(right.delta),
    );
  const best = candidates[0];
  if (
    best.delta !== 0 &&
    player.focus < 1 &&
    room.turn.omen !== "door"
  ) {
    return 0;
  }
  return best.delta;
}

function chooseOracle(room, player, controller) {
  const choices = room.pendingChoice.event.choices;
  if (!isHeuristic(controller)) {
    return choices[(player.seat + room.round) % choices.length];
  }
  return [...choices].sort((left, right) => {
    const score = (choice) => {
      const safety =
        (choice.deltaResolve || 0) * (player.resolve <= 1 ? 5 : 2) +
        (choice.ward ? 4 : 0) -
        Math.max(0, choice.staticDelta || 0) * (room.signal >= 8 ? 4 : 1);
      const progress =
        (choice.deltaEchoes || 0) * 2 +
        (choice.deltaKeys || 0) * (player.keys ? 1 : 7) +
        (choice.move || 0);
      const burden = choice.burden ? -2 : 0;
      return safety + progress + burden;
    };
    return score(right) - score(left) || String(left.id).localeCompare(String(right.id));
  })[0];
}

function councilChoice(room, player, controller) {
  if (room.signal >= 9) return "watch";
  if (controller === "greedy") return "open";
  if (controller === "safe") return "watch";
  if (controller === "social") return "knot";
  return COUNCIL_CHOICES[(room.round + player.seat) % COUNCIL_CHOICES.length];
}

function totalHarm(event) {
  return ["deltaEchoes", "deltaFocus", "deltaResolve"]
    .map((field) => Math.max(0, -(Number(event?.[field]) || 0)))
    .reduce((total, amount) => total + amount, 0);
}

function maybeUseIntentPowerOrRelic(room, player, controller, now, counters) {
  if (!isHeuristic(controller)) return;
  const relicId =
    player.relics.includes("quiet-bell") &&
    (room.signal >= 8 || room.fractureModifier || room.omen === "static")
      ? "quiet-bell"
      : player.relics.includes("mirror-shard") && player.resolve <= 1
        ? "mirror-shard"
        : player.relics.includes("foxfire-lens") && room.round >= 2
          ? "foxfire-lens"
          : null;
  if (relicId) {
    activateRelicV4(room, player.token, relicId, { now });
    counters.relicUses += 1;
    return;
  }
  if (!player.maskCharge) return;
  if (player.mask.id === "moon" && room.round >= 2) {
    activateMaskPower(room, player.token, { results: [2, 5] }, { now });
    counters.powerUses += 1;
  } else if (
    player.mask.id === "ash" &&
    room.lastResolvedEvent &&
    (room.signal >= 6 || room.round >= 3)
  ) {
    activateMaskPower(room, player.token, {}, { now });
    counters.powerUses += 1;
  }
}

function maybeUseBendPower(room, player, controller, now, counters) {
  if (!isHeuristic(controller) || !player.maskCharge) return false;
  if (player.mask.id === "ember") {
    const carriedRoll = room.turn.naturalRoll + 2;
    const carried = room.turn.reachable.find(
      (destination) => destination.roll === carriedRoll,
    );
    if (
      player.position + carriedRoll >= 36 ||
      (carried?.kind === "key" && player.keys === 0)
    ) {
      activateMaskPower(room, player.token, {}, { now });
      counters.powerUses += 1;
      return true;
    }
  }
  if (player.mask.id === "thorn") {
    const delta = bendFor(room, player, controller);
    if (delta !== 0) {
      activateMaskPower(room, player.token, { delta }, { now });
      counters.powerUses += 1;
      return true;
    }
  }
  return false;
}

function snapshotPlayers(room) {
  return room.players.map((player) =>
    player
      ? {
          focus: player.focus,
          correctPredictions: player.statistics.correctPredictions,
        }
      : null,
  );
}

function updateResourceMetrics(before, room, metrics) {
  for (let seat = 0; seat < room.players.length; seat += 1) {
    const prior = before[seat];
    const player = room.players[seat];
    if (!prior || !player) continue;
    const focusDelta = player.focus - prior.focus;
    if (focusDelta > 0) metrics.focusEarned += focusDelta;
    if (focusDelta < 0) metrics.focusSpent += -focusDelta;
    if (player.statistics.correctPredictions > prior.correctPredictions) {
      metrics.participationRounds.add(room.round);
    }
  }
}

function eventUtility(event) {
  const resourceWeights = {
    echoes: 1,
    focus: 1.5,
    resolve: 1.5,
    keys: 5,
    goldenThreads: 1,
    movement: 0.25,
    circuits: 4,
    maskCharge: 2,
  };
  const deltas = (event.deltas || []).reduce(
    (total, delta) =>
      total + (resourceWeights[delta.resource] || 0) * Number(delta.amount || 0),
    0,
  );
  const staticDelta =
    event.staticBefore === undefined || event.staticAfter === undefined
      ? 0
      : event.staticAfter - event.staticBefore;
  return deltas - staticDelta;
}

function processEvents(room, metrics) {
  const events = room.events.filter((event) => event.sequence > metrics.eventCursor);
  for (const event of events) {
    metrics.eventCursor = Math.max(metrics.eventCursor, event.sequence);
    if (event.type === "cast") {
      metrics.turns += 1;
      if (event.omen) increment(metrics.omens, event.omen);
    }
    if (event.type === "intent") {
      increment(metrics.intents, event.intent);
      const mask = room.players[event.actorSeat]?.mask.id || `seat-${event.actorSeat}`;
      metrics.intentsByMask[mask] ||= {};
      increment(metrics.intentsByMask[mask], event.intent);
      metrics.intentByTurn.set(event.turnNumber, event.intent);
    }
    if (["resolution", "oracle-choice", "council"].includes(event.type)) {
      const intent = event.intent || metrics.intentByTurn.get(event.turnNumber);
      if (intent && eventUtility(event) > 0) increment(metrics.intentSuccess, intent);
    }
    if (event.type === "oxygen") {
      metrics.oxygenSuccesses += 1;
      metrics.participationRounds.add(event.round);
    }
    if (event.type === "golden-thread") metrics.goldenThreads += 1;
    if (event.type === "fracture") metrics.fractures += 1;
    if (event.type === "final-orbit" && metrics.finalOrbitRound === null) {
      metrics.finalOrbitRound = room.endgame.triggerRound;
    }
    if (event.type === "vow-complete") {
      const mask = room.players[event.actorSeat]?.mask.id || `seat-${event.actorSeat}`;
      increment(metrics.vows, mask);
    }
    if (event.type === "oracle-choice") increment(metrics.oracleChoices, event.title);
    if (event.type === "council") {
      increment(metrics.councilResults, event.meta?.result || "unknown");
      for (const vote of event.meta?.votes || []) {
        increment(metrics.councilVotes, vote.choiceId);
      }
      metrics.participationRounds.add(event.round);
    }
    if (event.type === "resolution" && event.omen) {
      metrics.omenValues[event.omen] ||= { total: 0, count: 0 };
      metrics.omenValues[event.omen].total += eventUtility(event);
      metrics.omenValues[event.omen].count += 1;
    }
  }
}

function createMatchMetrics() {
  return {
    eventCursor: 0,
    turns: 0,
    focusEarned: 0,
    focusSpent: 0,
    oxygenAttempts: 0,
    oxygenSuccesses: 0,
    goldenThreads: 0,
    fractures: 0,
    finalOrbitRound: null,
    powerUses: 0,
    relicUses: 0,
    invalidStates: 0,
    invalidReasons: {},
    intents: {},
    intentsByMask: {},
    intentSuccess: {},
    intentByTurn: new Map(),
    vows: {},
    oracleChoices: {},
    councilResults: {},
    councilVotes: {},
    omens: {},
    omenValues: {},
    participationRounds: new Set(),
    staticByRound: {},
  };
}

function driveStep(room, profile, now, metrics) {
  const active = room.players[room.currentSeat];
  if (!active) throw new Error("The active seat is empty.");
  const controller = controllerFor(profile, active.seat);

  if (controller === "timeout") {
    const authorityNow = Math.max(now, Number(room.deadline || now) + 1);
    if (!settleExpiredPhase(room, authorityNow)) {
      throw new Error(`Timeout authority could not settle ${room.phase}.`);
    }
    return authorityNow;
  }

  if (room.phase === "intent") {
    for (const witness of room.players.filter(
      (player) => player && player.seat !== active.seat,
    )) {
      const witnessController = controllerFor(profile, witness.seat);
      if (
        witnessController === "timeout" ||
        room.predictions[`seat:${witness.seat}`]
      ) {
        continue;
      }
      submitPrediction(
        room,
        witness.token,
        predictionFor(room, witness.seat, witnessController),
        { now },
      );
    }
    maybeUseIntentPowerOrRelic(room, active, controller, now, metrics);
    const choice = intentFor(room, active, controller);
    selectIntent(room, active.token, choice.intent, choice.targetSeat, { now });
    castTurn(room, active.token, { now });
    return now;
  }

  if (room.phase === "bend") {
    if (maybeUseBendPower(room, active, controller, now, metrics)) return now;
    bendRoll(room, active.token, bendFor(room, active, controller), {
      now,
      useAshEvent: Boolean(room.turn.ashArmed && isHeuristic(controller)),
    });
    return now;
  }

  if (room.phase === "reaction") {
    const reaction = room.pendingReaction;
    const harm = totalHarm(reaction.event);
    const helpers = reaction.eligibleSeats
      .map((seat) => room.players[seat])
      .filter(Boolean)
      .sort((left, right) => {
        const leftScore =
          (left.mask.id === "moss" && left.maskCharge ? 10 : 0) +
          (left.mask.id === "veil" && left.maskCharge ? 8 : 0) +
          (isHeuristic(controllerFor(profile, left.seat)) ? 3 : 0);
        const rightScore =
          (right.mask.id === "moss" && right.maskCharge ? 10 : 0) +
          (right.mask.id === "veil" && right.maskCharge ? 8 : 0) +
          (isHeuristic(controllerFor(profile, right.seat)) ? 3 : 0);
        return rightScore - leftScore || left.seat - right.seat;
      });
    const helper = helpers.find(
      (candidate) =>
        controllerFor(profile, candidate.seat) !== "timeout" &&
        candidate.oxygenUsedRound !== room.round &&
        (candidate.resolve > 0 || candidate.echoes > 0),
    );
    if (helper && harm >= 1) {
      metrics.oxygenAttempts += 1;
      if (helper.mask.id === "moss" && helper.maskCharge) {
        activateMaskPower(room, helper.token, {}, { now });
        metrics.powerUses += 1;
      } else if (helper.mask.id === "veil" && helper.maskCharge) {
        activateMaskPower(room, helper.token, {}, { now });
        metrics.powerUses += 1;
      } else {
        giveOxygen(room, helper.token, { now });
      }
    } else {
      resolveReaction(room, now);
    }
    return now;
  }

  if (room.phase === "oracle") {
    const player = room.players[room.pendingChoice.seat];
    const choice = chooseOracle(
      room,
      player,
      controllerFor(profile, player.seat),
    );
    answerChoiceV4(room, player.token, choice.id, { now });
    return now;
  }

  if (room.phase === "council-vote") {
    for (const player of room.players.filter(Boolean)) {
      if (room.pendingCouncil.votes[player.seat]) continue;
      castCouncilVoteV4(
        room,
        player.token,
        councilChoice(room, player, controllerFor(profile, player.seat)),
        now,
      );
    }
    return now;
  }

  if (room.phase === "council-reveal") {
    advanceCouncilReveal(room, now);
    return now;
  }

  if (room.phase === "fracture") {
    resolveFracture(room, now);
    return now;
  }

  throw new Error(`The simulator does not recognize phase ${room.phase}.`);
}

function runMatch({ matchIndex, players, seed, profile }) {
  const code = `S${String(matchIndex).padStart(5, "0")}`.slice(-6);
  const room = createRoomV4(code, 1_000, undefined, {
    seed: (seed + Math.imul(matchIndex + 1, 2_654_435_761)) >>> 0,
  });
  const seated = [];
  for (let seat = 0; seat < players; seat += 1) {
    seated.push(
      seatPlayerV4(
        room,
        {
          name: `${profile} ${seat + 1}`,
          token: `${profile}-${matchIndex}-${seat}`,
          bot: false,
        },
        1_000 + seat,
      ),
    );
  }
  beginGameV4(room, seated[0].token, 2_000);
  const metrics = createMatchMetrics();
  processEvents(room, metrics);
  let now = 2_000;
  let actions = 0;

  while (room.status === "playing" && actions < MAX_ACTIONS_PER_MATCH) {
    const before = snapshotPlayers(room);
    try {
      now = driveStep(room, profile, now + 100, metrics);
    } catch (error) {
      metrics.invalidStates += 1;
      metrics.invalidReason = `${
        error instanceof Error ? error.message : "Unknown simulation error"
      } [phase=${room.phase}, event=${room.pendingChoice?.event?.id || room.pendingCouncil?.event?.id || "none"}]`;
      break;
    }
    updateResourceMetrics(before, room, metrics);
    processEvents(room, metrics);
    metrics.staticByRound[room.round] = room.signal;
    actions += 1;
  }

  if (room.status !== "finished") {
    if (!metrics.invalidStates) metrics.invalidStates += 1;
    metrics.invalidReason ||= `Match did not finish after ${actions} actions.`;
  }

  return {
    profile,
    completed: room.status === "finished",
    playerVictory: room.status === "finished" && !room.houseVictory,
    houseVictory: room.status === "finished" && room.houseVictory,
    winnerMask:
      room.winnerSeat === null || room.winnerSeat === undefined
        ? null
        : room.players[room.winnerSeat]?.mask.id || null,
    rounds: room.round,
    ...metrics,
    intentByTurn: undefined,
    participationRounds: metrics.participationRounds.size,
    totalParticipationRounds: Math.max(1, room.round),
    twoThreadLinks: metrics.goldenThreads >= 2,
  };
}

function emptyAggregate() {
  return {
    matches: 0,
    completed: 0,
    playerVictories: 0,
    houseVictories: 0,
    turns: [],
    fractures: [],
    finalOrbitRounds: [],
    focusEarned: 0,
    focusSpent: 0,
    oxygenAttempts: 0,
    oxygenSuccesses: 0,
    goldenThreads: 0,
    twoThreadMatches: 0,
    participationRounds: 0,
    totalParticipationRounds: 0,
    powerUses: 0,
    relicUses: 0,
    invalidStates: 0,
    invalidReasons: {},
    winsByMask: {},
    intents: {},
    intentsByMask: {},
    intentSuccess: {},
    vows: {},
    oracleChoices: {},
    councilResults: {},
    councilVotes: {},
    omens: {},
    omenValues: {},
    staticByRound: {},
  };
}

function mergeRecord(target, source) {
  for (const [key, value] of Object.entries(source || {})) increment(target, key, value);
}

function addMatch(aggregate, match) {
  aggregate.matches += 1;
  aggregate.completed += Number(match.completed);
  aggregate.playerVictories += Number(match.playerVictory);
  aggregate.houseVictories += Number(match.houseVictory);
  aggregate.turns.push(match.turns);
  aggregate.fractures.push(match.fractures);
  if (match.finalOrbitRound !== null) {
    aggregate.finalOrbitRounds.push(match.finalOrbitRound);
  }
  aggregate.focusEarned += match.focusEarned;
  aggregate.focusSpent += match.focusSpent;
  aggregate.oxygenAttempts += match.oxygenAttempts;
  aggregate.oxygenSuccesses += match.oxygenSuccesses;
  aggregate.goldenThreads += match.goldenThreads;
  aggregate.twoThreadMatches += Number(match.twoThreadLinks);
  aggregate.participationRounds += match.participationRounds;
  aggregate.totalParticipationRounds += match.totalParticipationRounds;
  aggregate.powerUses += match.powerUses;
  aggregate.relicUses += match.relicUses;
  aggregate.invalidStates += match.invalidStates;
  if (match.invalidReason) increment(aggregate.invalidReasons, match.invalidReason);
  if (match.winnerMask) increment(aggregate.winsByMask, match.winnerMask);
  mergeRecord(aggregate.intents, match.intents);
  mergeRecord(aggregate.intentSuccess, match.intentSuccess);
  mergeRecord(aggregate.vows, match.vows);
  mergeRecord(aggregate.oracleChoices, match.oracleChoices);
  mergeRecord(aggregate.councilResults, match.councilResults);
  mergeRecord(aggregate.councilVotes, match.councilVotes);
  mergeRecord(aggregate.omens, match.omens);
  for (const [mask, intents] of Object.entries(match.intentsByMask)) {
    aggregate.intentsByMask[mask] ||= {};
    mergeRecord(aggregate.intentsByMask[mask], intents);
  }
  for (const [omen, values] of Object.entries(match.omenValues)) {
    aggregate.omenValues[omen] ||= { total: 0, count: 0 };
    aggregate.omenValues[omen].total += values.total;
    aggregate.omenValues[omen].count += values.count;
  }
  for (const [round, staticValue] of Object.entries(match.staticByRound)) {
    aggregate.staticByRound[round] ||= { total: 0, count: 0 };
    aggregate.staticByRound[round].total += staticValue;
    aggregate.staticByRound[round].count += 1;
  }
}

function shares(record, denominator) {
  return Object.fromEntries(
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, rounded(ratio(value, denominator))]),
  );
}

function summarize(aggregate) {
  const intentTotal = Object.values(aggregate.intents).reduce(
    (total, count) => total + count,
    0,
  );
  const oracleTotal = Object.values(aggregate.oracleChoices).reduce(
    (total, count) => total + count,
    0,
  );
  const councilTotal = Object.values(aggregate.councilResults).reduce(
    (total, count) => total + count,
    0,
  );
  const councilVoteTotal = Object.values(aggregate.councilVotes).reduce(
    (total, count) => total + count,
    0,
  );
  const omenTotal = Object.values(aggregate.omens).reduce(
    (total, count) => total + count,
    0,
  );
  const turnWindowCount = aggregate.turns.filter(
    (turns) => turns >= 45 && turns <= 84,
  ).length;
  return {
    matches: aggregate.matches,
    completionRate: rounded(ratio(aggregate.completed, aggregate.matches)),
    turnCount: distribution(aggregate.turns),
    turns45To84Rate: rounded(ratio(turnWindowCount, aggregate.matches)),
    victories: {
      playerRate: rounded(ratio(aggregate.playerVictories, aggregate.matches)),
      houseRate: rounded(ratio(aggregate.houseVictories, aggregate.matches)),
    },
    playerWinShareByMask: shares(
      aggregate.winsByMask,
      aggregate.playerVictories,
    ),
    intents: {
      usage: shares(aggregate.intents, intentTotal),
      successRate: Object.fromEntries(
        Object.keys(aggregate.intents)
          .sort()
          .map((intent) => [
            intent,
            rounded(ratio(aggregate.intentSuccess[intent], aggregate.intents[intent])),
          ]),
      ),
      usageByMask: Object.fromEntries(
        Object.entries(aggregate.intentsByMask)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([mask, intents]) => [
            mask,
            shares(
              intents,
              Object.values(intents).reduce((total, count) => total + count, 0),
            ),
          ]),
      ),
    },
    focusPerMatch: {
      earned: rounded(ratio(aggregate.focusEarned, aggregate.matches), 2),
      spent: rounded(ratio(aggregate.focusSpent, aggregate.matches), 2),
    },
    oxygen: {
      attemptsPerMatch: rounded(ratio(aggregate.oxygenAttempts, aggregate.matches), 2),
      successesPerMatch: rounded(
        ratio(aggregate.oxygenSuccesses, aggregate.matches),
        2,
      ),
      successRate: rounded(
        ratio(aggregate.oxygenSuccesses, aggregate.oxygenAttempts),
      ),
    },
    goldenThreadsPerMatch: rounded(
      ratio(aggregate.goldenThreads, aggregate.matches),
      2,
    ),
    matchesWithTwoThreadLinksRate: rounded(
      ratio(aggregate.twoThreadMatches, aggregate.matches),
    ),
    successfulNonActiveParticipationRoundRate: rounded(
      ratio(aggregate.participationRounds, aggregate.totalParticipationRounds),
    ),
    staticByRound: Object.fromEntries(
      Object.entries(aggregate.staticByRound)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([round, value]) => [round, rounded(value.total / value.count, 2)]),
    ),
    fracturesPerMatch: distribution(aggregate.fractures),
    finalOrbitTriggerRound: distribution(aggregate.finalOrbitRounds),
    vowCompletionRateByMask: Object.fromEntries(
      ["ember", "veil", "thorn", "moon", "moss", "ash"].map((mask) => [
        mask,
        rounded(ratio(aggregate.vows[mask], aggregate.matches)),
      ]),
    ),
    oracleOptionFrequency: shares(aggregate.oracleChoices, oracleTotal),
    councilResultFrequency: shares(aggregate.councilResults, councilTotal),
    councilVoteFrequency: shares(aggregate.councilVotes, councilVoteTotal),
    omenFrequency: shares(aggregate.omens, omenTotal),
    omenMeanResolutionValue: Object.fromEntries(
      Object.entries(aggregate.omenValues)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([omen, values]) => [
          omen,
          rounded(ratio(values.total, values.count), 3),
        ]),
    ),
    maskPowerUsesPerMatch: rounded(
      ratio(aggregate.powerUses, aggregate.matches),
      2,
    ),
    relicUsesPerMatch: rounded(
      ratio(aggregate.relicUses, aggregate.matches),
      2,
    ),
    softLockOrInvalidStateCount: aggregate.invalidStates,
    invalidStateReasons: aggregate.invalidReasons,
  };
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function printSummary(report) {
  const summary = report.overall;
  console.log("OBSCUR — THE SIXFOLD ROAD · RULES V4 SIMULATION");
  console.log(
    `${report.configuration.matches.toLocaleString()} matches · ${report.configuration.players} seats · seed ${report.configuration.seed}`,
  );
  console.log(
    `Completion ${formatPercent(summary.completionRate)} · turns median ${summary.turnCount.median} (p10 ${summary.turnCount.p10}, p90 ${summary.turnCount.p90}, p95 ${summary.turnCount.p95})`,
  );
  console.log(
    `45–84 turns ${formatPercent(summary.turns45To84Rate)} · player victories ${formatPercent(summary.victories.playerRate)} · House ${formatPercent(summary.victories.houseRate)}`,
  );
  console.log(
    `Fractures median ${summary.fracturesPerMatch.median}, p90 ${summary.fracturesPerMatch.p90} · Threads ${summary.goldenThreadsPerMatch}/match · 2+ links ${formatPercent(summary.matchesWithTwoThreadLinksRate)}`,
  );
  console.log(
    `Non-active participation ${formatPercent(summary.successfulNonActiveParticipationRoundRate)} of rounds · invalid/soft-lock states ${summary.softLockOrInvalidStateCount}`,
  );
  console.log(
    `Conditional mask win share: ${Object.entries(summary.playerWinShareByMask)
      .map(([mask, share]) => `${mask} ${formatPercent(share)}`)
      .join(" · ")}`,
  );
  for (const [profile, profileSummary] of Object.entries(report.profiles)) {
    console.log(
      `${profile}: completion ${formatPercent(profileSummary.completionRate)}, median ${profileSummary.turnCount.median}, House ${formatPercent(profileSummary.victories.houseRate)}, invalid ${profileSummary.softLockOrInvalidStateCount}`,
    );
  }
}

function main() {
  const configuration = parseArguments(process.argv.slice(2));
  const selectedProfiles =
    configuration.profile === "all" ? [...PROFILES] : [configuration.profile];
  const overallAggregate = emptyAggregate();
  const profileAggregates = Object.fromEntries(
    selectedProfiles.map((profile) => [profile, emptyAggregate()]),
  );
  const startedAt = Date.now();

  for (let matchIndex = 0; matchIndex < configuration.matches; matchIndex += 1) {
    const profile = selectedProfiles[matchIndex % selectedProfiles.length];
    const match = runMatch({
      matchIndex,
      players: configuration.players,
      seed: configuration.seed,
      profile,
    });
    addMatch(overallAggregate, match);
    addMatch(profileAggregates[profile], match);
  }

  const report = {
    schemaVersion: 1,
    rulesVersion: 4,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    configuration: {
      matches: configuration.matches,
      players: configuration.players,
      seed: configuration.seed,
      profiles: selectedProfiles,
      policyAssignment:
        "Matches are distributed round-robin across the selected policy profiles.",
    },
    metricDefinitions: {
      intentSuccess:
        "A resolved ordinary, Oracle, or Council outcome whose visible weighted resource value minus Static gain is positive.",
      omenValue:
        "Mean visible weighted resource value minus Static gain for ordinary resolutions carrying that Omen.",
      successfulNonActiveParticipation:
        "A round with a correct Witness reward, successful Oxygen action, or resolved Council.",
      turnCount: "Number of authoritative cast events.",
      softLockOrInvalidState:
        "A thrown authority transition, unknown phase, non-terminal action cap, or missing active seat.",
    },
    acceptanceTargets: {
      completionRate: 1,
      turns45To84Rate: 0.95,
      turnMedianRange: [60, 78],
      fractureMedian: 1,
      fractureP90Maximum: 2,
      conditionalMaskWinShareRange: [0.13, 0.2],
      maximumIntentUsage: 0.6,
      successfulNonActiveParticipationRoundRate: 0.7,
      matchesWithTwoThreadLinksRate: 0.6,
      maximumUnexplainedOracleOrCouncilChoiceShare: 0.7,
    },
    overall: summarize(overallAggregate),
    profiles: Object.fromEntries(
      Object.entries(profileAggregates).map(([profile, aggregate]) => [
        profile,
        summarize(aggregate),
      ]),
    ),
  };

  if (configuration.json) {
    const destination = path.resolve(ROOT, configuration.json);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (!configuration.quiet) printSummary(report);
}

main();
