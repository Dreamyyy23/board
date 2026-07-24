import crypto from "node:crypto";

export const MAX_PLAYERS = 6;
export const BOARD_SIZE = 36;
export const TURN_MS = 20_000;
export const WIN_ECHOES = 13;
export const SIGNAL_MAX = 12;

export const FOXY_ALCHEMY_VIDEOS = [
  "_agqpz2GSOc",
  "M49MuTZDquE",
  "gMP0D9mxKJs",
  "_oZ9zKfxEQM",
  "xSvtwuttpqc",
  "z7WtUwLvI7o",
  "fTf_9w_48Io",
  "SnM5oGxI8Lo",
  "37waC24B5r4",
  "W5sy5X2yZUo",
  "XI6JGxB4AJw",
  "mn-N6mpApUg",
  "lKg3zxJNjSs",
  "vY76SBsFENw",
  "bMDNU1fipuo",
  "MhkEyOgui4Y",
  "FARmToPqgqo",
  "tPyHWmISZ4w",
  "up2SWzvgIQM",
  "BKHsKLYyh4I",
  "ZhTD2dbkj_A",
  "4NgEBJnHEJI",
  "t0FEoTaLHLo",
  "SMUl3rXf9JU",
  "5jwt1PEfvZA",
  "pi_iN1vA6p4",
  "1MDU-G6EHDU",
  "rSQIVSKlAbU",
  "PiQd492oxLE",
  "P0K9JuzErCs",
];

const FOXY_ALCHEMY_CHANNEL =
  "https://www.youtube.com/@FoxyAlchemyStudio";

export const MASKS = [
  {
    id: "ember",
    name: "EMBER",
    color: "#e76f51",
    title: "The First Spark",
    passive: "Echo spaces grant one additional Echo.",
  },
  {
    id: "veil",
    name: "VEIL",
    color: "#7dd3fc",
    title: "The Uncut Thread",
    passive: "The first Snare of each circuit is ignored.",
  },
  {
    id: "thorn",
    name: "THORN",
    color: "#d8b4fe",
    title: "The Crooked Road",
    passive: "Rifts carry you one additional space.",
  },
  {
    id: "moon",
    name: "MOON",
    color: "#facc15",
    title: "The Listening House",
    passive: "Archives restore one Focus.",
  },
  {
    id: "moss",
    name: "MOSS",
    color: "#86efac",
    title: "The Patient Root",
    passive: "The Hearth restores one Resolve.",
  },
  {
    id: "ash",
    name: "ASH",
    color: "#fda4af",
    title: "The Last Witness",
    passive: "Your landings lower global Static by one.",
  },
];

export const VOWS = [
  { id: "walk-rifts", title: "Walk the Bent Road", kind: "rift", target: 3 },
  { id: "survive-snares", title: "Remain Uncaught", kind: "snare", target: 3 },
  { id: "answer-oracles", title: "Answer the Two Mouths", kind: "oracle", target: 2 },
  { id: "open-archives", title: "Hear the Lost Signal", kind: "archive", target: 2 },
  { id: "gather-echoes", title: "Tend the Small Lights", kind: "echo", target: 5 },
  { id: "carry-relics", title: "Keep What Was Left", kind: "relic", target: 2 },
];

export const RELICS = {
  "quiet-bell": {
    id: "quiet-bell",
    title: "Quiet Bell",
    mark: "◌",
    description: "Reduce Static by four and restore one Resolve.",
  },
  "mirror-shard": {
    id: "mirror-shard",
    title: "Mirror Shard",
    mark: "◇",
    description: "Ward the next loss or backward movement.",
  },
  "foxfire-lens": {
    id: "foxfire-lens",
    title: "Foxfire Lens",
    mark: "◉",
    description: "Restore two Focus.",
  },
};

export const SPACE_KINDS = Array.from({ length: BOARD_SIZE }, (_, index) => {
  if (index === 0) return "hearth";
  if ([3, 15, 27].includes(index)) return "relic";
  if ([6, 18, 30].includes(index)) return "archive";
  if ([8, 20, 32].includes(index)) return "council";
  if ([9, 21, 33].includes(index)) return "oracle";
  if ([12, 24].includes(index)) return "key";
  if ([5, 11, 17, 23, 29, 35].includes(index)) return "rift";
  if ([4, 10, 16, 22, 28, 34].includes(index)) return "snare";
  return "echo";
});

