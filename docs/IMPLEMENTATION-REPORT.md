# Obscur rules v4 implementation report

Date: 2026-07-25
Status: local implementation and acceptance complete; production deployment
blocked by external project/source state.

## Core design changes

- Replaced the open-ended legacy loop with explicit rounds, three Fractures, a
  deterministic Final Orbit, and a hard House ending.
- Added Read the Road, three public Intents, hidden Witness predictions,
  post-roll Bend, Give Oxygen, Golden Threads, Omens, stateful Oracle choices,
  secret Council reveal, relic timing, and structured Chronicles.
- Gave all six masks tuned passives, one-charge active powers, and behavioral
  Vows with tested completion paths.
- Unified Socket.IO, D1-backed HTTP, bots, spectators, reconnects, timeouts,
  idempotent commands, and simulation on the rules-v4 authority.
- Preserved public rules-v1 rooms through an honest compatibility adapter.
- Rebuilt the presentation as a native ritual machine with a physical die,
  natural/final destination states, traveling tokens, phase deformation,
  Static veins, Golden Threads, adaptive event audio, broadcast mode, and
  reduced-motion behavior.

## Major files changed

### Authority and client contract

- `server/game-v4.mjs` — canonical rules-v4 state machine.
- `server/game-core.mjs` — shared identities plus preserved legacy authority.
- `server/server.mjs` — v4 realtime commands and local-origin handling.
- `server/http-authority.mjs` — D1 persistence and v4 HTTP envelopes.
- `app/authority-compat.mjs` — rules-v1 normalization and transmission bridge.
- `app/game-types.ts` — complete v4 public client types.
- `app/game-client.tsx` — v4 commands, reconnect, broadcast, and sound cues.

### Native table presentation

- `app/components/board.tsx` — physical die, reachability, tokens, Threads, and
  presentation-state hooks.
- `app/components/command-rail.tsx` — phase decisions, active authority, and
  urgent timing.
- `app/components/seat-rail.tsx` — v4 resources, Vows, qualifications, and
  relationship state.
- `app/components/transmission-stage.tsx` — non-blocking landing receiver.
- `app/entity-v5.css` — ritual-machine animation, responsive, broadcast, and
  reduced-motion layers.
- `app/layout.tsx`, `app/loading.tsx`, and `public/og.png` — metadata, loading,
  and social sharing artwork.

### Simulation, tests, and publishing

- `scripts/simulate-baseline.mjs` and `scripts/simulate.mjs` — deterministic
  before/after harnesses.
- `tests/game-v4.test.mjs`, `tests/authority-compat.test.mjs`,
  `tests/http-authority.test.mjs`, `tests/realtime.integration.test.mjs`, and
  `tests/visual-contract.test.mjs` — rules, transports, and presentation
  contracts.
- `vite.pages.config.ts`, `github-pages/index.html`,
  `scripts/publish-pages.mjs`, and `scripts/prune-sites-build.mjs` — production
  URL precedence, v4 metadata, and static publishing.
- `README.md`, `CHANGELOG.md`, and all documents in `docs/` — player,
  protocol, broadcast, visual, production, and balance handoff.

## Verification performed

- `npm run lint` — passed with zero warnings or errors.
- `npm test` — 61/61 tests passed; 0 failed; production vinext build passed.
- `npm run build:pages` — passed; generated JS contains the configured
  production authority URL and no localhost authority URL.
- Live local match — six occupied masks completed through round 10 and Final
  Orbit; Intent, Cast, Bend, reaction, transmission, and victory states were
  exercised.
- Desktop/broadcast inspection — board, transmission, and HUD visible;
  `.action-dock` hidden in broadcast mode; horizontal overflow fixed at the
  browser's supported 1280-wide QA viewport.
- Higgsfield manifest — valid JSON. No Higgsfield credits were spent.

## Simulation: before and after

Both runs used 10,000 six-seat matches and seed `20260725`.

| Metric | Legacy | Rules v4 |
|---|---:|---:|
| Completion | 0.51% before 720-action guard | 100.0% |
| Target-duration result | 0.0% completed by 84 casts | 98.6% in 45–84 casts |
| Median completed casts | 145 | 60 |
| 90th percentile | 415 | 72 |
| Invalid / soft-lock states | not structurally bounded | 0 |
| Guaranteed ending | no | yes |
| House win condition | no | 9.4% overall |

Rules-v4 conditional win share remained within 13–20% for every mask: Ember
19.3%, Moss 18.2%, Ash 17.4%, Moon 15.8%, Veil 14.9%, and Thorn 14.5%.

## Deployment steps not performed

- **OpenAI Sites:** `.openai/hosting.json` names project
  `appgprj_6a6335b811948191b68de9108c3f11ee`, but the Sites connector returns
  `Sites project not found`. A version cannot be saved or deployed against a
  nonexistent project.
- **Source identity:** the original attachment export has no `.git` directory,
  branch, or commit SHA. Publication must therefore be based on a clean clone of
  `Dreamyyy23/board` and a normal fast-forward or reviewed merge.
- **Higgsfield style frames:** the website session was signed out and displayed
  a normal credit charge rather than a verified Unlimited `$0` toggle. The
  required three-frame prompts are ready in the manifest; no generation and no
  credit spend occurred.

## Remaining risks

### Gameplay

The simulator covers deterministic policies, not every human metagame. Vow
completion rates vary by policy, so future tuning should compare both JSON
artifacts rather than optimize only overall wins.

### Networking

Realtime and HTTP paths are tested locally, but multi-region D1 contention,
long-lived production polling, and reconnects across a real deployment still
require production soak testing.

### UI

The app browser enforced a 1280-pixel minimum during responsive QA. The 900px
and 620px layouts and reduced-motion path are implemented and protected by
source-contract tests, but physical mobile-device visual capture remains a
release check. Synthesized audio also remains subject to browser gesture rules.

### Production deployment

Rules v4 is not publicly live. The recorded Sites project is missing, the
local source has no commit identity, and the known public authority remains a
rules-v1 compatibility endpoint.

## Exact commands

Local table:

```text
npm install
npm run dev
```

Legacy baseline:

```text
npm run simulate:baseline -- --matches=10000 --players=6 --seed=20260725 --json=docs/balance-baseline.json
```

Rules-v4 acceptance:

```text
npm run simulate -- --matches=10000 --players=6 --seed=20260725 --profile=all --json=docs/balance-v4.json
```
