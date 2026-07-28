# Changelog

## The Table Takes the Controls (v5.3) — 2026-07-27

An audit of every interactive element, phase by phase, said it plainly:
sixteen controls on screen during a turn, and exactly one of them was on
the board. Every actual decision — intent, cast, bend, witness, the Oracle,
the Council vote — lived in a column to the right of the thing you were
looking at.

### Decisions moved onto the table

The Decision Tray already knew every legal move for the current phase; it
was only ever shown as a dock on phone layouts. It now sits on the board
at every width, at the foot of the table, and the rail's copies of those
controls are gone — not hidden behind an `aria-hidden`, but removed from
the layout, because two live copies of one decision means two tab stops
and a screen reader reading the game twice.

The rail keeps what it is good at: seats, chronicle, relics, the event.
The audit now reads nine controls on the board, and the ones still off it
are settings and reference, not moves.

### The table turns

Drag it, wheel or pinch to zoom, and it rides on top of the authored
camera rather than replacing it — so turning the board never costs you the
framing a Fracture or a Council is supposed to have. Because a drag
gesture is not a control everyone has, the same three moves are real
buttons on the board with labels, and they hide under reduced motion.

### A turn you can play without a mouse

When a decision opens, focus moves to its first choice — but only on the
transition into that decision, never on the re-render the clock causes
every second, and never if the player has deliberately tabbed elsewhere.
Straight after a cast every choice is briefly disabled while the command
is in flight, so the focus gate stays unclaimed and tries again the moment
they come alive rather than silently giving up.

Verified end to end: focus lands on CLAIM, Enter, focus lands on CAST THE
BONE, Enter, focus lands on the bend destination, Enter, committed. No
mouse, no tabbing.

### Sound that survives the game

The board made eight bare oscillator beeps, and it opened a brand-new
`AudioContext` for every one of them and never closed a single one.
Browsers allow around six. Sound died partway through every game.

`app/table-audio.ts` shares one context, resumes it when the tab wakes,
and unlocks it on the first gesture. The cues are synthesised — a bone
landing on stone, a socket taking light, static climbing the rim are
transients and resonant bodies, which is filtered noise, not a sample —
so the board carries no audio payload at all. There is a small built
reverb so it sounds like a room.

Any cue can be replaced: drop `public/audio/<cue>.webm` and it wins for
that cue alone. New cues fire on arrival, on turning the table, and on
the Static rising.

### Also

- The omen plaque stops landing on the authority beacon on a phone.
- A visible focus ring, at last.

## Weight and Glow (v5.2) — 2026-07-27

Three things were wrong with the temple table: the centre readout wandered
off it, the travellers looked like paper cutouts standing on it, and
nothing about the stone actually burned.

### The readout stops drifting

The camera moves through sixteen framings; the "cast the bone" button is a
DOM element pinned to the centre of the panel. Every time the shot changed
the two came apart.

The fix is not to chase the button around with projected coordinates —
that means fighting a transformed ancestor's coordinate space — but to
aim the camera at the sculpt's hearth. `lookAt` puts its target at the
centre of the view, which is exactly where the button already is. Per-shot
look offsets are damped rather than dropped, so the framings still breathe
without walking the readout off the table. `heartY` in
`table-model.json` moves the aim point for a different sculpt.

### Travellers have weight

What sold the old tokens as cutouts was that nothing they did touched the
table. Now each one drops a soft shadow onto the stone, spills a little of
its seat colour into the surface under it, and stands in a taller carved
plinth. In motion the mask lifts off the road and its shadow spreads and
thins beneath it, so a move reads as a move rather than a slide.

The slab of stone that used to sit behind each mask is gone — the painted
mask already carries its own carved frame, and a second rectangle behind it
was most of what made these read as cards.

### The amber burns

A bloom pass, so the hearth crystal, the gold inlay and the Static throw
light rather than merely being bright. The threshold is high on purpose:
only things meant to be burning bloom, or the table turns to fog. It is
fitted only after the frame-cost sampler has proved the machine can carry
it, and it is the first thing dropped when the machine cannot. `?glow=1`
forces it on and `?glow=0` suppresses it — without which there is no way
to see it on a machine with no GPU, which is the machine it gets tested on.

### Arrivals land