const EVENTS = {
  hearth: [
    {
      id: "hearth-return",
      title: "The Hearth Remembers",
      body: "The first room is never the same room twice. Gain one Echo and one Focus.",
      tone: "warm",
      deltaEchoes: 1,
      deltaFocus: 1,
      staticDelta: -1,
    },
  ],
  echo: [
    {
      id: "moth-lantern",
      title: "A Moth Carries a Lantern",
      body: "It circles your name, then leaves two small lights behind.",
      tone: "quiet",
      deltaEchoes: 2,
    },
    {
      id: "borrowed-footsteps",
      title: "Borrowed Footsteps",
      body: "Someone walks in your rhythm three corridors away. Gain one Echo and one Resolve.",
      tone: "cold",
      deltaEchoes: 1,
      deltaResolve: 1,
    },
    {
      id: "kind-wall",
      title: "A Wall Chooses Kindness",
      body: "A passage opens where the map insisted on stone. Gain three Echoes.",
      tone: "warm",
      deltaEchoes: 3,
      staticDelta: 1,
    },
    {
      id: "name-in-dust",
      title: "Your Name in Old Dust",
      body: "The handwriting is yours, but older. Gain two Echoes; Static rises.",
      tone: "rift",
      deltaEchoes: 2,
      staticDelta: 2,
    },
    {
      id: "unclaimed-chair",
      title: "The Unclaimed Chair",
      body: "It moves closer when nobody looks. Recover one Focus.",
      tone: "quiet",
      deltaFocus: 1,
    },
  ],
  archive: [
    {
      id: "borrowed-summer",
      title: "The Borrowed Summer",
      body:
        "A voluntary transmission waits inside the cabinet. Playback is never automatic and does not change the roll.",
      tone: "signal",
      deltaEchoes: 1,
      videoUrl: "https://www.youtube.com/watch?v=TdrL3QxjyVw",
      videoLabel: "Open the archived transmission",
    },
    {
      id: "frequency-seven",
      title: "Frequency Seven",
      body: "Four travelers describe the same room from incompatible directions.",
      tone: "signal",
      deltaEchoes: 2,
      deltaFocus: 1,
      staticDelta: 1,
    },
    {
      id: "voice-before-birth",
      title: "The Voice Before Its Birth",
      body: "The recording answers a question nobody has asked yet.",
      tone: "signal",
      deltaEchoes: 3,
      staticDelta: 2,
    },
  ],
  oracle: [
    {
      id: "forked-question",
      title: "The Question With Two Mouths",
      body: "The table asks which loss you are willing to name.",
      tone: "choice",
      choices: [
        {
          id: "truth",
          label: "Name the truth",
          result: "The room believes you. Gain three Echoes.",
          deltaEchoes: 3,
          staticDelta: 1,
        },
        {
          id: "door",
          label: "Name the door",
          result: "The answer moves ahead of you. Advance two spaces and recover Focus.",
          move: 2,
          deltaFocus: 1,
        },
      ],
    },
    {
      id: "weight-of-name",
      title: "What Does Your Name Weigh?",
      body: "The scale offers certainty or momentum.",
      tone: "choice",
      choices: [
        {
          id: "keep",
          label: "Keep its weight",
          result: "You remain yourself. Gain two Resolve.",
          deltaResolve: 2,
        },
        {
          id: "spend",
          label: "Spend its weight",
          result: "The road recognizes the sacrifice. Gain four Echoes; Static rises.",
          deltaEchoes: 4,
          staticDelta: 3,
        },
      ],
    },
    {
      id: "friendly-lie",
      title: "A Friendly Lie",
      body: "It can shelter you or carry you.",
      tone: "choice",
      choices: [
        {
          id: "shelter",
          label: "Live beneath it",
          result: "A temporary mercy. You are warded.",
          ward: true,
        },
        {
          id: "carry",
          label: "Carry it outward",
          result: "Gain two Echoes and move one space.",
          deltaEchoes: 2,
          move: 1,
        },
      ],
    },
  ],
  key: [
    {
      id: "alabaster-key",
      title: "The Alabaster Key",
      body: "It is warm from a hand you have not met yet.",
      tone: "gold",
      deltaKeys: 1,
      staticDelta: 1,
    },
  ],
  relic: [
    {
      id: "quiet-bell-found",
      title: "The Quiet Bell",
      body: "It rings only inside the Static. Carry it until your turn needs silence.",
      tone: "relic",
      relic: "quiet-bell",
    },
    {
      id: "mirror-shard-found",
      title: "The Mirror Shard",
      body: "It reflects the consequence before the action.",
      tone: "relic",
      relic: "mirror-shard",
    },
    {
      id: "foxfire-lens-found",
      title: "The Foxfire Lens",
      body: "Look through it and every wrong road glows.",
      tone: "relic",
      relic: "foxfire-lens",
    },
  ],
  rift: [
    {
      id: "counterclockwise-rift",
      title: "Counterclockwise",
      body: "North turns away. The road carries you three spaces forward.",
      tone: "rift",
      move: 3,
      staticDelta: 2,
    },
    {
      id: "shared-dark",
      title: "The Shared Dark",
      body: "Another traveler leaves an Echo where you can find it.",
      tone: "rift",
      deltaEchoes: 2,
      staticDelta: 1,
    },
    {
      id: "thirteenth-direction",
      title: "The Thirteenth Direction",
      body: "It should not fit between North and North. Advance four spaces.",
      tone: "rift",
      move: 4,
      staticDelta: 3,
    },
  ],
  snare: [
    {
      id: "polite-corridor",
      title: "A Very Polite Corridor",
      body: "It apologizes while returning you two spaces.",
      tone: "danger",
      move: -2,
      staticDelta: 1,
    },
    {
      id: "hungry-static",
      title: "Hungry Static",
      body: "The radio eats two clear memories.",
      tone: "danger",
      deltaEchoes: -2,
      staticDelta: 2,
    },
    {
      id: "borrowed-face",
      title: "Your Borrowed Face",
      body: "Lose one Resolve. If none remains, lose two Echoes.",
      tone: "danger",
      deltaResolve: -1,
      fallbackEchoLoss: 2,
      staticDelta: 2,
    },
    {
      id: "locked-behind-you",
      title: "The Door Locks Behind You",
      body: "Return three spaces unless a ward takes the blow.",
      tone: "danger",
      move: -3,
      staticDelta: 1,
    },
  ],
};

