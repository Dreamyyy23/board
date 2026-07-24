# Sixfold Road protocol v4

Rules v4 uses one canonical server state for Socket.IO, the D1-backed HTTP
authority, reconnects, bots, spectators, simulation, broadcast mode, and the
Chronicle. Clients submit decisions; they never submit dice, positions,
resources, deadlines, events, Omens, qualification, or winners.

Current identifiers:

- Socket.IO: `sixfold-road-v4`
- HTTP: `sixfold-road-http-v4`
- `rulesVersion: 4`
- `stateVersion: 4`

Every gameplay mutation should include a client-generated `commandId`. The
authority records the bounded key `token:action:commandId`; a retry returns
`duplicate: true` without resolving again.

## Transports

### Socket.IO

Commands are event names with acknowledgement callbacks. Every accepted
mutation broadcasts `room_state`.

```js
socket.emit("select_intent", payload, (reply) => {
  // { ok, duplicate?, state?, error? }
});
```

### HTTP authority

POST an envelope to `/api/authority`:

```json
{
  "action": "select_intent",
  "payload": {
    "code": "NORTH",
    "token": "private bearer token",
    "commandId": "intent-m2m7-1",
    "intent": "claim"
  }
}
```

`get_state` is the polling read. It may settle at most one expired phase before
returning, persist that transition with optimistic compare-and-swap, and expose
the resulting public snapshot. A command request that first encounters an
expired phase returns the settled state and asks the client to review it rather
than applying a late decision.

## Sessions and lobby

### `health`

No payload. Reports protocol, rules version, and authority capabilities.

### `create_room`

Input: `{ name, youtubeChannelUrl? }`

Reply: `{ ok, code, token, playerId, state }`

The authority resolves the channel once and stores the playable catalog
privately. The first non-bot traveler is the table keeper.

### `join_room`

Input: `{ code, name, token? }`

A valid player token restores its exact seat. A valid spectator token restores
that spectator session. A new visitor takes the first empty mask; when all six
are occupied, the visitor becomes a spectator.

### `claim_seat`

Input: `{ code, token, commandId, seat }`

Lobby only. Moves the traveler to an empty seat and adopts that mask and Vow.

### `leave_seat`

Input: `{ code, token, commandId }`

Releases the mask. If it was active, the authority safely advances the round.
Keeper status transfers to another occupied human session when possible.

### `add_bot`

Input: `{ code, token }`

Keeper-only, lobby-only. Adds one Echo traveler.

### `remove_bot`

Input: `{ code, token, commandId, seat }`

Keeper-only, lobby-only.

### `start_game`

Input: `{ code, token, commandId }`

Keeper-only. Starts the room or opens another road after a completed match.

## Phase machine and deadlines

| Phase | Default deadline | Accepted decisions | Timeout/default |
|---|---:|---|---|
| `lobby` | none | seat and keeper commands | none |
| `intent` | 20 s | Intent, Witness, intent-timed power/relic, gift, cast | SHELTER, then server cast |
| `bend` | 5 s | accept, ±1 Bend, bend-timed power | accept natural result |
| `reaction` | 5 s | first valid Oxygen or reaction power | apply remaining harm |
| `oracle` | 20 s | landing traveler's answer | deterministic state-aware answer |
| `council-vote` | 20 s | one secret stone per occupied mask | deterministic missing votes |
| `council-reveal` | 650 ms/stone | none | reveal next seat |
| `fracture` | 2.5 s | none | install modifier and resume |
| `finished` | none | keeper may start a new match | none |

Bots and timeout defaults call the same pure authority transitions used by
human commands. One settlement call advances one visible phase, which prevents
polling from skipping transmissions or dramatic states.

## Decisions

### `select_intent`

Input:

```ts
{
  code: string;
  token: string;
  commandId: string;
  intent: "claim" | "shelter" | "bind";
  targetSeat?: number; // required for BIND
}
```

Only the active traveler may lock an Intent during `intent`.

### `submit_prediction`

Input:

```ts
{
  code: string;
  token: string; // player or durable spectator token
  commandId: string;
  prediction: "light" | "threshold" | "teeth";
}
```

The active traveler cannot Witness their own cast. Predictions stay private
until the natural result; public state exposes only submitted status and
aggregate counts. Spectator submissions are rate-limited.

### `cast`

Input: `{ code, token, commandId }`

Contains no die. Requires a locked Intent, creates the server-owned natural d6,
reveals predictions, and opens `bend`.

`roll` remains a compatibility alias for `cast`; it does not restore pre-v4
single-step resolution.

### `bend`

Input:

```ts
{
  code: string;
  token: string;
  commandId: string;
  delta: -1 | 0 | 1;
  useAshEvent?: boolean;
}
```

