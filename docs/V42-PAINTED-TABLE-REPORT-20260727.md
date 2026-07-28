# V4.2 · The Painted Table — session report (2026-07-27)

Goal (owner's direction): "use the higgsfield images… take hours on the
ui/ux… make it a fully fledged game with animations and interesting
images." This wave makes the generated art the table's default skin —
visible from the first frame — and gives every authority beat a cinematic
moment.

## Generated art (Higgsfield · Nano Banana Pro, 2K)

| Asset | Source generation | Normalization | Shipped |
| --- | --- | --- | --- |
| `entry-hero.webp` | hf_20260727_032550_463a4446 (2752×1536) | Lanczos → 1152×643, WEBP q40 | 19.4 KB |
| `mask-sheet-v2.webp` | hf_20260727_032606_12f10999 (3×2 grid) | exact-cell crop → blur-threshold bbox → content scaled to 86% of 300×326 cells | 19.4 KB |
| `omen-sheet-v3.webp` | hf_20260727_032616_fd7a0cd3 (3×2 grid) | same, 90% of 240×240 cells | 20.0 KB |
| `intent-sheet.webp` | hf_20260727_032628_9694aafd (3×1 triptych) | same, 84% of 300×300 cells | 3.3 KB |
| `board-medallion.webp` | hf_20260727_032638_38123788 (2048²) | circle bbox square-crop +24px margin → 620² q52 | 34.7 KB |

Sprite order verified visually against the CSS contract:
masks = Ember/Veil/Thorn over Moon/Moss/Ash (seat order);
omens = flame/mirror/door over moth/thread/static;
intents = claim/shelter/bind.

Every file was moved over a checksum relay (12 KB base64 chunks, per-chunk
MD5, whole-file MD5, PIL decode check) — all five decode as valid WEBP at
the expected dimensions.

## Where the paint landed

- Entry: full-bleed hero keyart with a 46s Ken Burns drift, ember motes,
  painted mask orbit, title shimmer.
- Roster, mask cards, entry orbit, turn banner: painted portraits
  (`.mask-portrait` layers v2 over the legacy sheet as fallback).
- Rail omen-law + board omen plaque: engraved talisman of the active omen.
- Intent controls (rail + tray): painted CLAIM/SHELTER/BIND emblems.
- Heart dial: brass spiral medallion under the countdown.
- Fracture: full-screen stinger with scene art + static veins + the
  installed law; Turn change: portrait sweep banner.

## Verification

- `node --test`: **85/85 pass** (includes visual-contract source checks).
- `eslint app server scripts tests --max-warnings=0`: clean.
- Playwright (chromium 1194, 1440×900 + 390×844) against the production
  pages bundle on :4175 with the live authority on :3001 — 8/8 checks:
  entry hero wired; opening-turn banner fires; portraits painted from v2
  sheet; omen sigils painted with distinct grid cells (door ≠ static);
  intent emblems painted; medallion painted; fracture stinger art;
  mobile tray reachable. Screenshots 23–29 in the delivery.
- Fixed during verification: intent-card emblem column widened to 46px
  (text was sliding under the artwork).

## Publishing

- `scripts/publish-pages.mjs` now rewrites the five new asset URLs to
  `/board/public/…` for GitHub Pages.
- `scripts/fetch-scene-art.mjs` gained the entry-hero source URL (sprite
  sheets intentionally excluded — their alignment depends on the recorded
  normalization, not a plain resize).
- Root `index.html` + `pages-assets/` rebuilt from this wave.

## Constraints honored

61s authority untouched; server-authoritative outcomes untouched; no new
CSS override sheet (append to `entity-v5.css`); ritual visual identity
extended, not replaced; reduced-motion respected everywhere; no deploys.
