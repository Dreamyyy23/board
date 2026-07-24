# Production architecture and deployment truth

Obscur has one rules model and two authority transports. A room always has one
canonical writer. The browser renders public state and sends decisions; it does
not calculate outcomes.

## Source architecture

```text
React / vinext interface
        │
        ├── Socket.IO commands + room_state (local/realtime)
        │
        └── HTTP action envelopes + polling (durable/static host)
                    │
                    ▼
             rules v4 authority
                    │
        ┌───────────┴───────────┐
        │                       │
 in-memory room Map        D1 room row
 local Socket.IO           optimistic CAS version
        │                       │
        └──────── structured events ────────┐
                                             ▼
                           reconnect / broadcast / Chronicle
```

Canonical pure and testable rules live in `server/game-v4.mjs`. The historical
v3 engine remains in `server/game-core.mjs` for baseline reproduction and
shared authored catalogs. Both `server/server.mjs` and
`server/http-authority.mjs` call the v4 functions.

## Local Socket.IO authority

`npm run dev` starts:

- the vinext client at `http://localhost:3000`;
- the Socket.IO authority at `http://localhost:3001`.

Rooms are stored in a process-local `Map`. This is correct for local play and a
single Node instance. It must not be placed behind a multi-instance load
balancer: two processes could otherwise believe they own the same room.

A scaled Socket.IO release needs one of:

- one Durable Object or equivalent actor per room code; or
- a directory that pins each room to one Node host, plus durable snapshots and
  a shared broadcast layer.

Live host migration is not implemented. A directory may assign a new room, but
it must not move an active match without a versioned snapshot and signed
handoff.

## Durable HTTP authority

`server/http-authority.mjs` is designed for static clients and request-based
hosting:

- one D1 row per room code;
- serialized v4 room state;
- monotonically increasing row version;
- optimistic compare-and-swap on every write;
- 24-hour room expiry;
- one expired phase settled per request;
- bounded in-process rate buckets in addition to platform controls;
- durable player and spectator reconnect tokens;
- token-free public snapshots.

Simultaneous commands cannot silently overwrite each other. One wins the row
version; the other receives a retryable conflict. Command IDs prevent a
successful mutation from resolving twice when the retry reaches a newer
version.

For stronger production abuse controls, add platform-distributed rate limiting
or a Durable Object gate. The current in-process rate buckets are not shared
between isolates.

## YouTube transmission rule

Room creation binds one public YouTube channel. The authority resolves and
stores its playable upload catalog privately, then selects one upload for each
landing.

- Public state exposes only the assigned transmission.
- One player iframe is mounted lazily when a transmission exists.
- Native YouTube controls, captions, fullscreen, and branding remain.
- A blocked autoplay receives a nearby start control.
- A rejected embed fails forward to an untried candidate.
- The final accepted video ID deterministically names the Omen.
- Playback never gates phase settlement or grants progression.

`YOUTUBE_API_KEY` is optional and server-only. Without it, supported curated or
RSS discovery paths remain available with narrower validation. Never embed the
key in Pages or client JavaScript.

## Security and privacy boundaries

- Reconnect tokens are bearer secrets and stay out of snapshots, logs, event
  history, broadcast mode, and the Chronicle.
- Council vote maps remain private until each stone is revealed.
- Witness choices remain private until the natural die.
- Clients cannot submit dice, event deltas, positions, resources, Omens,
  qualification, or winners.
- Spectator tokens can predict but fail player-ownership checks for gameplay
  commands.
- Names and room codes are normalized server-side.
- CORS is restricted to the same origin and explicitly allowed client origins.
- Support/donation UI is separate from every authority action and reward path.

## Build and hosting surfaces

### Vinext application

```text
npm run build
```

This produces the full application artifact for a compatible application host.
`NEXT_PUBLIC_GAME_SERVER_URL` selects the browser-facing authority.

### GitHub Pages client

```text
$env:VITE_GAME_SERVER_URL="https://authority.example/api/authority"
npm run build:pages
```

Pages can host only the static client. It cannot execute the authority. The
build writes the root shell and `pages-assets/`.

### OpenAI Sites metadata

`.openai/hosting.json` is the sole source of truth for the connected Sites
project ID and bindings. Never invent or replace that opaque ID. A deployment
requires:

1. a reachable configured Sites project;
2. a pushed source state;
3. a real commit SHA for exactly that state;
4. a saved version;
5. deployment of that saved version.

Every Sites deployment URL is production. If project access or source-control
state is missing, report the deployment as blocked; a local build is not a
deployment.

## Current public truth

At the time of this source handoff:

- the repository contains and locally builds rules v4;
- the local Socket.IO and source HTTP authorities report v4;
- the opaque project recorded in `.openai/hosting.json` currently returns
  `Sites project not found`, so no Sites version or production deployment was
  created;
- this local export has no `.git` directory or source commit SHA, so it cannot
  be treated as a pushed, versionable deployment source;
- the existing GitHub Pages/public authority pairing is still known to expose
  the older HTTP v1 contract;
- `app/authority-compat.mjs` keeps that surface usable and labels it
  **Foxy-only compatibility**;
- v4 source features must not be described as publicly live until the deployed
  authority reports v4 and the public client is rebuilt against it.

## Required production verification

Before removing the compatibility warning:

1. check `/api/authority` reports rules v4;
2. create six independent traveler sessions and a spectator;
3. reconnect during Intent, Bend, reaction, Oracle, Council vote/reveal, and
   Fracture;
4. retry duplicate commands over both transports;
5. race two Oxygen commands and verify one resolution;
6. reject an embed and verify movement/event state does not replay;
7. complete both a Final Orbit victory and a House victory;
8. inspect every public payload for tokens and unrevealed votes;
9. validate normal and reduced-motion broadcast capture at 1920×1080;
10. run lint, tests, production build, and Pages build from the deployed source
    commit.
