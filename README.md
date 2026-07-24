# Obscur — The Sixfold Road

An isolated Foxyverse multiplayer board game. Six travelers wear asymmetric
masks, cross a thirty-six-space ritual road, survive the rising Static, bargain
at Councils, collect relics, and race to return to the Hearth with thirteen
Echoes and an Alabaster Key.

This is a game rather than a lore page. The board is synchronized in real time,
all meaningful state changes are decided by the server, and reconnect tokens
restore a traveler to the same mask.

## Run locally

Requires Node.js 22.13 or newer.

```text
npm install
npm run dev
```

Open `http://localhost:3000`. The Socket.IO room authority listens on port
`3001`; `npm run dev` starts both processes.

For a solo test, create a room, call several Echo travelers, select a mask, and
begin the crossing. For multiplayer testing, open another browser or private
window and join with the five-letter room code.

## The game

- Six named masks have distinct passive abilities: Ember, Veil, Thorn, Moon,
  Moss, and Ash.
- Every traveler has Focus, Resolve, a personal Vow, inventory slots, and a
  once-per-turn gift action.
- Focus can tune a server-owned die exactly one face before rolling.
- Relics create deliberate tactical exceptions: ward a collapse, reroll a bad
  cast, or reveal the next space.
- Oracle spaces pause for a private choice. Councils pause for a table-wide
  vote and resolve only after every human traveler has answered.
- The global Static meter rises with dangerous outcomes. At twelve, the table
  collapses and every unwarded traveler loses Echoes.
- Vow progress rewards a particular style of play rather than only raw luck.
- A traveler wins by carrying an Alabaster Key, reaching thirteen Echoes, and
  completing a full circuit.
- Every landing draws a random Foxy Alchemy Studio transmission from the
  server-owned channel deck. The landing player receives a prominent video
  gate and the table sees the same assignment in the event rail.
- YouTube playback is always an explicit player action, never autoplays, and
  never affects movement, rewards, or victory.
- The authority enforces six seats but deliberately does not enforce one seat
  per person, account, or network. One operator may occupy all six through six
  separate sessions.

## Multiplayer authority

```text
React / vinext client
        │ Socket.IO commands + canonical snapshots
        ▼
Node room authority
        ├── room-code registry and six reconnectable seats
        ├── server-owned die, timer, events, votes, and inventory
        ├── Oracle and Council pause states
        ├── bot turns through the same command path
        └── token-free public room snapshots
```

Live rooms are currently kept in memory, so a server restart clears them. A
production release should move each room to a durable single-writer authority
such as Cloudflare Durable Objects, or use a Socket.IO fleet with a Redis
adapter. A rotating host directory should distribute health, capacity, region,
and protocol version only; reconnect tokens must never leave their room
authority.

## Configuration

- `GAME_PORT` — realtime server port, default `3001`
- `CLIENT_ORIGINS` — comma-separated allowed browser origins
- `NEXT_PUBLIC_GAME_SERVER_URL` — browser-facing realtime endpoint

Board rules, mask abilities, vows, relics, event decks, and the curated channel
video IDs live in
`server/game-core.mjs`. The wire contract is documented in
`docs/PROTOCOL.md`.

## Verification

```text
npm run lint
npm test
```

The suite covers public-state privacy, turn authorization, Oracle ownership,
timer authority, reconnects, asymmetric mask selection, Focus tuning, Council
consensus, and relic consumption. `npm test` also creates a production build.
