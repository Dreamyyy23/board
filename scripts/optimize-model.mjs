// Turn a raw generated .glb into something a browser can actually load.
//
//   node scripts/optimize-model.mjs <input.glb> [output.glb]
//
// Generators like Tripo happily hand back 50 MB and two million triangles.
// At the size this model is drawn — a table filling maybe a thousand
// pixels — that is between ten and twenty times more geometry than can
// ever be seen, and it is the difference between the board appearing at
// once and the tab hanging for half a minute on a phone.
//
// Three passes, in this order:
//   1. simplify  — collapse the mesh to ~12% of its triangles
//   2. webp      — re-encode textures (PNG atlases are enormous)
//   3. draco     — compress the vertex data
//
// Draco needs its decoder served from public/draco/, which is already in
// this repo, and `table-3d.tsx` already points DRACOLoader at it.
//
// Requires `npx @gltf-transform/cli` (fetched on first run).
import { execFileSync } from "node:child_process";
import { statSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("usage: node scripts/optimize-model.mjs <input.glb> [output.glb]");
  process.exit(1);
}
const output = process.argv[3] || "public/table-model.glb";

const RATIO = Number(process.env.MODEL_RATIO || 0.12);
const ERROR = Number(process.env.MODEL_ERROR || 0.004);
const TEXTURE_MAX = Number(process.env.MODEL_TEXTURE_MAX || 2048);

const mb = (path) => `${(statSync(path).size / 1024 / 1024).toFixed(2)} MB`;
const scratch = (name) => join(dirname(resolve(output)), `.opt-${name}.glb`);

const run = (args) => {
  execFileSync("npx", ["--yes", "@gltf-transform/cli", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });
};

const simplified = scratch("simplified");
const textured = scratch("textured");
const resized = scratch("resized");

try {
  console.log(`\ninput      ${input}  ${mb(input)}`);

  console.log("\n[1/3] simplify");
  run(["simplify", input, simplified, "--ratio", String(RATIO), "--error", String(ERROR)]);

  console.log("\n[2/3] textures");
  try {
    run(["webp", simplified, textured, "--slots", "*", "--quality", "84"]);
    run([
      "resize",
      textured,
      resized,
      "--width",
      String(TEXTURE_MAX),
      "--height",
      String(TEXTURE_MAX),
    ]);
  } catch {
    // A model with no textures, or an encoder that refuses one: carry the
    // geometry win rather than failing the whole run.
    console.log("      (skipped — no textures to re-encode)");
  }

  const beforeDraco = existsSync(resized)
    ? resized
    : existsSync(textured)
      ? textured
      : simplified;

  console.log("\n[3/3] draco");
  run(["draco", beforeDraco, output]);

  console.log(`\noutput     ${output}  ${mb(output)}`);
  console.log("\nNow inspect it:  node scripts/inspect-model.mjs " + output);
} finally {
  for (const path of [simplified, textured, resized]) {
    if (existsSync(path)) rmSync(path);
  }
}
