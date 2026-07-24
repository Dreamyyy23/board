import assert from "node:assert/strict";
import test from "node:test";
import {
  beginGameV4,
  bendRoll,
  castTurn,
  createRoomV4,
  publicRoomV4,
  seatPlayerV4,
  selectIntent,
} from "../server/game-v4.mjs";
import { settleRoom } from "../server/http-authority.mjs";

test("HTTP settlement exposes each consecutive bot landing as its own transmission", () => {
  const room = createRoomV4("BOTTV", 100, undefined, { seed: 42 });
  const keeper = seatPlayerV4(room, { name: "Keeper" }, 100);
  seatPlayerV4(room, { name: "First Echo", bot: true }, 101);
  seatPlayerV4(room, { name: "Second Echo", bot: true }, 102);
  beginGameV4(room, keeper.token, 1_000);

  // HTTP settlement advances exactly one visible v4 phase. The keeper first
  // completes the same intent -> cast -> bend sequence used by network clients.
  selectIntent(room, keeper.token, "shelter", null, { now: 2_000 });
  castTurn(room, keeper.token, { now: 2_010, rng: () => 0 });
  bendRoll(room, keeper.token, 0, { now: 2_020, rng: () => 0 });
  assert.equal(room.currentSeat, 1);

  assert.equal(settleRoom(room, 3_000, { rng: () => 0 }), true);
  assert.equal(room.phase, "bend");
  assert.equal(room.currentSeat, 1);
  assert.equal(room.activeTransmission.landingSeat, 0);

  assert.equal(settleRoom(room, 3_001, { rng: () => 0 }), true);
  const firstState = publicRoomV4(room, 3_001);
  assert.equal(firstState.currentSeat, 2);
  assert.equal(firstState.activeTransmission.landingSeat, 1);
  assert.equal(firstState.turnNumber, 3);

  assert.equal(settleRoom(room, 4_000, { rng: () => 0 }), true);
  assert.equal(room.phase, "bend");
  assert.equal(room.currentSeat, 2);

  assert.equal(settleRoom(room, 4_001, { rng: () => 0 }), true);
  const secondState = publicRoomV4(room, 4_001);
  assert.equal(secondState.currentSeat, 0);
  assert.equal(secondState.activeTransmission.landingSeat, 2);
  assert.equal(secondState.turnNumber, 4);
  assert.notEqual(
    firstState.activeTransmission.transmissionId,
    secondState.activeTransmission.transmissionId,
  );
});