const COUNCIL_EVENT = {
  id: "sixfold-council",
  title: "The Sixfold Council",
  body: "Every occupied mask must choose how the table answers the rising signal.",
  tone: "council",
  choices: [
    {
      id: "stabilize",
      label: "Stabilize",
      result: "Lower Static by four. Every traveler recovers one Resolve.",
    },
    {
      id: "provoke",
      label: "Provoke",
      result: "The caller gains four Echoes. Static rises by three.",
    },
    {
      id: "exchange",
      label: "Exchange",
      result: "The richest traveler gives two Echoes to the poorest. All recover one Focus.",
    },
  ],
};

function clone(value) {
  return structuredClone(value);
}

export function sanitizeName(value) {
  const clean = String(value ?? "")
    .replace(/[^\p{L}\p{N} _.-]/gu, "")
    .trim()
    .slice(0, 18);
  return clean || "Wanderer";
}

export function createCode(existing = new Set()) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = "";
    for (let i = 0; i < 5; i += 1) {
      code += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    if (!existing.has(code)) return code;
  }
  throw new Error("Could not allocate a room code.");
}

export function createRoom(code, now = Date.now()) {
  return {
    code,
    createdAt: now,
    status: "lobby",
    hostToken: null,
    players: Array(MAX_PLAYERS).fill(null),
    spectators: new Set(),
    currentSeat: null,
    turnNumber: 0,
    deadline: null,
    pendingChoice: null,
    pendingCouncil: null,
    signal: 2,
    collapseCount: 0,
    hazard: null,
    lastEvent: {
      id: "table-wakes",
      title: "The Table Wakes",
      body: "Choose a mask, call companions, then begin the crossing.",
      tone: "quiet",
    },
    lastRoll: null,
    winnerSeat: null,
    log: [
      {
        id: crypto.randomUUID(),
        at: now,
        text: "A new table surfaced between the walls.",
      },
    ],
  };
}

