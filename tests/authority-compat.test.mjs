import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuthorityCompatibility,
  inferAuthorityMode,
  LEGACY_FOXY_CHANNEL,
} from "../app/authority-compat.mjs";

function legacyState(overrides = {}) {
  return {
    code: "NORTH",
    turnNumber: 2,
    players: [{ name: "Wanderer" }],
    lastRoll: {
      seat: 0,
      die: 4,
      naturalDie: 4,
      tuning: 0,
      from: 0,
      to: 4,
    },
    lastEvent: {
      id: "hungry-static",
      title: "Hungry Static",
      videoId: "SnM5oGxI8Lo",
      videoSource: "Foxy Alchemy Studio",
      landingSeat: 0,
    },
    log: [
      {
        id: "unique-roll-log",
        at: 25_000,
        text: "Wanderer cast 4 and reached Hungry Static.",
      },
    ],
    ...overrides,
  };
}

test("v1 snapshots receive one stable synthetic landing transmission", () => {
  const adapter = createAuthorityCompatibility({ now: () => 99_000 });
  const first = adapter.normalize(legacyState(), "sixfold-road-http-v1");
  const second = adapter.normalize(legacyState(), "sixfold-road-http-v1");

  assert.equal(first.mode, "v1");
  assert.deepEqual(first.room.youtubeChannel, LEGACY_FOXY_CHANNEL);
  assert.equal(
    first.room.activeTransmission.transmissionId,
    second.room.activeTransmission.transmissionId,
  );
  assert.equal(first.room.activeTransmission.transmissionStartedAt, 25_000);
  assert.equal(first.room.activeTransmission.landingSpace, 4);
});

test("a new v1 roll log creates a new transmission identity", () => {
  const adapter = createAuthorityCompatibility();
  const first = adapter.normalize(legacyState(), "sixfold-road-http-v1");
  const next = legacyState({
    turnNumber: 3,
    lastRoll: {
      seat: 0,
      die: 2,
      naturalDie: 2,
      tuning: 0,
      from: 4,
      to: 6,
    },
    lastEvent: {
      id: "blue-archive",
      title: "Blue Archive",
      videoId: "ABC123",
      landingSeat: 0,
    },
    log: [
      ...legacyState().log,
      {
        id: "next-roll-log",
        at: 30_000,
        text: "Wanderer cast 2 and reached Blue Archive.",
      },
    ],
  });
  const second = adapter.normalize(next, "sixfold-road-http-v1");

  assert.notEqual(
    first.room.activeTransmission.transmissionId,
    second.room.activeTransmission.transmissionId,
  );
  assert.equal(second.room.activeTransmission.transmissionStartedAt, 30_000);
});

test("v2 snapshots pass through unchanged", () => {
  const room = {
    youtubeChannel: { title: "Margaret" },
    activeTransmission: null,
  };
  const normalized = createAuthorityCompatibility().normalize(
    room,
    "sixfold-road-http-v2",
  );

  assert.equal(inferAuthorityMode(room), "v2");
  assert.equal(normalized.mode, "v2");
  assert.equal(normalized.room, room);
});

test("v1 non-landing snapshots remain silent", () => {
  const state = legacyState({
    lastRoll: null,
    lastEvent: { id: "table-wakes", title: "The Table Wakes" },
  });
  const normalized = createAuthorityCompatibility().normalize(state);

  assert.equal(normalized.mode, "v1");
  assert.equal(normalized.room.activeTransmission, null);
});
