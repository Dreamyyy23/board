# P0 core-trust fixes — localhost session, 2026-07-27

Scope: the four game-breaking interaction defects and the mobile Decision
Tray called out in the 2026-07-27 handoff (§12 and Phase 1–2 of §21). Work was
performed against the PsycheOrSike site-export mirror at
`foxyverse-dreams-main\board-main\board-main` on the owner's instruction, and
verified end-to-end on localhost only. Nothing was pushed to GitHub, Pages, or
the Sites authority. Before the next deployment, sync these source files into
the canonical clone (`D:\foxy\.codex-publish-board-v4-20260725\repo`), re-run
its tests, and publish from there per the handoff's §3.2 workflow.

## What changed

### 12.1 Paid no-op Bends — fixed in `server/game-v4.mjs`

- `bendRoll` rejects a Bend whose clamped result equals the natural roll
  ("Natural 1 has no lower edge…") BEFORE Focus, the DOOR free Bend, or bend
  statistics mutate. Natural 1 therefore offers only Accept/+1 and natural 6
  only −1/Accept.
- Thorn's Crooked Road rejects edge no-ops before consuming the mask charge.
- `botBend` (authority) and `bendFor` (simulator) order candidates `[0, −1, +1]`
  so the edge-clamped duplicate dedupes away — bots previously PAID for no-op
  bends at the edges and would have soft-locked settlement once the authority
  started rejecting them.
- UI: bend option lists in the command rail and Decision Tray filter out any
  paid option whose destination equals the natural result, and label the DOOR
  free Bend as free.

### 12.2 Intent lock — fixed in `server/game-v4.mjs`

- `selectIntent` throws "Your Intent is already locked for this turn" once
  `room.turn.intent` is set, before any mutation. Statistics, Chronicle
  entries, and BIND targets can no longer be farmed by re-selection.
- The Oracle `must-shelter` oath can no longer be consumed by selecting
  SHELTER and then replaced: the lock lands in the same accepted command.
- Identical retries (same command ID) remain idempotent via the existing
  ledger; a DIFFERENT second command is rejected without mutation.
- UI: after the lock the rail shows an immutable Intent summary (with BIND
  target) plus one prominent "Cast the bone" action beside it — Intent → Cast
  is now one spatial flow on desktop and inside the tray on mobile.

### 12.3 Mirror Shard reaction timing — fixed in `app/components/command-rail.tsx`

- The authority already allowed the active victim to use Mirror Shard during
  the reaction window; the UI never offered it. Relic legality is now computed
  per relic and phase (`relicLegal`), and a dedicated one-press "MIRROR SHARD ·
  prevent up to 2 of N harm" control renders above the fold inside the
  reaction actions and the Decision Tray for the victim.
- Quiet Bell and Foxfire Lens keep their Intent-only timing (tested).

### 12.5 HTTP authority contention — fixed in `server/http-authority.mjs`

- `saveRoom` now throws a typed `VersionConflictError`; the request handler
  retries the whole action (fresh load + same command ID) up to 8 times, so
  simultaneous Witness/Council/Oxygen commands resolve server-side instead of
  surfacing "the table changed" errors.
- Rule rejections after a race return `ok:false` with `alreadyResolved:true`,
  the human-readable reason, and a FRESH public state + version (HTTP 409,
  never a generic 400). The client applies that state immediately, so losing
  Oxygen helpers snap to the truth.
- Retry exhaustion returns HTTP 503 with `retryable:true`.

### 12.4 Mobile Decision Tray — new `app/components/decision-tray.tsx`

- State-derived sticky dock, rendered on compact layouts (≤900px, where the
  command rail stacks below the board): current decision, authoritative
  timer with phase budget, cost, and legal buttons stay visible without
  scrolling. Covers Intent (with BIND targets), locked-Intent → Cast,
  Witness, Bend (edge-filtered, DOOR-aware), Ember/Thorn bend powers, Ash's
  Last Witness, Give Oxygen / Hold, victim Mirror Shard, Oracle answers, and
  secret Council stones.
- 44px+ touch targets (measured 59px), keyboard-focusable native buttons,
  `aria-live` decision label, urgent styling at ≤5s, reduced-motion safe,
  no horizontal overflow at 390px. Styles live in a scoped block appended to
  `app/entity-v5.css` (no new override sheet).

## Verification

- `node --test tests/*.test.mjs` — **77/77 passing** (was 64), including:
  - `tests/p0-trust.test.mjs` (new): edge Bends at natural 1 and 6, DOOR
    interaction, Thorn edge no-ops, bot settlement at both die extremes,
    Intent immutability + oath locking + idempotent retries, and every relic
    exercised in its real legal phase.
  - `tests/http-contention.test.mjs` (new): a compare-and-swap FakeD1 that
    guarantees stale concurrent reads; five simultaneous Witness submissions
    and six simultaneous Council votes each record exactly once; a five-way
    Oxygen race produces one winner, four `alreadyResolved` replies carrying
    state, and exactly one oxygen event; duplicate command IDs stay
    idempotent under contention.
- `npm run lint` — clean. `npm test` (tests + vinext production build) — clean.
- `npm run build:pages` — clean (the verified client bundle).
- Deterministic simulation smoke (400 matches, seed 20260725): 100%
  completion, 0 invalid/soft-lock states, median 60 casts, House 10.0%,
  2+ Thread links 83.5% — inside the accepted balance envelope.
- Live localhost playthrough (Socket authority :3001 + built Pages client):
  desktop 1440×900 and mobile 390×844. Scripted checks 10/10: Intent grid →
  lock → Cast → Bend → landing on both layouts; bend options never duplicate
  the natural result (natural 1 offered only [1, 2]); tray fully in-viewport
  with zero scroll during the five-second Bend window.

## Running it locally

```text
npm install
npm run dev            # table on :3000, Socket authority on :3001
```

Note for THIS mirror: the repo-root `index.html` + `pages-assets/` are
generated GitHub Pages artifacts. In dev they shadow `/`, and in this export
the hashed bundle they reference is stale — if the dev URL shows a blank
page, use the freshly built static client instead:

```text
NEXT_PUBLIC_GAME_SERVER_URL=http://localhost:3001 npx vite build --config vite.pages.config.ts
node scripts/publish-pages.mjs
npx vite preview --config vite.pages.config.ts --port 4175
# open http://localhost:4175/board/
```

## Not done here (deliberately)

- No GitHub push, Pages publish, or Sites deployment (owner instruction:
  localhost only; mirror is not the publication source).
- No Oxygen-frequency retuning, Vow retuning, Council/Witness tension work,
  destination-aware Intent previews, or BroadcastNarrator — those are P1 and
  need the telemetry + human tables the handoff describes.
- No Higgsfield generation; zero credits touched.
