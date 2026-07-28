import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "pages-dist");
const generatedAssets = resolve(output, "pages-assets");
const publishedAssets = resolve(root, "pages-assets");
const publicSource = resolve(root, "public");
const previewPublic = resolve(output, "public");
const publicAssetNames = [
  "mask-sheet.webp",
  "og.png",
  "omen-sheet-v2.webp",
  "table-bg.webp",
  "scene-fracture.webp",
  "scene-final-orbit.webp",
  "scene-victory.webp",
  "scene-house-victory.webp",
  "mask-sheet-v2.webp",
  "omen-sheet-v3.webp",
  "intent-sheet.webp",
  "entry-hero.webp",
  "board-medallion.webp",
  "mask-sheet-v3.webp",
  "intent-sheet-v2.webp",
];

await rm(publishedAssets, { recursive: true, force: true });
await cp(generatedAssets, publishedAssets, { recursive: true });
await cp(resolve(output, "index.html"), resolve(root, "index.html"));

await rm(previewPublic, { recursive: true, force: true });
await mkdir(previewPublic, { recursive: true });
await cp(publicSource, previewPublic, { recursive: true });

for (const filename of await readdir(publishedAssets)) {
  if (!filename.endsWith(".css")) continue;
  const publishedPath = resolve(publishedAssets, filename);
  let css = await readFile(publishedPath, "utf8");
  for (const assetName of publicAssetNames) {
    const publishedUrl = `/board/public/${assetName}`;
    css = css
      .replaceAll(`/board/${assetName}`, publishedUrl)
      .replaceAll(`/${assetName}`, publishedUrl);
  }
  await writeFile(publishedPath, css);
  await writeFile(resolve(generatedAssets, filename), css);
}

await writeFile(resolve(root, ".nojekyll"), "");

console.log("GitHub Pages bundle published to index.html and pages-assets/.");
