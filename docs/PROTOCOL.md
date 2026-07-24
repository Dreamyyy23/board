# Sixfold Road protocol v3

Socket.IO acknowledgement callbacks are used for commands. `room_state` is the
canonical public snapshot broadcast after every accepted mutation. Clients do
not optimistically change positions, scores, inventory, votes, or timers.

## Session commands

### `create_room`

Input: `{ name, youtubeChannelUrl }`

Reply: `{ ok, code, token, playerId, state }`

The authority resolves the channel before allocating the room, rejects empty
or unreadable channels, and stores the resulting public-upload catalog
privately. An optional API key adds server-side embeddability filtering.

### `join_room`

Input: `{ code, name, token? }`

A valid reconnect token restores the original player and mask. When all six
seats are occupied, a new connection becomes a spectator.

Seat uniqueness is token-based only. The protocol intentionally has no
one-seat-per-account, IP, browser, or person restriction; six independent
sessions can claim all six seats.

### `claim_seat`

Input: `{ code, token, seat }`

Lobby only. Moves the player to an unoccupied seat and therefore selects that
seat's asymmetric mask.

## Keeper commands

### `start_game`

Input: `{ code, token }`

Starts or resets the crossing. Only the room keeper may call it.

### `add_bot` / `remove_bot`

Input: `{ code, token, seat? }`

Lobby-only controls for filling empty masks with practice Echo travelers.

## Active-turn commands

### `tune_roll`

Input: `{ code, token, direction }`

`direction` is `-1` or `1`. It spends one Focus and modifies the eventual
server-owned die by exactly one face. The unmodified die remains private until
the cast resolves.

### `use_relic`

Input: `{ code, token, relicId }`

Consumes a carried relic through the authority path. Relic effects can ward a
Static collapse, reroll a cast, or reveal approaching terrain.

### `gift_echo`

Input: `{ code, token, targetSeat }`

Transfers one Echo to another occupied seat. A traveler may gift once per turn.

### `roll`

Input: `{ code, token }`

Contains no die value. The server verifies the active traveler, rolls, applies
Focus tuning and mask passives, moves the token, and resolves the landed space.

### `reject_transmission`

Input: `{ code, transmissionId, videoId, errorCode? }`

Reports that YouTube rejected the currently assigned embed. The authority
validates both public IDs, privately excludes every candidate already attempted
for that landing, and stages a distinct upload. This command never reruns the
space, movement, rewards, hazards, or victory checks. The room catalog remains
absent from public snapshots.

## Paused-state commands

### `answer_choice`

Input: `{ code, token, choiceId }`

Only the traveler who opened the pending Oracle may answer.

### `vote_council`

Input: `{ code, token, vote }`

`vote` is `stabilize`, `provoke`, or `exchange`. Every occupied human mask must
vote. Bots automatically vote to stabilize. A tie follows the fixed priority
order stabilize, provoke, exchange so resolution is deterministic.

## Server events

### `room_state`

The public snapshot contains:

- room code, protocol-independent phase, keeper seat, round, and turn number
- six mask definitions and six token-free public player slots
- current seat and authoritative deadline
- latest public die result, movement, event, and chronicle
- public channel metadata (`id`, title, URL, visual brand, and video count)
- the landing's server-selected `transmissionId`, start time, `videoId`, title,
  canonical YouTube `videoUrl`, and channel source
- pending Oracle choice or pending Council with visible submitted votes
- per-player Echoes, Key state, Focus, Resolve, Vow progress, relics, ward,
  tuning, connection state, and public statistics
- global Static signal, current hazard, and winner

Private reconnect tokens never appear in room snapshots or broadcasts.
Every accepted landing creates a new unique transmission even when a
single-video channel repeats. Clients stage that assignment for every player
and spectator. The authority never waits for playback and never grants
progression for opening, pausing, or watching a video.

## Timer and disconnect behavior

Turns last twenty seconds. The authority resolves an expired roll without a
client command. Oracle and Council pauses use their own deadlines. A disconnected
traveler keeps their seat for reconnection; the server can continue resolving
their timed turns through the same authoritative path.
