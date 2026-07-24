import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function waitForState(socket, predicate, timeout = 3_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("room_state", onState);
      reject(new Error("Timed out waiting for synchronized room state."));
    }, timeout);
    function onState(state) {
      if (!predicate(state)) return;
      clearTimeout(timer);
      socket.off("room_state", onState);
      resolve(state);
    }
    socket.on("room_state", onState);
  });
}

test(
  "two clients share turns and reconnect to the same seat",
  { timeout: 12_000 },
  async (context) => {
    const port = 31_000 + Math.floor(Math.random() * 900);
    const child = spawn(process.execPath, ["server/server.mjs"], {
      cwd: ROOT,
      env: { ...process.env, GAME_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    context.after(() => child.kill());
    await Promise.race([
      once(child.stdout, "data"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Realtime server did not start.")), 4_000),
      ),
    ]);

    const url = `http://localhost:${port}`;
    const first = io(url, { transports: ["websocket"] });
    const second = io(url, { transports: ["websocket"] });
    context.after(() => first.disconnect());
    context.after(() => second.disconnect());
    await Promise.all([once(first, "connect"), once(second, "connect")]);

    const created = await emit(first, "create_room", { name: "Cartographer" });
    assert.equal(created.ok, true);
    const joined = await emit(second, "join_room", {
      name: "Witness",
      code: created.code,
    });
    assert.equal(joined.ok, true);
    assert.equal(joined.state.players.filter(Boolean).length, 2);

    const startedState = waitForState(second, (state) => state.status === "playing");
    const started = await emit(first, "start_game", {
      code: created.code,
      token: created.token,
      commandId: "start-1",
    });
    assert.equal(started.ok, true);
    const opening = await startedState;
    assert.equal(opening.phase, "intent");
    assert.equal(opening.rulesVersion, 4);

    const rejected = await emit(second, "cast", {
      code: created.code,
      token: joined.token,
      commandId: "out-of-turn-cast",
    });
    assert.equal(rejected.ok, false);

    const intentState = waitForState(
      second,
      (state) =>
        state.currentSeat === 0 &&
        state.phase === "intent" &&
        state.turn?.intent === "shelter",
    );
    const intent = await emit(first, "select_intent", {
      code: created.code,
      token: created.token,
      commandId: "intent-1",
      intent: "shelter",
    });
    assert.equal(intent.ok, true);
    await intentState;

    const castState = waitForState(
      second,
      (state) =>
        state.currentSeat === 0 &&
        state.phase === "bend" &&
        Number.isInteger(state.turn?.naturalRoll),
    );
    const cast = await emit(first, "cast", {
      code: created.code,
      token: created.token,
      commandId: "cast-1",
    });
    assert.equal(cast.ok, true);
    const afterCast = await castState;
    assert.equal(afterCast.turn.finalRoll, afterCast.turn.naturalRoll);

    const landingState = waitForState(
      second,
      (state) => state.activeTransmission?.landingSeat === 0,
    );
    const bent = await emit(first, "bend", {
      code: created.code,
      token: created.token,
      commandId: "bend-1",
      delta: 0,
    });
    assert.equal(bent.ok, true);
    let afterLanding = await landingState;

    if (afterLanding.phase === "reaction") {
      const resolvedState = waitForState(
        second,
        (state) =>
          state.currentSeat === 1 &&
          state.activeTransmission?.landingSeat === 0,
      );
      const rescued = await emit(second, "give_oxygen", {
        code: created.code,
        token: joined.token,
        commandId: "oxygen-1",
      });
      assert.equal(rescued.ok, true);
      afterLanding = await resolvedState;
    }
    assert.equal(afterLanding.currentSeat, 1);

    const reroutedState = waitForState(
      second,
      (state) =>
        state.activeTransmission?.videoId !==
        afterLanding.activeTransmission.videoId,
    );
    const rerouted = await emit(second, "reject_transmission", {
      code: created.code,
      token: joined.token,
      commandId: "reroute-1",
      transmissionId: afterLanding.activeTransmission.transmissionId,
      videoId: afterLanding.activeTransmission.videoId,
    });
    assert.equal(rerouted.ok, true);
    const afterReroute = await reroutedState;
    assert.notEqual(
      afterReroute.activeTransmission.videoId,
      afterLanding.activeTransmission.videoId,
    );
    assert.equal(
      afterReroute.players[0].position,
      afterLanding.players[0].position,
    );
    assert.equal(afterReroute.turnNumber, afterLanding.turnNumber);

    second.disconnect();
    const returning = io(url, { transports: ["websocket"] });
    context.after(() => returning.disconnect());
    await once(returning, "connect");
    const rejoined = await emit(returning, "join_room", {
      code: created.code,
      name: "Witness",
      token: joined.token,
    });
    assert.equal(rejoined.ok, true);
    assert.equal(rejoined.reconnected, true);
    assert.equal(rejoined.playerId, joined.playerId);
  },
);
