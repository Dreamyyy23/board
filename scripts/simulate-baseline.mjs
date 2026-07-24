#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  answerChoice,
  beginGame,
  createRoom,
  resolveCouncil,
  rollTurn,
  seatPlayer,
} from "../server/game-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACTION_CAP = 720;

function parseArguments(argv) {
  const result = {
    matches: 10_000,
    players: 6,
    seed: 12_345,
    json: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [inlineName, inlineValue] = argument.split("=", 2);
    const name = inlineName.replace(/^--/, "");
    const value = inlineValue ?? argv[index + 1];
    if (!inlineValue && argument.startsWith("--")) index += 1;
    if (name === "matches") result.matches = Number(value);
    else if (name === "players") result.players = Number(value);
    else if (name === "seed") result.seed = Number(value);
    else if (name === "json") result.json = String(value);
    else throw new Error(`Unknown baseline option: ${argument}`);
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
  return result;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
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
  return {
    mean: rounded(values.reduce((total, value) => total + value, 0) / values.length, 2),
    median: rounded(quantile(values, 0.5), 2),
    p10: rounded(quantile(values, 0.1), 2),
    p90: rounded(quantile(values, 0.9), 2),
    p95: rounded(quantile(values, 0.95), 2),
  };
}

function choiceValue(choice) {
  return (
    (Number(choice.deltaKeys) || 0) * 8 +
    (Number(choice.deltaEchoes) || 0) * 2 +
    (Number(choice.deltaFocus) || 0) +
    (Number(choice.deltaResolve) || 0) -
    (Number(choice.staticDelta) || 0) * 2 +
    (Number(choice.move) || 0) * 0.25
  );
}

function chooseOracle(room) {
  return [...room.pendingChoice.event.choices].sort(
    (left, right) =>
      choiceValue(right) - choiceValue(left) ||
      String(left.id).localeCompare(String(right.id)),
  )[0].id;
}

function resolveLegacyCouncil(room, rng, now) {
  const choices = ["stabilize", "exchange", "provoke"];
  for (const player of room.players.filter(Boolean)) {
    room.pendingCouncil.votes[player.seat] =
      choices[Math.floor(rng() * choices.length)];
  }
  resolveCouncil(room, now, false);
}

function runMatch(matchIndex, configuration) {
  const rng = seededRandom(
    configuration.seed + Math.imul(matchIndex + 1, 0x9e3779b1),
  );
  const room = createRoom(`B${String(matchIndex).padStart(4, "0")}`, 0);
  const travelers = [];
  for (let seat = 0; seat < configuration.players; seat += 1) {
    travelers.push(
      seatPlayer(room, {
        name: `Baseline ${seat + 1}`,
        token: `baseline-${matchIndex}-${seat}`,
      }),
    );
  }
  beginGame(room, travelers[0].token, 1_000);

  let casts = 0;
  let actions = 0;
  let now = 1_000;
  while (room.status === "playing" && actions < ACTION_CAP) {
    actions += 1;
    now += 100;
    if (room.pendingChoice) {
      answerChoice(room, null, chooseOracle(room), { automated: true, now });
      continue;
    }
    if (room.pendingCouncil) {
      resolveLegacyCouncil(room, rng, now);
      continue;
    }
    rollTurn(room, null, { automated: true, now, rng });
    casts += 1;
  }

  return {
    completed: room.status === "finished",
    casts,
    actions,
    collapses: room.collapseCount,
    winnerMask:
      room.winnerSeat === null ? null : room.players[room.winnerSeat]?.mask.id,
  };
}

const configuration = parseArguments(process.argv.slice(2));
const startedAt = Date.now();
const results = Array.from({ length: configuration.matches }, (_, matchIndex) =>
  runMatch(matchIndex, configuration),
);
const completed = results.filter((result) => result.completed);
const completedCasts = completed.map((result) => result.casts);
const byCast = (limit) =>
  rounded(
    results.filter((result) => result.completed && result.casts <= limit).length /
      results.length,
  );
const winnerCounts = Object.create(null);
for (const result of completed) {
  if (result.winnerMask) {
    winnerCounts[result.winnerMask] = (winnerCounts[result.winnerMask] || 0) + 1;
  }
}

const report = {
  schemaVersion: 1,
  implementation: "legacy game-core authority",
  generatedAt: new Date().toISOString(),
  durationMs: Date.now() - startedAt,
  configuration: {
    ...configuration,
    actionCap: ACTION_CAP,
    policy:
      "Server-owned d6, strongest immediate Oracle choice, randomized Council stones, no tactical tuning, gifting, or relic use.",
  },
  overall: {
    matches: results.length,
    completedBeforeActionCapRate: rounded(completed.length / results.length),
    completionByCast: {
      45: byCast(45),
      84: byCast(84),
      120: byCast(120),
      240: byCast(240),
    },
    completedCastCount: distribution(completedCasts),
    meanSignalCollapses: rounded(
      results.reduce((total, result) => total + result.collapses, 0) /
        results.length,
      2,
    ),
    cappedWithoutWinner: results.length - completed.length,
    guaranteedEnding: false,
    houseVictoryCondition: false,
    conditionalWinnerMaskShare: Object.fromEntries(
      Object.entries(winnerCounts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([mask, count]) => [mask, rounded(count / completed.length)]),
    ),
  },
};

if (configuration.json) {
  const destination = path.resolve(ROOT, configuration.json);
  fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
}

console.log("OBSCUR — LEGACY BASELINE SIMULATION");
console.log(
  `${configuration.matches.toLocaleString()} matches · ${configuration.players} seats · seed ${configuration.seed}`,
);
console.log(
  `Completed by 84 casts ${(report.overall.completionByCast[84] * 100).toFixed(1)}% · by 120 ${(report.overall.completionByCast[120] * 100).toFixed(1)}% · capped ${report.overall.cappedWithoutWinner}`,
);
console.log(
  `Completed-cast median ${report.overall.completedCastCount.median} · p90 ${report.overall.completedCastCount.p90} · p95 ${report.overall.completedCastCount.p95}`,
);
console.log(
  `Mean signal collapses ${report.overall.meanSignalCollapses} · guaranteed ending no · House victory no`,
);
