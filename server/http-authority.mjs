import crypto from "node:crypto";
import { createCode } from "./game-core.mjs";
import {
  createRoomV4,
  executeGameCommand,
  migrateRoomState,
  publicRoomV4,
  reconnectPlayerV4,
  registerSpectator,
  seatPlayerV4,
  settleExpiredPhase,
} from "./game-v4.mjs";
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
const rateBuckets = new Map();

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
  const allowed = !origin || origin === requestOrigin || FIXED_ORIGINS.has(origin);
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

function roomFromJson(value, now) {
  const room = JSON.parse(value);
  room.spectators = new Set(room.spectators || []);
  return migrateRoomState(room, now);
}

async function ensureSchema(db, now) {
  await db.prepare(CREATE_ROOMS_SQL).run();
  await db
    .prepare("DELETE FROM obscur_rooms WHERE expires_at <= ?")
    .bind(now)
    .run();
}

async function loadRoom(db, code, now) {
  const row = await db
    .prepare(
      "SELECT state, version FROM obscur_rooms WHERE code = ? AND expires_at > ?",
    )
    .bind(code, now)
    .first();
  if (!row) return null;
  return {
    room: roomFromJson(row.state, now),
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

export class VersionConflictError extends Error {
  constructor() {
    super("The table changed at the same moment.");
    this.name = "VersionConflictError";
    this.code = "version-conflict";
  }
}

// Six seats can legally act in the same instant (Witness, Council, Oxygen).
// The unluckiest writer may lose the compare-and-swap up to five times in a
// full-table pileup, so the ceiling leaves margin beyond that worst case.
const SAVE_RETRY_LIMIT = 8;

// Messages that mean "another traveler legally got there first" — the losing
// command should receive a calm already-resolved reply plus fresh state, not
// a generic error.
const ALREADY_RESOLVED_PATTERNS = [
  /already reached the table/i,
  /already spoken for the turn/i,
  /already voted/i,
  /already locked for this turn/i,
  /already gave oxygen/i,
  /no traveler can receive oxygen/i,
  /no harmful event is waiting/i,
  /no remaining harm to prevent/i,
  /no council ballot is open/i,
  /predictions close when the bone is cast/i,
  /not legal during/i,
];

function isAlreadyResolved(message) {
  return ALREADY_RESOLVED_PATTERNS.some((pattern) => pattern.test(message));
}

async function saveRoom(db, room, version, now) {
  const result = await db
    .prepare(
      "UPDATE obscur_rooms SET state = ?, version = version + 1, expires_at = ?, updated_at = ? WHERE code = ? AND version = ?",
    )
    .bind(roomToJson(room), now + ROOM_TTL, now, room.code, version)
    .run();
  if (Number(result.meta?.changes || 0) !== 1) {
    throw new VersionConflictError();
  }
  return version + 1;
}

function requestIdentity(request, action, payload) {
  const forwarded = request.headers.get("cf-connecting-ip");
  const fallback = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || fallback || "unknown";
  return `${ip}:${action}:${String(payload.code || "").slice(0, 5)}`;
}

function enforceRateLimit(request, action, payload, now) {
  const key = requestIdentity(request, action, payload);
  const createOrJoin = action === "create_room" || action === "join_room";
  const windowMs = createOrJoin ? 60_000 : 10_000;
  const limit = createOrJoin ? 24 : 80;
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new Error("Too many commands reached the table. Wait a moment.");
  }
  if (rateBuckets.size > 2_000) {
    for (const [candidate, value] of rateBuckets) {
      if (now - value.startedAt > 60_000) rateBuckets.delete(candidate);
    }
  }
}

function tokenBelongsToRoom(room, token) {
  if (!token) return false;
  if (room.players.some((player) => player?.token === token)) return true;
  return Boolean(room.spectatorSessions?.[token]);
}

export function settleRoom(room, now, options = {}) {
  return settleExpiredPhase(room, now, options);
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
    const room = createRoomV4(code, now, youtubeChannel);
    const player = seatPlayerV4(room, { name }, now);
    try {
      await insertRoom(db, room, now);
      return {
        ok: true,
        protocol: "sixfold-road-http-v4",
        code,
        token: player.token,
        playerId: player.id,
        state: publicRoomV4(room, now),
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
      protocol: "sixfold-road-http-v4",
      rulesVersion: 4,
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
  const loaded = requireRoom(await loadRoom(db, code, now));
  const { room } = loaded;
  let version = loaded.version;

  if (action === "get_state") {
    const settled = settleRoom(room, now);
    if (settled) version = await saveRoom(db, room, version, now);
    return {
      ok: true,
      protocol: "sixfold-road-http-v4",
      code,
      state: publicRoomV4(room, now),
      version,
    };
  }

  if (action === "join_room") {
    const returning = payload.token
      ? reconnectPlayerV4(room, payload.token, null, now)
      : null;
    if (returning) {
      version = await saveRoom(db, room, version, now);
      return {
        ok: true,
        protocol: "sixfold-road-http-v4",
        code,
        token: returning.token,
        playerId: returning.id,
        state: publicRoomV4(room, now),
        reconnected: true,
        version,
      };
    }
    const returningSpectator =
      payload.token && room.spectatorSessions?.[payload.token]
        ? registerSpectator(room, {
            name: payload.name,
            token: payload.token,
          }, now)
        : null;
    if (returningSpectator) {
      version = await saveRoom(db, room, version, now);
      return {
        ok: true,
        protocol: "sixfold-road-http-v4",
        code,
        token: returningSpectator.token,
        playerId: null,
        spectator: true,
        reconnected: true,
        state: publicRoomV4(room, now),
        version,
      };
    }
    try {
      const player = seatPlayerV4(room, { name: payload.name }, now);
      version = await saveRoom(db, room, version, now);
      return {
        ok: true,
        protocol: "sixfold-road-http-v4",
        code,
        token: player.token,
        playerId: player.id,
        state: publicRoomV4(room, now),
        version,
      };
    } catch {
      const spectator = registerSpectator(room, { name: payload.name }, now);
      version = await saveRoom(db, room, version, now);
      return {
        ok: true,
        protocol: "sixfold-road-http-v4",
        code,
        token: spectator.token,
        playerId: null,
        spectator: true,
        state: publicRoomV4(room, now),
        version,
      };
    }
  }

  if (action === "add_bot") {
    if (room.hostToken !== payload.token) {
      throw new Error("Only the table keeper can call an Echo.");
    }
    if (room.status !== "lobby") {
      throw new Error("The crossing has already begun.");
    }
    const count = room.players.filter((player) => player?.bot).length;
    seatPlayerV4(
      room,
      {
        name: BOT_NAMES[count % BOT_NAMES.length],
        token: `bot-${crypto.randomUUID()}`,
        bot: true,
      },
      now,
    );
    version = await saveRoom(db, room, version, now);
    return {
      ok: true,
      protocol: "sixfold-road-http-v4",
      code,
      state: publicRoomV4(room, now),
      version,
    };
  }

  if (!tokenBelongsToRoom(room, payload.token)) {
    throw new Error("This session does not belong to the table.");
  }

  if (action === "reject_transmission") {
    const command = executeGameCommand(room, action, payload, { now });
    version = await saveRoom(db, room, version, now);
    return {
      ok: true,
      protocol: "sixfold-road-http-v4",
      code,
      duplicate: command.duplicate,
      state: publicRoomV4(room, now),
      version,
    };
  }

  const settled = settleRoom(room, now);
  if (settled) {
    version = await saveRoom(db, room, version, now);
    return {
      ok: false,
      protocol: "sixfold-road-http-v4",
      code,
      settled: true,
      error: "The authority advanced an expired phase. Review the new state.",
      state: publicRoomV4(room, now),
      version,
    };
  }

  let command;
  try {
    command = executeGameCommand(room, action, payload, { now });
  } catch (error) {
    if (error instanceof VersionConflictError) throw error;
    // A rule rejection after (possibly) racing another traveler. Reload a
    // clean snapshot — the in-memory room may hold partial mutations that
    // were never saved — and answer with the current truth attached.
    const message =
      error instanceof Error ? error.message : "The table refused the move.";
    const fresh = await loadRoom(db, code, now);
    return {
      ok: false,
      protocol: "sixfold-road-http-v4",
      code,
      error: message,
      alreadyResolved: isAlreadyResolved(message),
      state: fresh ? publicRoomV4(fresh.room, now) : undefined,
      version: fresh ? fresh.version : undefined,
    };
  }
  version = await saveRoom(db, room, version, now);
  return {
    ok: true,
    protocol: "sixfold-road-http-v4",
    code,
    duplicate: command.duplicate,
    state: publicRoomV4(room, now),
    version,
  };
}

export async function handleAuthorityRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (!env.DB) {
    return json(request, { ok: false, error: "Room storage is unavailable." }, 503);
  }
  if (request.method === "GET") {
    return json(request, {
      ok: true,
      protocol: "sixfold-road-http-v4",
      rulesVersion: 4,
    });
  }
  if (request.method !== "POST") {
    return json(request, { ok: false, error: "Method not allowed." }, 405);
  }

  try {
    const now = Date.now();
    await ensureSchema(env.DB, now);
    const body = await request.json();
    const action = String(body.action || "");
    const payload = body.payload || {};
    enforceRateLimit(request, action, payload, now);
    // Optimistic-concurrency conflicts are retried HERE, server-side, with
    // the same command ID against freshly loaded state. Simultaneous Witness
    // submissions, Council votes, and Oxygen races therefore each resolve
    // exactly once without the browser ever seeing a version error.
    let result;
    for (let attempt = 1; ; attempt += 1) {
      try {
        result = await runAction(env.DB, action, payload, Date.now(), env);
        break;
      } catch (error) {
        if (!(error instanceof VersionConflictError)) throw error;
        if (attempt >= SAVE_RETRY_LIMIT) {
          return json(
            request,
            {
              ok: false,
              error:
                "The table is very busy this instant. The move was not lost — try it again.",
              retryable: true,
            },
            503,
          );
        }
      }
    }
    return json(request, result, result.ok === false ? 409 : 200);
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