function applyMask(player, seat) {
  player.seat = seat;
  player.mask = clone(MASKS[seat]);
  player.sigil = MASKS[seat].name;
  player.color = MASKS[seat].color;
  player.vow = {
    ...clone(VOWS[seat]),
    progress: 0,
    complete: false,
  };
}

function resetPlayer(player) {
  player.position = 0;
  player.echoes = 0;
  player.keys = 0;
  player.laps = 0;
  player.focus = 1;
  player.resolve = 2;
  player.relics = [];
  player.warded = false;
  player.tuning = 0;
  player.giftedTurn = null;
  player.veilGuardLap = -1;
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
  };
  player.vow.progress = 0;
  player.vow.complete = false;
}

export function seatPlayer(room, { name, token, socketId, bot = false }) {
  const seat = room.players.findIndex((player) => player === null);
  if (seat === -1) throw new Error("All six seats are occupied.");
  const playerToken = token || crypto.randomUUID();
  const player = {
    id: crypto.randomUUID(),
    token: playerToken,
    socketId: socketId || null,
    name: sanitizeName(name),
    online: true,
    bot,
  };
  applyMask(player, seat);
  resetPlayer(player);
  room.players[seat] = player;
  if (!room.hostToken && !bot) room.hostToken = playerToken;
  appendLog(room, `${player.name} took the ${player.sigil} mask.`);
  return player;
}

export function claimSeat(room, actorToken, targetSeat) {
  if (room.status !== "lobby") {
    throw new Error("Masks cannot change after the crossing begins.");
  }
  if (!Number.isInteger(targetSeat) || targetSeat < 0 || targetSeat >= MAX_PLAYERS) {
    throw new Error("That mask does not exist.");
  }
  if (room.players[targetSeat]) throw new Error("That mask is already claimed.");
  const currentSeat = room.players.findIndex((player) => player?.token === actorToken);
  if (currentSeat === -1) throw new Error("Your seat is no longer at this table.");
  const player = room.players[currentSeat];
  room.players[currentSeat] = null;
  applyMask(player, targetSeat);
  room.players[targetSeat] = player;
  appendLog(room, `${player.name} chose the ${player.sigil} mask.`);
  return player;
}

export function reconnectPlayer(room, token, socketId) {
  const player = room.players.find((candidate) => candidate?.token === token);
  if (!player) return null;
  player.socketId = socketId;
  player.online = true;
  appendLog(room, `${player.name} returned to the table.`);
  return player;
}

export function appendLog(room, text, now = Date.now()) {
  room.log.push({ id: crypto.randomUUID(), at: now, text });
  room.log = room.log.slice(-24);
}

export function beginGame(room, actorToken, now = Date.now()) {
  if (room.hostToken !== actorToken) {
    throw new Error("Only the table keeper can begin.");
  }
  if (room.status !== "lobby" && room.status !== "finished") {
    throw new Error("The crossing has already begun.");
  }
  const firstSeat = room.players.findIndex(Boolean);
  if (firstSeat === -1) {
    throw new Error("The table needs at least one traveler.");
  }

  for (const player of room.players.filter(Boolean)) resetPlayer(player);
  room.status = "playing";
  room.currentSeat = firstSeat;
  room.turnNumber = 1;
  room.deadline = now + TURN_MS;
  room.pendingChoice = null;
  room.pendingCouncil = null;
  room.winnerSeat = null;
  room.lastRoll = null;
  room.signal = 2;
  room.collapseCount = 0;
  room.hazard = null;
  room.lastEvent = {
    id: "first-turn",
    title: "The Road Opens",
    body: `${room.players[firstSeat].name} has twenty seconds to choose a tactic and cast the bone.`,
    tone: "warm",
  };
  appendLog(room, "The Sixfold Road began to move.", now);
  return room;
}

function transmissionFor(rng = Math.random) {
  const index = Math.min(
    FOXY_ALCHEMY_VIDEOS.length - 1,
    Math.floor(rng() * FOXY_ALCHEMY_VIDEOS.length),
  );
  const videoId = FOXY_ALCHEMY_VIDEOS[index];
  return {
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoLabel: "Open the assigned Foxy Alchemy transmission",
    videoSource: "Foxy Alchemy Studio",
    channelUrl: FOXY_ALCHEMY_CHANNEL,
  };
}