When a traveller reaches a space, the socket under them throws a ring
outward in their own colour and dies away. Six are pooled and reused.

### Also

- The omen plaque no longer lands on top of the authority beacon on a
  phone: below 760px the stack moves to the foot of the board and the
  crossing counters, which already have their own section further down the
  page, drop out of the floating copy.

## The Temple (v5.1) — 2026-07-27

The table is a sculpted Anubis temple now, not a lacquered disc. The road
runs around its base plate, past the carved faces set into the stone, and
the Hearth is the amber crystal burning at its heart.

### The sculpt

- `public/table-model.glb` — a 53.56 MB, 1.84-million-triangle generated
  diorama, cut to **1.40 MB and 221k triangles** without a visible loss:
  geometry simplified to 12%, textures re-encoded to WebP and capped at
  2048px, vertex data Draco-compressed.
- `scripts/optimize-model.mjs` runs that pipeline on any `.glb`, so the
  next table doesn't need the steps rediscovered.
- `scripts/inspect-model.mjs` reports weight, triangle count, required
  compression extensions and whether nodes are named, without depending on
  three.js or a browser.

### The stage fits itself to whatever it is given

The interesting problem with a sculpted table is that the artist decides
where the road can physically go. A temple in the middle leaves only an
outer walkway, and the authored spiral — which runs from the rim inward to
45% — would spend its last third inside solid stone.

So the loader measures instead of assuming. It bins every vertex by
distance from the axis and records the highest point in each ring, giving
a radial profile of the sculpt. The outermost rings agree on a height:
that's the base plate. Scanning inward, the first ring that rises clear of
the plate is where the centrepiece begins. The band between them is the
walkway, and the 36-space road is re-laid into it.

- The camera reframes to the model's real extents, so a tall diorama is
  not cropped by a shot solved for a flat 6.5-unit dais.
- Lighting lifts when a sculpt mounts — dark carved stone eats the
  candlelight the pale dais was lit for.
- The painted medallion hides itself when the sculpt has its own centre.
- `public/table-model.json` overrides any part of the measurement
  (`roadOuter`, `roadInner`, `roadY`, `roadDrop`, `autoFitRoad`) for a
  model that confuses it.
- No model, or a broken one: the procedural dais stands as before. The
  mount is fire-and-forget and can never take the table down.

### Notes

- `docs/MODEL-PIPELINE.md` documents generating a replacement table with
  the Tripo CLI and running it through the optimiser. Tripo's API is not
  reachable from the sandbox this was built in, so that step runs locally
  and the API key never has to be shared.
- `scripts/make-test-table.mjs` writes a stand-in plate-and-tower GLB,
  which is how the walkway measurement was verified in a browser before
  the real sculpt existed.
- 86/86 authority tests still pass; the road change is presentation only.

## The Carved Table (v5.0) — 2026-07-27

The Sixfold Road is now rendered in WebGL. The flat SVG spiral becomes a
physical object: a lacquered dais with 36 carved sockets descending in a
spiral toward a brass medallion, standing mask tokens, Golden Threads
strung in the air between bound travellers, Static bleeding into the rim,
and candlelight that actually falls on the wood.

### The stage

- `app/components/table-3d.tsx` — a three.js scene driven entirely by
  public room state. It is presentation only: the authority still owns
  every outcome, and the scene never sends a command.
- The spiral uses the same geometry the flat board draws, lifted into
  world space and given a gentle descent, so the 3D road and the printed
  road are the same road.
- Mask tokens are standees cut from `mask-sheet-v3.webp` by UV offset, so
  every traveller wears the painted mask that is already on their card.
  They glide along the spiral when the authority moves them and fan apart
  when they share a space.
- BIND draws a real Golden Thread: a glowing catenary between the two
  bound travellers that shimmers while the bond holds.
- Static fills the rim vein by vein as the signal climbs; a Fracture
  shakes the camera and washes the table red.
- Sixteen camera framings keyed to the authority's presentation states —
  the shot pushes in for the cast, follows token travel, pulls up for the
  Council, and drops low when the House takes the table.

### Made to survive contact with real machines

- three.js is a dynamic import in its own chunk (679 KB): the entry screen
  never pays for it, and it only loads once a board mounts.
- Adaptive quality samples two seconds of real frame cost and sheds load
  in two steps (resolution, then embers and dynamic lights) rather than
  handing a weak GPU a slideshow.
