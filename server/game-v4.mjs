import crypto from "node:crypto";
import {
  BEND_MS,
  BOARD_SIZE,
  COUNCIL_EVENT_V4,
  COUNCIL_REVEAL_MS,
  DEFAULT_YOUTUBE_CHANNEL,
  EVENTS,
  FINAL_ROUND,
  FOXY_ALCHEMY_TITLES,
  FRACTURE_MS,
  HARD_END_ROUND,
  INTENTS,
  MASKS,
  MAX_PLAYERS,
  OMENS,
  PHASES,
  PREDICTIONS,
  REACTION_MS,
  RELICS,
  RULES_VERSION,
  SIGNAL_MAX,
  SPACE_KINDS,
  TURN_MS,
  VOWS_V4,
  WIN_ECHOES,
  sanitizeName,
} from "./game-core.mjs";

export const STATE_VERSION = 4;
export const EVENT_HISTORY_LIMIT = 480;
export const COMMAND_LEDGER_LIMIT = 320;
export const FOCUS_MAX = 3;
export const RESOLVE_MAX = 3;
export const RELIC_CAPACITY = 2;

export const SPACE_CLASSES = Object.freeze({
  hearth: "light",
  echo: "light",
  archive: "light",
  relic: "light",
  key: "light",
  oracle: "threshold",
  council: "threshold",
  rift: "teeth",
  snare: "teeth",
});

export const FRACTURE_MODIFIERS = Object.freeze([
  {
    id: "road-opens",
    title: "THE ROAD OPENS",
    body: "Movement gains one space this round; positive event Static gains one.",
  },
  {
    id: "lights-remember",
    title: "THE LIGHTS REMEMBER",
    body: "The two lowest-Echo travelers gain one Echo; SHELTER is weakened this round.",
  },
  {
    id: "sixth-wall",
    title: "THE SIXTH WALL",
    body: "Correct Witnesses gain a Thread; risky CLAIM outcomes add extra Static.",
  },
]);

const V4_FEATURES = Object.freeze([
  "rules-v4",
  "intents",
  "witness",
  "post-roll-bend",
  "oxygen",
  "golden-threads",
  "omens",
  "fractures",
  "final-orbit",
  "mask-actives",
  "secret-council",
  "chronicle",
  "broadcast",
  "audience-pulse",
  "idempotent-commands",
]);

const HARM_FIELDS = Object.freeze([
  ["deltaEchoes", "Echo"],
  ["deltaResolve", "Resolve"],
  ["move", "movement"],
]);

function v4Clone(value) {
  return structuredClone(value);
}

function occupiedSeatsV4(room) {
  return room.players
    .map((player, seat) => (player ? seat : null))
    .filter((seat) => seat !== null);
}