function chooseEvent(kind, rng = Math.random) {
  const list = EVENTS[kind] || EVENTS.echo;
  const event = clone(list[Math.floor(rng() * list.length)]);
  return {
    ...event,
    ...transmissionFor(rng),
  };
}

function clampPlayer(player) {
  player.echoes = Math.max(0, player.echoes);
  player.keys = Math.max(0, player.keys);
  player.focus = Math.max(0, Math.min(3, player.focus));
  player.resolve = Math.max(0, Math.min(3, player.resolve));
}

function movePlayer(player, amount) {
  if (!amount) return;
  if (amount < 0 && player.warded) {
    player.warded = false;
    return;
  }
  const raw = player.position + amount;
  if (amount > 0 && raw >= BOARD_SIZE) player.laps += 1;
  player.position = ((raw % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
}

function applyEvent(room, player, event) {
  const harmful =
    (event.deltaEchoes || 0) < 0 ||
    (event.deltaResolve || 0) < 0 ||
    (event.move || 0) < 0;
  if (harmful && player.warded) {
    player.warded = false;
    room.lastEvent = {
      ...event,
      body: `${event.body} The Mirror Ward takes the consequence instead.`,
    };
    return;
  }

  if (event.deltaEchoes) player.echoes += event.deltaEchoes;
  if (event.deltaKeys) player.keys += event.deltaKeys;
  if (event.deltaFocus) player.focus += event.deltaFocus;
  if (event.deltaResolve) {
    if (event.deltaResolve < 0 && player.resolve === 0 && event.fallbackEchoLoss) {
      player.echoes -= event.fallbackEchoLoss;
    } else {
      player.resolve += event.deltaResolve;
    }
  }
  if (event.ward) player.warded = true;
  movePlayer(player, event.move || 0);

  if (event.relic) {
    if (player.relics.length < 2) player.relics.push(event.relic);
    else player.echoes += 2;
  }
  room.signal += event.staticDelta || 0;
  clampPlayer(player);
}

function applyMaskPassive(room, player, kind, event) {
  if (player.mask.id === "ember" && kind === "echo") {
    event.deltaEchoes = (event.deltaEchoes || 0) + 1;
    event.body += " The Ember mask kindles one additional Echo.";
  }
  if (
    player.mask.id === "veil" &&
    kind === "snare" &&
    player.veilGuardLap !== player.laps
  ) {
    player.veilGuardLap = player.laps;
    event.deltaEchoes = Math.max(0, event.deltaEchoes || 0);
    event.deltaResolve = Math.max(0, event.deltaResolve || 0);
    event.move = Math.max(0, event.move || 0);
    event.body += " The Veil mask lets the first Snare pass through you.";
  }
  if (player.mask.id === "thorn" && kind === "rift") {
    event.move = (event.move || 0) + 1;
    event.body += " Thorn bends the road one space farther.";
  }
  if (player.mask.id === "moon" && kind === "archive") {
    event.deltaFocus = (event.deltaFocus || 0) + 1;
    event.body += " Moon hears a second frequency and restores Focus.";
  }
  if (player.mask.id === "moss" && kind === "hearth") {
    event.deltaResolve = (event.deltaResolve || 0) + 1;
    event.body += " Moss takes root and restores Resolve.";
  }
  if (player.mask.id === "ash") room.signal -= 1;
}

function progressVow(room, player, kind) {
  player.statistics[kind] = (player.statistics[kind] || 0) + 1;
  if (player.vow.complete || player.vow.kind !== kind) return;
  player.vow.progress += 1;
  if (player.vow.progress >= player.vow.target) {
    player.vow.complete = true;
    player.echoes += 5;
    player.focus = Math.min(3, player.focus + 1);
    appendLog(room, `${player.name} fulfilled the vow: ${player.vow.title}.`);
  }
}

function applySignalCollapse(room, now = Date.now()) {
  if (room.signal < SIGNAL_MAX) {
    room.signal = Math.max(0, room.signal);
    return false;
  }
  for (const player of room.players.filter(Boolean)) {
    if (player.warded) player.warded = false;
    else player.echoes = Math.max(0, player.echoes - 2);
  }
  room.signal = 4;
  room.collapseCount += 1;
  room.hazard = {
    id: crypto.randomUUID(),
    title: "SIGNAL COLLAPSE",
    body: "The radio found every occupied mask. Each unwarded traveler lost two Echoes.",
    at: now,
  };
  appendLog(room, "Static reached twelve. The signal collapsed through every seat.", now);
  return true;
}

function occupiedSeats(room) {
  return room.players
    .map((player, seat) => (player ? seat : null))
    .filter((seat) => seat !== null);
}

function openCouncil(room, player, now, rng = Math.random) {
  const event = {
    ...clone(COUNCIL_EVENT),
    ...transmissionFor(rng),
    landingSeat: player.seat,
  };
  const votes = {};
  for (const candidate of room.players.filter(Boolean)) {
    if (candidate.bot) votes[candidate.seat] = "stabilize";
  }
  room.pendingCouncil = {
    callerSeat: player.seat,
    event,
    votes,
  };
  room.lastEvent = event;
  room.deadline = now + TURN_MS;
  player.statistics.council += 1;
  appendLog(room, `${player.name} called the Sixfold Council.`, now);
}

export function resolveCouncil(room, now = Date.now(), fillMissing = false) {
  const council = room.pendingCouncil;
  if (!council) throw new Error("No council is waiting.");
  const seats = occupiedSeats(room);
  if (fillMissing) {
    for (const seat of seats) {
      if (!council.votes[seat]) council.votes[seat] = "stabilize";
    }
  }
  if (!seats.every((seat) => council.votes[seat])) return false;

  const counts = { stabilize: 0, provoke: 0, exchange: 0 };
  for (const choice of Object.values(council.votes)) counts[choice] += 1;
  const order = ["stabilize", "exchange", "provoke"];
  const winner = order.reduce((best, choice) =>
    counts[choice] > counts[best] ? choice : best,
  );
  const caller = room.players[council.callerSeat];

  if (winner === "stabilize") {
    room.signal = Math.max(0, room.signal - 4);
    for (const player of room.players.filter(Boolean)) {
      player.resolve = Math.min(3, player.resolve + 1);
    }
  } else if (winner === "provoke") {
    caller.echoes += 4;
    room.signal += 3;
  } else {
    const players = room.players.filter(Boolean);
    const richest = [...players].sort((a, b) => b.echoes - a.echoes)[0];
    const poorest = [...players].sort((a, b) => a.echoes - b.echoes)[0];
    const gift = Math.min(2, richest.echoes);
    richest.echoes -= gift;
    poorest.echoes += gift + 1;
    for (const player of players) player.focus = Math.min(3, player.focus + 1);
  }

  const choice = council.event.choices.find((candidate) => candidate.id === winner);
  room.lastEvent = {
    landingSeat: council.event.landingSeat,
    videoId: council.event.videoId,
    videoUrl: council.event.videoUrl,
    videoLabel: council.event.videoLabel,
    videoSource: council.event.videoSource,
    channelUrl: council.event.channelUrl,
    id: `council-${winner}`,
    title: `Council: ${choice.label}`,
    body: choice.result,
    tone: "council",
  };
  room.pendingCouncil = null;
  applySignalCollapse(room, now);
  appendLog(room, `The Council chose ${choice.label}.`, now);
  advanceTurn(room, now);
  return true;
}

export function castCouncilVote(room, actorToken, choiceId, now = Date.now()) {
  const council = room.pendingCouncil;
  if (!council) throw new Error("No council is waiting.");
  const player = room.players.find((candidate) => candidate?.token === actorToken);
  if (!player) throw new Error("Only an occupied mask may vote.");
  if (!council.event.choices.some((choice) => choice.id === choiceId)) {
    throw new Error("The Council does not recognize that answer.");
  }
  if (council.votes[player.seat]) throw new Error("Your mask has already voted.");
  council.votes[player.seat] = choiceId;
  appendLog(room, `${player.name} placed a Council stone.`, now);
  return resolveCouncil(room, now, false);
}

export function tuneRoll(room, actorToken, amount) {
  if (room.status !== "playing" || room.pendingChoice || room.pendingCouncil) {
    throw new Error("The die cannot be tuned during this phase.");
  }
  const player = room.players[room.currentSeat];
  if (!player || player.token !== actorToken) throw new Error("It is not your turn.");
  if (![1, -1].includes(amount)) throw new Error("The die can move only one edge.");
  if (player.focus < 1) throw new Error("You have no Focus to spend.");
  if (player.tuning) throw new Error("The die is already tuned.");
  player.focus -= 1;
  player.tuning = amount;
  appendLog(room, `${player.name} tuned the bone ${amount > 0 ? "high" : "low"}.`);
}

export function useRelic(room, actorToken, relicId) {
  if (room.status !== "playing" || room.pendingChoice || room.pendingCouncil) {
    throw new Error("Relics are quiet during this phase.");
  }
  const player = room.players[room.currentSeat];
  if (!player || player.token !== actorToken) throw new Error("It is not your turn.");
  const index = player.relics.indexOf(relicId);
  if (index === -1 || !RELICS[relicId]) throw new Error("You are not carrying that relic.");
  player.relics.splice(index, 1);
  if (relicId === "quiet-bell") {
    room.signal = Math.max(0, room.signal - 4);
    player.resolve = Math.min(3, player.resolve + 1);
  } else if (relicId === "mirror-shard") {
    player.warded = true;
  } else if (relicId === "foxfire-lens") {
    player.focus = Math.min(3, player.focus + 2);
  }
  room.lastEvent = {
    id: `used-${relicId}`,
    title: RELICS[relicId].title,
    body: `${player.name} used ${RELICS[relicId].title}. ${RELICS[relicId].description}`,
    tone: "relic",
  };
  appendLog(room, `${player.name} used ${RELICS[relicId].title}.`);
}

export function giftEcho(room, actorToken, targetSeat) {
  if (room.status !== "playing" || room.pendingChoice || room.pendingCouncil) {
    throw new Error("The table cannot exchange Echoes during this phase.");
  }
  const player = room.players[room.currentSeat];
  const target = room.players[targetSeat];
  if (!player || player.token !== actorToken) throw new Error("It is not your turn.");
  if (!target || target.seat === player.seat) throw new Error("Choose another occupied mask.");
  if (player.echoes < 1) throw new Error("You have no Echo to give.");
  if (player.giftedTurn === room.turnNumber) throw new Error("You already gave an Echo this turn.");
  player.echoes -= 1;
  target.echoes += 1;
  player.giftedTurn = room.turnNumber;
  appendLog(room, `${player.name} gave one Echo to ${target.name}.`);
}

export function rollTurn(room, actorToken, options = {}) {
  const now = options.now ?? Date.now();
  const rng = options.rng ?? Math.random;
  const automated = Boolean(options.automated);
  if (room.status !== "playing") throw new Error("The road is not moving.");
  if (room.pendingChoice || room.pendingCouncil) {
    throw new Error("The table is waiting for an answer.");
  }

  const player = room.players[room.currentSeat];
  if (!player) throw new Error("The active seat is empty.");
  if (!automated && player.token !== actorToken) {
    throw new Error("It is not your turn.");
  }

  const naturalDie = Math.floor(rng() * 6) + 1;
  const die = Math.max(1, Math.min(6, naturalDie + player.tuning));
  const tuning = player.tuning;
  player.tuning = 0;
  const before = player.position;
  movePlayer(player, die);
  const kind = SPACE_KINDS[player.position];
  room.signal += 1;
  room.lastRoll = {
    seat: player.seat,
    die,
    naturalDie,
    tuning,
    from: before,
    to: player.position,
  };

  if (kind === "council") {
    openCouncil(room, player, now, rng);
    applySignalCollapse(room, now);
    return { die, event: room.lastEvent, council: true };
  }

  const event = chooseEvent(kind, rng);
  event.landingSeat = player.seat;
  applyMaskPassive(room, player, kind, event);
  room.lastEvent = event;
  progressVow(room, player, kind);
  appendLog(room, `${player.name} cast ${die} and reached ${event.title}.`, now);

  if (event.choices) {
    room.pendingChoice = { seat: player.seat, event };
    room.deadline = now + TURN_MS;
    applySignalCollapse(room, now);
    return { die, event, pending: true };
  }

  applyEvent(room, player, event);
  applySignalCollapse(room, now);
  if (player.laps > 0 && player.echoes >= WIN_ECHOES && player.keys > 0) {
    room.status = "finished";
    room.winnerSeat = player.seat;
    room.deadline = null;
    room.lastEvent = {
      landingSeat: event.landingSeat,
      videoId: event.videoId,
      videoUrl: event.videoUrl,
      videoLabel: event.videoLabel,
      videoSource: event.videoSource,
      channelUrl: event.channelUrl,
      id: "road-names-winner",
      title: "The Road Speaks a Name",
      body: `${player.name} returned with ${player.echoes} Echoes, an Alabaster Key, and the ${player.sigil} mask.`,
      tone: "gold",
    };
    appendLog(room, `${player.name} completed the Sixfold Road.`, now);
    return { die, event: room.lastEvent, won: true };
  }

  advanceTurn(room, now);
  return { die, event, pending: false };
}

export function answerChoice(room, actorToken, choiceId, options = {}) {
  const now = options.now ?? Date.now();
  const automated = Boolean(options.automated);
  if (!room.pendingChoice) throw new Error("No question is waiting.");
  const player = room.players[room.pendingChoice.seat];
  if (!automated && player.token !== actorToken) {
    throw new Error("This answer is not yours.");
  }
  const choice = room.pendingChoice.event.choices.find(
    (candidate) => candidate.id === choiceId,
  );
  if (!choice) throw new Error("The table does not recognize that answer.");

  applyEvent(room, player, choice);
  room.lastEvent = {
    ...room.pendingChoice.event,
    id: `${room.pendingChoice.event.id}-${choice.id}`,
    body: choice.result,
    choices: undefined,
  };
  appendLog(room, `${player.name} chose: ${choice.label}.`, now);
  room.pendingChoice = null;
  applySignalCollapse(room, now);
  advanceTurn(room, now);
  return room.lastEvent;
}

export function advanceTurn(room, now = Date.now()) {
  const occupied = room.players.filter(Boolean);
  if (!occupied.length) {
    room.status = "lobby";
    room.currentSeat = null;
    room.deadline = null;
    return;
  }

  for (let step = 1; step <= MAX_PLAYERS; step += 1) {
    const seat = (room.currentSeat + step) % MAX_PLAYERS;
    if (room.players[seat]) {
      room.currentSeat = seat;
      room.turnNumber += 1;
      room.deadline = now + TURN_MS;
      return;
    }
  }
}

export function removeBot(room, actorToken, seat) {
  if (room.hostToken !== actorToken) {
    throw new Error("Only the table keeper can move empty masks.");
  }
  const player = room.players[seat];
  if (!player?.bot || room.status !== "lobby") {
    throw new Error("That seat cannot be cleared.");
  }
  room.players[seat] = null;
  appendLog(room, `${player.name} dissolved into Static.`);
}

export function publicRoom(room, now = Date.now()) {
  const occupied = Math.max(1, room.players.filter(Boolean).length);
  return {
    code: room.code,
    status: room.status,
    keeperSeat:
      room.players.find((player) => player?.token === room.hostToken)?.seat ?? null,
    players: room.players.map((player) =>
      player
        ? {
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
            relics: player.relics.map((id) => RELICS[id]),
            warded: player.warded,
            tuning: player.tuning,
            vow: player.vow,
            online: player.online,
            bot: player.bot,
          }
        : null,
    ),
    masks: MASKS,
    spectatorCount: room.spectators.size,
    currentSeat: room.currentSeat,
    turnNumber: room.turnNumber,
    round: room.status === "playing" ? Math.ceil(room.turnNumber / occupied) : 0,
    deadline: room.deadline,
    secondsLeft: room.deadline
      ? Math.max(0, Math.ceil((room.deadline - now) / 1000))
      : null,
    pendingChoice: room.pendingChoice
      ? { seat: room.pendingChoice.seat, event: room.pendingChoice.event }
      : null,
    pendingCouncil: room.pendingCouncil
      ? {
          callerSeat: room.pendingCouncil.callerSeat,
          event: room.pendingCouncil.event,
          votes: room.pendingCouncil.votes,
        }
      : null,
    signal: Math.max(0, Math.min(SIGNAL_MAX, room.signal)),
    signalMax: SIGNAL_MAX,
    collapseCount: room.collapseCount,
    hazard: room.hazard,
    lastEvent: room.lastEvent,
    lastRoll: room.lastRoll,
    winnerSeat: room.winnerSeat,
    log: room.log,
    objective: { echoes: WIN_ECHOES, keys: 1, laps: 1 },
  };
}
