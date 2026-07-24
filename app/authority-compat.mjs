export const LEGACY_FOXY_CHANNEL = Object.freeze({
  id: null,
  title: "Foxy Alchemy Studio",
  handle: "@FoxyAlchemyStudio",
  url: "https://www.youtube.com/@FoxyAlchemyStudio",
  brand: "obscur",
  videoCount: 0,
  source: "legacy-authority-bundle",
});

export function authorityModeFromProtocol(protocol) {
  const value = String(protocol || "").toLowerCase();
  if (value.includes("v1")) return "v1";
  if (value.includes("v2") || value.includes("v3")) return "v2";
  return null;
}

export function inferAuthorityMode(room, protocol) {
  const explicit = authorityModeFromProtocol(protocol);
  if (explicit) return explicit;
  if (
    room &&
    (!Object.hasOwn(room, "youtubeChannel") ||
      !Object.hasOwn(room, "activeTransmission"))
  ) {
    return "v1";
  }
  return "v2";
}

function latestLandingLog(room, seat) {
  const playerName = room.players?.[seat]?.name;
  if (!playerName || !Array.isArray(room.log)) return null;
  const castPrefix = `${playerName} cast `;
  const councilText = `${playerName} called the Sixfold Council.`;
  return (
    [...room.log]
      .reverse()
      .find(
        (entry) =>
          typeof entry?.text === "string" &&
          (entry.text.startsWith(castPrefix) || entry.text === councilText),
      ) || null
  );
}

function legacyLandingIdentity(room) {
  const event = room.lastEvent;
  const roll = room.lastRoll;
  if (!event?.videoId || !roll) return null;

  const seat = Number.isInteger(event.landingSeat)
    ? event.landingSeat
    : roll.seat;
  const logEntry = latestLandingLog(room, seat);
  const fallback = [
    room.turnNumber,
    roll.seat,
    roll.from,
    roll.to,
    roll.naturalDie,
    roll.tuning,
  ].join("-");
  const anchor = logEntry?.id || fallback;
  return {
    key: `legacy-${room.code}-${anchor}-${event.videoId}`,
    landingSeat: seat,
    landingSpace: roll.to,
    startedAt: Number(logEntry?.at) || null,
  };
}

/**
 * Normalizes both deployed HTTP v1 room snapshots and current v2 snapshots.
 * The observation cache is only a fallback for unusually old v1 snapshots
 * without log timestamps; it keeps the synthetic start time stable across
 * polling rather than re-triggering playback every 900ms.
 */
export function createAuthorityCompatibility(options = {}) {
  const now = options.now || Date.now;
  const observedAt = new Map();

  return {
    normalize(room, protocol) {
      const mode = inferAuthorityMode(room, protocol);
      if (mode !== "v1") return { mode, room };

      const identity = legacyLandingIdentity(room);
      let activeTransmission = null;
      if (identity) {
        if (!observedAt.has(identity.key)) {
          observedAt.set(identity.key, now());
        }
        activeTransmission = {
          ...room.lastEvent,
          transmissionId: identity.key,
          transmissionStartedAt:
            identity.startedAt || observedAt.get(identity.key),
          landingSeat: identity.landingSeat,
          landingSpace: identity.landingSpace,
          videoTitle:
            room.lastEvent.videoTitle ||
            room.lastEvent.videoLabel ||
            room.lastEvent.title,
          videoSource:
            room.lastEvent.videoSource || LEGACY_FOXY_CHANNEL.title,
          channelUrl:
            room.lastEvent.channelUrl || LEGACY_FOXY_CHANNEL.url,
          channelBrand: "obscur",
        };
      }

      return {
        mode,
        room: {
          ...room,
          youtubeChannel: LEGACY_FOXY_CHANNEL,
          activeTransmission,
        },
      };
    },
  };
}