function roomChannelV4(room) {
  const channel = room.youtubeChannel || DEFAULT_YOUTUBE_CHANNEL;
  if (!Array.isArray(channel.videos) || channel.videos.length === 0) {
    throw new Error("This table's channel has no public playable videos.");
  }
  return channel;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function seedFromCode(code) {
  let hash = 2166136261;
  for (const character of String(code || "OBSCUR")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

function nextRoomRandom(room, override) {
  if (override) return clamp(Number(override()) || 0, 0, 0.999999999999);
  let state = Number(room.rngState) >>> 0;
  if (!state) state = seedFromCode(room.code);
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  room.rngState = state >>> 0;
  return (room.rngState >>> 0) / 4294967296;
}

function randomIndex(room, length, override) {
  return Math.min(
    Math.max(0, length - 1),
    Math.floor(nextRoomRandom(room, override) * length),
  );
}

function newId(prefix = "event") {
  return `${prefix}-${crypto.randomUUID()}`;
}

function spaceClass(kind) {
  return SPACE_CLASSES[kind] || "light";
}

function staticLabel(value) {
  if (value >= SIGNAL_MAX) return "FRACTURE";
  if (value >= 8) return "HUNGRY";
  if (value >= 4) return "LISTENING";
  return "WHISPERING";
}

function maskForSeat(seat) {
  return v4Clone(MASKS[seat]);
}

function vowForSeat(seat) {
  return {
    ...v4Clone(VOWS_V4[seat]),
    progress: 0,
    complete: false,
  };
}

function applySeatIdentity(player, seat) {
  player.seat = seat;
  player.mask = maskForSeat(seat);
  player.sigil = MASKS[seat].name;
  player.color = MASKS[seat].color;
  player.vow = vowForSeat(seat);
}

function resetPlayerV4(player) {
  player.position = 0;
  player.echoes = 0;
  player.keys = 0;
  player.laps = 0;
  player.focus = 1;
  player.resolve = 2;
  player.relics = [];
  player.warded = false;
  player.exposed = false;
  player.exposedPenaltyPending = false;
  player.maskCharge = 1;
  player.goldenThreads = 0;
  player.relationships = {};
  player.oxygenUsedRound = 0;
  player.predictionRewardRound = 0;
  player.predictionTurnId = null;
  player.rescuePartners = [];
  player.burdens = [];
  player.qualified = false;
  player.qualifiedAtSequence = null;
  player.qualifiedAtTurn = null;
  player.veilGuardLap = -1;
  player.emberKindleLap = -1;
  player.statistics = {
    hearth: 0,
    echo: 0,
    archive: 0,
    oracle: 0,
    key: 0,
    relic: 0,
    rift: 0,
    snare: 0,
    council: 0,
    intents: { claim: 0, shelter: 0, bind: 0 },
    bends: 0,
    predictions: 0,
    correctPredictions: 0,
    oxygenGiven: 0,
    oxygenReceived: 0,
    powersUsed: 0,
  };
  player.vow = vowForSeat(player.seat);
}

function baseEvent(room, partial, now = Date.now()) {
  const sequence = (room.eventSequence || 0) + 1;
  room.eventSequence = sequence;
  return {
    id: partial.id || newId(partial.type || "event"),
    sequence,
    type: partial.type || "table",
    phase: partial.phase || room.phase || PHASES.LOBBY,
    actorSeat: partial.actorSeat,
    targetSeats: partial.targetSeats,
    naturalRoll: partial.naturalRoll,
    finalRoll: partial.finalRoll,
    origin: partial.origin,
    destination: partial.destination,
    spaceKind: partial.spaceKind,
    spaceClass: partial.spaceClass,
    intent: partial.intent,
    omen: partial.omen,
    deltas: partial.deltas || [],
    staticBefore: partial.staticBefore,
    staticAfter: partial.staticAfter,
    severity: partial.severity || "minor",
    title: partial.title || "The Table Moved",
    summary: partial.summary || partial.title || "The table moved.",
    createdAt: now,
    turnNumber: room.turnNumber || 0,
    round: room.round || 0,
    meta: partial.meta,
  };
}

export function appendGameEvent(room, partial, now = Date.now()) {
  const event = baseEvent(room, partial, now);
  room.events ||= [];
  room.events.push(event);
  room.events = room.events.slice(-EVENT_HISTORY_LIMIT);
  room.log ||= [];
  room.log.push({
    id: event.id,
    at: event.createdAt,
    text: event.summary,
  });
  room.log = room.log.slice(-48);
  room.presentationState =
    partial.presentationState ||
    (event.severity === "critical"
      ? "critical"
      : event.severity === "major"
        ? event.type
        : "resolution");
  return event;
}

function publicEventTemplate(event) {
  if (!event) return null;
  const visible = v4Clone(event);
  delete visible.preparedEvents;
  delete visible.privateEffect;
  return visible;
}

function transmissionFieldsV4(event) {
  return {
    transmissionId: event.transmissionId,
    transmissionStartedAt: event.transmissionStartedAt,
    videoId: event.videoId,
    videoUrl: event.videoUrl,
    videoTitle: event.videoTitle,
    videoLabel: event.videoLabel,
    videoSource: event.videoSource,
    channelId: event.channelId,
    channelUrl: event.channelUrl,
    channelBrand: event.channelBrand,
    omen: event.omen,
  };
}

export function omenFromVideoId(videoId) {
  let hash = 2166136261;
  for (const character of String(videoId || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return OMENS[(hash >>> 0) % OMENS.length];
}

function transmissionForV4(room, rng, now = Date.now()) {
  const channel = roomChannelV4(room);
  const video = channel.videos[randomIndex(room, channel.videos.length, rng)];
  const videoId = typeof video === "string" ? video : video.id;
  const videoTitle =
    (typeof video === "string" ? FOXY_ALCHEMY_TITLES[video] : video.title) ||
    "Assigned channel transmission";
  return {
    transmissionId: crypto.randomUUID(),
    transmissionStartedAt: now,
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoTitle,
    videoLabel: "The table chose this transmission",
    videoSource: channel.title || "YouTube",
    channelId: channel.id || null,
    channelUrl: channel.url,
    channelBrand: channel.brand || "obscur",
    omen: omenFromVideoId(videoId),
  };
}

function setActiveTransmissionV4(room, event, player, now) {
  const transmission = {
    ...transmissionFieldsV4(event),
    id: `transmission-${event.transmissionId}`,
    title: event.videoTitle || event.title,
    body: event.body,
    tone: event.tone,
    severity: event.severity || "minor",
    landingSeat: player.seat,
    landingSpace: player.position,
    eventId: event.id,
    eventTitle: event.title,
    transmissionStartedAt: event.transmissionStartedAt || now,
  };
  room.activeTransmission = transmission;
  room.transmissionRecovery = {
    transmissionId: event.transmissionId,
    attemptedVideoIds: [event.videoId],
  };
  room.nextOmen = event.omen;
  return transmission;
}

function pickEventV4(room, kind, rng, now = Date.now()) {
  if (kind === "council") {
    return {
      ...v4Clone(COUNCIL_EVENT_V4),
      ...transmissionForV4(room, rng, now),
    };
  }
  const list = EVENTS[kind] || EVENTS.echo;
  return {
    ...v4Clone(list[randomIndex(room, list.length, rng)]),
    ...transmissionForV4(room, rng, now),
  };
}

function reachableDestinations(player) {
  return Array.from({ length: 6 }, (_, index) => {
    const roll = index + 1;
    const destination = (player.position + roll) % BOARD_SIZE;
    const kind = SPACE_KINDS[destination];
    return {
      roll,
      destination,
      displaySpace: destination + 1,
      kind,
      class: spaceClass(kind),
    };
  });
}

function createInitialLastEvent() {
  return {
    id: "table-wakes",
    title: "The Table Wakes",
    body: "Choose a mask, call companions, then begin the crossing.",
    tone: "quiet",
    severity: "minor",
  };
}

export function createRoomV4(
  code,
  now = Date.now(),
  youtubeChannel = DEFAULT_YOUTUBE_CHANNEL,
  options = {},
) {
  const channel = v4Clone(youtubeChannel || DEFAULT_YOUTUBE_CHANNEL);
  if (!Array.isArray(channel.videos) || channel.videos.length === 0) {
    throw new Error("The selected channel has no public playable videos.");
  }
  const room = {
    rulesVersion: RULES_VERSION,
    stateVersion: STATE_VERSION,
    code,
    createdAt: now,
    youtubeChannel: channel,
    rngState: Number(options.seed) >>> 0 || seedFromCode(code),
    status: "lobby",
    phase: PHASES.LOBBY,
    hostToken: null,
    players: Array(MAX_PLAYERS).fill(null),
    spectators: new Set(),
    spectatorSessions: {},
    currentSeat: null,
    turnNumber: 0,
    round: 0,
    roundState: { participantSeats: [], takenSeats: [] },
    turn: null,
    deadline: null,
    pendingChoice: null,
    pendingCouncil: null,
    pendingReaction: null,
    predictions: {},
    signal: 2,
    fractures: 0,
    collapseCount: 0,
    fractureModifier: null,
    councilModifier: null,
    fractureResume: null,
    hazard: null,
    omen: null,
    nextOmen: null,
    activeTransmission: null,
    transmissionRecovery: null,
    lastResolvedEvent: null,
    lastEvent: createInitialLastEvent(),
    lastRoll: null,
    winnerSeat: null,
    houseVictory: false,
    endgame: {
      mode: "normal",
      triggerRound: null,
      turnsRemaining: null,
    },
    qualifiedOrder: [],
    eventSequence: 0,
    events: [],
    log: [],
    chronicle: null,
    audiencePulse: {
      enabled: false,
      counts: { light: 0, threshold: 0, teeth: 0 },
      total: 0,
      majority: null,
      revealed: false,
      correct: null,
      accuracy: null,
      houseGuess: null,
    },
    streamerMode: false,
    threadPairs: {},
    processedCommands: [],
    presentationState: "lobby",
  };
  appendGameEvent(
    room,
    {
      type: "room-created",
      title: "A Table Surfaced",
      summary: "A new table surfaced between the walls.",
    },
    now,
  );
  return room;
}

export function seatPlayerV4(
  room,
  { name, token, socketId, bot = false },
  now = Date.now(),
) {
  migrateRoomState(room, now);
  if (room.status !== "lobby") {
    throw new Error("The crossing has already begun.");
  }
  const seat = room.players.findIndex((player) => player === null);
  if (seat === -1) throw new Error("All six seats are occupied.");
  const player = {
    id: crypto.randomUUID(),
    token: token || crypto.randomUUID(),
    socketId: socketId || null,
    name: sanitizeName(name),
    online: true,
    bot,
  };
  applySeatIdentity(player, seat);
  resetPlayerV4(player);
  room.players[seat] = player;
  if (!room.hostToken && !bot) room.hostToken = player.token;
  appendGameEvent(
    room,
    {
      type: "seat-claimed",
      actorSeat: seat,
      title: `${player.sigil} Was Claimed`,
      summary: `${player.name} took the ${player.sigil} mask.`,
    },
    now,
  );
  return player;
}

export function claimSeatV4(room, actorToken, targetSeat, now = Date.now()) {
  migrateRoomState(room, now);
  if (room.status !== "lobby") {
    throw new Error("Masks cannot change after the crossing begins.");
  }
  if (
    !Number.isInteger(targetSeat) ||
    targetSeat < 0 ||
    targetSeat >= MAX_PLAYERS
  ) {
    throw new Error("That mask does not exist.");
  }
  if (room.players[targetSeat]) throw new Error("That mask is already claimed.");
  const currentSeat = room.players.findIndex(
    (player) => player?.token === actorToken,
  );
  if (currentSeat === -1) throw new Error("Your seat is no longer at this table.");
  const player = room.players[currentSeat];
  room.players[currentSeat] = null;
  applySeatIdentity(player, targetSeat);
  resetPlayerV4(player);
  room.players[targetSeat] = player;
  appendGameEvent(
    room,
    {
      type: "mask-changed",
      actorSeat: targetSeat,
      title: `${player.sigil} Chosen`,
      summary: `${player.name} chose the ${player.sigil} mask.`,
    },
    now,
  );
  return player;
}

export function reconnectPlayerV4(room, token, socketId, now = Date.now()) {
  migrateRoomState(room, now);
  const player = room.players.find((candidate) => candidate?.token === token);
  if (!player) return null;
  player.socketId = socketId || null;
  player.online = true;
  appendGameEvent(
    room,
    {
      type: "reconnected",
      actorSeat: player.seat,
      title: `${player.sigil} Returned`,
      summary: `${player.name} returned to the table.`,
    },
    now,
  );
  return player;
}

export function registerSpectator(
  room,
  { name, token, socketId } = {},
  now = Date.now(),
) {
  migrateRoomState(room, now);
  const spectatorToken = token || crypto.randomUUID();
  const existing = room.spectatorSessions[spectatorToken];
  const spectator = existing || {
    id: crypto.randomUUID(),
    token: spectatorToken,
    name: sanitizeName(name || "Witness"),
    predictions: 0,
    correctPredictions: 0,
    lastPredictionAt: 0,
  };
  spectator.socketId = socketId || null;
  spectator.online = true;
  room.spectatorSessions[spectatorToken] = spectator;
  return spectator;
}

export function releaseSeat(room, actorToken, now = Date.now()) {
  migrateRoomState(room, now);
  const seat = room.players.findIndex((player) => player?.token === actorToken);
  if (seat === -1) throw new Error("Your seat is no longer at this table.");
  const player = room.players[seat];
  room.players[seat] = null;
  if (room.hostToken === actorToken) {
    room.hostToken =
      room.players.find((candidate) => candidate && !candidate.bot)?.token || null;
  }
  appendGameEvent(
    room,
    {
      type: "seat-released",
      actorSeat: seat,
      title: `${player.sigil} Was Set Down`,
      summary: `${player.name} released the ${player.sigil} mask.`,
    },
    now,
  );
  if (room.status === "playing") {
    room.roundState.participantSeats = room.roundState.participantSeats.filter(
      (candidate) => candidate !== seat,
    );
    if (room.currentSeat === seat) finishTurnV4(room, now);
  }
  return player;
}

function migratePlayer(player, seat) {
  if (!player) return null;
  player.seat = seat;
  player.mask = player.mask?.id === MASKS[seat].id ? player.mask : maskForSeat(seat);
  player.sigil ||= MASKS[seat].name;
  player.color ||= MASKS[seat].color;
  player.position = Number(player.position) || 0;
  player.echoes = Math.max(0, Number(player.echoes) || 0);
  player.keys = Math.max(0, Number(player.keys) || 0);
  player.laps = Math.max(0, Number(player.laps) || 0);
  player.focus = clamp(Number(player.focus) || 0, 0, FOCUS_MAX);
  player.resolve = clamp(Number(player.resolve) || 0, 0, RESOLVE_MAX);
  player.relics = Array.isArray(player.relics)
    ? player.relics.map((relic) => (typeof relic === "string" ? relic : relic.id))
    : [];
  player.warded = Boolean(player.warded);
  player.exposed = Boolean(player.exposed || player.resolve === 0);
  player.exposedPenaltyPending = Boolean(player.exposedPenaltyPending);
  player.maskCharge = clamp(Number(player.maskCharge ?? 1), 0, 1);
  player.goldenThreads = Math.max(0, Number(player.goldenThreads) || 0);
  player.relationships ||= {};
  player.oxygenUsedRound = Number(player.oxygenUsedRound) || 0;
  player.predictionRewardRound = Number(player.predictionRewardRound) || 0;
  player.predictionTurnId ||= null;
  player.rescuePartners = Array.isArray(player.rescuePartners)
    ? player.rescuePartners
    : [];
  player.burdens = Array.isArray(player.burdens) ? player.burdens : [];
  player.qualified = Boolean(player.qualified);
  player.qualifiedAtSequence ??= null;
  player.qualifiedAtTurn ??= null;
  player.veilGuardLap = Number(player.veilGuardLap ?? -1);
  player.emberKindleLap = Number(player.emberKindleLap ?? -1);
  player.statistics ||= {};
  player.statistics.intents ||= { claim: 0, shelter: 0, bind: 0 };
  for (const key of [
    "bends",
    "predictions",
    "correctPredictions",
    "oxygenGiven",
    "oxygenReceived",
    "powersUsed",
  ]) {
    player.statistics[key] = Number(player.statistics[key]) || 0;
  }
  const expectedVow = vowForSeat(seat);
  if (!player.vow || player.vow.kind !== expectedVow.kind) {
    const oldProgress = Number(player.vow?.progress) || 0;
    const oldComplete = Boolean(player.vow?.complete);
    player.vow = {
      ...expectedVow,
      progress: oldComplete ? expectedVow.target : Math.min(oldProgress, expectedVow.target),
      complete: oldComplete,
    };
  }
  return player;
}

export function migrateRoomState(room, now = Date.now()) {
  if (!room || typeof room !== "object") {
    throw new Error("The room snapshot is unreadable.");
  }
  room.players = Array.from({ length: MAX_PLAYERS }, (_, seat) =>
    migratePlayer(room.players?.[seat] || null, seat),
  );
  room.spectators =
    room.spectators instanceof Set
      ? room.spectators
      : new Set(room.spectators || []);
  room.spectatorSessions ||= {};
  if (room.rulesVersion === RULES_VERSION && room.stateVersion === STATE_VERSION) {
    return room;
  }

  const previousVersion = Number(room.rulesVersion || room.stateVersion || 3);
  room.rulesVersion = RULES_VERSION;
  room.stateVersion = STATE_VERSION;
  room.rngState = Number(room.rngState) >>> 0 || seedFromCode(room.code);
  room.phase =
    room.status === "finished"
      ? PHASES.FINISHED
      : room.status === "lobby"
        ? PHASES.LOBBY
        : room.pendingCouncil
          ? PHASES.COUNCIL_VOTE
          : room.pendingChoice
            ? PHASES.ORACLE
            : PHASES.INTENT;
  room.round = Math.max(
    1,
    Number(room.round) ||
      Math.ceil(
        Math.max(1, Number(room.turnNumber) || 1) /
          Math.max(1, occupiedSeatsV4(room).length),
      ),
  );
  room.roundState ||= {
    participantSeats: occupiedSeatsV4(room),
    takenSeats: [],
  };
  room.roundState.participantSeats ||= occupiedSeatsV4(room);
  room.roundState.takenSeats ||= [];
  room.turn ||= null;
  room.pendingReaction ||= null;
  room.predictions ||= {};
  room.fractures = Number(room.fractures ?? room.collapseCount) || 0;
  room.collapseCount = room.fractures;
  room.fractureModifier ||= null;
  room.councilModifier ||= null;
  room.fractureResume ||= null;
  room.omen ||= null;
  room.nextOmen ||= null;
  room.lastResolvedEvent ||= null;
  room.houseVictory = Boolean(room.houseVictory);
  room.endgame ||= {
    mode: "normal",
    triggerRound: null,
    turnsRemaining: null,
  };
  room.qualifiedOrder ||= [];
  room.eventSequence = Number(room.eventSequence) || 0;
  room.events ||= [];
  room.log ||= [];
  room.chronicle ||= null;
  room.audiencePulse ||= {
    enabled: false,
    counts: { light: 0, threshold: 0, teeth: 0 },
    total: 0,
    majority: null,
    revealed: false,
    correct: null,
    accuracy: null,
    houseGuess: null,
  };
  room.streamerMode = Boolean(room.streamerMode);
  room.threadPairs ||= {};
  room.processedCommands ||= [];
  room.presentationState ||= "turn-opening";
  if (room.status === "playing" && !room.turn && room.currentSeat !== null) {
    const player = room.players[room.currentSeat];
    room.turn = player
      ? {
          id: newId("turn"),
          mode: room.endgame.mode === "normal" ? "normal" : room.endgame.mode,
          seat: player.seat,
          round: room.round,
          startedAt: now,
          intent: null,
          bindTargetSeat: null,
          reachable: reachableDestinations(player),
          revealedEvents: {},
          preparedEvents: {},
          naturalRoll: null,
          finalRoll: null,
          bendDelta: 0,
          omen: room.omen,
          predictionSummary: {
            counts: { light: 0, threshold: 0, teeth: 0 },
            total: 0,
            revealed: false,
          },
          reactionEligibleSeats: [],
          ashAlternative: null,
          staticAtStart: room.signal,
        }
      : null;
  }
  appendGameEvent(
    room,
    {
      type: "rules-migrated",
      severity: "major",
      title: "The Table Remembered New Law",
      summary: `Room state migrated from rules v${previousVersion} to v${RULES_VERSION}.`,
    },
    now,
  );
  return room;
}

function buildTurn(room, seat, now, mode = room.endgame?.mode || "normal") {
  const player = room.players[seat];
  if (!player) throw new Error("The active seat is empty.");
  room.omen = room.nextOmen || null;
  room.nextOmen = null;
  room.predictions = {};
  room.audiencePulse = {
    enabled: Boolean(room.streamerMode),
    counts: { light: 0, threshold: 0, teeth: 0 },
    total: 0,
    majority: null,
    revealed: false,
    correct: null,
    accuracy: null,
    houseGuess: null,
  };
  const turn = {
    id: newId("turn"),
    mode:
      mode === "qualification-pending"
        ? "normal"
        : mode === "hard-final"
          ? "hard-final"
          : mode === "final-orbit"
            ? "final-orbit"
            : "normal",
    seat,
    round: room.round,
    startedAt: now,
    intent: null,
    bindTargetSeat: null,
    reachable: reachableDestinations(player),
    revealedEvents: {},
    preparedEvents: {},
    naturalRoll: null,
    finalRoll: null,
    bendDelta: 0,
    bendCost: 0,
    freeBendUsed: false,
    omen: room.omen,
    predictionSummary: {
      counts: { light: 0, threshold: 0, teeth: 0 },
      total: 0,
      revealed: false,
    },
    reactionEligibleSeats: [],
    ashAlternative: null,
    ashArmed: false,
    useAshEvent: false,
    powerUsed: null,
    staticAtStart: room.signal,
    thresholdVowPending: false,
    informedChanged: false,
  };
  room.turn = turn;
  room.currentSeat = seat;
  room.phase = PHASES.INTENT;
  room.deadline = now + TURN_MS;
  room.pendingChoice = null;
  room.pendingCouncil = null;
  room.pendingReaction = null;
  room.lastRoll = null;
  room.hazard = null;
  room.presentationState = "turn-opening";

  for (const candidate of room.players.filter(Boolean)) {
    candidate.predictionTurnId = null;
    if (candidate.bot && candidate.seat !== seat) {
      const counts = turn.reachable.reduce(
        (summary, destination) => {
          summary[destination.class] += 1;
          return summary;
        },
        { light: 0, threshold: 0, teeth: 0 },
      );
      const prediction = ["light", "threshold", "teeth"].sort(
        (left, right) => counts[right] - counts[left],
      )[0];
      room.predictions[`seat:${candidate.seat}`] = {
        type: "player",
        seat: candidate.seat,
        prediction,
        submittedAt: now,
      };
      candidate.predictionTurnId = turn.id;
    }
  }
  refreshPredictionSummary(room);
  appendGameEvent(
    room,
    {
      type: "turn-opened",
      phase: PHASES.INTENT,
      actorSeat: seat,
      title: `${player.sigil} Reads the Road`,
      summary: `${player.name} must choose CLAIM, SHELTER, or BIND.`,
      presentationState: "turn-opening",
    },
    now,
  );
  return turn;
}

function refreshPredictionSummary(room) {
  const counts = { light: 0, threshold: 0, teeth: 0 };
  for (const entry of Object.values(room.predictions || {})) {
    if (PREDICTIONS.includes(entry.prediction)) counts[entry.prediction] += 1;
  }
  const total = counts.light + counts.threshold + counts.teeth;
  if (room.turn) {
    room.turn.predictionSummary = {
      counts,
      total,
      revealed: Boolean(room.turn.predictionSummary?.revealed),
      correctClass: room.turn.predictionSummary?.correctClass || null,
    };
  }
  room.audiencePulse.counts = { ...counts };
  room.audiencePulse.total = total;
  return counts;
}

function nextUntakenSeat(room, currentSeat) {
  const participants = room.roundState.participantSeats.filter(
    (seat) => room.players[seat],
  );
  if (!participants.length) return null;
  for (let step = 1; step <= MAX_PLAYERS; step += 1) {
    const seat = (currentSeat + step) % MAX_PLAYERS;
    if (
      participants.includes(seat) &&
      !room.roundState.takenSeats.includes(seat)
    ) {
      return seat;
    }
  }
  return null;
}

function rankingForQualified(room) {
  return room.players
    .filter((player) => player?.qualified)
    .sort((left, right) => {
      if (right.echoes !== left.echoes) return right.echoes - left.echoes;
      if (Number(right.vow.complete) !== Number(left.vow.complete)) {
        return Number(right.vow.complete) - Number(left.vow.complete);
      }
      if (right.goldenThreads !== left.goldenThreads) {
        return right.goldenThreads - left.goldenThreads;
      }
      if (right.resolve !== left.resolve) return right.resolve - left.resolve;
      return (
        Number(left.qualifiedAtSequence || Number.MAX_SAFE_INTEGER) -
        Number(right.qualifiedAtSequence || Number.MAX_SAFE_INTEGER)
      );
    });
}

function chooseHighlights(events) {
  const priority = {
    winner: 12,
    "house-victory": 12,
    qualification: 10,
    fracture: 9,
    oxygen: 8,
    council: 7,
    "vow-complete": 7,
    "key-found": 7,
    "mask-power": 6,
  };
  return [...events]
    .sort((left, right) => {
      const severity = { critical: 3, major: 2, minor: 1 };
      return (
        (priority[right.type] || 0) -
          (priority[left.type] || 0) ||
        (severity[right.severity] || 0) -
          (severity[left.severity] || 0) ||
        right.sequence - left.sequence
      );
    })
    .slice(0, 3)
    .sort((left, right) => left.sequence - right.sequence)
    .map((event) => ({
      id: event.id,
      sequence: event.sequence,
      type: event.type,
      title: event.title,
      summary: event.summary,
      turnNumber: event.turnNumber,
      round: event.round,
    }));
}

function generateChronicle(room, now, decisiveEvent) {
  const events = room.events || [];
  const winner = room.winnerSeat === null ? null : room.players[room.winnerSeat];
  room.chronicle = {
    rulesVersion: RULES_VERSION,
    outcome: room.houseVictory ? "house" : "traveler",
    winnerSeat: room.winnerSeat,
    winnerName: winner?.name || null,
    winnerMask: winner?.sigil || null,
    decisiveTurn: decisiveEvent
      ? {
          turnNumber: decisiveEvent.turnNumber,
          round: decisiveEvent.round,
          title: decisiveEvent.title,
          summary: decisiveEvent.summary,
        }
      : null,
    rescues: events.filter((event) => event.type === "oxygen"),
    councils: events.filter((event) => event.type === "council"),
    fractures: events.filter((event) => event.type === "fracture"),
    vowCompletions: events.filter((event) => event.type === "vow-complete"),
    keysFound: events.filter((event) => event.type === "key-found"),
    finalTransmission: room.activeTransmission
      ? {
          transmissionId: room.activeTransmission.transmissionId,
          videoId: room.activeTransmission.videoId,
          videoTitle: room.activeTransmission.videoTitle,
          videoSource: room.activeTransmission.videoSource,
          omen: room.activeTransmission.omen,
        }
      : null,
    highlights: chooseHighlights(events),
    generatedAt: now,
  };
  return room.chronicle;
}

function finishMatch(room, outcome, now = Date.now(), reason = "") {
  if (room.status === "finished") return room;
  room.status = "finished";
  room.phase = PHASES.FINISHED;
  room.deadline = null;
  room.turn = null;
  room.pendingChoice = null;
  room.pendingCouncil = null;
  room.pendingReaction = null;
  room.endgame.turnsRemaining = 0;
  room.houseVictory = outcome === "house";
  if (outcome === "traveler") {
    const [winner] = rankingForQualified(room);
    room.winnerSeat = winner?.seat ?? null;
  } else {
    room.winnerSeat = null;
  }
  const winner = room.winnerSeat === null ? null : room.players[room.winnerSeat];
  const decisive = appendGameEvent(
    room,
    outcome === "house"
      ? {
          type: "house-victory",
          severity: "critical",
          title: "THE HOUSE REMEMBERS",
          summary:
            reason ||
            "No traveler escaped before the table closed the final road.",
          presentationState: "house-victory",
        }
      : {
          type: "winner",
          severity: "critical",
          actorSeat: winner?.seat,
          title: `${winner?.sigil || "A TRAVELER"} ESCAPES`,
          summary: `${winner?.name || "A traveler"} wins after the Final Orbit by the table's visible tiebreakers.`,
          presentationState: "winner",
        },
    now,
  );
  room.lastEvent = {
    id: decisive.id,
    title: decisive.title,
    body: decisive.summary,
    tone: outcome === "house" ? "danger" : "gold",
    severity: "critical",
  };
  generateChronicle(room, now, decisive);
  return room;
}

export function checkQualifications(
  room,
  now = Date.now(),
  reason = "state mutation",
) {
  migrateRoomState(room, now);
  const newlyQualified = [];
  for (const player of room.players.filter(Boolean)) {
    const qualifies =
      player.laps >= 1 && player.keys >= 1 && player.echoes >= WIN_ECHOES;
    if (!qualifies || player.qualified) continue;
    player.qualified = true;
    player.qualifiedAtSequence = room.eventSequence + 1;
    player.qualifiedAtTurn = room.turnNumber;
    room.qualifiedOrder.push(player.seat);
    newlyQualified.push(player);
    appendGameEvent(
      room,
      {
        type: "qualification",
        severity: "critical",
        actorSeat: player.seat,
        title: `${player.sigil} IS QUALIFIED`,
        summary: `${player.name} holds ${player.echoes} Echoes, a Key, and a completed circuit (${reason}).`,
        presentationState: "qualification",
      },
      now,
    );
  }
  if (
    newlyQualified.length &&
    room.endgame.mode === "normal"
  ) {
    room.endgame = {
      mode: "qualification-pending",
      triggerRound: room.round,
      turnsRemaining:
        room.roundState.participantSeats.length -
        room.roundState.takenSeats.length,
    };
  }
  return newlyQualified;
}

function startRound(room, mode, now) {
  const participants = occupiedSeatsV4(room);
  if (!participants.length) {
    room.status = "lobby";
    room.phase = PHASES.LOBBY;
    room.currentSeat = null;
    room.deadline = null;
    return;
  }
  room.roundState = {
    participantSeats: participants,
    takenSeats: [],
  };
  room.endgame.mode = mode;
  room.endgame.turnsRemaining = participants.length;
  buildTurn(room, participants[0], now, mode);
}

function completeRound(room, now) {
  const completedRound = room.round;
  if (
    room.fractureModifier &&
    room.fractureModifier.expiresAfterRound <= completedRound
  ) {
    room.fractureModifier = null;
  }
  if (
    room.councilModifier &&
    room.councilModifier.expiresAfterRound <= completedRound
  ) {
    room.councilModifier = null;
  }
  room.threadPairs = {};

  if (room.endgame.mode === "qualification-pending") {
    room.round += 1;
    room.turnNumber += 1;
    room.endgame = {
      mode: "final-orbit",
      triggerRound: room.endgame.triggerRound || completedRound,
      turnsRemaining: occupiedSeatsV4(room).length,
    };
    appendGameEvent(
      room,
      {
        type: "final-orbit",
        severity: "critical",
        title: "FINAL ORBIT",
        summary:
          "Every occupied traveler receives one last turn before the table chooses among the qualified.",
        presentationState: "final-orbit",
      },
      now,
    );
    startRound(room, "final-orbit", now);
    return;
  }

  if (room.endgame.mode === "final-orbit") {
    if (rankingForQualified(room).length) {
      finishMatch(room, "traveler", now);
    } else {
      finishMatch(
        room,
        "house",
        now,
        "The Final Orbit closed without a qualified traveler.",
      );
    }
    return;
  }

  if (room.endgame.mode === "hard-final") {
    if (rankingForQualified(room).length) {
      finishMatch(room, "traveler", now);
    } else {
      finishMatch(
        room,
        "house",
        now,
        "Round thirteen ended without a qualified traveler.",
      );
    }
    return;
  }

  if (completedRound >= HARD_END_ROUND) {
    room.round = FINAL_ROUND;
    room.turnNumber += 1;
    room.endgame = {
      mode: "hard-final",
      triggerRound: HARD_END_ROUND,
      turnsRemaining: occupiedSeatsV4(room).length,
    };
    appendGameEvent(
      room,
      {
        type: "hard-final",
        severity: "critical",
        title: "THE LAST ROUND",
        summary:
          "No traveler has triggered the Final Orbit. Every occupied mask receives one mandatory final turn.",
        presentationState: "final-orbit",
      },
      now,
    );
    startRound(room, "hard-final", now);
    return;
  }

  room.round += 1;
  room.turnNumber += 1;
  startRound(room, "normal", now);
}

export function finishTurnV4(room, now = Date.now()) {
  if (room.status !== "playing") return room;
  const seat = room.currentSeat;
  if (
    seat !== null &&
    room.roundState.participantSeats.includes(seat) &&
    !room.roundState.takenSeats.includes(seat)
  ) {
    room.roundState.takenSeats.push(seat);
  }
  if (room.endgame.mode !== "normal") {
    room.endgame.turnsRemaining = Math.max(
      0,
      room.roundState.participantSeats.filter((candidate) => room.players[candidate])
        .length - room.roundState.takenSeats.length,
    );
  }
  const activePlayer = seat === null ? null : room.players[seat];
  if (
    activePlayer?.mask.id === "ash" &&
    room.turn?.useAshEvent &&
    room.signal <= room.turn.staticAtStart
  ) {
    progressVowV4(room, activePlayer, 1, now, "Last Witness kept the Static still");
    // Ash's authored vow requires two successful Witness turns. Preserve the
    // charge after the first success so the vow is achievable without adding a
    // second generic recharge currency.
    if (!activePlayer.vow.complete) activePlayer.maskCharge = 1;
  }
  const nextSeat = nextUntakenSeat(room, seat ?? 0);
  if (nextSeat === null) {
    completeRound(room, now);
    return room;
  }
  room.turnNumber += 1;
  buildTurn(room, nextSeat, now, room.endgame.mode);
  return room;
}

export function beginGameV4(room, actorToken, now = Date.now()) {
  migrateRoomState(room, now);
  if (room.hostToken !== actorToken) {
    throw new Error("Only the table keeper can begin.");
  }
  if (room.status !== "lobby" && room.status !== "finished") {
    throw new Error("The crossing has already begun.");
  }
  const participants = occupiedSeatsV4(room);
  if (!participants.length) throw new Error("The table needs at least one traveler.");
  for (const player of room.players.filter(Boolean)) resetPlayerV4(player);
  room.status = "playing";
  room.phase = PHASES.INTENT;
  room.currentSeat = participants[0];
  room.turnNumber = 1;
  room.round = 1;
  room.roundState = { participantSeats: participants, takenSeats: [] };
  room.signal = 2;
  room.fractures = 0;
  room.collapseCount = 0;
  room.fractureModifier = null;
  room.councilModifier = null;
  room.fractureResume = null;
  room.hazard = null;
  room.omen = null;
  room.nextOmen = null;
  room.activeTransmission = null;
  room.transmissionRecovery = null;
  room.lastResolvedEvent = null;
  room.lastRoll = null;
  room.winnerSeat = null;
  room.houseVictory = false;
  room.qualifiedOrder = [];
  room.chronicle = null;
  room.endgame = {
    mode: "normal",
    triggerRound: null,
    turnsRemaining: null,
  };
  room.threadPairs = {};
  appendGameEvent(
    room,
    {
      type: "game-started",
      severity: "major",
      title: "THE ROAD OPENS",
      summary: "The Sixfold Road began to move.",
      presentationState: "turn-opening",
    },
    now,
  );
  buildTurn(room, participants[0], now, "normal");
  return room;
}

function completeVowV4(room, player, now, reason) {
  if (player.vow.complete || player.vow.progress < player.vow.target) return false;
  player.vow.complete = true;
  player.echoes += 3;
  player.focus = clamp(player.focus + 1, 0, FOCUS_MAX);
  player.maskCharge = 1;
  appendGameEvent(
    room,
    {
      type: "vow-complete",
      severity: "major",
      actorSeat: player.seat,
      deltas: [
        { seat: player.seat, resource: "echoes", amount: 3 },
        { seat: player.seat, resource: "focus", amount: 1 },
        { seat: player.seat, resource: "maskCharge", amount: 1 },
      ],
      title: `${player.vow.title.toUpperCase()} FULFILLED`,
      summary: `${player.name} fulfilled ${player.vow.title}: ${reason}.`,
      presentationState: "vow-completion",
    },
    now,
  );
  checkQualifications(room, now, "vow completion");
  return true;
}

function progressVowV4(room, player, amount, now, reason) {
  if (!player || player.vow.complete || amount <= 0) return false;
  player.vow.progress = Math.min(player.vow.target, player.vow.progress + amount);
  return completeVowV4(room, player, now, reason);
}

function pairKey(leftSeat, rightSeat) {
  return [leftSeat, rightSeat].sort((left, right) => left - right).join(":");
}

function formGoldenThread(
  room,
  giver,
  receiver,
  now,
  { both = false, force = false } = {},
) {
  if (!giver || !receiver || giver.seat === receiver.seat) return false;
  const key = pairKey(giver.seat, receiver.seat);
  if (!force && room.threadPairs[key] === room.round) return false;
  room.threadPairs[key] = room.round;
  giver.goldenThreads += 1;
  if (both) receiver.goldenThreads += 1;
  giver.relationships[receiver.seat] =
    (giver.relationships[receiver.seat] || 0) + 1;
  receiver.relationships[giver.seat] =
    (receiver.relationships[giver.seat] || 0) + 1;
  appendGameEvent(
    room,
    {
      type: "golden-thread",
      actorSeat: giver.seat,
      targetSeats: [receiver.seat],
      title: "GOLDEN THREAD FORMED",
      summary: `${giver.name} and ${receiver.name} formed a visible Golden Thread.`,
      deltas: [
        { seat: giver.seat, resource: "goldenThreads", amount: 1 },
        ...(both
          ? [{ seat: receiver.seat, resource: "goldenThreads", amount: 1 }]
          : []),
      ],
    },
    now,
  );
  return true;
}

function activePlayerFor(room, actorToken, expectedPhase) {
  if (room.status !== "playing") throw new Error("The road is not moving.");
  if (expectedPhase && room.phase !== expectedPhase) {
    throw new Error(`That action is not legal during ${room.phase}.`);
  }
  const player = room.players[room.currentSeat];
  if (!player) throw new Error("The active seat is empty.");
  if (actorToken !== null && actorToken !== undefined && player.token !== actorToken) {
    throw new Error("It is not your turn.");
  }
  return player;
}

function consumeBurden(player, burdenId) {
  const index = player.burdens.findIndex((burden) => burden.id === burdenId);
  if (index === -1) return null;
  return player.burdens.splice(index, 1)[0];
}

export function selectIntent(
  room,
  actorToken,
  intent,
  targetSeat,
  options = {},
) {
  const now = options.now ?? Date.now();
  migrateRoomState(room, now);
  const player = activePlayerFor(room, actorToken, PHASES.INTENT);
  const normalized = String(intent || "").toLowerCase();
  if (!INTENTS.includes(normalized)) {
    throw new Error("Choose CLAIM, SHELTER, or BIND.");
  }
  const shelterOath = player.burdens.find((burden) => burden.id === "must-shelter");
  if (shelterOath && normalized !== "shelter") {
    throw new Error("Your Oracle oath requires SHELTER this turn.");
  }
  let bindTargetSeat = null;
  if (normalized === "bind") {
    bindTargetSeat = Number(targetSeat);
    const target = room.players[bindTargetSeat];
    if (!target || target.seat === player.seat) {
      throw new Error("BIND requires another occupied traveler.");
    }
  }
  if (shelterOath) consumeBurden(player, "must-shelter");
  room.turn.intent = normalized;
  room.turn.bindTargetSeat = bindTargetSeat;
  player.statistics.intents[normalized] += 1;
  room.presentationState = "intent-locked";
  appendGameEvent(
    room,
    {
      type: "intent",
      actorSeat: player.seat,
      targetSeats: bindTargetSeat === null ? undefined : [bindTargetSeat],
      intent: normalized,
      title: `${player.sigil} CHOSE ${normalized.toUpperCase()}`,
      summary:
        normalized === "bind"
          ? `${player.name} bound their route to ${room.players[bindTargetSeat].name}.`
          : `${player.name} chose ${normalized.toUpperCase()} before the cast.`,
      presentationState: "intent-locked",
    },
    now,
  );
  return room.turn;
}

function predictionActor(room, actorToken, spectatorId) {
  const player = room.players.find((candidate) => candidate?.token === actorToken);
  if (player) return { type: "player", player, key: `seat:${player.seat}` };
  const token = spectatorId || actorToken;
  const spectator = token ? room.spectatorSessions[token] : null;
  if (spectator) {
    return { type: "spectator", spectator, key: `spectator:${spectator.token}` };
  }
  throw new Error("Only a traveler or registered spectator may Witness.");
}

export function submitPrediction(
  room,
  actorToken,
  prediction,
  options = {},
) {
  const now = options.now ?? Date.now();
  migrateRoomState(room, now);
  if (room.status !== "playing" || room.phase !== PHASES.INTENT) {
    throw new Error("Witness predictions close when the bone is cast.");
  }
  const normalized = String(prediction || "").toLowerCase();
  if (!PREDICTIONS.includes(normalized)) {
    throw new Error("Predict LIGHT, THRESHOLD, or TEETH.");
  }
  const actor = predictionActor(room, actorToken, options.spectatorId);
  if (room.predictions[actor.key]) {
    throw new Error("This Witness has already spoken for the turn.");
  }
  if (actor.player?.seat === room.currentSeat) {
    throw new Error("The active traveler cannot Witness their own cast.");
  }
  if (
    actor.spectator &&
    now - Number(actor.spectator.lastPredictionAt || 0) < 400
  ) {
    throw new Error("The audience pulse is rate-limited.");
  }
  room.predictions[actor.key] = {
    type: actor.type,
    seat: actor.player?.seat,
    spectatorToken: actor.spectator?.token,
    prediction: normalized,
    submittedAt: now,
  };
  if (actor.player) {
    actor.player.predictionTurnId = room.turn.id;
    actor.player.statistics.predictions += 1;
  } else {
    actor.spectator.lastPredictionAt = now;
    actor.spectator.predictions += 1;
  }
  refreshPredictionSummary(room);
  return true;
}

function revealPredictions(room, correctClass, now) {
  const counts = refreshPredictionSummary(room);
  let correct = 0;
  let spectatorCorrect = 0;
  let spectatorTotal = 0;
  for (const entry of Object.values(room.predictions)) {
    const isCorrect = entry.prediction === correctClass;
    if (isCorrect) correct += 1;
    if (entry.type === "player" && entry.seat !== undefined) {
      const player = room.players[entry.seat];
      if (
        player &&
        isCorrect &&
        player.predictionRewardRound !== room.round
      ) {
        player.focus = clamp(player.focus + 1, 0, FOCUS_MAX);
        player.predictionRewardRound = room.round;
        player.statistics.correctPredictions += 1;
        if (room.fractureModifier?.id === "sixth-wall") {
          player.goldenThreads += 1;
        }
      }
    } else if (entry.type === "spectator") {
      spectatorTotal += 1;
      if (isCorrect) {
        spectatorCorrect += 1;
        const spectator = room.spectatorSessions[entry.spectatorToken];
        if (spectator) spectator.correctPredictions += 1;
      }
    }
  }
  const majority = ["light", "threshold", "teeth"].sort(
    (left, right) => counts[right] - counts[left],
  )[0];
  room.turn.predictionSummary = {
    counts,
    total: Object.keys(room.predictions).length,
    revealed: true,
    correctClass,
    correct,
  };
  room.audiencePulse = {
    ...room.audiencePulse,
    counts,
    total: Object.keys(room.predictions).length,
    majority: room.audiencePulse.total ? majority : null,
    revealed: true,
    correct: spectatorCorrect,
    accuracy: spectatorTotal ? spectatorCorrect / spectatorTotal : null,
    houseGuess:
      room.streamerMode && spectatorTotal >= 3 ? majority : null,
  };
  if (room.audiencePulse.houseGuess) {
    appendGameEvent(
      room,
      {
        type: "house-guess",
        title: "THE HOUSE'S GUESS",
        summary: `The audience chose ${majority.toUpperCase()}; the cast revealed ${correctClass.toUpperCase()}.`,
        meta: {
          guess: majority,
          correct: majority === correctClass,
        },
      },
      now,
    );
  }
}

function prepareExactEvent(room, roll, rng, now) {
  const destination = room.turn.reachable.find((entry) => entry.roll === roll);
  if (!destination) throw new Error("That result is not reachable.");
  if (!room.turn.preparedEvents[roll]) {
    room.turn.preparedEvents[roll] = pickEventV4(
      room,
      destination.kind,
      rng,
      now,
    );
  }
  room.turn.revealedEvents[roll] = publicEventTemplate(
    room.turn.preparedEvents[roll],
  );
  return room.turn.revealedEvents[roll];
}

function chooseRevealRolls(room, requested, rng) {
  const valid = Array.from(
    new Set(
      (Array.isArray(requested) ? requested : [])
        .map(Number)
        .filter((roll) => Number.isInteger(roll) && roll >= 1 && roll <= 6),
    ),
  );
  const pool = [1, 2, 3, 4, 5, 6].filter((roll) => !valid.includes(roll));
  while (valid.length < 2 && pool.length) {
    valid.push(pool.splice(randomIndex(room, pool.length, rng), 1)[0]);
  }
  return valid.slice(0, 2);
}

export function castTurn(room, actorToken, options = {}) {
  const now = options.now ?? Date.now();
  const rng = options.rng;
  const automated = Boolean(options.automated);
  migrateRoomState(room, now);
  const player = activePlayerFor(
    room,
    automated ? null : actorToken,
    PHASES.INTENT,
  );
  if (!room.turn.intent) {
    if (!automated) {
      throw new Error("Choose an Intent before casting.");
    }
    selectIntent(room, player.token, "shelter", null, { now });
  }
  const naturalRoll = Math.floor(nextRoomRandom(room, rng) * 6) + 1;
  const naturalDestination = room.turn.reachable.find(
    (entry) => entry.roll === naturalRoll,
  );
  room.turn.naturalRoll = naturalRoll;
  room.turn.finalRoll = naturalRoll;
  room.turn.bendDelta = 0;
  if (room.turn.omen === "moth") {
    prepareExactEvent(room, naturalRoll, rng, now);
  }
  revealPredictions(room, naturalDestination.class, now);
  room.phase = PHASES.BEND;
  room.deadline = now + BEND_MS;
  room.lastRoll = {
    seat: player.seat,
    die: naturalRoll,
    naturalDie: naturalRoll,
    tuning: 0,
    bendDelta: 0,
    from: player.position,
    to: naturalDestination.destination,
    resolved: false,
  };
  room.presentationState = "cast";
  appendGameEvent(
    room,
    {
      type: "cast",
      phase: PHASES.BEND,
      actorSeat: player.seat,
      naturalRoll,
      finalRoll: naturalRoll,
      origin: player.position,
      destination: naturalDestination.destination,
      spaceKind: naturalDestination.kind,
      spaceClass: naturalDestination.class,
      intent: room.turn.intent,
      omen: room.turn.omen,
      severity: "major",
      title: `NATURAL ${naturalRoll}`,
      summary: `${player.sigil} cast ${naturalRoll}; ${naturalDestination.class.toUpperCase()} waits under the bone.`,
      presentationState: "bend-decision",
    },
    now,
  );
  room.presentationState = "bend-decision";
  return room.turn;
}

function movePlayerV4(player, amount) {
  if (!amount) return { crossedHearth: false, origin: player.position };
  const origin = player.position;
  const raw = player.position + amount;
  let circuits = 0;
  if (amount > 0 && raw >= BOARD_SIZE) {
    circuits = Math.floor(raw / BOARD_SIZE);
    player.laps += circuits;
  }
  player.position = ((raw % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  return {
    origin,
    crossedHearth: circuits > 0,
    circuits,
  };
}

function applyMaskPassiveV4(room, player, kind, event, now) {
  if (
    player.mask.id === "ember" &&
    kind === "echo" &&
    player.emberKindleLap !== player.laps
  ) {
    player.emberKindleLap = player.laps;
    event.deltaEchoes = (event.deltaEchoes || 0) + 1;
    event.body += " Ember kindles the first Echo of this circuit.";
  }
  if (
    player.mask.id === "veil" &&
    kind === "snare" &&
    player.veilGuardLap !== player.laps
  ) {
    const before =
      Math.abs(Math.min(0, event.deltaEchoes || 0)) +
      Math.abs(Math.min(0, event.deltaResolve || 0)) +
      Math.abs(Math.min(0, event.move || 0));
    player.veilGuardLap = player.laps;
    event.deltaEchoes = Math.max(0, event.deltaEchoes || 0);
    event.deltaResolve = Math.max(0, event.deltaResolve || 0);
    event.move = Math.max(0, event.move || 0);
    if (before) {
      event.prevented = (event.prevented || 0) + before;
      event.deltaEchoes = (event.deltaEchoes || 0) + 4;
      progressVowV4(room, player, 1, now, "Veil let a Snare pass through");
    }
    event.body +=
      " Veil lets the first Snare of the circuit pass through and keeps four Echoes.";
  }
  if (player.mask.id === "thorn" && kind === "rift") {
    event.move = (event.move || 0) + 1;
    event.deltaEchoes = (event.deltaEchoes || 0) + 4;
    event.body +=
      " Thorn bends the road one space farther and takes four Echoes.";
  }
  if (player.mask.id === "moon" && kind === "archive") {
    event.deltaFocus = (event.deltaFocus || 0) + 1;
    event.deltaEchoes = (event.deltaEchoes || 0) + 3;
    event.body += " Moon hears a second frequency and recovers three Echoes.";
  }
  if (player.mask.id === "moss" && kind === "hearth") {
    event.deltaResolve = (event.deltaResolve || 0) + 1;
    event.deltaEchoes = (event.deltaEchoes || 0) + 4;
    event.body += " Moss takes root, restores Resolve, and tends four Echoes.";
  }
  if (player.mask.id === "ash") {
    const quieted = room.signal >= 8;
    room.signal = Math.max(0, room.signal - 1);
    if (quieted) event.deltaEchoes = (event.deltaEchoes || 0) + 1;
    event.body += quieted
      ? " Ash quiets one hungry Static and recovers one Echo from the silence."
      : " Ash quiets one Static.";
  }
}

function reduceFirstNegative(event, amount) {
  let remaining = amount;
  let prevented = 0;
  for (const [field] of HARM_FIELDS.slice(0, 2)) {
    const value = Number(event[field]) || 0;
    if (value >= 0 || remaining <= 0) continue;
    const reduction = Math.min(remaining, Math.abs(value));
    event[field] += reduction;
    remaining -= reduction;
    prevented += reduction;
  }
  return prevented;
}

function applyTurnModifiers(room, player, event, kind, className, now) {
  const originalHarm =
    Math.abs(Math.min(0, event.deltaEchoes || 0)) +
    Math.abs(Math.min(0, event.deltaResolve || 0)) +
    Math.abs(Math.min(0, event.move || 0));
  applyMaskPassiveV4(room, player, kind, event, now);
  // V4 removes automatic per-cast Static and softens legacy event spikes by
  // one. Escalation now comes from authored danger, risky Intent, powers,
  // Omens, and Council law rather than simply from time passing.
  if ((event.staticDelta || 0) > 0) {
    event.staticDelta = Math.max(0, event.staticDelta - 1);
  }

  if (room.turn.omen === "flame" && (event.deltaEchoes || 0) > 0) {
    event.deltaEchoes += 1;
    event.omenApplied = "flame";
  } else if (room.turn.omen === "mirror") {
    const prevented = reduceFirstNegative(event, 1);
    if (prevented) {
      event.prevented = (event.prevented || 0) + prevented;
      event.omenApplied = "mirror";
    }
  } else if (room.turn.omen === "static") {
    if ((event.deltaEchoes || 0) > 0) event.deltaEchoes += 1;
    else if ((event.deltaFocus || 0) > 0) event.deltaFocus += 1;
    else if ((event.deltaResolve || 0) > 0) event.deltaResolve += 1;
    event.staticDelta = (event.staticDelta || 0) + 1;
    event.omenApplied = "static";
  }

  if (player.mask.id === "moon" && room.turn.informedChanged) {
    event.deltaEchoes = (event.deltaEchoes || 0) + 1;
    event.body += " Moon earns one Echo for changing a revealed future.";
  }
  if (player.mask.id === "ash" && room.turn.useAshEvent) {
    event.deltaEchoes = (event.deltaEchoes || 0) + 2;
    event.body += " Ash recovers two Echoes from the kept event.";
  }

  if (room.fractureModifier?.id === "road-opens") {
    event.move = (event.move || 0) + 1;
    if ((event.staticDelta || 0) > 0) event.staticDelta += 1;
  }
  if (room.councilModifier?.id === "watch" && className === "light") {
    event.deltaEchoes = Math.max(0, (event.deltaEchoes || 0) - 1);
  } else if (room.councilModifier?.id === "open") {
    if (className === "light") event.deltaEchoes = (event.deltaEchoes || 0) + 1;
    if (className === "teeth") event.staticDelta = (event.staticDelta || 0) + 1;
  } else if (
    room.councilModifier?.id === "knot" &&
    room.turn.intent === "claim"
  ) {
    event.staticDelta = (event.staticDelta || 0) + 1;
  }

  if (room.turn.intent === "claim") {
    if (className === "light") {
      event.deltaEchoes = (event.deltaEchoes || 0) + 1;
    } else if (className === "teeth") {
      event.staticDelta =
        (event.staticDelta || 0) +
        (room.fractureModifier?.id === "sixth-wall" ? 2 : 1);
    }
  } else if (room.turn.intent === "shelter") {
    const shelterStrength =
      room.fractureModifier?.id === "lights-remember" ? 0 : 1;
    const prevented = reduceFirstNegative(event, shelterStrength);
    if ((event.move || 0) < 0) {
      const movePrevention = Math.min(
        room.fractureModifier?.id === "lights-remember" ? 1 : 2,
        Math.abs(event.move),
      );
      event.move += movePrevention;
      event.prevented = (event.prevented || 0) + movePrevention;
    }
    event.prevented = (event.prevented || 0) + prevented;
    const remainingHarm =
      Math.abs(Math.min(0, event.deltaEchoes || 0)) +
      Math.abs(Math.min(0, event.deltaResolve || 0)) +
      Math.abs(Math.min(0, event.move || 0));
    if (originalHarm === 0 && remainingHarm === 0 && (event.deltaEchoes || 0) > 0) {
      event.deltaEchoes = Math.max(0, event.deltaEchoes - 1);
    }
  }

  const claimBurden = consumeBurden(player, "next-claim-static");
  if (claimBurden && room.turn.intent === "claim") {
    event.staticDelta = (event.staticDelta || 0) + 1;
  } else if (claimBurden) {
    player.burdens.push(claimBurden);
  }
  const lightBurden = consumeBurden(player, "next-light-echo-loss");
  if (lightBurden && className === "light") {
    event.deltaEchoes = Math.max(0, (event.deltaEchoes || 0) - 1);
  } else if (lightBurden) {
    player.burdens.push(lightBurden);
  }
  return event;
}

function eventIsHarmful(event) {
  return HARM_FIELDS.some(([field]) => (Number(event[field]) || 0) < 0);
}

function totalHarm(event) {
  return HARM_FIELDS.reduce(
    (sum, [field]) => sum + Math.abs(Math.min(0, Number(event[field]) || 0)),
    0,
  );
}

function preventHarm(event, amount) {
  let remaining = amount;
  const details = [];
  let prevented = 0;
  for (const [field, label] of HARM_FIELDS) {
    const value = Number(event[field]) || 0;
    if (value >= 0 || remaining <= 0) continue;
    const reduction = Math.min(remaining, Math.abs(value));
    event[field] += reduction;
    remaining -= reduction;
    prevented += reduction;
    details.push({ field, label, amount: reduction });
  }
  event.prevented = (event.prevented || 0) + prevented;
  return { prevented, details };
}

function clampPlayerV4(player) {
  player.echoes = Math.max(0, player.echoes);
  player.keys = Math.max(0, player.keys);
  player.focus = clamp(player.focus, 0, FOCUS_MAX);
  player.resolve = clamp(player.resolve, 0, RESOLVE_MAX);
  if (player.resolve <= 0) {
    if (!player.exposed) player.exposedPenaltyPending = true;
    player.exposed = true;
  } else {
    player.exposed = false;
    player.exposedPenaltyPending = false;
  }
}

function applyEventDeltas(room, player, event, now) {
  const deltas = [];
  let echoDelta = Number(event.deltaEchoes) || 0;
  if (echoDelta < 0 && player.exposed && player.exposedPenaltyPending) {
    echoDelta -= 1;
    player.exposedPenaltyPending = false;
  }
  if (echoDelta) {
    player.echoes += echoDelta;
    deltas.push({ seat: player.seat, resource: "echoes", amount: echoDelta });
  }
  if (event.deltaKeys) {
    player.keys += event.deltaKeys;
    deltas.push({
      seat: player.seat,
      resource: "keys",
      amount: event.deltaKeys,
    });
  }
  if (event.deltaFocus) {
    player.focus += event.deltaFocus;
    deltas.push({
      seat: player.seat,
      resource: "focus",
      amount: event.deltaFocus,
    });
  }
  if (event.deltaResolve) {
    let resolveDelta = event.deltaResolve;
    if (resolveDelta < 0 && player.resolve === 0 && event.fallbackEchoLoss) {
      player.echoes -= event.fallbackEchoLoss;
      deltas.push({
        seat: player.seat,
        resource: "echoes",
        amount: -event.fallbackEchoLoss,
      });
      resolveDelta = 0;
    }
    if (resolveDelta) {
      player.resolve += resolveDelta;
      deltas.push({
        seat: player.seat,
        resource: "resolve",
        amount: resolveDelta,
      });
    }
  }
  if (event.ward) player.warded = true;
  if (event.move) {
    const movement = movePlayerV4(player, event.move);
    deltas.push({
      seat: player.seat,
      resource: "movement",
      amount: event.move,
    });
    if (movement.circuits) {
      deltas.push({
        seat: player.seat,
        resource: "circuits",
        amount: movement.circuits,
      });
    }
  }
  if (event.relic) {
    if (player.relics.length < RELIC_CAPACITY) {
      player.relics.push(event.relic);
      deltas.push({ seat: player.seat, resource: "relic", amount: 1 });
    } else {
      player.echoes += 2;
      deltas.push({ seat: player.seat, resource: "echoes", amount: 2 });
    }
  }
  const staticBefore = room.signal;
  room.signal += Number(event.staticDelta) || 0;
  room.signal = Math.max(0, room.signal);
  clampPlayerV4(player);
  if (event.id === "alabaster-key" && (event.deltaKeys || 0) > 0) {
    appendGameEvent(
      room,
      {
        type: "key-found",
        severity: "major",
        actorSeat: player.seat,
        title: "ALABASTER KEY FOUND",
        summary: `${player.name} found an Alabaster Key.`,
        presentationState: "key-found",
      },
      now,
    );
  }
  return { deltas, staticBefore, staticAfter: room.signal };
}

function applyBindLanding(room, player, className, now) {
  if (room.turn.intent !== "bind") return;
  const target = room.players[room.turn.bindTargetSeat];
  if (!target) return;
  if (className === "light") {
    target.echoes += 1;
    formGoldenThread(room, player, target, now);
    clampPlayerV4(target);
  }
}

function applyThresholdIntent(room, player, now) {
  if (room.turn.intent === "claim") {
    player.focus = clamp(player.focus + 1, 0, FOCUS_MAX);
  } else if (room.turn.intent === "bind") {
    const target = room.players[room.turn.bindTargetSeat];
    player.focus = clamp(player.focus + 1, 0, FOCUS_MAX);
    if (target) target.focus = clamp(target.focus + 1, 0, FOCUS_MAX);
  }
  if (room.turn.thresholdVowPending && player.mask.id === "thorn") {
    progressVowV4(room, player, 1, now, "Thorn chose a Threshold destination");
    room.turn.thresholdVowPending = false;
  }
}

function fractureChoice(room, rng) {
  return v4Clone(
    FRACTURE_MODIFIERS[randomIndex(room, FRACTURE_MODIFIERS.length, rng)],
  );
}

function triggerFractureIfNeeded(room, now, rng, resume = "finish-turn") {
  if (room.signal < SIGNAL_MAX) return false;
  const staticBefore = room.signal;
  room.fractures += 1;
  room.collapseCount = room.fractures;
  if (room.fractures >= 3) {
    appendGameEvent(
      room,
      {
        type: "fracture",
        severity: "critical",
        staticBefore,
        staticAfter: room.signal,
        title: "THE THIRD FRACTURE",
        summary: "The third Fracture swallowed the Sixfold Road.",
        presentationState: "fracture",
      },
      now,
    );
    finishMatch(
      room,
      "house",
      now,
      "The third Fracture swallowed every occupied mask.",
    );
    return true;
  }
  room.signal = 3;
  const modifier = fractureChoice(room, rng);
  room.fractureModifier = {
    ...modifier,
    startedRound: room.round,
    expiresAfterRound: room.round,
  };
  if (modifier.id === "lights-remember") {
    const lowest = room.players
      .filter(Boolean)
      .sort((left, right) => left.echoes - right.echoes || left.seat - right.seat)
      .slice(0, Math.min(2, occupiedSeatsV4(room).length));
    for (const player of lowest) player.echoes += 1;
  }
  room.hazard = {
    id: newId("fracture"),
    title: `FRACTURE ${room.fractures}/3 · ${modifier.title}`,
    body: modifier.body,
    at: now,
  };
  room.fractureResume = resume;
  room.phase = PHASES.FRACTURE;
  room.deadline = now + FRACTURE_MS;
  appendGameEvent(
    room,
    {
      type: "fracture",
      severity: "critical",
      staticBefore,
      staticAfter: room.signal,
      title: modifier.title,
      summary: `Fracture ${room.fractures}/3: ${modifier.body}`,
      meta: { modifier: modifier.id },
      presentationState: "fracture",
    },
    now,
  );
  checkQualifications(room, now, "Fracture modifier");
  return true;
}

function finalizeOrdinaryEvent(room, player, event, kind, className, now, rng) {
  if (player.warded && eventIsHarmful(event)) {
    const prevented = totalHarm(event);
    preventHarm(event, prevented);
    player.warded = false;
  }
  const applied = applyEventDeltas(room, player, event, now);
  applyBindLanding(room, player, className, now);
  player.statistics[kind] = (player.statistics[kind] || 0) + 1;
  if (
    player.mask.id === "ember" &&
    className === "teeth" &&
    (room.turn.intent === "claim" || room.turn.powerUsed === "carry-the-flame")
  ) {
    progressVowV4(room, player, 1, now, "Ember willingly entered Teeth");
  }
  if (
    player.mask.id === "veil" &&
    (event.prevented || 0) > 0
  ) {
    progressVowV4(room, player, 1, now, "Veil prevented a harmful consequence");
  }
  if (
    player.mask.id === "moon" &&
    room.turn.informedChanged
  ) {
    progressVowV4(room, player, 1, now, "Moon changed a revealed future");
    room.turn.informedChanged = false;
  }
  checkQualifications(room, now, "event resolution");
  const captionParts = [
    player.sigil,
    `NATURAL ${room.turn.naturalRoll}`,
    room.turn.finalRoll !== room.turn.naturalRoll
      ? `BENT TO ${room.turn.finalRoll}`
      : null,
    kind.toUpperCase(),
    ...applied.deltas.map(
      (delta) =>
        `${delta.amount > 0 ? "+" : ""}${delta.amount} ${String(delta.resource).toUpperCase()}`,
    ),
    room.signal !== applied.staticBefore
      ? `STATIC ${room.signal > applied.staticBefore ? "+" : ""}${room.signal - applied.staticBefore}`
      : null,
  ].filter(Boolean);
  const structured = appendGameEvent(
    room,
    {
      type: "resolution",
      phase: room.phase,
      actorSeat: player.seat,
      targetSeats:
        room.turn.intent === "bind" && room.turn.bindTargetSeat !== null
          ? [room.turn.bindTargetSeat]
          : undefined,
      naturalRoll: room.turn.naturalRoll,
      finalRoll: room.turn.finalRoll,
      origin: room.lastRoll?.from,
      destination: player.position,
      spaceKind: kind,
      spaceClass: className,
      intent: room.turn.intent,
      omen: room.turn.omen,
      deltas: applied.deltas,
      staticBefore: applied.staticBefore,
      staticAfter: applied.staticAfter,
      severity: event.id === "alabaster-key" ? "major" : "minor",
      title: event.title,
      summary: captionParts.join(" → "),
      presentationState:
        event.id === "alabaster-key" ? "key-found" : "event-reveal",
    },
    now,
  );
  room.lastEvent = {
    ...event,
    landingSeat: player.seat,
    landingSpace: player.position,
    severity: structured.severity,
    structuredEventId: structured.id,
  };
  room.lastResolvedEvent =
    kind !== "key" && kind !== "council"
      ? {
          ...v4Clone(event),
          sourceKind: kind,
          sourceClass: className,
        }
      : room.lastResolvedEvent;
  if (!triggerFractureIfNeeded(room, now, rng, "finish-turn")) {
    finishTurnV4(room, now);
  }
  return structured;
}

function openReaction(room, player, event, kind, className, now) {
  const occupied = occupiedSeatsV4(room).filter((seat) => seat !== player.seat);
  const boundSeat =
    room.turn.intent === "bind" && occupied.includes(room.turn.bindTargetSeat)
      ? room.turn.bindTargetSeat
      : null;
  const eligibleSeats =
    boundSeat === null
      ? occupied
      : [boundSeat, ...occupied.filter((seat) => seat !== boundSeat)];
  room.pendingReaction = {
    id: newId("reaction"),
    victimSeat: player.seat,
    event,
    kind,
    class: className,
    eligibleSeats,
    openedAt: now,
    helperSeat: null,
    resolved: false,
  };
  room.turn.reactionEligibleSeats = eligibleSeats;
  room.phase = PHASES.REACTION;
  room.deadline = now + REACTION_MS;
  room.presentationState = "event-reveal";
  appendGameEvent(
    room,
    {
      type: "reaction-window",
      actorSeat: player.seat,
      targetSeats: eligibleSeats,
      severity: "major",
      title: "GIVE OXYGEN?",
      summary: `${player.name} faces ${totalHarm(event)} harm; another traveler may intervene.`,
      presentationState: "event-reveal",
    },
    now,
  );
  return room.pendingReaction;
}

function prepareOracleV4(room, player, event) {
  const leader = room.players
    .filter(Boolean)
    .sort((left, right) => right.echoes - left.echoes || left.seat - right.seat)[0];
  const stateLine =
    leader?.seat === player.seat
      ? "The leader's shadow is yours."
      : `${leader?.name || "No traveler"} currently carries the most Echoes.`;
  event.body = `${event.body} ${stateLine} Static is ${staticLabel(room.signal)}${
    room.turn.omen ? ` and ${room.turn.omen.toUpperCase()} is listening` : ""
  }.`;
  if (event.id === "forked-question") {
    event.choices[0].result +=
      " Your next CLAIM also adds one Static.";
    event.choices[0].burden = {
      id: "next-claim-static",
      title: "Truth's Weight",
    };
    event.choices[1].result +=
      " The movement may expose you to the table's current escalation.";
  } else if (event.id === "weight-of-name") {
    event.choices[0].result +=
      " Your next LIGHT reward loses one Echo.";
    event.choices[0].burden = {
      id: "next-light-echo-loss",
      title: "Kept Weight",
    };
  } else if (event.id === "friendly-lie") {
    event.choices[0].result += " You must choose SHELTER on your next turn.";
    event.choices[0].burden = {
      id: "must-shelter",
      title: "Sheltering Oath",
    };
  }
  return event;
}

function openOracleV4(room, player, event, now) {
  prepareOracleV4(room, player, event);
  room.pendingChoice = {
    id: newId("oracle"),
    seat: player.seat,
    event,
    openedAt: now,
  };
  room.phase = PHASES.ORACLE;
  room.deadline = now + TURN_MS;
  room.lastEvent = event;
  room.presentationState = "oracle";
  player.statistics.oracle = (player.statistics.oracle || 0) + 1;
  appendGameEvent(
    room,
    {
      type: "oracle",
      severity: "major",
      actorSeat: player.seat,
      title: event.title,
      summary: `${player.name} must choose between two visible costs.`,
      presentationState: "oracle",
    },
    now,
  );
  return room.pendingChoice;
}

function deterministicCouncilChoice(room, player) {
  if (room.signal >= 8) return "watch";
  const lowest = Math.min(
    ...room.players.filter(Boolean).map((candidate) => candidate.echoes),
  );
  if (player.echoes === lowest) return "knot";
  return "open";
}

function openCouncilV4(room, player, event, now) {
  const votes = {};
  for (const candidate of room.players.filter(Boolean)) {
    if (candidate.bot) votes[candidate.seat] = deterministicCouncilChoice(room, candidate);
  }
  room.pendingCouncil = {
    id: newId("council"),
    callerSeat: player.seat,
    event,
    stage: "voting",
    votes,
    openedAt: now,
    revealOrder: [],
    revealedVotes: [],
    revealIndex: 0,
  };
  room.phase = PHASES.COUNCIL_VOTE;
  room.deadline = now + TURN_MS;
  room.lastEvent = event;
  room.presentationState = "council-voting";
  player.statistics.council = (player.statistics.council || 0) + 1;
  appendGameEvent(
    room,
    {
      type: "council-opened",
      severity: "major",
      actorSeat: player.seat,
      title: "THE SIXFOLD COUNCIL",
      summary: `${player.name} called a secret Council vote.`,
      presentationState: "council-voting",
    },
    now,
  );
  if (
    occupiedSeatsV4(room).every(
      (seat) => room.pendingCouncil.votes[seat],
    )
  ) {
    beginCouncilReveal(room, now);
  }
  return room.pendingCouncil;
}

function resolveLanding(room, player, now, rng, options = {}) {
  const movement = Number(room.turn.finalRoll) || room.turn.naturalRoll;
  const origin = player.position;
  const movementResult = movePlayerV4(player, movement);
  if (
    room.turn.powerUsed === "carry-the-flame" &&
    movementResult.crossedHearth
  ) {
    player.echoes += 2;
  }
  const destination = player.position;
  const kind = SPACE_KINDS[destination];
  const className = spaceClass(kind);
  room.lastRoll = {
    seat: player.seat,
    die: movement,
    naturalDie: room.turn.naturalRoll,
    tuning: room.turn.bendDelta,
    bendDelta: room.turn.bendDelta,
    from: origin,
    to: destination,
    resolved: true,
  };

  let event;
  const usesAshEvent = Boolean(options.useAshEvent && room.turn.ashAlternative);
  if (usesAshEvent) {
    event = {
      ...v4Clone(room.turn.ashAlternative),
      ...transmissionForV4(room, rng, now),
      id: `${room.turn.ashAlternative.id}-witnessed`,
      body: `${room.turn.ashAlternative.body} Ash kept this event from the previous turn.`,
    };
    room.turn.useAshEvent = true;
  } else {
    const matchingRoll = movement >= 1 && movement <= 6 ? movement : null;
    event =
      (matchingRoll && room.turn.preparedEvents[matchingRoll]
        ? v4Clone(room.turn.preparedEvents[matchingRoll])
        : pickEventV4(room, kind, rng, now));
  }
  const resolvedKind = usesAshEvent ? event.sourceKind || "archive" : kind;
  const resolvedClass = usesAshEvent
    ? event.sourceClass || spaceClass(resolvedKind)
    : className;
  event.landingSeat = player.seat;
  event.landingSpace = destination;
  event.severity =
    resolvedKind === "key" ||
    resolvedKind === "oracle" ||
    resolvedKind === "council"
      ? "major"
      : "minor";
  setActiveTransmissionV4(room, event, player, now);

  if (
    player.mask.id === "thorn" &&
    resolvedClass === "threshold" &&
    (room.turn.bendDelta !== 0 || room.turn.powerUsed === "crooked-road")
  ) {
    room.turn.thresholdVowPending = true;
  }
  if (
    player.mask.id === "moon" &&
    Object.keys(room.turn.revealedEvents).length &&
    room.turn.finalRoll !== room.turn.naturalRoll
  ) {
    room.turn.informedChanged = true;
  }
  if (
    room.turn.omen === "moth" &&
    room.turn.finalRoll !== room.turn.naturalRoll
  ) {
    room.turn.informedChanged = true;
  }

  if (resolvedKind === "council") {
    applyBindLanding(room, player, resolvedClass, now);
    return openCouncilV4(room, player, event, now);
  }
  if (resolvedKind === "oracle") {
    applyBindLanding(room, player, resolvedClass, now);
    return openOracleV4(room, player, event, now);
  }

  applyTurnModifiers(room, player, event, resolvedKind, resolvedClass, now);
  if (eventIsHarmful(event) && !player.warded) {
    return openReaction(room, player, event, resolvedKind, resolvedClass, now);
  }
  return finalizeOrdinaryEvent(
    room,
    player,
    event,
    resolvedKind,
    resolvedClass,
    now,
    rng,
  );
}

export function bendRoll(room, actorToken, delta = 0, options = {}) {
  const now = options.now ?? Date.now();
  const rng = options.rng;
  const automated = Boolean(options.automated);
  migrateRoomState(room, now);
  const player = activePlayerFor(
    room,
    automated ? null : actorToken,
    PHASES.BEND,
  );
  const adjustment = Number(delta);
  if (![0, -1, 1].includes(adjustment)) {
    throw new Error("A normal Bend may move only one edge.");
  }
  if (adjustment !== 0) {
    if (room.turn.omen === "door" && !room.turn.freeBendUsed) {
      room.turn.freeBendUsed = true;
      room.turn.bendCost = 0;
    } else {
      if (player.focus < 1) throw new Error("You have no Focus to Bend.");
      player.focus -= 1;
      room.turn.bendCost = 1;
    }
    player.statistics.bends += 1;
  }
  room.turn.bendDelta = adjustment;
  room.turn.finalRoll = clamp(room.turn.naturalRoll + adjustment, 1, 6);
  if (
    adjustment !== 0 &&
    Object.keys(room.turn.revealedEvents).length > 0
  ) {
    room.turn.informedChanged = true;
  }
  room.presentationState = "token-travel";
  appendGameEvent(
    room,
    {
      type: "bend",
      actorSeat: player.seat,
      naturalRoll: room.turn.naturalRoll,
      finalRoll: room.turn.finalRoll,
      intent: room.turn.intent,
      title: adjustment === 0 ? "THE CAST WAS ACCEPTED" : "THE BONE WAS BENT",
      summary:
        adjustment === 0
          ? `${player.name} accepted natural ${room.turn.naturalRoll}.`
          : `${player.name} bent ${room.turn.naturalRoll} to ${room.turn.finalRoll}${room.turn.bendCost ? " for one Focus" : " through the DOOR Omen"}.`,
      presentationState: "token-travel",
    },
    now,
  );
  return resolveLanding(room, player, now, rng, {
    useAshEvent: Boolean(options.useAshEvent),
  });
}

export function resolveReaction(room, now = Date.now(), options = {}) {
  migrateRoomState(room, now);
  if (room.phase !== PHASES.REACTION || !room.pendingReaction) {
    throw new Error("No harmful event is waiting for a reaction.");
  }
  const reaction = room.pendingReaction;
  if (reaction.resolved) return false;
  reaction.resolved = true;
  const player = room.players[reaction.victimSeat];
  const event = reaction.event;
  const kind = reaction.kind;
  const className = reaction.class;
  room.pendingReaction = null;
  room.turn.reactionEligibleSeats = [];
  return finalizeOrdinaryEvent(
    room,
    player,
    event,
    kind,
    className,
    now,
    options.rng,
  );
}

function rescueCost(helper, free) {
  if (free) return { resource: null, amount: 0 };
  if (helper.resolve > 0) {
    helper.resolve -= 1;
    return { resource: "resolve", amount: -1 };
  }
  if (helper.echoes > 0) {
    helper.echoes -= 1;
    return { resource: "echoes", amount: -1 };
  }
  throw new Error("You have no Resolve or Echo to Give Oxygen.");
}

export function giveOxygen(room, actorToken, options = {}) {
  const now = options.now ?? Date.now();
  migrateRoomState(room, now);
  if (room.phase !== PHASES.REACTION || !room.pendingReaction) {
    throw new Error("No traveler can receive Oxygen right now.");
  }
  const reaction = room.pendingReaction;
  if (reaction.resolved || reaction.helperSeat !== null) {
    throw new Error("Another reaction already reached the table.");
  }
  const helper = room.players.find((player) => player?.token === actorToken);
  const victim = room.players[reaction.victimSeat];
  if (!helper || !victim || helper.seat === victim.seat) {
    throw new Error("Choose another traveler to rescue.");
  }
  if (!reaction.eligibleSeats.includes(helper.seat)) {
    throw new Error("That mask is not eligible for this reaction.");
  }
  if (helper.oxygenUsedRound === room.round) {
    throw new Error("You already Gave Oxygen this round.");
  }
  const threadOmen = room.turn.omen === "thread";
  const cost = rescueCost(helper, threadOmen);
  const prevention = preventHarm(reaction.event, 2);
  if (!prevention.prevented) {
    if (cost.resource === "resolve") helper.resolve += 1;
    if (cost.resource === "echoes") helper.echoes += 1;
    throw new Error("There is no remaining harm to prevent.");
  }
  helper.oxygenUsedRound = room.round;
  helper.statistics.oxygenGiven += 1;
  victim.statistics.oxygenReceived += 1;
  reaction.helperSeat = helper.seat;
  formGoldenThread(room, helper, victim, now, { both: threadOmen });
  if (helper.mask.id === "moss") {
    helper.echoes += 1;
    if (!helper.rescuePartners.includes(victim.seat)) {
      helper.rescuePartners.push(victim.seat);
      progressVowV4(room, helper, 1, now, "Moss rescued a new traveler");
    }
  }
  if (victim.mask.id === "moss") {
    if (!victim.rescuePartners.includes(helper.seat)) {
      victim.rescuePartners.push(helper.seat);
      progressVowV4(room, victim, 1, now, "Moss joined a new rescue");
    }
  }
  appendGameEvent(
    room,
    {
      type: "oxygen",
      severity: "major",
      actorSeat: helper.seat,
      targetSeats: [victim.seat],
      deltas: [
        ...(cost.resource
          ? [{ seat: helper.seat, resource: cost.resource, amount: -1 }]
          : []),
        ...(helper.mask.id === "moss"
          ? [{ seat: helper.seat, resource: "echoes", amount: 1 }]
          : []),
      ],
      title: `${helper.sigil} GAVE OXYGEN TO ${victim.sigil}`,
      summary: `${helper.name} prevented ${prevention.prevented} harm for ${victim.name}; a Golden Thread formed.`,
      meta: { prevented: prevention.prevented, free: threadOmen },
      presentationState: "oxygen-rescue",
    },
    now,
  );
  clampPlayerV4(helper);
  return resolveReaction(room, now, options);
}

export function activateMaskPower(room, actorToken, payload = {}, options = {}) {
  const now = options.now ?? Date.now();
  const rng = options.rng;
  migrateRoomState(room, now);
  const player = room.players.find((candidate) => candidate?.token === actorToken);
  if (!player) throw new Error("That mask is not occupied by this session.");
  if (player.maskCharge < 1) throw new Error("Your mask has no charge.");
  const maskId = player.mask.id;

  if (maskId === "moon") {
    if (room.phase !== PHASES.INTENT || room.currentSeat !== player.seat) {
      throw new Error("Moon listens before the active cast.");
    }
    const rolls = chooseRevealRolls(room, payload.results, rng);
    for (const roll of rolls) prepareExactEvent(room, roll, rng, now);
    room.turn.powerUsed = "hear-what-comes-next";
  } else if (maskId === "ash") {
    if (room.phase !== PHASES.INTENT || room.currentSeat !== player.seat) {
      throw new Error("Ash keeps the last event before casting.");
    }
    if (!room.lastResolvedEvent) {
      throw new Error("No ordinary event remains for Ash to Witness.");
    }
    room.turn.ashAlternative = publicEventTemplate(
      v4Clone(room.lastResolvedEvent),
    );
    room.turn.ashArmed = true;
    room.turn.powerUsed = "last-witness";
  } else if (maskId === "ember") {
    if (room.phase !== PHASES.BEND || room.currentSeat !== player.seat) {
      throw new Error("Ember carries the flame after the natural cast.");
    }
    room.turn.finalRoll = room.turn.naturalRoll + 2;
    room.turn.bendDelta = 2;
    room.turn.powerUsed = "carry-the-flame";
    room.signal += 2;
  } else if (maskId === "thorn") {
    if (room.phase !== PHASES.BEND || room.currentSeat !== player.seat) {
      throw new Error("Thorn bends an adjacent road after the natural cast.");
    }
    const delta = Number(payload.delta);
    if (![1, -1].includes(delta)) {
      throw new Error("Crooked Road chooses one adjacent destination.");
    }
    room.turn.finalRoll = clamp(room.turn.naturalRoll + delta, 1, 6);
    room.turn.bendDelta = delta;
    room.turn.powerUsed = "crooked-road";
    const destination = room.turn.reachable.find(
      (entry) => entry.roll === room.turn.finalRoll,
    );
    if (destination?.class === "teeth") player.echoes += 1;
  } else if (maskId === "veil") {
    if (room.phase !== PHASES.REACTION || !room.pendingReaction) {
      throw new Error("Veil cuts a thread only during a harmful resolution.");
    }
    const victim = room.players[room.pendingReaction.victimSeat];
    if (!victim) throw new Error("The target has left the table.");
    const event = room.pendingReaction.event;
    const candidates = HARM_FIELDS.map(([field, label]) => ({
      field,
      label,
      amount: Math.abs(Math.min(0, Number(event[field]) || 0)),
    }))
      .filter((candidate) => candidate.amount > 0)
      .sort((left, right) => right.amount - left.amount);
    const chosen =
      candidates.find((candidate) => candidate.field === payload.field) ||
      candidates[0];
    if (!chosen) throw new Error("No harmful consequence remains.");
    event[chosen.field] = 0;
    event.prevented = (event.prevented || 0) + chosen.amount;
    player.echoes += 1;
    room.signal += 1;
    progressVowV4(room, player, 1, now, "Veil cut a harmful consequence");
    room.pendingReaction.helperSeat = player.seat;
  } else if (maskId === "moss") {
    if (room.phase !== PHASES.REACTION || !room.pendingReaction) {
      throw new Error("Moss keeps the ember only during a rescue.");
    }
    const victim = room.players[room.pendingReaction.victimSeat];
    if (!victim || victim.seat === player.seat) {
      throw new Error("Moss must keep another traveler's ember.");
    }
    const cost = rescueCost(player, room.turn.omen === "thread");
    const prevention = preventHarm(room.pendingReaction.event, 3);
    if (!prevention.prevented) throw new Error("No harm remains for Moss to prevent.");
    player.oxygenUsedRound = room.round;
    player.echoes += 1;
    room.pendingReaction.helperSeat = player.seat;
    formGoldenThread(room, player, victim, now, { both: true });
    if (!player.rescuePartners.includes(victim.seat)) {
      player.rescuePartners.push(victim.seat);
      progressVowV4(room, player, 1, now, "Moss kept a new traveler's ember");
    }
    appendGameEvent(
      room,
      {
        type: "oxygen",
        severity: "major",
        actorSeat: player.seat,
        targetSeats: [victim.seat],
        title: "MOSS KEPT THE EMBER",
        summary: `${player.name} prevented ${prevention.prevented} harm for ${victim.name}.`,
        deltas: cost.resource
          ? [
              { seat: player.seat, resource: cost.resource, amount: -1 },
              { seat: player.seat, resource: "echoes", amount: 1 },
            ]
          : [{ seat: player.seat, resource: "echoes", amount: 1 }],
        presentationState: "mask-power",
      },
      now,
    );
  }

  player.maskCharge = 0;
  player.statistics.powersUsed += 1;
  appendGameEvent(
    room,
    {
      type: "mask-power",
      severity: "major",
      actorSeat: player.seat,
      targetSeats:
        room.pendingReaction?.victimSeat === undefined
          ? undefined
          : [room.pendingReaction.victimSeat],
      title: player.mask.active?.title?.toUpperCase() || "MASK POWER",
      summary: `${player.name} performed ${player.mask.active?.title || "their mask power"}.`,
      deltas:
        maskId === "veil"
          ? [{ seat: player.seat, resource: "echoes", amount: 1 }]
          : [],
      presentationState: "mask-power",
    },
    now,
  );
  clampPlayerV4(player);

  if (maskId === "ember" || maskId === "thorn") {
    return resolveLanding(room, player, now, rng);
  }
  if (maskId === "veil" || maskId === "moss") {
    return resolveReaction(room, now, options);
  }
  return room.turn;
}

export function answerChoiceV4(
  room,
  actorToken,
  choiceId,
  options = {},
) {
  const now = options.now ?? Date.now();
  migrateRoomState(room, now);
  if (room.phase !== PHASES.ORACLE || !room.pendingChoice) {
    throw new Error("No Oracle question is waiting.");
  }
  const player = room.players[room.pendingChoice.seat];
  if (!options.automated && player?.token !== actorToken) {
    throw new Error("This answer is not yours.");
  }
  const choice = room.pendingChoice.event.choices.find(
    (candidate) => candidate.id === choiceId,
  );
  if (!choice) throw new Error("The table does not recognize that answer.");
  const event = {
    ...v4Clone(choice),
    id: `${room.pendingChoice.event.id}-${choice.id}`,
    title: `${room.pendingChoice.event.title}: ${choice.label}`,
    body: choice.result,
    tone: "choice",
  };
  if (choice.burden) player.burdens.push(v4Clone(choice.burden));
  const applied = applyEventDeltas(room, player, event, now);
  applyThresholdIntent(room, player, now);
  const sourceEvent = room.pendingChoice.event;
  room.pendingChoice = null;
  room.lastEvent = {
    ...sourceEvent,
    id: event.id,
    title: event.title,
    body: event.body,
    choices: undefined,
    severity: "major",
  };
  appendGameEvent(
    room,
    {
      type: "oracle-choice",
      severity: "major",
      actorSeat: player.seat,
      deltas: applied.deltas,
      staticBefore: applied.staticBefore,
      staticAfter: applied.staticAfter,
      title: choice.label.toUpperCase(),
      summary: `${player.name} chose ${choice.label}: ${choice.result}`,
      presentationState: "oracle",
    },
    now,
  );
  checkQualifications(room, now, "Oracle choice");
  if (!triggerFractureIfNeeded(room, now, options.rng, "finish-turn")) {
    finishTurnV4(room, now);
  }
  return room.lastEvent;
}

function beginCouncilReveal(room, now) {
  const council = room.pendingCouncil;
  if (!council) throw new Error("No Council is waiting.");
  council.stage = "reveal";
  council.revealOrder = occupiedSeatsV4(room);
  council.revealedVotes = [];
  council.revealIndex = 0;
  room.phase = PHASES.COUNCIL_REVEAL;
  room.deadline = now + COUNCIL_REVEAL_MS;
  room.presentationState = "council-reveal";
  appendGameEvent(
    room,
    {
      type: "council-reveal",
      severity: "major",
      title: "THE STONES TURN",
      summary: "The Council's secret stones will be revealed in seat order.",
      presentationState: "council-reveal",
    },
    now,
  );
}

export function castCouncilVoteV4(
  room,
  actorToken,
  choiceId,
  now = Date.now(),
) {
  migrateRoomState(room, now);
  const council = room.pendingCouncil;
  if (
    room.phase !== PHASES.COUNCIL_VOTE ||
    !council ||
    council.stage !== "voting"
  ) {
    throw new Error("No Council ballot is open.");
  }
  const player = room.players.find((candidate) => candidate?.token === actorToken);
  if (!player) throw new Error("Only an occupied mask may vote.");
  if (!council.event.choices.some((choice) => choice.id === choiceId)) {
    throw new Error("The Council does not recognize that answer.");
  }
  if (council.votes[player.seat]) throw new Error("Your mask has already voted.");
  council.votes[player.seat] = choiceId;
  if (occupiedSeatsV4(room).every((seat) => council.votes[seat])) {
    beginCouncilReveal(room, now);
    return true;
  }
  return false;
}

function applyCouncilResult(room, council, winner, now, rng) {
  const caller = room.players[council.callerSeat];
  const staticBefore = room.signal;
  if (winner === "watch") {
    room.signal = Math.max(0, room.signal - 3);
    room.councilModifier = {
      id: "watch",
      title: "Watch the Embers",
      body: "LIGHT rewards lose one Echo this round.",
      expiresAfterRound: room.round,
    };
  } else if (winner === "open") {
    room.councilModifier = {
      id: "open",
      title: "Open the Mouth",
      body: "LIGHT gains an Echo; TEETH adds one Static this round.",
      expiresAfterRound: room.round,
    };
  } else {
    const lowest = room.players
      .filter(Boolean)
      .sort((left, right) => left.echoes - right.echoes || left.seat - right.seat)
      .slice(0, Math.min(2, occupiedSeatsV4(room).length));
    for (const player of lowest) player.echoes += 1;
    room.councilModifier = {
      id: "knot",
      title: "Knot the Thread",
      body: "CLAIM adds one extra Static this round.",
      expiresAfterRound: room.round,
    };
  }
  applyThresholdIntent(room, caller, now);
  const choice = council.event.choices.find((candidate) => candidate.id === winner);
  room.lastEvent = {
    ...transmissionFieldsV4(council.event),
    landingSeat: council.event.landingSeat,
    id: `council-${winner}`,
    title: `Council: ${choice.label}`,
    body: choice.result,
    tone: "council",
    severity: "major",
  };
  appendGameEvent(
    room,
    {
      type: "council",
      severity: "major",
      actorSeat: caller?.seat,
      staticBefore,
      staticAfter: room.signal,
      title: `COUNCIL: ${choice.label.toUpperCase()}`,
      summary: `The revealed Council chose ${choice.label}: ${choice.result}`,
      meta: {
        result: winner,
        votes: council.revealedVotes,
      },
      presentationState: "council-reveal",
    },
    now,
  );
  room.pendingCouncil = null;
  checkQualifications(room, now, "Council result");
  if (!triggerFractureIfNeeded(room, now, rng, "finish-turn")) {
    finishTurnV4(room, now);
  }
  return true;
}

export function advanceCouncilReveal(room, now = Date.now(), options = {}) {
  migrateRoomState(room, now);
  const council = room.pendingCouncil;
  if (
    room.phase !== PHASES.COUNCIL_REVEAL ||
    !council ||
    council.stage !== "reveal"
  ) {
    throw new Error("The Council is not revealing stones.");
  }
  const seat = council.revealOrder[council.revealIndex];
  if (seat !== undefined) {
    council.revealedVotes.push({
      seat,
      choiceId: council.votes[seat],
    });
    council.revealIndex += 1;
  }
  if (council.revealIndex < council.revealOrder.length) {
    room.deadline = now + COUNCIL_REVEAL_MS;
    return false;
  }
  const counts = { watch: 0, open: 0, knot: 0 };
  for (const choice of Object.values(council.votes)) counts[choice] += 1;
  const tieOrder = ["watch", "knot", "open"];
  const winner = tieOrder.reduce((best, choice) =>
    counts[choice] > counts[best] ? choice : best,
  );
  return applyCouncilResult(room, council, winner, now, options.rng);
}

export function resolveCouncilV4(
  room,
  now = Date.now(),
  fillMissing = false,
  options = {},
) {
  migrateRoomState(room, now);
  const council = room.pendingCouncil;
  if (!council) throw new Error("No Council is waiting.");
  if (council.stage === "voting") {
    if (fillMissing) {
      for (const seat of occupiedSeatsV4(room)) {
        if (!council.votes[seat]) {
          council.votes[seat] = deterministicCouncilChoice(
            room,
            room.players[seat],
          );
        }
      }
    }
    if (!occupiedSeatsV4(room).every((seat) => council.votes[seat])) {
      return false;
    }
    beginCouncilReveal(room, now);
    return false;
  }
  return advanceCouncilReveal(room, now, options);
}

export function activateRelicV4(
  room,
  actorToken,
  relicId,
  options = {},
) {
  const now = options.now ?? Date.now();
  const rng = options.rng;
  migrateRoomState(room, now);
  const player = room.players.find((candidate) => candidate?.token === actorToken);
  if (!player || player.seat !== room.currentSeat) {
    throw new Error("Only the active traveler may use this relic.");
  }
  const index = player.relics.indexOf(relicId);
  if (index === -1 || !RELICS[relicId]) {
    throw new Error("You are not carrying that relic.");
  }
  if (
    room.phase !== PHASES.INTENT &&
    !(room.phase === PHASES.REACTION && relicId === "mirror-shard")
  ) {
    throw new Error("That relic is quiet during this phase.");
  }
  player.relics.splice(index, 1);
  if (relicId === "quiet-bell") {
    if (room.fractureModifier) room.fractureModifier = null;
    else if (room.omen) room.omen = null;
    else room.signal = Math.max(0, room.signal - 4);
  } else if (relicId === "mirror-shard") {
    if (room.phase === PHASES.REACTION) {
      preventHarm(room.pendingReaction.event, 2);
    } else {
      player.warded = true;
    }
  } else if (relicId === "foxfire-lens") {
    const rolls = chooseRevealRolls(room, options.results, rng);
    for (const roll of rolls) prepareExactEvent(room, roll, rng, now);
  }
  appendGameEvent(
    room,
    {
      type: "relic",
      severity: "major",
      actorSeat: player.seat,
      title: RELICS[relicId].title.toUpperCase(),
      summary: `${player.name} used ${RELICS[relicId].title}.`,
      presentationState: "mask-power",
    },
    now,
  );
  checkQualifications(room, now, "relic");
  if (room.phase === PHASES.REACTION && relicId === "mirror-shard") {
    return resolveReaction(room, now, options);
  }
  return true;
}

export function giftEchoV4(room, actorToken, targetSeat, now = Date.now()) {
  migrateRoomState(room, now);
  const player = activePlayerFor(room, actorToken, PHASES.INTENT);
  const target = room.players[Number(targetSeat)];
  if (!target || target.seat === player.seat) {
    throw new Error("Choose another occupied traveler.");
  }
  if (player.echoes < 1) throw new Error("You have no Echo to give.");
  if (room.turn.gifted) throw new Error("You already gave an Echo this turn.");
  player.echoes -= 1;
  target.echoes += 1;
  room.turn.gifted = true;
  appendGameEvent(
    room,
    {
      type: "gift",
      actorSeat: player.seat,
      targetSeats: [target.seat],
      title: "AN ECHO WAS GIVEN",
      summary: `${player.name} gave one Echo to ${target.name}.`,
      deltas: [
        { seat: player.seat, resource: "echoes", amount: -1 },
        { seat: target.seat, resource: "echoes", amount: 1 },
      ],
    },
    now,
  );
  checkQualifications(room, now, "Echo gift");
  return true;
}

export function resolveFracture(room, now = Date.now()) {
  migrateRoomState(room, now);
  if (room.phase !== PHASES.FRACTURE) {
    throw new Error("No Fracture is waiting.");
  }
  const resume = room.fractureResume;
  room.fractureResume = null;
  if (room.status === "finished") return room;
  if (resume === "finish-turn") finishTurnV4(room, now);
  return room;
}

function replaceTransmissionFieldsV4(target, transmission) {
  if (!target) return;
  Object.assign(target, transmissionFieldsV4(transmission));
}

export function retryTransmissionV4(
  room,
  failedTransmissionId,
  failedVideoId,
  options = {},
) {
  const active = room.activeTransmission;
  if (!active?.transmissionId || !active.videoId) {
    throw new Error("No landing transmission is active.");
  }
  if (
    active.transmissionId !== failedTransmissionId ||
    active.videoId !== failedVideoId
  ) {
    throw new Error("That transmission has already moved to another signal.");
  }
  const channel = roomChannelV4(room);
  const recovery =
    room.transmissionRecovery?.transmissionId === failedTransmissionId
      ? room.transmissionRecovery
      : {
          transmissionId: failedTransmissionId,
          attemptedVideoIds: [failedVideoId],
        };
  const attempted = new Set([...recovery.attemptedVideoIds, failedVideoId]);
  const candidates = channel.videos.filter((video) => {
    const id = typeof video === "string" ? video : video.id;
    return id && !attempted.has(id);
  });
  if (!candidates.length) {
    throw new Error("Every available channel transmission was rejected.");
  }
  const now = options.now ?? Date.now();
  const video = candidates[randomIndex(room, candidates.length, options.rng)];
  const videoId = typeof video === "string" ? video : video.id;
  const videoTitle =
    (typeof video === "string" ? FOXY_ALCHEMY_TITLES[video] : video.title) ||
    "Assigned channel transmission";
  const next = {
    ...active,
    transmissionId: crypto.randomUUID(),
    transmissionStartedAt: now,
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoTitle,
    title: videoTitle,
    omen: omenFromVideoId(videoId),
  };
  room.activeTransmission = next;
  room.nextOmen = next.omen;
  room.transmissionRecovery = {
    transmissionId: next.transmissionId,
    attemptedVideoIds: [...attempted, videoId],
  };
  replaceTransmissionFieldsV4(room.lastEvent, next);
  replaceTransmissionFieldsV4(room.pendingChoice?.event, next);
  replaceTransmissionFieldsV4(room.pendingCouncil?.event, next);
  replaceTransmissionFieldsV4(room.pendingReaction?.event, next);
  appendGameEvent(
    room,
    {
      type: "transmission-rerouted",
      title: "THE FREQUENCY CHANGED",
      summary: `The receiver rejected one upload; the table selected another ${next.omen.toUpperCase()} transmission.`,
    },
    now,
  );
  return next;
}

export function removeBotV4(room, actorToken, seat, now = Date.now()) {
  migrateRoomState(room, now);
  if (room.hostToken !== actorToken) {
    throw new Error("Only the table keeper can move empty masks.");
  }
  const player = room.players[Number(seat)];
  if (!player?.bot || room.status !== "lobby") {
    throw new Error("That seat cannot be cleared.");
  }
  room.players[player.seat] = null;
  appendGameEvent(
    room,
    {
      type: "bot-removed",
      actorSeat: player.seat,
      title: "AN ECHO DISSOLVED",
      summary: `${player.name} dissolved into Static.`,
    },
    now,
  );
  return true;
}

export function setStreamerMode(
  room,
  actorToken,
  enabled,
  now = Date.now(),
) {
  migrateRoomState(room, now);
  if (room.hostToken !== actorToken) {
    throw new Error("Only the table keeper may change audience rules.");
  }
  room.streamerMode = Boolean(enabled);
  appendGameEvent(
    room,
    {
      type: "streamer-setting",
      title: room.streamerMode ? "THE HOUSE WILL GUESS" : "THE HOUSE IS QUIET",
      summary: room.streamerMode
        ? "Audience majority predictions will be recorded once per round without changing resources or victory."
        : "Audience predictions remain visual only.",
    },
    now,
  );
  return room.streamerMode;
}

function botIntent(room, player) {
  if (player.burdens.some((burden) => burden.id === "must-shelter")) {
    return { intent: "shelter", targetSeat: null };
  }
  const counts = room.turn.reachable.reduce(
    (result, destination) => {
      result[destination.class] += 1;
      return result;
    },
    { light: 0, threshold: 0, teeth: 0 },
  );
  const lowestOther = room.players
    .filter((candidate) => candidate && candidate.seat !== player.seat)
    .sort((left, right) => left.echoes - right.echoes || left.seat - right.seat)[0];
  if (player.resolve <= 1 || counts.teeth >= 3) {
    return { intent: "shelter", targetSeat: null };
  }
  if (
    lowestOther &&
    ((room.turnNumber + player.seat) % 2 === 0 ||
      lowestOther.echoes + 3 < player.echoes)
  ) {
    return { intent: "bind", targetSeat: lowestOther.seat };
  }
  return { intent: "claim", targetSeat: null };
}

function destinationUtility(destination) {
  if (!destination) return -99;
  if (destination.kind === "key") return 8;
  if (destination.class === "light") return 4;
  if (destination.class === "threshold") return 3;
  return -2;
}

function botBend(room, player) {
  const natural = room.turn.naturalRoll;
  const options = [-1, 0, 1]
    .map((delta) => ({
      delta,
      roll: clamp(natural + delta, 1, 6),
    }))
    .filter(
      (candidate, index, all) =>
        all.findIndex((other) => other.roll === candidate.roll) === index,
    )
    .map((candidate) => ({
      ...candidate,
      destination: room.turn.reachable.find(
        (entry) => entry.roll === candidate.roll,
      ),
    }))
    .sort(
      (left, right) =>
        destinationUtility(right.destination) -
          destinationUtility(left.destination) ||
        Math.abs(left.delta) - Math.abs(right.delta),
    );
  const best = options[0];
  if (best.delta !== 0 && player.focus < 1 && room.turn.omen !== "door") return 0;
  return best.delta;
}

function botOracleChoice(room, player) {
  const choices = room.pendingChoice.event.choices;
  if (player.resolve <= 1) {
    return (
      choices.find((choice) => (choice.deltaResolve || 0) > 0 || choice.ward) ||
      choices[0]
    );
  }
  if (room.signal >= 9) {
    return (
      choices.find((choice) => (choice.staticDelta || 0) <= 0) || choices[0]
    );
  }
  return [...choices].sort(
    (left, right) =>
      (right.deltaEchoes || 0) - (left.deltaEchoes || 0),
  )[0];
}

export function settleExpiredPhase(room, now = Date.now(), options = {}) {
  migrateRoomState(room, now);
  if (room.status !== "playing") return false;
  const expired = Boolean(room.deadline && now >= room.deadline);
  const active = room.players[room.currentSeat];
  const botTurn = Boolean(active?.bot);

  if (room.phase === PHASES.INTENT) {
    if (!expired && !botTurn) return false;
    if (botTurn && active.maskCharge && ["moon", "ash"].includes(active.mask.id)) {
      try {
        activateMaskPower(room, active.token, {}, { now, rng: options.rng });
      } catch {
        // A missing Ash event is a legal reason to keep the charge.
      }
    }
    if (!room.turn.intent) {
      const choice = botTurn
        ? botIntent(room, active)
        : { intent: "shelter", targetSeat: null };
      selectIntent(
        room,
        active.token,
        choice.intent,
        choice.targetSeat,
        { now },
      );
    }
    castTurn(room, null, {
      automated: true,
      now,
      rng: options.rng,
    });
    return true;
  }
  if (room.phase === PHASES.BEND) {
    if (!expired && !botTurn) return false;
    if (botTurn && active.maskCharge && active.mask.id === "ember") {
      const naturalDestination = room.turn.reachable.find(
        (entry) => entry.roll === room.turn.naturalRoll,
      );
      if (
        naturalDestination?.class === "teeth" ||
        active.position + room.turn.naturalRoll + 2 >= BOARD_SIZE
      ) {
        activateMaskPower(room, active.token, {}, { now, rng: options.rng });
        return true;
      }
    }
    if (botTurn && active.maskCharge && active.mask.id === "thorn") {
      const delta = botBend(room, active);
      if (delta !== 0) {
        activateMaskPower(
          room,
          active.token,
          { delta },
          { now, rng: options.rng },
        );
        return true;
      }
    }
    bendRoll(room, null, botTurn ? botBend(room, active) : 0, {
      automated: true,
      now,
      rng: options.rng,
      useAshEvent:
        botTurn &&
        Boolean(room.turn.ashArmed) &&
        destinationUtility({
          class: spaceClass(room.pendingReaction?.kind),
        }) < 0,
    });
    return true;
  }
  if (room.phase === PHASES.REACTION) {
    const reaction = room.pendingReaction;
    const botHelper = reaction?.eligibleSeats
      .map((seat) => room.players[seat])
      .find(
        (player) =>
          player?.bot &&
          player.oxygenUsedRound !== room.round &&
          (player.resolve > 0 || player.echoes > 0),
      );
    if (
      botHelper &&
      totalHarm(reaction.event) >= 2 &&
      (expired || now - reaction.openedAt >= 800)
    ) {
      if (botHelper.mask.id === "moss" && botHelper.maskCharge) {
        activateMaskPower(room, botHelper.token, {}, { now, rng: options.rng });
      } else {
        giveOxygen(room, botHelper.token, { now, rng: options.rng });
      }
      return true;
    }
    if (!expired) return false;
    resolveReaction(room, now, options);
    return true;
  }
  if (room.phase === PHASES.ORACLE) {
    if (!expired && !room.players[room.pendingChoice?.seat]?.bot) return false;
    const player = room.players[room.pendingChoice.seat];
    const choice = botOracleChoice(room, player);
    answerChoiceV4(room, null, choice.id, {
      automated: true,
      now,
      rng: options.rng,
    });
    return true;
  }
  if (room.phase === PHASES.COUNCIL_VOTE) {
    if (!expired) return false;
    resolveCouncilV4(room, now, true, options);
    return true;
  }
  if (room.phase === PHASES.COUNCIL_REVEAL) {
    if (!expired) return false;
    advanceCouncilReveal(room, now, options);
    return true;
  }
  if (room.phase === PHASES.FRACTURE) {
    if (!expired) return false;
    resolveFracture(room, now);
    return true;
  }
  return false;
}

function commandKey(action, payload) {
  const commandId = String(payload.commandId || "").trim();
  if (!commandId) return null;
  const actor = String(payload.token || payload.spectatorId || "authority");
  return `${actor}:${action}:${commandId}`;
}

function wasProcessed(room, key) {
  return Boolean(key && room.processedCommands.includes(key));
}

function recordProcessed(room, key) {
  if (!key) return;
  room.processedCommands.push(key);
  room.processedCommands = room.processedCommands.slice(-COMMAND_LEDGER_LIMIT);
}

export function executeGameCommand(
  room,
  action,
  payload = {},
  options = {},
) {
  const now = options.now ?? Date.now();
  migrateRoomState(room, now);
  const key = commandKey(action, payload);
  if (wasProcessed(room, key)) {
    return { duplicate: true, result: null };
  }
  let result;
  switch (action) {
    case "start_game":
      result = beginGameV4(room, payload.token, now);
      break;
    case "claim_seat":
      result = claimSeatV4(room, payload.token, Number(payload.seat), now);
      break;
    case "remove_bot":
      result = removeBotV4(room, payload.token, Number(payload.seat), now);
      break;
    case "leave_seat":
      result = releaseSeat(room, payload.token, now);
      break;
    case "select_intent":
      result = selectIntent(
        room,
        payload.token,
        payload.intent,
        payload.targetSeat,
        { now },
      );
      break;
    case "submit_prediction":
      result = submitPrediction(room, payload.token, payload.prediction, {
        now,
        spectatorId: payload.spectatorId,
      });
      break;
    case "cast":
    case "roll":
      result = castTurn(room, payload.token, {
        now,
        rng: options.rng,
      });
      break;
    case "bend":
      result = bendRoll(room, payload.token, Number(payload.delta || 0), {
        now,
        rng: options.rng,
        useAshEvent: Boolean(payload.useAshEvent),
      });
      break;
    case "tune_roll":
      if (room.phase !== PHASES.BEND) {
        throw new Error("Focus bends the die only after the natural result.");
      }
      result = bendRoll(room, payload.token, Number(payload.amount || 0), {
        now,
        rng: options.rng,
      });
      break;
    case "give_oxygen":
      result = giveOxygen(room, payload.token, {
        now,
        rng: options.rng,
      });
      break;
    case "use_mask_power":
      result = activateMaskPower(room, payload.token, payload, {
        now,
        rng: options.rng,
      });
      break;
    case "use_relic":
      result = activateRelicV4(room, payload.token, String(payload.relicId || ""), {
        now,
        rng: options.rng,
        results: payload.results,
      });
      break;
    case "gift_echo":
      result = giftEchoV4(room, payload.token, Number(payload.targetSeat), now);
      break;
    case "answer_choice":
      result = answerChoiceV4(
        room,
        payload.token,
        String(payload.choiceId || ""),
        { now, rng: options.rng },
      );
      break;
    case "vote_council":
      result = castCouncilVoteV4(
        room,
        payload.token,
        String(payload.choiceId || ""),
        now,
      );
      break;
    case "reject_transmission":
      result = retryTransmissionV4(
        room,
        String(payload.transmissionId || ""),
        String(payload.videoId || ""),
        { now, rng: options.rng },
      );
      break;
    case "set_streamer_mode":
      result = setStreamerMode(room, payload.token, payload.enabled, now);
      break;
    default:
      throw new Error("The authority does not recognize that move.");
  }
  recordProcessed(room, key);
  return { duplicate: false, result };
}

function publicPlayerV4(room, player) {
  if (!player) return null;
  const predictionKey = `seat:${player.seat}`;
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    sigil: player.sigil,
    color: player.color,
    mask: player.mask,
    position: player.position,
    echoes: player.echoes,
    keys: player.keys,
    laps: player.laps,
    focus: player.focus,
    resolve: player.resolve,
    relics: player.relics.map((id) => RELICS[id]).filter(Boolean),
    warded: player.warded,
    exposed: player.exposed,
    maskCharge: player.maskCharge,
    goldenThreads: player.goldenThreads,
    relationships: { ...player.relationships },
    qualified: player.qualified,
    qualifiedAtSequence: player.qualifiedAtSequence,
    qualifiedAtTurn: player.qualifiedAtTurn,
    oxygenAvailable:
      room.phase === PHASES.REACTION &&
      room.pendingReaction?.victimSeat !== player.seat &&
      room.pendingReaction?.eligibleSeats.includes(player.seat) &&
      player.oxygenUsedRound !== room.round,
    predictionAvailable:
      room.phase === PHASES.INTENT &&
      room.currentSeat !== player.seat &&
      !room.predictions[predictionKey],
    predictionSubmitted:
      room.turn?.predictionSummary?.revealed && room.predictions[predictionKey]
        ? room.predictions[predictionKey].prediction
        : Boolean(room.predictions[predictionKey]),
    vow: player.vow,
    online: player.online,
    bot: player.bot,
  };
}

function publicTurnV4(room) {
  if (!room.turn) return null;
  const turn = v4Clone(room.turn);
  delete turn.preparedEvents;
  return turn;
}

function publicCouncilV4(room) {
  const council = room.pendingCouncil;
  if (!council) return null;
  return {
    id: council.id,
    callerSeat: council.callerSeat,
    event: publicEventTemplate(council.event),
    stage: council.stage,
    votedSeats: Object.keys(council.votes).map(Number),
    revealedVotes:
      council.stage === "reveal" ? v4Clone(council.revealedVotes) : [],
    revealIndex: council.stage === "reveal" ? council.revealIndex : 0,
    revealTotal: council.revealOrder?.length || occupiedSeatsV4(room).length,
  };
}

function qualificationRanking(room) {
  return rankingForQualified(room).map((player, index) => ({
    rank: index + 1,
    seat: player.seat,
    name: player.name,
    sigil: player.sigil,
    echoes: player.echoes,
    vowComplete: player.vow.complete,
    goldenThreads: player.goldenThreads,
    resolve: player.resolve,
    qualifiedAtSequence: player.qualifiedAtSequence,
  }));
}

export function publicRoomV4(room, now = Date.now()) {
  migrateRoomState(room, now);
  const channel = roomChannelV4(room);
  const secondsLeft = room.deadline
    ? Math.max(0, Math.ceil((room.deadline - now) / 1000))
    : null;
  const spectatorCount = Math.max(
    Object.values(room.spectatorSessions).filter(
      (spectator) => spectator.online !== false,
    ).length,
    room.spectators.size,
  );
  return {
    rulesVersion: RULES_VERSION,
    stateVersion: STATE_VERSION,
    features: [...V4_FEATURES],
    code: room.code,
    status: room.status,
    phase: room.phase,
    presentationState: room.presentationState,
    keeperSeat:
      room.players.find((player) => player?.token === room.hostToken)?.seat ?? null,
    players: room.players.map((player) => publicPlayerV4(room, player)),
    masks: MASKS,
    spectatorCount,
    streamerMode: room.streamerMode,
    currentSeat: room.currentSeat,
    turnNumber: room.turnNumber,
    round: room.round,
    roundState: v4Clone(room.roundState),
    turn: publicTurnV4(room),
    deadline: room.deadline,
    secondsLeft,
    pendingChoice: room.pendingChoice
      ? {
          id: room.pendingChoice.id,
          seat: room.pendingChoice.seat,
          event: publicEventTemplate(room.pendingChoice.event),
        }
      : null,
    pendingCouncil: publicCouncilV4(room),
    pendingReaction: room.pendingReaction
      ? {
          id: room.pendingReaction.id,
          victimSeat: room.pendingReaction.victimSeat,
          event: publicEventTemplate(room.pendingReaction.event),
          kind: room.pendingReaction.kind,
          class: room.pendingReaction.class,
          eligibleSeats: [...room.pendingReaction.eligibleSeats],
          helperSeat: room.pendingReaction.helperSeat,
        }
      : null,
    signal: Math.max(0, Math.min(SIGNAL_MAX, room.signal)),
    signalMax: SIGNAL_MAX,
    staticState: {
      value: Math.max(0, Math.min(SIGNAL_MAX, room.signal)),
      max: SIGNAL_MAX,
      label: staticLabel(room.signal),
      fractures: room.fractures,
      fracturesUntilHouse: Math.max(0, 3 - room.fractures),
    },
    fractures: room.fractures,
    collapseCount: room.fractures,
    fractureModifier: room.fractureModifier,
    councilModifier: room.councilModifier,
    hazard: room.hazard,
    omen: room.omen,
    nextOmen: room.nextOmen,
    activeTransmission: room.activeTransmission || null,
    lastEvent: room.lastEvent,
    lastRoll: room.lastRoll,
    winnerSeat: room.winnerSeat,
    houseVictory: room.houseVictory,
    endgame: {
      ...v4Clone(room.endgame),
      hardEndRound: HARD_END_ROUND,
      finalRound: FINAL_ROUND,
      qualificationRanking: qualificationRanking(room),
      tiebreakers: [
        "Most Echoes",
        "Completed vow",
        "Most Golden Threads",
        "Most Resolve",
        "Earliest qualification",
      ],
    },
    events: v4Clone(room.events.slice(-120)),
    recentEvents: v4Clone(room.events.slice(-3)),
    log: v4Clone(room.log),
    chronicle: room.chronicle ? v4Clone(room.chronicle) : null,
    audiencePulse: v4Clone(room.audiencePulse),
    objective: { echoes: WIN_ECHOES, keys: 1, laps: 1 },
    youtubeChannel: {
      id: channel.id || null,
      title: channel.title || "YouTube",
      handle: channel.handle || null,
      url: channel.url,
      brand: channel.brand || "obscur",
      videoCount: channel.videos.length,
      source: channel.source || "resolved",
    },
  };
}
