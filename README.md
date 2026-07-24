# Obscur — The Sixfold Road

Obscur is a one-to-six traveler, server-authoritative Foxyverse board game.
Wear one of six asymmetric masks, read six possible roads, declare an Intent,
cast and Bend the bone, rescue other travelers, survive Shared Static, and
qualify for the Final Orbit.

This repository contains the complete rules-v4 game: browser table, native
ritual-machine presentation, Socket.IO authority, D1-backed HTTP authority,
bots, reconnects, spectators, broadcast mode, deterministic simulation, and
the legacy v1 compatibility adapter.

## What makes it a game

- A 36-space physical road with six visible destination classes every turn.
- Server-owned natural rolls and a visible ±1 Focus Bend decision.
- `CLAIM`, `SHELTER`, and targeted `BIND` Intents.
- Private Witness predictions for every non-active traveler.
- Give Oxygen reactions and persistent Golden Thread relationships.
- Oracle choices, secret Council votes, relics, Omens, and Fracture laws.
- Six masks with distinct passives, charged powers, and behavioral Vows.
- A public, deterministic Final Orbit and House-loss condition.
- Authority-selected YouTube transmissions that never gate gameplay.
- A median target of roughly 20–30 minutes.

The full player rules are in [docs/RULES.md](docs/RULES.md). The 10,000-match
acceptance result is in [docs/BALANCE-REPORT.md](docs/BALANCE-REPORT.md).

## Run locally

Requires Node.js 22.13 or newer.

```text
npm install
npm run dev
```

Open `http://localhost:3000`. The realtime authority listens on port `3001`.
Create a table and use **Call Echo Traveler** to fill empty masks with bots for
a complete solo match.

Useful commands:

```text
npm run lint
npm test
npm run simulate:baseline -- --matches=10000 --players=6 --seed=20260725
npm run simulate -- --matches=10000 --players=6 --seed=20260725 --profile=all
npm run build:pages
```

## Rules-v4 turn

Each ordinary turn follows one canonical authority sequence:

```text
READ → INTENT → WITNESS → CAST → BEND → RESOLVE → REACTION → TRANSMISSION
```

Expired human decisions settle to documented safe defaults. Bots use the same
command paths. Commands carry idempotency IDs, and reconnect tokens restore the
same mask without ever appearing in public snapshots.

A traveler qualifies with 13 Echoes, an Alabaster Key, and one completed
circuit. The current round then finishes and all occupied masks receive one
Final Orbit turn. The third Fracture—or failure to qualify by the hard
ending—gives the victory to the House.

## Presentation

The UI is a native board rather than a cinematic shell:

- a physical six-pip die and natural/final result distinction;
- reachable-space pulses and class-specific risk color;
- smoothly traveling tokens with stable identities;
- Golden Threads anchored between travelers;
- phase, Bend, Oxygen, Fracture, key, and victory feedback;
- Shared Static interference that escalates with authority state;
- compact desktop, tablet, mobile, and `?broadcast=1` layouts;
- text/symbol redundancy and a reduced-motion path.

The visual rules and external-art approval gate are in
[docs/VISUAL-BIBLE.md](docs/VISUAL-BIBLE.md). Planned Higgsfield batches are
recorded in
[docs/HIGGSFIELD-GENERATION-MANIFEST.json](docs/HIGGSFIELD-GENERATION-MANIFEST.json).
External cinematic frames are optional; the complete game remains playable
with every generated asset disabled.

## Architecture

```text
React / vinext client
        │
        ├── Socket.IO commands + canonical snapshots (local realtime)
        │
        └── HTTP envelopes + polling (static Pages client)
                    │
                    ▼
Rules-v4 authority
        ├── server-owned phases, deadlines, die, events, and winners
        ├── reconnectable seats, spectators, bots, and idempotent commands
        ├── D1 optimistic persistence for HTTP rooms
        ├── private YouTube catalog and public transmission identity
        └── structured Chronicle and deterministic simulation
```

The current identifiers are:

- Socket.IO: `sixfold-road-v4`
- HTTP: `sixfold-road-http-v4`
- `rulesVersion: 4`
- `stateVersion: 4`

See [docs/PROTOCOL.md](docs/PROTOCOL.md) for commands and state contracts, and
[docs/PRODUCTION-ARCHITECTURE.md](docs/PRODUCTION-ARCHITECTURE.md) for the
deployment model.

## GitHub Pages and authority deployment

`npm run build:pages` creates the static Pages shell at `index.html`, its
browser bundle in `pages-assets/`, and a self-contained preview in
`pages-dist/`.

GitHub Pages cannot run multiplayer authority code. A production Pages build
must embed an already-deployed HTTP authority:

```powershell
$env:VITE_GAME_SERVER_URL='https://your-authority.example/api/authority'
npm run build:pages
```

The build config gives an explicit process environment variable priority over
`.env.local`, preventing a release from accidentally targeting localhost.
Until the rules-v4 authority and static bundle are both deployed, a public
endpoint may continue to expose the legacy v1 compatibility experience; local
source remains the release authority of record.

## Configuration

- `GAME_PORT` — realtime port, default `3001`
- `CLIENT_ORIGINS` — comma-separated allowed browser origins
- `NEXT_PUBLIC_GAME_SERVER_URL` — vinext browser-facing endpoint
- `VITE_GAME_SERVER_URL` — endpoint embedded in the Pages client
- `YOUTUBE_API_KEY` — optional server-only YouTube Data API credential

Never embed `YOUTUBE_API_KEY`, reconnect tokens, or the room's private video
catalog in the Pages bundle.

## Verification

```text
npm run lint
npm test
```

The test suite covers rules-v4 phases, all six Vow completion paths, Omens,
mask powers, Fractures, timeout defaults, bots, reconnects, spectators,
idempotency, public-state privacy, HTTP persistence, video failover,
compatibility normalization, adaptive presentation contracts, and production
build creation.

The deterministic baseline and acceptance artifacts are
`docs/balance-baseline.json` and `docs/balance-v4.json`. The legacy authority
completed only 0.51% of matches before the simulator's 720-action guard. Rules
v4 completed all 10,000 matches with zero invalid or soft-lock states, a
60-cast median, and all six masks inside the intended 13–20% conditional
win-share band.