The authority spends Focus only after the natural result is visible. `delta: 0`
accepts it. DOOR can waive the cost. `useAshEvent` selects a previously armed
Last Witness alternative without changing the landed position.

`tune_roll` is a compatibility alias in `bend`; `amount` maps to `delta`.

### `give_oxygen`

Input: `{ code, token, commandId }`

The first valid non-victim helper during `reaction` pays Resolve, then Echo,
prevents harm, and forms a Golden Thread. Once-per-round and already-resolved
checks are authoritative and idempotent.

### `use_mask_power`

Input: `{ code, token, commandId, delta?, results? }`

The mask determines timing and payload:

- Moon and Foxfire-style reveals may request candidate `results`; the
  authority validates and fills two legal results.
- Thorn requires `delta: -1 | 1`.
- other powers require no client arithmetic.

### `use_relic`

Input: `{ code, token, commandId, relicId, results? }`

Relics are removed and resolved atomically. Quiet Bell, Mirror Shard, and
Foxfire Lens each validate their legal phase.

### `gift_echo`

Input: `{ code, token, commandId, targetSeat }`

Active traveler only, during `intent`, once per turn.

### `answer_choice`

Input: `{ code, token, commandId, choiceId }`

Only the traveler who opened the Oracle may answer.

### `vote_council`

Input: `{ code, token, commandId, choiceId }`

Choices are `watch`, `open`, and `knot`. Public voting state contains
`votedSeats`, never the private vote map. During reveal it adds one
`{ seat, choiceId }` at a time.

### `reject_transmission`

Input:

```ts
{
  code: string;
  token: string;
  commandId: string;
  transmissionId: string;
  videoId: string;
  errorCode?: number;
}
```

The authority validates the active IDs, chooses a distinct untried private
candidate, and derives the next Omen from the final accepted video ID. It never
reruns movement, event deltas, qualification, or victory.

### `set_streamer_mode`

Input: `{ code, token, commandId, enabled }`

Keeper-only. Enables the audience pulse and optional House's Guess
presentation. It grants no gameplay authority.

## Public room snapshot

Important v4 fields:

```ts
{
  rulesVersion: 4;
  stateVersion: 4;
  features: string[];
  phase: string;
  presentationState: string;
  round: number;
  roundState: { participantSeats: number[]; takenSeats: number[] };
  turn: {
    id: string;
    intent: "claim" | "shelter" | "bind" | null;
    reachable: Array<{
      roll: number;
      destination: number;
      kind: string;
      class: "light" | "threshold" | "teeth";
    }>;
    revealedEvents: Record<number, object>;
    naturalRoll: number | null;
    finalRoll: number | null;
    omen: string | null;
    predictionSummary: object;
  } | null;
  pendingReaction: object | null;
  pendingChoice: object | null;
  pendingCouncil: object | null;
  staticState: object;
  fractures: number;
  fractureModifier: object | null;
  councilModifier: object | null;
  omen: string | null;
  nextOmen: string | null;
  endgame: object;
  events: StructuredGameEvent[];
  recentEvents: StructuredGameEvent[];
  chronicle: object | null;
  audiencePulse: object;
}
```

Each player exposes public progress, mask power metadata, `maskCharge`,
`goldenThreads`, relationship counts, `exposed`, `qualified`,
`oxygenAvailable`, and prediction-submitted state. No player or spectator token
appears anywhere in a public snapshot.

## Structured events

Events carry stable fields rather than requiring prose parsing:

```ts
type StructuredGameEvent = {
  id: string;
  sequence: number;
  type: string;
  phase: string;
  actorSeat?: number;
  targetSeats?: number[];
  naturalRoll?: number;
  finalRoll?: number;
  origin?: number;
  destination?: number;
  spaceKind?: string;
  spaceClass?: "light" | "threshold" | "teeth";
  intent?: "claim" | "shelter" | "bind";
  omen?: string;
  deltas: Array<{ seat: number; resource: string; amount: number }>;
  staticBefore?: number;
  staticAfter?: number;
  severity: "minor" | "major" | "critical";
  title: string;
  summary: string;
  turnNumber: number;
  round: number;
  createdAt: number;
  meta?: object;
};
```

The bounded event history supports reconnect, broadcast captions, simulation
metrics, and Chronicle generation.

## Version migration and production compatibility

`migrateRoomState` upgrades older serialized snapshots by adding explicit v4
defaults while preserving seat identity and accumulated progress. New v4
clients still recognize the deployed public v1 shape through
`app/authority-compat.mjs`; that compatibility path synthesizes a stable
landing transmission but does not claim unavailable v4 mechanics.

Do not describe source v4 as publicly live until the deployed authority reports
rules v4 and the public client has passed the production protocol checks.