- Three dynamic lights, not nine: four candles are painted, two are lit,
  and a single lamp rides with whoever holds the authority.
- No WebGL, or `prefers-reduced-motion`, and the layer removes itself —
  the flat SVG board underneath is still fully playable.

### The entry screen

Rebuilt after reading the actual render at 2508px, where it fell apart.

- The wordmark was outgrowing its column and sliding under the entry card.
  It now scales from the column, capped, and never collides.
- The composition is capped at 1720px and centred, while the artwork,
  scrim and grain became viewport-fixed — previously capping the layout
  also capped the hero, leaving raw film grain in the margins.
- That film grain was running at opacity 0.5 on `overlay` (a v4.2
  regression); at 0.07 on `soft-light` the gold reads as gold again.
- The waiting masks sat in an absolutely positioned strip that the scroll
  container clipped; they now sit in the flow.

### The board centre

The heart no longer prints a second `OBSCUR` wordmark over the play
surface — the wordmark is in the header. It reports live state instead:
whose road it is, the bend window, the oxygen window, the Council, the
Fracture, and what the road answered.

### Fixes

- `has-3d` restyling of the heart replaced the base
  `translate(-50%, -50%)`, sliding the whole readout 116px off the
  medallion. Any transform on a centred element has to restate its
  centring.

## The Playability Pass (v4.3) — 2026-07-27

Found by sitting down and playing the table like a stranger. Every fix
below answers a real observed failure, not a hypothetical one.

### The table is reachable again

- **Published bundles no longer inherit `.env`.** The dev value
  `NEXT_PUBLIC_GAME_SERVER_URL=http://localhost:3001` was being baked into
  `index.html`, so the shipped site dialed the visitor's own localhost and
  the entry screen could never connect. Pages builds now default to the
  production authority; only an explicit shell variable overrides it.
- **Quick Table starts a real game in one click.** `start_game` accepts
  `quickFill`: the authority seats bots up to a four-mask table and starts
  immediately — no lobby stop, no manual bot seating. "Host a lobby
  instead" (under Advanced) keeps the shareable-code flow for friends.
- `HOW-TO-RUN.md` documents both local modes in two PowerShell blocks.

### Time to think

- Bend window 5s → **12s**, reaction 5s → **8s**. Five seconds was not
  enough to read a fresh natural cast against three destinations.
- **Bot tempo**: bots hold their cast ~6s and their bend ~2.5s instead of
  acting instantly. Witnesses finally get a real betting window in solo
  play — before this, a bot turn resolved in ~2s and the entire
  prediction economy was invisible.

### The rail reads in decision order

- The rail is now clock → **the one thing to do now** → context. During
  another traveler's turn the Witness bet leads with three large
  class-colored buttons (counts, minority marker, BOLD toggle).
- The Bend window shows one primary ACCEPT card (destination + class) with
  compact ±1 edges beneath; the coach, gift row, pulse toggle, omen-law
  and mask-power prose all stand down during the timed decision.
- "Your crossing" and "Current Omen" merged into one right-hand stack —
  they previously overlapped at independent absolute offsets, clipping the
  tallies. The omen plaque's talisman/text grid no longer overflows.
- Unoccupied masks collapse to slim, dimmed rows.

### Icons finally sit right

- `mask-sheet-v3.webp` / `intent-sheet-v2.webp`: re-normalized with tight
  content crops (fixed 14–17% inset into each painting's own plaque, then
  scaled to ~97% of the cell). Portraits fill their frames instead of
  floating at ~55% inside double borders; the CLAIM spearhead, SHELTER
  stone and BIND thread are readable at 46px instead of reading as black
  squares. All portrait boxes now carry the sheet's exact cell
  aspect-ratio, and the redundant inner border is gone.

### Tests

- 86/86 (new: quick-fill seats and starts in one idempotent command;
  timing tests updated to the new tempo).

## The Painted Table (v4.2) — 2026-07-27

Higgsfield imagery is no longer reserved for rare beats — it is the table's
skin, visible from the first second of every session.

### Art (all generated with Nano Banana Pro, normalized to exact sprite grids)

- `entry-hero.webp` — cinematic keyart of the ritual table (candles, spiral
  track, six mask tokens, golden threads, red static) behind the entry
  screen, with a slow Ken Burns drift.
