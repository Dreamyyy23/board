# Putting a sculpted table on the board

The 3D stage will use `public/table-model.glb` if that file exists, and
fall back to the procedural dais if it doesn't. Nothing else needs
changing to swap the table — drop a new `.glb` in and rebuild.

## What the loader does on its own

When a model mounts, `app/components/table-3d.tsx` measures it rather than
assuming anything about its shape. It bins every vertex by distance from
the centre and records the highest point in each ring, which gives a
radial profile of the sculpt. The outer rings agree on a height — that's
the base plate. Scanning inward, the first ring that rises clear of the
plate is where the centrepiece begins. The band between the two is the
walkway, and the 36-space road is re-laid into it.

That's why a tall diorama works: the road ends up in the ring around the
temple instead of vanishing underneath it. The camera also reframes to the
model's real extents, so a tall sculpt isn't cropped.

Nothing here needs tuning by hand. If a particular model confuses the
measurement, `public/table-model.json` overrides any part of it:

```json
{
  "scale": 1.0,
  "offsetY": 0,
  "rotationY": 0,
  "roadY": -1.2,
  "roadOuter": 5.4,
  "roadInner": 3.6,
  "roadDrop": 0,
  "autoFitRoad": true,
  "hideDais": true,
  "hideMedallion": true
}
```

`roadOuter` / `roadInner` are the radius of space 0 and space 35.
`autoFitRoad: false` keeps the authored spiral and only swaps the table.

## Generating a new table with Tripo

Tripo's API is not reachable from Claude's sandbox, so this part runs on
your machine. Your API key never has to leave it.

```powershell
npm install -g @tripo3d/cli
tripo auth login          # prompts for the key, stores it locally
```

Then generate. `--face-limit` matters more than anything else here: ask
for a web-sized mesh up front and you skip most of the optimising.

```powershell
tripo generate text "A single ornate circular temple diorama on a black background, three-quarter view. A wide twelve-sided basalt base plate whose broad outer walkway is carved with a continuous spiral road of flat stepping stones inlaid with tarnished gold and thin glowing amber seams. Rising from the middle of the plate, occupying only the central half of its width, a compact stepped temple of black volcanic stone with arched doorways, narrow stairs and crenellations, no taller than half the plate's diameter. Six identical jackal-headed guardian statues evenly spaced around the temple, all facing outward. A single faceted amber crystal burning at the top, lighting the stone from within. Six shallow alcoves in the outer rim, each holding a carved stone funerary mask. Weathered brass banding and riveted iron. Perfectly radially symmetric, no front and no back." `
  --model-version v3.1-20260211 `
  --texture --pbr --texture-quality detailed `
  --face-limit 150000 `
  --output raw-table.glb
```

From a reference image instead:

```powershell
tripo generate image .\reference.png --texture --pbr --face-limit 150000 --output raw-table.glb
```

## Making it web-ready

Whatever comes back, run it through the optimiser before shipping it.
The fortress model went 53.56 MB / 1.84M triangles → 2.70 MB / 184k this
way, which is the difference between the board appearing instantly and a
phone hanging on it.

```powershell
node scripts/optimize-model.mjs .\raw-table.glb public\table-model.glb
node scripts/inspect-model.mjs public\table-model.glb
npm run build:pages
```

`inspect-model.mjs` reports size, triangle count, which compression
extensions the file needs, and whether its nodes are named — named nodes
are the ones gameplay could later be bound to directly.

Tune the trade-off with environment variables if the mesh comes out too
soft or still too heavy:

```powershell
$env:MODEL_RATIO = "0.2"      # keep 20% of triangles instead of 12%
$env:MODEL_TEXTURE_MAX = "1024"
```

## Checking it landed

```powershell
npm run build:pages
npx vite preview --config vite.pages.config.ts --port 4175
```

Open <http://localhost:4175/board/>, start a Quick Table, and watch the
network panel: `table-model.glb` should be a 200, and `draco_decoder.wasm`
should follow it if the model is Draco-compressed. If the model 404s the
board falls back to the procedural dais silently — by design, so a bad
file can never take the table down.
