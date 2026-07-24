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

## GitHub Pages

`npm run build:pages` creates the committed static Pages shell at `index.html`
and its browser bundle in `pages-assets/`. GitHub Pages can publish that client
from the repository root without converting this README into the website.

GitHub Pages cannot execute multiplayer authority code itself. The published
client therefore calls the durable HTTP authority at
`https://obscur-sixfold-road.firstly2-8y.chatgpt.site/api/authority` while all
player-facing navigation remains on `https://dreamyyy23.github.io/board/`.
Rebuild the Pages client with:

```text
VITE_GAME_SERVER_URL=https://obscur-sixfold-road.firstly2-8y.chatgpt.site/api/authority npm run build:pages
```

The production authority stores rooms in D1, accepts the GitHub Pages origin,
and uses polling so the static client does not depend on a WebSocket-capable
host.

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

Local Socket.IO rooms are kept in memory. The GitHub Pages release instead uses
`server/http-authority.mjs`, stores room snapshots in D1, and applies optimistic
version checks so simultaneous commands cannot silently overwrite each other.
Reconnect tokens remain in each player's browser and are never included in
public room snapshots.

## Configuration

- `GAME_PORT` — realtime server port, default `3001`
- `CLIENT_ORIGINS` — comma-separated allowed browser origins
- `NEXT_PUBLIC_GAME_SERVER_URL` — browser-facing realtime endpoint
- `VITE_GAME_SERVER_URL` — authority endpoint embedded in the GitHub Pages
  client

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