- `mask-sheet-v2.webp` — six painted relic-mask portraits (Ember flame-red,
  Veil shrouded ivory, Thorn spiked iron, Moon silver crescent, Moss leafed
  green, Ash ember-cracked grey) on wood-panel plaques; content-aware
  normalized into the exact 3×2 CSS grid; used in the roster, the entry
  orbit, mask cards, and the turn banner.
- `omen-sheet-v3.webp` — six engraved blackened-brass omen talismans
  (flame / mirror / door / moth / thread / static) as a 3×2 sprite; the
  active talisman now hangs in the rail's omen-law plaque and the board's
  omen plaque.
- `intent-sheet.webp` — CLAIM (gilded spearhead), SHELTER (glowing hearth
  stone), BIND (thread joining two rings) triptych; painted emblems on every
  Intent control in rail and tray.
- `board-medallion.webp` — top-down blackened-brass spiral dais with
  ember-lit grooves and bone-ivory bowl behind the heart dial.
- All five ship pre-optimized (≤35 KB each, ~97 KB total);
  `scripts/fetch-scene-art.mjs` can refetch the hero at 1920px.

### Cinema

- Turn banner stinger: the incoming mask's painted portrait sweeps across
  the table for 1.9s whenever authority changes hands (skips reconnects and
  reduced-motion).
- Fracture stinger: a 2.4s full-bleed takeover — scene art, crawling static
  veins, FRACTURE N/3, and the newly installed law — inside the authority's
  own 2.5s Fracture phase.
- Bone-rattle cast, destination burst, staggered road-reveal, phase-colored
  board lighting, entry-screen ember drift and title shimmer, button
  micro-interactions; every motion has a reduced-motion fallback.

### Fixes

- Intent cards give the painted emblem a true 46px column (no more text
  under the artwork).

## Informed choices, social priority, and the painted table (v4.1) — 2026-07-27

### Gameplay

- Destination-aware Intent previews: the authority now publishes truthful
  class-level annotations for CLAIM/SHELTER/BIND (fracture-law aware) plus
  full BIND target dossiers (Echoes, Resolve, qualification needs, existing
  Thread strength). Hovering or locking an Intent writes its consequences
  over the six Road Ahead cards.
- BIND is now a real promise: the bound traveler holds an authority-enforced
  exclusive first claim on Give Oxygen for two seconds of every reaction
  window. Bots and the simulator honor the window.
- Bold Witness calls: a Witness may swear on a minority destination class;
  a correct bold call pays +1 Echo on top of the Focus. Class counts and
  minority markers are visible on every Witness control.
