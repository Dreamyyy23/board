export type SpaceClass = "light" | "threshold" | "teeth";
export type Intent = "claim" | "shelter" | "bind";
export type Omen = "flame" | "mirror" | "door" | "moth" | "thread" | "static";
export type GamePhase =
  | "lobby"
  | "intent"
  | "bend"
  | "reaction"
  | "oracle"
  | "council-vote"
  | "council-reveal"
  | "fracture"
  | "finished";

export type Choice = {
  id: string;
  label: string;
  result: string;
  burden?: { id: string; title: string };
  [key: string]: unknown;
};

export type ResourceDelta = {
  seat: number;
  resource: string;
  amount: number;
};

export type GameEvent = {
  id: string;
  sequence?: number;
  type?: string;
  phase?: string;
  title: string;
  body?: string;
  summary?: string;
  tone?: string;
  severity?: "minor" | "major" | "critical";
  createdAt?: number;
  turnNumber?: number;
  round?: number;
  actorSeat?: number;
  targetSeats?: number[];
  presentationState?: string;
  naturalRoll?: number;
  finalRoll?: number;
  origin?: number;
  destination?: number;
  spaceKind?: string;
  spaceClass?: SpaceClass;
  intent?: Intent;
  omen?: Omen;
  deltas?: ResourceDelta[];
  staticBefore?: number;
  staticAfter?: number;
  meta?: Record<string, unknown>;
  transmissionId?: string;
  transmissionStartedAt?: number;
  landingSeat?: number;
  landingSpace?: number;
  eventId?: string;
  eventTitle?: string;
  deltaEchoes?: number;
  deltaKeys?: number;
  deltaFocus?: number;
  deltaResolve?: number;
  staticDelta?: number;
  move?: number;
  relic?: string;
  videoId?: string;
  videoUrl?: string;
  videoTitle?: string;
  videoLabel?: string;
  videoSource?: string;
  channelId?: string | null;
  channelUrl?: string;
  channelBrand?: ChannelBrand;
  choices?: Choice[];
};

export type ChannelBrand =
  | "obscur"
  | "signal"
  | "inkblot"
  | "fateweaver"
  | "chromed"
  | "chromed-sakura";

export type YoutubeChannel = {
  id: string | null;
  title: string;
  handle: string | null;
  url: string;
  brand: ChannelBrand;
  videoCount: number;
  source: string;
};

export type MaskPower = {
  id: string;
  title: string;
  timing: string;
  description: string;
};

export type Mask = {
  id: string;
  name: string;
  color: string;
  title: string;
  passive: string;
  active?: MaskPower;
};

export type Vow = {
  id: string;
  title: string;
  kind: string;
  target: number;
  progress: number;
  complete: boolean;
  description?: string;
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
  tuning?: number;
  exposed?: boolean;
  maskCharge?: number;
  goldenThreads?: number;
  relationships?: Record<number, number>;
  qualified?: boolean;
  qualifiedAtSequence?: number | null;
  qualifiedAtTurn?: number | null;
  oxygenAvailable?: boolean;
  predictionAvailable?: boolean;
  predictionSubmitted?: boolean | SpaceClass;
  vow: Vow;
  online: boolean;
  bot: boolean;
};

export type ReachableDestination = {
  roll: number;
  destination: number;
  kind: string;
  class: SpaceClass;
};

export type TurnState = {
  id: string;
  mode: string;
  seat: number;
  round: number;
  startedAt: number;
  intent: Intent | null;
  bindTargetSeat: number | null;
  reachable: ReachableDestination[];
  revealedEvents: Record<number, GameEvent>;
  naturalRoll: number | null;
  finalRoll: number | null;
  bendDelta: number;
  bendCost: number;
  freeBendUsed: boolean;
  omen: Omen | null;
  predictionSummary: {
    counts: Record<SpaceClass, number>;
    total: number;
    revealed: boolean;
    correctClass?: SpaceClass;
    correct?: number;
  };
  reactionEligibleSeats: number[];
  ashAlternative?: GameEvent | null;
  ashArmed?: boolean;
  useAshEvent?: boolean;
  powerUsed?: string | null;
};

