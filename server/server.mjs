import http from "node:http";
import crypto from "node:crypto";
import { Server } from "socket.io";
import { TURN_MS, createCode } from "./game-core.mjs";
import {
  createRoomV4,
  executeGameCommand,
  publicRoomV4,
  reconnectPlayerV4,
  registerSpectator,
  seatPlayerV4,
  settleExpiredPhase,
} from "./game-v4.mjs";
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
        protocol: "sixfold-road-v4",
        rulesVersion: 4,
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
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3100,http://127.0.0.1:3100,http://localhost:3102,http://127.0.0.1:3102,http://localhost:4175,http://127.0.0.1:4175,https://dreamyyy23.github.io"
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
  io.to(room.code).emit("room_state", publicRoomV4(room));
}

function callbackError(callback, error) {
  callback?.({
    ok: false,
    error: error instanceof Error ? error.message : "The signal broke.",
  });
}

function track(socket, room, { player = null, spectator = null } = {}) {
  socket.join(room.code);
  socketMembership.set(socket.id, {
    roomCode: room.code,
    token: player?.token || spectator?.token || null,
    playerId: player?.id || null,
    spectator: Boolean(spectator),
  });
  if (spectator) room.spectators.add(socket.id);
}

function scheduleAuthority(room) {
  if (room.status !== "playing") return;
  const expectedTurn = room.turnNumber;
  const expectedPhase = room.phase;
  setTimeout(() => {
    if (
      room.status !== "playing" ||
      room.turnNumber !== expectedTurn ||
      room.phase !== expectedPhase
    ) {
      return;
    }
    try {
      if (settleExpiredPhase(room, Date.now())) {
        emitRoom(room);
        scheduleAuthority(room);
      }
    } catch {
      // The one-second authority tick retries interrupted bot/timeout work.
    }
  }, 900);
}

function roomFor(payload) {
  const room = rooms.get(String(payload.code || "").toUpperCase());
  if (!room) throw new Error("The table is gone.");
  return room;
}

io.on("connection", (socket) => {
  socket.emit("server_hello", {
    protocol: "sixfold-road-v4",
    rulesVersion: 4,
    turnMs: TURN_MS,
  });

  socket.on("create_room", async (payload = {}, callback) => {
    try {
      const youtubeChannel = await resolveRoomChannel(
        payload.youtubeChannelUrl,
        { apiKey: process.env.YOUTUBE_API_KEY },
      );
      const code = createCode(new Set(rooms.keys()));
      const room = createRoomV4(code, Date.now(), youtubeChannel);
      rooms.set(code, room);
      const player = seatPlayerV4(room, {
        name: payload.name,
        socketId: socket.id,
      });
      track(socket, room, { player });
      callback?.({
        ok: true,
        protocol: "sixfold-road-v4",
        code,
        token: player.token,
        playerId: player.id,
        state: publicRoomV4(room),
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
        ? reconnectPlayerV4(room, payload.token, socket.id)
        : null;
      if (returning) {
        track(socket, room, { player: returning });
        callback?.({
          ok: true,
          protocol: "sixfold-road-v4",
          code,
          token: returning.token,
          playerId: returning.id,
          state: publicRoomV4(room),
          reconnected: true,
        });
        emitRoom(room);
        return;
      }

      const priorSpectator =
        payload.token && room.spectatorSessions?.[payload.token]
          ? registerSpectator(
              room,
              {
                name: payload.name,
                token: payload.token,
                socketId: socket.id,
              },
            )
          : null;
      if (priorSpectator) {
        track(socket, room, { spectator: priorSpectator });
        callback?.({
          ok: true,
          protocol: "sixfold-road-v4",
          code,
          token: priorSpectator.token,
          playerId: null,
          spectator: true,
          reconnected: true,
          state: publicRoomV4(room),
        });
        emitRoom(room);
        return;
      }

      try {
        const player = seatPlayerV4(room, {
          name: payload.name,
          socketId: socket.id,
        });
        track(socket, room, { player });
        callback?.({
          ok: true,
          protocol: "sixfold-road-v4",
          code,
          token: player.token,
          playerId: player.id,
          state: publicRoomV4(room),
        });
      } catch {
        const spectator = registerSpectator(room, {
          name: payload.name,
          socketId: socket.id,
        });
        track(socket, room, { spectator });
        callback?.({
          ok: true,
          protocol: "sixfold-road-v4",
          code,
          token: spectator.token,
          playerId: null,
          spectator: true,
          state: publicRoomV4(room),
        });
      }
      emitRoom(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  socket.on("add_bot", (payload = {}, callback) => {
    try {
      const room = roomFor(payload);
      if (room.hostToken !== payload.token) {
        throw new Error("Only the table keeper can call an Echo.");
      }
      if (room.status !== "lobby") {
        throw new Error("The crossing has already begun.");
      }
      const count = room.players.filter((player) => player?.bot).length;
      seatPlayerV4(room, {
        name: botNames[count % botNames.length],
        token: `bot-${crypto.randomUUID()}`,
        bot: true,
      });
      callback?.({ ok: true, state: publicRoomV4(room) });
      emitRoom(room);
    } catch (error) {
      callbackError(callback, error);
    }
  });

  const mutationEvents = [
    "start_game",
    "claim_seat",
    "remove_bot",
    "leave_seat",
    "select_intent",
    "submit_prediction",
    "cast",
    "roll",
    "bend",
    "tune_roll",
    "give_oxygen",
    "use_mask_power",
    "use_relic",
    "gift_echo",
    "answer_choice",
    "vote_council",
    "set_streamer_mode",
  ];

  for (const event of mutationEvents) {
    socket.on(event, (payload = {}, callback) => {
      try {
        const room = roomFor(payload);
        const membership = socketMembership.get(socket.id);
        if (
          !membership ||
          membership.roomCode !== room.code ||
          (payload.token && membership.token !== payload.token)
        ) {
          throw new Error("This session does not belong to the table.");
        }
        const response = executeGameCommand(room, event, payload);
        const state = publicRoomV4(room);
        callback?.({
          ok: true,
          duplicate: response.duplicate,
          state,
        });
        emitRoom(room);
        scheduleAuthority(room);
      } catch (error) {
        callbackError(callback, error);
      }
    });
  }

  socket.on("reject_transmission", (payload = {}, callback) => {
    try {
      const room = roomFor(payload);
      const membership = socketMembership.get(socket.id);
      if (!membership || membership.roomCode !== room.code) {
        throw new Error("This session does not belong to the table.");
      }
      const response = executeGameCommand(room, "reject_transmission", {
        ...payload,
        token: membership.token,
      });
      const state = publicRoomV4(room);
      callback?.({ ok: true, duplicate: response.duplicate, state });
      emitRoom(room);
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
      const spectator = room.spectatorSessions[membership.token];
      if (spectator) {
        spectator.online = false;
        spectator.socketId = null;
      }
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
    try {
      if (room.status === "playing") {
        if (settleExpiredPhase(room, now)) scheduleAuthority(room);
        emitRoom(room);
      }
    } catch {
      // A later tick or valid command can recover the serialized phase.
    }

    const noHumans = room.players.every((player) => !player || player.bot);
    const noAudience = Object.values(room.spectatorSessions || {}).every(
      (spectator) => spectator.online === false,
    );
    if (noHumans && noAudience && now - room.createdAt > 30 * 60_000) {
      rooms.delete(code);
    }
  }
}, 1_000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`OBSCUR room signal listening on http://localhost:${PORT}`);
});
