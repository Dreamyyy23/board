export type Choice = {
  id: string;
  label: string;
  result: string;
};

export type GameEvent = {
  id: string;
  title: string;
  body: string;
  tone: string;
  landingSeat?: number;
  deltaEchoes?: number;
  deltaKeys?: number;
  deltaFocus?: number;
  deltaResolve?: number;
  staticDelta?: number;
  move?: number;
  relic?: string;
  videoId?: string;
  videoUrl?: string;
  videoLabel?: string;
  videoSource?: string;
  channelUrl?: string;
  choices?: Choice[];
};

export type Mask = {
  id: string;
  name: string;
  color: string;
  title: string;
  passive: string;
};

export type Vow = {
  id: string;
  title: string;
  kind: string;
  target: number;
  progress: number;
  complete: boolean;
};

export type Relic = {
  id: string;
  title: string;
  mark: string;
  description: string;
};

export type Player = {
  id: string;
  name: string;
  seat: number;
  sigil: string;
  color: string;
  mask: Mask;
  position: number;
  echoes: number;
  keys: number;
  laps: number;
  focus: number;
  resolve: number;
  relics: Relic[];
  warded: boolean;
  tuning: number;
  vow: Vow;
  online: boolean;
  bot: boolean;
};

export type RoomState = {
  code: string;
  status: "lobby" | "playing" | "finished";
  players: Array<Player | null>;
  masks: Mask[];
  keeperSeat: number | null;
  spectatorCount: number;
  currentSeat: number | null;
  turnNumber: number;
  round: number;
  deadline: number | null;
  secondsLeft: number | null;
  pendingChoice: { seat: number; event: GameEvent } | null;
  pendingCouncil: {
    callerSeat: number;
    event: GameEvent;
    votes: Record<number, string>;
  } | null;
  signal: number;
  signalMax: number;
  collapseCount: number;
  hazard: { id: string; title: string; body: string; at: number } | null;
  lastEvent: GameEvent;
  lastRoll: {
    seat: number;
    die: number;
    naturalDie: number;
    tuning: number;
    from: number;
    to: number;
  } | null;
  winnerSeat: number | null;
  log: Array<{ id: string; at: number; text: string }>;
  objective: { echoes: number; keys: number; laps: number };
};

export type Session = {
  code: string;
  token: string | null;
  playerId: string | null;
  name: string;
  spectator?: boolean;
};

export type ServerReply = {
  ok: boolean;
  error?: string;
  code?: string;
  token?: string | null;
  playerId?: string | null;
  spectator?: boolean;
  reconnected?: boolean;
  resolved?: boolean;
  state?: RoomState;
};
