import assert from "node:assert/strict";
import test from "node:test";
import {
  beginGame,
  createRoom,
  publicRoom,
  rollTurn,
  seatPlayer,
} from "../server/game-core.mjs";
import { settleRoom } from "../server/http-authority.mjs";

test("HTTP settlement exposes each consecutive bot landing as its own transmission", () => {
  const room = createRoom("BOTTV", 100);
  const keeper = seatPlayer(room, { name: "Keeper" });
  seatPlayer(room, { name: "First Echo", bot: true });
  seatPlayer(room, { name: "Second Echo", bot: true });
  beginGame(room, keeper.token, 1_000);

  // Spaces 1–6 contain no choice or Council, so the keeper's first cast always
  // hands authority directly to the first bot.
  rollTurn(room, keeper.token, { now: 2_000, rng: () => 0 });
  assert.equal(room.currentSeat, 1);

  assert.equal(settleRoom(room, 3_000), true);
  const firstState = publicRoom(room, 3_000);
  assert.equal(firstState.currentSeat, 2);
  assert.equal(firstState.activeTransmission.landingSeat, 1);
  assert.equal(firstState.turnNumber, 3);

  assert.equal(settleRoom(room, 4_000), true);
  const secondState = publicRoom(room, 4_000);
  assert.equal(secondState.currentSeat, 0);
  assert.equal(secondState.activeTransmission.landingSeat, 2);
  assert.equal(secondState.turnNumber, 4);
  assert.notEqual(
    firstState.activeTransmission.transmissionId,
    secondState.activeTransmission.transmissionId,
  );
});
