// Re-download the full-resolution Higgsfield scene art (2752×1536 PNG) and
// optimize it into public/ as high-quality webp. The repo ships compact
// 960px versions of the same four images so the table works out of the box;
// run this once on a machine with open internet for the crisp originals:
//
//   node scripts/fetch-scene-art.mjs
//
// Generated 2026-07-26 with Nano Banana Pro (2K, 16:9) in the material
// language of docs/HIGGSFIELD-GENERATION-MANIFEST.json. Prompts are recorded
// in docs/P0-TRUST-REPORT-20260727.md's follow-up section.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3Gxhwg6WH7ccHQ7nSx92PZDsP6V";
const SCENES = [
  ["scene-fracture", "hf_20260726_225907_dc483e29-004c-4fbf-9503-14fb5a27ecd4"],
  ["scene-final-orbit", "hf_20260726_225916_4775ccba-d0b9-4f9e-b607-5833ab302772"],
  ["scene-victory", "hf_20260726_225925_50cbef57-da97-4a8c-93c3-42e6dbff49df"],
  ["scene-house-victory", "hf_20260726_225934_b2cf14b6-91ef-447c-9872-28a7775d14a3"],
  // v4.2 "Painted Table" kit — full-bleed entry keyart (16:9). The sprite
  // sheets (mask/omen/intent/medallion) ship pre-normalized in public/ and are
  // NOT refetched here: their cell alignment depends on the exact
  // content-aware crop recorded in docs/V42-PAINTED-TABLE-REPORT-20260727.md.
  ["entry-hero", "hf_20260727_032550_463a4446-63b5-4264-9d95-5133bbe24f94"],
];

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("sharp is unavailable — run `npm install` first.");
  process.exit(1);
}

for (const [name, file] of SCENES) {
  const url = `${CDN}/${file}.png`;
  process.stdout.write(`${name} … `);
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`FAILED (${response.status}) — the CDN copy may have expired.`);
    continue;
  }
  const source = Buffer.from(await response.arrayBuffer());
  const output = await sharp(source)
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
  const target = resolve(process.cwd(), "public", `${name}.webp`);
  await writeFile(target, output);
  console.log(`ok → public/${name}.webp (${Math.round(output.length / 1024)} KB)`);
}
console.log("Done. Rebuild pages (npm run build:pages) to publish the upgraded art.");
