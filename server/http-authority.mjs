import crypto from "node:crypto";
import {
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
  useRelic as activateRelic,
} from "./game-core.mjs";
import { resolveRoomChannel } from "./room-channel.mjs";

const ROOM_TTL = 24 * 60 * 60_000;
const BOT_NAMES = ["Moth", "North", "Palanca", "Alabaster", "Static", "Lantern"];
const FIXED_ORIGINS = new Set([
  "https://dreamyyy23.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4175",
  "http://127.0.0.1:4175",
]);

const CREATE_ROOMS_SQL = `
  CREATE TABLE IF NOT EXISTS obscur_rooms (
    code TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

function corsHeaders(request) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  const allowed =
    !origin ||
    origin === requestOrigin ||
    FIXED_ORIGINS.has(origin);
  return {
    "access-control-allow-origin": allowed ? origin || "*" : "null",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
    vary: "Origin",
  };
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function roomToJson(room) {
  return JSON.stringify({
    ...room,
    spectators: Array.from(room.spectators || []),
  });
}

function roomFromJson(value) {
  const room = JSON.parse(value);
  room.spectators = new Set(room.spectators || []);
  return room;
}

async function ensureSchema(db) {
  await db.prepare(CREATE_ROOMS_SQL).run();
}

async function loadRoom(db, code) {
  const row = await db
    .prepare(
      "SELECT state, version FROM obscur_rooms WHERE code = ? AND expires_at > ?",
    )
    .bind(code, Date.now())
    .first();
  if (!row) return null;
  return {
    room: roomFromJson(row.state),
    version: Number(row.version),
  };
}

async function insertRoom(db, room, now) {
  await db
    .prepare(
      "INSERT INTO obscur_rooms (code, state, version, expires_at, updated_at) VALUES (?, ?, 1, ?, ?)",
    )
    .bind(room.code, roomToJson(room), now + ROOM_TTL, now)
    .run();
  return 1;
}

async function saveRoom(db, room, version, now) {
  const result = await db
    .prepare(
      "UPDATE obscur_rooms SET state = ?, version = version + 1, expires_at = ?, updated_at = ? WHERE code = ? AND version = ?",
    )
    .bind(roomToJson(room), now + ROOM_TTL, now, room.code, version)
    .run();
  if (Number(result.meta?.changes || 0) !== 1) {
    throw new Error("The table changed at the same moment. Try that move again.");
  }
  return version + 1;
}

export function settleRoom(room, now) {
  if (room.status !== "playing") return false;

  const active = room.players[room.currentSeat];
  const expired = Boolean(room.deadline && now >= room.deadline);
  const botTurn = Boolean(active?.bot);
  if (!expired && !botTurn) return false;

  if (room.pendingCouncil) {
    if (!expired) return false;
    resolveCouncil(room, now, true);
  } else if (room.pendingChoice) {
    if (!expired && !room.players[room.pendingChoice.seat]?.bot) return false;
    answerChoice(room, null, room.pendingChoice.event.choices[0].id, {
      automated: true,
      now,
    });
  } else {
    // Resolve only one landing per request. The HTTP client polls for the next
    // canonical snapshot, so advancing through several bots here would replace
    // intermediate activeTransmission values before any client could stage them.
    rollTurn(room, null, { automated: true, now });
  }
  return true;
}

function requireRoom(loaded) {
  if (!loaded) throw new Error("No table answered that room code.");
  return loaded;
}

async function createNewRoom(db, name, youtubeChannelUrl, now, env) {
  const youtubeChannel = await resolveRoomChannel(youtubeChannelUrl, {
    apiKey: env.YOUTUBE_API_KEY,
    now,
  });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = createCode();
    const room = createRoom(code, now, youtubeChannel);
    const player = seatPlayer(room, { name });
    try {
      await insertRoom(db, room, now);
      return {
        ok: true,
        code,
        token: player.token,
        playerId: player.id,
        state: publicRoom(room, now),
      };
    } catch (error) {
      if (!String(error).toLowerCase().includes("unique")) throw error;
    }
  }
  throw new Error("The table could not find a free signal.");
}

async function runAction(db, action, payload, now, env) {
  if (action === "health") {
    return {
      ok: true,
      protocol: "sixfold-road-http-v2",
      channelInput: true,
      youtubeApiConfigured: Boolean(env.YOUTUBE_API_KEY),
    };
  }
  if (action === "create_room") {
    return createNewRoom(
      db,
      payload.name,
      payload.youtubeChannelUrl,
      now,
      env,
    );
  }

  const code = String(payload.code || "").toUpperCase().trim();
  const loaded = requireRoom(await loadRoom(db, code));
  const { room } = loaded;
  let version = loaded.version;

  // A receiver error refers to the currently staged landing. Route it before
  // automatic bot settlement has a chance to replace that transmission.
  if (action === "reject_transmission") {
    retryTransmission(
      room,
      String(payload.transmissionId || ""),
      String(payload.videoId || ""),
      { now },
    );
    version = await saveRoom(db, room, version, now);
    return { ok: true, code, state: publicRoom(room, now), version };
  }

  const settled = settleRoom(room, now);

  if (action === "get_state") {
    if (settled) version = await saveRoom(db, room, version, now);
    return { ok: true, code, state: publicRoom(room, now), version };
  }

  if (action === "join_room") {
    const returning = payload.token
      ? reconnectPlayer(room, payload.token, null)
      : null;
    if (returning) {
      await saveRoom(db, room, version, now);
      return {
        ok: true,
        code,
        token: returning.token,
        playerId: returning.id,
        state: publicRoom(room, now),
        reconnected: true,
      };
    }

    try {
      const player = seatPlayer(room, { name: payload.name });
      await saveRoom(db, room, version, now);
      return {
        ok: true,
        code,
        token: player.token,
        playerId: player.id,
        state: publicRoom(room, now),
      };
    } catch {
      if (settled) await saveRoom(db, room, version, now);
      return {
        ok: true,
        code,
        token: null,
        playerId: null,
        spectator: true,
        state: publicRoom(room, now),
      };
    }
  }

  switch (action) {
    case "start_game":
      beginGame(room, payload.token, now);
      break;
    case "claim_seat":
      claimSeat(room, payload.token, Number(payload.seat));
      break;
    case "add_bot": {
      if (room.hostToken !== payload.token) {
        throw new Error("Only the table keeper can call an Echo.");
      }
      if (room.status !== "lobby") {
        throw new Error("The crossing has already begun.");
      }
      const count = room.players.filter((player) => player?.bot).length;
      seatPlayer(room, {
        name: BOT_NAMES[count % BOT_NAMES.length],
        token: `bot-${crypto.randomUUID()}`,
        bot: true,
      });
      break;
    }
    case "remove_bot":
      removeBot(room, payload.token, Number(payload.seat));
      break;
    case "roll":
      rollTurn(room, payload.token, { now });
      break;
    case "tune_roll":
      tuneRoll(room, payload.token, Number(payload.amount));
      break;
    case "use_relic":
      activateRelic(room, payload.token, String(payload.relicId || ""));
      break;
    case "gift_echo":
      giftEcho(room, payload.token, Number(payload.targetSeat));
      break;
    case "answer_choice":
      answerChoice(room, payload.token, String(payload.choiceId || ""), { now });
      break;
    case "vote_council":
      castCouncilVote(room, payload.token, String(payload.choiceId || ""), now);
      break;
    default:
      throw new Error("The authority does not recognize that move.");
  }

  await saveRoom(db, room, version, now);
  return { ok: true, code, state: publicRoom(room, now) };
}

export async function handleAuthorityRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (!env.DB) {
    return json(request, { ok: false, error: "Room storage is unavailable." }, 503);
  }
  if (request.method === "GET") {
    return json(request, { ok: true, protocol: "sixfold-road-http-v1" });
  }
  if (request.method !== "POST") {
    return json(request, { ok: false, error: "Method not allowed." }, 405);
  }

  try {
    await ensureSchema(env.DB);
    const body = await request.json();
    const result = await runAction(
      env.DB,
      String(body.action || ""),
      body.payload || {},
      Date.now(),
      env,
    );
    return json(request, result);
  } catch (error) {
    return json(
      request,
      {
        ok: false,
        error: error instanceof Error ? error.message : "The signal broke.",
      },
      400,
    );
  }
}
