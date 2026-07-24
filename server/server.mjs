import http from "node:http";
import crypto from "node:crypto";
import { Server } from "socket.io";
import {
  TURN_MS,
  answerChoice,
  beginGame,
  castCouncilVote,
  claimSeat,
  createCode,
  createRoom,
  giftEcho,
  publicRoom,
  reconnectPlayer,
  removeBot,
  resolveCouncil,
  retryTransmission,
  rollTurn,
  seatPlayer,
  tuneRoll,
  useRelic,
} from "./game-core.mjs";
import { resolveRoomChannel } from "./room-channel.mjs";

const PORT = Number(process.env.GAME_PORT || 3001);
const rooms = new Map();
const socketMembership = new Map();
const botNames = ["Moth", "North", "Palanca", "Alabaster", "Static", "Lantern"];

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        rooms: rooms.size,
        protocol: "sixfold-road-v3",
        channelInput: true,
        youtubeApiConfigured: Boolean(process.env.YOUTUBE_API_KEY),
      }),
    );
    return;
  }
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("OBSCUR room signal online");
});

const allowedOrigins = new Set(
  (
    process.env.CLIENT_ORIGINS ||
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:4175,http://127.0.0.1:4175,https://dreamyyy23.github.io"
  )
    .split(",")
    .map((value) => value.trim()),
);

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Origin not admitted to this table."));
    },
  },
  transports: ["websocket", "polling"],
});

function emitRoom(room) {
  io.to(room.code).emit("room_state", publicRoom(room));
}

function callbackError(callback, error) {
  callback?.({
    ok: false,
    error: error instanceof Error ? error.message : "The signal broke.",
  });
}

function track(socket, room, player = null, spectator = false) {
  socket.join(room.code);
  socketMembership.set(socket.id, {
    roomCode: room.code,
    token: player?.token || null,
    spectator,
  });
  if (spectator) room.spectators.add(socket.id);
}

function scheduleBot(room) {
  if (room.status !== "playing") return;
  const active = room.players[room.currentSeat];
  if (!active?.bot) return;
  const expectedTurn = room.turnNumber;
  setTimeout(() => {
    if (
      room.status !== "playing" ||
      room.turnNumber !== expectedTurn ||
      !room.players[room.currentSeat]?.bot
    ) {
      return;
    }
    try {
      if (room.pendingChoice) {
        const choice = room.pendingChoice.event.choices[0];
        answerChoice(room, null, choice.id, { automated: true });
      } else {
        rollTurn(room, null, { automated: true });
      }
      emitRoom(room);
      scheduleBot(room);
    } catch {
      // The one-second authority tick will recover an interrupted bot.
    }
  }, 1_500);
}

