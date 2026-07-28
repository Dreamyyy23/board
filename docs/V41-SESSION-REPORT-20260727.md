# v4.1 session report — informed choices, social priority, painted table

Date: 2026-07-27 (overnight session, localhost only)
Scope: the owner's directive — "make the project 10x more interesting; add
animations; use Higgsfield; add real board-game depth" — executed on top of
the same-night P0 trust fixes (see `P0-TRUST-REPORT-20260727.md`). Worked in
the site-export mirror on the owner's instruction; nothing was pushed to
GitHub, Pages, or the Sites authority. Sync to the canonical clone before
deploying, per the handoff's §3.2 workflow.

## New game mechanics (authority-owned, all tested)

1. **Destination-aware Intent previews** (`intentPreviewsV4` in
   `server/game-v4.mjs`, published inside the public turn):
   truthful class-level annotations per Intent, derived from the same
   modifier state `applyTurnModifiers` uses (sixth-wall doubles the CLAIM
   Static line; lights-remember dulls the SHELTER line), plus BIND dossiers
   with each target's Echoes/Resolve/Focus, thread strength toward the
   active traveler, and remaining qualification needs. The client renders
   forecasts on the Intent cards and writes the annotations over the six
   Road Ahead cards on hover/focus/lock (desktop) and as a class strip in
   the Decision Tray (mobile).

2. **BIND Oxygen priority** (`OXYGEN_PRIORITY_MS = 2000`): when the active
   traveler is bound and lands on harm, the bound traveler alone may Give
   Oxygen for the first two seconds. Enforced in `giveOxygen`, honored by
   bot settlement and by `scripts/simulate.mjs`. The reaction UI names the
   priority holder; the tray flags "YOUR bound claim".

3. **Bold Witness** (`submitPrediction {bold}`): swearing on a class that is
   a strict minority among the six visible destinations pays +1 Echo with
   the Focus when correct (no penalty otherwise; spectators excluded).
   Rewards stay inside the once-per-round gate. Witness buttons show class
   counts and minority markers; a toggle arms the bold call.

4. **Council projections** (`councilProjectionsV4`): each stone carries a
   projection computed at open time from live table state — e.g.
   `Static 7 → 4 · LIGHT rewards −1 Echo this round`, and Knot names the
   two travelers who would gain the Echo now.

5. **Complete mask/relic agency**: Moon and Foxfire Lens use a two-of-six
   roll picker (`roll-picker.tsx` — no more random reveals on the player's
   behalf); Veil picks the exact harm field to cut; Ember previews the +2
   flame path (space, kind, class, Static, Hearth crossing) in rail and
   tray; Thorn's edges are filtered to legal moves everywhere.

6. **Telemetry** (`telemetryV4`): oxygen windows / priority windows /
   rescues / summed response time, witness submissions / correct / bold
   correct — recorded by the authority and included in public state for
   the tuning work the handoff schedules after human tables.

7. **Authority-published phase budgets**: clients read
   `phaseBudgets` from state instead of hard-coding 61/5-second constants
   (handoff §18.2 direction).

## Onboarding, ending, broadcast

- **Quick Table**: the entry card leads with one primary CTA; the
  creator-channel terminal (presets + custom URL) moved into an
  `<details>` Advanced disclosure. Join-by-code unchanged.
- **Coaching** (`coach-hint.tsx`): one-line dismissible hints for intent,
  cast, bend, witness, reaction, oracle, and council — rendered beside the
  live control, persisted in `localStorage`, never modal, never pauses the
  authority clock.
- **Chronicle card** (`chronicle-card.tsx`): privacy-safe result overlay —
  outcome, winner mask, decisive turn, three highlight beats, per-player
  Echo/Thread/Vow summary, strongest Golden Thread, copy-result, rematch
  (host), and Return to Depth 847 / Return to Obscur links
  (psycheorsike.com routes per handoff §15.3).
- **BroadcastNarrator** (`broadcast-narrator.tsx`): derived only from
  public state — active mask/name, phase + seconds (urgent at ≤5s), locked
  Intent with BIND target, natural → final result, six-class counts,
  Static bar + Fractures + active traveler's remaining needs, latest
  consequence at 18px+ and the two prior captions. Verified at 1920×1080.

## Native animation pass (entity-v5.css, reduced-motion safe)

Keyed to authority presentation states so every motion explains a rule:
bone-cast turn (cast/bend), token ember wake (token-travel), Golden Thread
shimmer, Oxygen table pulse, Fracture shudder + brightened veins, Final
Orbit rotating ring (also during hard-final), rising victory embers,
House-victory desaturation, and a brief golden lift for vow completion and
key discovery. All animations are disabled under
`prefers-reduced-motion: reduce`; information never depends on motion.

## Higgsfield presentation art

Four 2K 16:9 backdrops were generated with Nano Banana Pro (8 credits
total; 335 → 327) in the continuity language of
`docs/HIGGSFIELD-GENERATION-MANIFEST.json` — materials, camera, restraint,
and prohibitions respected; centers left as dark negative space so the
LIVE board remains the subject:

- `public/scene-fracture.webp` — red-white interference fissures entering
  from the table edges (shown at 62% during Fracture).
- `public/scene-final-orbit.webp` — pale-gold rune orbit ring + cyan
  threshold light (42% throughout Final Orbit / hard-final; the ring halos
  the spiral board).
- `public/scene-victory.webp` — dawn-gold door light and a single ember
  trail (72% on traveler victory, with native rising embers above it).
- `public/scene-house-victory.webp` — cold vein lattice swallowing the
  table corners (78% on House victory).

The repo ships compact 960px versions (transferred with per-chunk MD5
verification; this sandbox cannot reach the CDN). For the crisp 2K
originals run **`node scripts/fetch-scene-art.mjs`** once on an open
network, then rebuild Pages. `scripts/publish-pages.mjs` rewrites the new
asset URLs for the `/board/` base. Native fallback: if the files are
absent the layer stays transparent and the table is unchanged.

## Verification

- `node --test tests/*.test.mjs` — **85/85** (77 → 85 with
  `tests/mechanics-v41.test.mjs`: previews + dossiers, priority window
  enforcement and expiry, bot deference to a human priority holder, bold
  witness pay and majority no-pay, Council projections, phase budgets,
  telemetry counters).
- `npm run lint`, `npm test` (with vinext production build), and the Pages
  build — all clean.
- Simulation smoke (400 matches, seed 20260725) with the priority
  mechanic: 100% completion, 0 invalid/soft-lock states, median 60 casts,
  House 9.8%, threads 9.84/match — inside the accepted envelope.
- Scripted live verification (12/12): Quick Table + disclosure; coach hint
  render/dismiss; hover-CLAIM annotating all six roads; Intent forecasts;
  BIND dossiers (desktop) and BIND chips (tray); full Intent → Cast → Bend
  turn on desktop and through the mobile tray with zero horizontal
  overflow; BroadcastNarrator at 1920×1080 with ≥18px critical type.
  Presentation art validated by forcing the four states and screenshotting.

## Still deliberately out of scope

Human playtests (the handoff's next design authority), Oxygen/Vow/Council
numeric retuning (now instrumented), CSS consolidation behind visual
regression, any deployment, and any additional Higgsfield spend beyond the
four approved-style backdrops.
