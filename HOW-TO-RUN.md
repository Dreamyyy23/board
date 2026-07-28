# Running Obscur — The Sixfold Road locally

## The two-command way (PowerShell, from this folder)

```powershell
npm install          # first time only — now also pulls three.js
npm run build:pages  # builds index.html + pages-assets (production authority)
npx vite preview --config vite.pages.config.ts --port 4175
```

> `npm install` is required again after this update: the 3D table depends
> on `three`. It ships as its own lazy-loaded chunk, so the entry screen is
> unaffected and the board falls back to the flat SVG road if WebGL is
> unavailable or the machine asks for reduced motion.

Open http://localhost:4175/board/ — type a name and press
**Quick Table — cross now**. You get a live four-mask table instantly
(you + three rival Echoes). The client talks to the hosted authority, so
nothing else needs to run.

## Fully local authority (offline play / engine hacking)

```powershell
node server/server.mjs      # terminal 1 — the 61-second authority on :3001
npm run build:pages:local   # terminal 2 — bundle pointed at your local server
npx vite preview --config vite.pages.config.ts --port 4175
```

> Use `build:pages:local` rather than setting `$env:NEXT_PUBLIC_GAME_SERVER_URL`
> by hand. That variable survives for the rest of the PowerShell session, so
> the next `npm run build:pages` in the same window publishes a bundle that
> points at your own machine — which looks fine to you and shows everyone
> else "The room authority is offline". `build:pages:local` sets it for one
> process, and a plain `build:pages` always targets production.

> `.env` is used by `npm run dev` only; published bundles ignore it on
> purpose. If a localhost authority does get published, the build prints a
> loud warning, and the bundle itself now recovers: served from anywhere
> that is not loopback, it falls back to the production authority and says
> so in the console.

## Swapping the table sculpt

The 3D stage loads `public/table-model.glb` if it is there and falls back
to the procedural dais if it isn't. Drop in a different `.glb`, rebuild,
and the loader measures it and lays the road on its walkway by itself.

```powershell
node scripts/optimize-model.mjs .\raw-table.glb public\table-model.glb
node scripts/inspect-model.mjs public\table-model.glb
npm run build:pages
```

See `docs/MODEL-PIPELINE.md` for generating a new one with the Tripo CLI.

## Checks

```powershell
npm test    # 86 authority tests
npx eslint app server scripts tests --max-warnings=0
```