- Council stones show state-aware projections ("Static 7 → 4 · LIGHT −1
  Echo this round") before the secret vote.
- Full mask/relic agency: Moon and the Foxfire Lens choose exactly two roads
  to reveal through a picker; Veil chooses the exact harm to cut; Ember's
  Carry the Flame previews destination, class, Static, and Hearth crossing;
  Thorn offers only legal edges.
- Oxygen/Witness telemetry (windows, priority windows, rescues, response
  times, bold accuracy) is recorded and published for future tuning.

### Interface

- Quick Table entry: one primary CTA with the creator-channel terminal moved
  into an Advanced disclosure.
- Contextual first-turn coaching beside the live control (dismissible,
  never modal, never pauses the clock).
- End-of-match Chronicle card: outcome, decisive turn, three beats, table
  summary, strongest Thread, copyable result, rematch, and Return to
  Depth 847 / Obscur links.
- BroadcastNarrator strip for broadcast mode: active mask, phase clock,
  locked Intent + BIND target, natural → final cast, class counts, Static
  pressure, qualification needs, and the last three captions at ≥18px.
- Native animation pass keyed to authority presentation states: bone-cast
  turn, token ember wake, Golden Thread shimmer, Oxygen pulse, Fracture
  shudder, Final Orbit ring, victory embers, House-victory desaturation —
  all reduced-motion safe.
- Painted presentation art (generated with Higgsfield in the manifest's
  material language, ~8 credits) for Fracture, Final Orbit, traveler
  victory, and House victory as low-opacity backdrops behind live state.
  Compact versions ship in `public/`; run `node scripts/fetch-scene-art.mjs`
  on an open network for the 2K originals. The table remains complete when
  the images are absent.
- Phase timing is read from the authority's published `phaseBudgets`
  instead of client constants.

### Verification

- New `tests/mechanics-v41.test.mjs` (previews, dossiers, priority windows,
  bot deference, bold Witness both ways, Council projections, phase
  budgets). Suite: 85/85 with lint, production build, and Pages build.
- 400-match simulation smoke with the priority mechanic: 100% completion,
  0 soft locks, balance inside the accepted envelope.
- Scripted browser verification: 12/12 checks across desktop 1440×900,
  mobile 390×844, and broadcast 1920×1080.

## Core game trust (P0) — 2026-07-27

### Authority correctness

- Rejected paid no-op Bends: natural 1 can no longer spend Focus on −1 and
  natural 6 can no longer spend Focus on +1. Invalid Bends are refused before
  any Focus, DOOR free-Bend, or statistics mutation.
- Rejected Thorn Crooked Road edge no-ops so the single mask charge is never
  consumed without movement. Bot bend policy (authority and simulator) now
  prefers the natural result over an edge-clamped duplicate.
- Made the first accepted Intent immutable for the turn. A different second
  Intent is rejected without mutating state, identical retries stay
  idempotent, and an Oracle `must-shelter` oath can no longer be consumed by
  selecting SHELTER and then replaced with CLAIM or BIND.
- Added server-side retry for D1 optimistic-concurrency conflicts using the
  same command ID against freshly loaded state. Simultaneous Witness
  submissions, Council votes, and Oxygen attempts each record exactly once;
  losing Oxygen helpers receive a calm `alreadyResolved` reply carrying the
  current state instead of a generic HTTP 400.

### Interface

- The command rail now collapses to a locked-Intent summary (including the
  BIND target) plus one prominent Cast action after the Intent locks, and
  never presents a paid Bend whose destination equals the natural result.
- Relic legality is computed per relic and phase: Mirror Shard appears above
  the fold during its owner's reaction window with a one-press
  prevent-up-to-2 action, while Quiet Bell and Foxfire Lens keep their
  Intent-phase timing.
- Added a state-derived sticky Decision Tray on compact layouts (≤900px):
  Intent → Cast, five-second Bend and Oxygen windows, mask powers, Oracle
  answers, and Council stones stay on-screen with the authority timer,
  44px+ touch targets, and reduced-motion support.

### Verification

- Added `tests/p0-trust.test.mjs` (edge Bends, DOOR interaction, Thorn edges,
  bot settlement at both die extremes, Intent immutability, oath locking, and
  relic phase timing) and `tests/http-contention.test.mjs` (six-way Witness,
  Council, Oxygen, and duplicate-command races against a compare-and-swap
  fake D1). Suite: 77/77 tests passing with lint and production build.

## Rules v4 — 2026-07-25

### Gameplay

- Rebuilt the match around explicit Read, Intent, Witness, Cast, Bend, Resolve,
  Reaction, Oracle, Council, Fracture, and Final Orbit authority phases.
- Added three public Intents, private Witness predictions, Give Oxygen,
  Golden Threads, Omens, visible Fracture laws, and structured Chronicles.
- Added tuned passives, charged active powers, and completable Vows for all six
  masks.
- Added deterministic timeout settlement, bot decisions, reconnect handling,
  spectators, command idempotency, and a guaranteed hard ending.
- Preserved rules-v1 rooms through a compatibility adapter.

### Presentation

- Replaced dashboard-style feedback with a physical die, reachable road
  states, stable traveling tokens, phase deformation, Static veins, Golden
  Threads, and adaptive event audio.
- Added compact broadcast mode, responsive layouts, reduced-motion behavior,
  clearer active authority, and urgent decision timing.
- Added a visual bible, a staged Higgsfield generation manifest, and the new
  refreshed social metadata.

### Verification

- Added rules-v4, timeout, bot, reconnect, spectator, six-Vow, compatibility,
  and visual-contract tests.
- Added deterministic legacy and v4 simulators. The baseline reproduced 0.51%
  completion before its safety cap; the accepted v4 run reached 100%
  completion with zero invalid or soft-lock states.
- Documented the accepted balance envelope in `docs/BALANCE-REPORT.md`.