export type Chronicle = {
  rulesVersion: number;
  outcome: "house" | "traveler";
  winnerSeat: number | null;
  winnerName: string | null;
  winnerMask: string | null;
  decisiveTurn: {
    turnNumber: number;
    round: number;
    title: string;
    summary: string;
  } | null;
  rescues: GameEvent[];
  councils: GameEvent[];
  fractures: GameEvent[];
  vowCompletions: GameEvent[];
  keysFound: GameEvent[];
  highlights: GameEvent[];
  finalTransmission?: {
    videoId: string;
    videoTitle: string;
    videoSource: string;
    omen: Omen;
  } | null;
};

export type RoomState = {
  rulesVersion?: number;
  stateVersion?: number;
  features?: string[];
  code: string;
  status: "lobby" | "playing" | "finished";
  phase?: GamePhase;
  presentationState?: string;
  players: Array<Player | null>;
  masks: Mask[];
  keeperSeat: number | null;
  spectatorCount: number;
  streamerMode?: boolean;
  currentSeat: number | null;
  turnNumber: number;
  round: number;
  roundState?: { participantSeats: number[]; takenSeats: number[] };
  turn?: TurnState | null;
  deadline: number | null;
  secondsLeft: number | null;
  pendingChoice: { id?: string; seat: number; event: GameEvent } | null;
  pendingCouncil: {
    id?: string;
    callerSeat: number;
    event: GameEvent;
    stage?: "voting" | "reveal";
    votedSeats?: number[];
    revealedVotes?: Array<{ seat: number; choiceId: string }>;
    revealIndex?: number;
    revealTotal?: number;
    votes?: Record<number, string>;
  } | null;
  pendingReaction?: {
    id: string;
    victimSeat: number;
    event: GameEvent;
    kind: string;
    class: SpaceClass;
    eligibleSeats: number[];
    helperSeat: number | null;
  } | null;
  signal: number;
  signalMax: number;
  staticState?: {
    value: number;
    max: number;
    label: string;
    fractures: number;
    fracturesUntilHouse: number;
  };
  fractures?: number;
  collapseCount: number;
  fractureModifier?: { id: string; title: string; body: string } | null;
  councilModifier?: { id: string; title: string; body: string } | null;
  hazard: { id: string; title: string; body: string; at: number } | null;
  omen?: Omen | null;
  nextOmen?: Omen | null;
  activeTransmission: GameEvent | null;
  lastEvent: GameEvent;
  lastRoll: {
    seat: number;
    die: number;
    naturalDie: number;
    tuning: number;
    bendDelta?: number;
    from: number;
    to: number;
    resolved?: boolean;
  } | null;
  winnerSeat: number | null;
  houseVictory?: boolean;
  endgame?: {
    mode: string;
    triggerRound: number | null;
    turnsRemaining: number | null;
    hardEndRound: number;
    finalRound: number;
    qualificationRanking: Array<{
      rank: number;
      seat: number;
      name: string;
      sigil: string;
      echoes: number;
      vowComplete: boolean;
      goldenThreads: number;
      resolve: number;
      qualifiedAtSequence: number;
    }>;
    tiebreakers: string[];
  };
  events?: GameEvent[];
  recentEvents?: GameEvent[];
  log: Array<{ id: string; at: number; text: string }>;
  chronicle?: Chronicle | null;
  audiencePulse?: {
    enabled: boolean;
    counts: Record<SpaceClass, number>;
    total: number;
    majority: SpaceClass | null;
    revealed: boolean;
    correct: number | null;
    accuracy: number | null;
    houseGuess: SpaceClass | null;
  };
  objective: { echoes: number; keys: number; laps: number };
  youtubeChannel: YoutubeChannel;
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
  protocol?: string;
  error?: string;
  code?: string;
  token?: string | null;
  playerId?: string | null;
  spectator?: boolean;
  reconnected?: boolean;
  resolved?: boolean;
  duplicate?: boolean;
  state?: RoomState;
};