io.on("connection", (socket) => {
  socket.emit("server_hello", {
    protocol: "sixfold-road-v2",
    turnMs: TURN_MS,
  });

  socket.on("create_room", async (payload = {}, callback) => {
    try {
      const youtubeChannel = await resolveRoomChannel(
        payload.youtubeChannelUrl,
        { apiKey: process.env.YOUTUBE_API_KEY },
      );
      const code = createCode(new Set(rooms.keys()));
      const room = createRoom(code, Date.now(), youtubeChannel);
      rooms.set(code, room);
      const player = seatPlayer(room, {
        name: payload.name,
        socketId: socket.id,
      });
      track(socket, room, player);
      callback?.({
        ok: true,
        code,
        token: player.token,
        playerId: player.id,
        state: publicRoom(room),
      });
      emitRoom(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("join_room", (payload = {}, callback) => {
    try {
      const code = String(payload.code || "").toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) throw new Error("No table answered that room code.");

      const returning = payload.token
        ? reconnectPlayer(room, payload.token, socket.id)
        : null;
      if (returning) {
        track(socket, room, returning);
        callback?.({
          ok: true,
          code,
          token: returning.token,
          playerId: returning.id,
          state: publicRoom(room),
          reconnected: true,
        });
        emitRoom(room);
        return;
      }

      try {
        const player = seatPlayer(room, {
          name: payload.name,
          socketId: socket.id,
        });
        track(socket, room, player);
        callback?.({
          ok: true,
          code,
          token: player.token,
          playerId: player.id,
          state: publicRoom(room),
        });
      } catch {
        track(socket, room, null, true);
        callback?.({
          ok: true,
          code,
          token: null,
          playerId: null,
          spectator: true,
          state: publicRoom(room),
        });
      }
      emitRoom(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("start_game", (payload = {}, callback) => {
    try {
      const room = rooms.get(payload.code);
      if (!room) throw new Error("The table is gone.");
      beginGame(room, payload.token);
      callback?.({ ok: true });
      emitRoom(room);
      scheduleBot(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("claim_seat", (payload = {}, callback) => {
    try {
      const room = rooms.get(payload.code);
      if (!room) throw new Error("The table is gone.");
      const player = claimSeat(room, payload.token, Number(payload.seat));
      callback?.({ ok: true, playerId: player.id });
      emitRoom(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("add_bot", (payload = {}, callback) => {
    try {
      const room = rooms.get(payload.code);
      if (!room) throw new Error("The table is gone.");
      if (room.hostToken !== payload.token) {
        throw new Error("Only the table keeper can call an Echo.");
      }
      if (room.status !== "lobby") {
        throw new Error("The crossing has already begun.");
      }
      const existingBots = room.players.filter((player) => player?.bot).length;
      seatPlayer(room, {
        name: botNames[existingBots % botNames.length],
        token: `bot-${crypto.randomUUID()}`,
        bot: true,
      });
      callback?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("remove_bot", (payload = {}, callback) => {
    try {
      const room = rooms.get(payload.code);
      if (!room) throw new Error("The table is gone.");
      removeBot(room, payload.token, Number(payload.seat));
      callback?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("roll", (payload = {}, callback) => {
    try {
      const room = rooms.get(payload.code);
      if (!room) throw new Error("The table is gone.");
      rollTurn(room, payload.token);
      callback?.({ ok: true });
      emitRoom(room);
      scheduleBot(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("reject_transmission", (payload = {}, callback) => {
    try {
      const membership = socketMembership.get(socket.id);
      const room = rooms.get(payload.code);
      if (!room || membership?.roomCode !== room.code) {
        throw new Error("The table is gone.");
      }
      retryTransmission(
        room,
        String(payload.transmissionId || ""),
        String(payload.videoId || ""),
      );
      const state = publicRoom(room);
      callback?.({ ok: true, state });
      emitRoom(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("tune_roll", (payload = {}, callback) => {
    try {
      const room = rooms.get(payload.code);
      if (!room) throw new Error("The table is gone.");
      tuneRoll(room, payload.token, Number(payload.amount));
      callback?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("use_relic", (payload = {}, callback) => {
    try {
      const room = rooms.get(payload.code);
      if (!room) throw new Error("The table is gone.");
      useRelic(room, payload.token, String(payload.relicId || ""));
      callback?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("gift_echo", (payload = {}, callback) => {
    try {
      const room = rooms.get(payload.code);
      if (!room) throw new Error("The table is gone.");
      giftEcho(room, payload.token, Number(payload.targetSeat));
      callback?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("answer_choice", (payload = {}, callback) => {
    try {
      const room = rooms.get(payload.code);
      if (!room) throw new Error("The table is gone.");
      answerChoice(room, payload.token, payload.choiceId);
      callback?.({ ok: true });
      emitRoom(room);
      scheduleBot(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("vote_council", (payload = {}, callback) => {
    try {
      const room = rooms.get(payload.code);
      if (!room) throw new Error("The table is gone.");
      const resolved = castCouncilVote(
        room,
        payload.token,
        String(payload.choiceId || ""),
      );
      callback?.({ ok: true, resolved });
      emitRoom(room);
      if (resolved) scheduleBot(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("disconnect", () => {
    const membership = socketMembership.get(socket.id);
    socketMembership.delete(socket.id);
    if (!membership) return;
    const room = rooms.get(membership.roomCode);
    if (!room) return;
    if (membership.spectator) {
      room.spectators.delete(socket.id);
    } else {
      const player = room.players.find(
        (candidate) => candidate?.token === membership.token,
      );
      if (player) {
        player.online = false;
        player.socketId = null;
      }
    }
    emitRoom(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.status === "playing" && room.deadline && now >= room.deadline) {
      try {
        if (room.pendingCouncil) {
          resolveCouncil(room, now, true);
        } else if (room.pendingChoice) {
          answerChoice(room, null, room.pendingChoice.event.choices[0].id, {
            now,
            automated: true,
          });
        } else {
          rollTurn(room, null, { now, automated: true });
        }
        emitRoom(room);
        scheduleBot(room);
      } catch {
        // Leave state untouched; the next tick can retry.
      }
    } else if (room.status === "playing") {
      emitRoom(room);
    }

    const empty =
      room.players.every((player) => !player || player.bot) &&
      room.spectators.size === 0;
    if (empty && now - room.createdAt > 30 * 60_000) rooms.delete(code);
  }
}, 1_000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`OBSCUR room signal listening on http://localhost:${PORT}`);
});
