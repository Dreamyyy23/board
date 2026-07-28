// Report what is actually inside a .glb before we try to stage it.
//
//   node scripts/inspect-model.mjs public/table-model.glb
//
// Parses the GLB container and its JSON chunk directly — no three.js, no
// DOM, no dependencies — so it works on any machine and tells us the three
// things that decide how the model gets wired in: how heavy it is, which
// compression extensions it needs, and what its nodes are called (named
// nodes let the authority drive parts of the model directly).
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/inspect-model.mjs <file.glb|file.gltf>");
  process.exit(1);
}

const path = resolve(process.cwd(), target);
const bytes = await readFile(path);

function parseGlb(buffer) {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) {
    // Not a GLB container — assume a plain .gltf JSON document.
    return { json: JSON.parse(buffer.toString("utf8")), binaryBytes: 0 };
  }
  const total = view.getUint32(8, true);
  let offset = 12;
  let json = null;
  let binaryBytes = 0;
  while (offset < total) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      const raw = buffer.subarray(start, start + length).toString("utf8");
      json = JSON.parse(raw.replace(/[\s\0]+$/, ""));
    } else if (type === 0x004e4942) {
      binaryBytes = length;
    }
    offset = start + length + ((4 - (length % 4)) % 4);
  }
  return { json, binaryBytes };
}

const { json, binaryBytes } = parseGlb(bytes);
const mb = (value) => `${(value / 1024 / 1024).toFixed(2)} MB`;

console.log(`\nFILE      ${target}`);
console.log(`SIZE      ${mb(bytes.length)}  (binary chunk ${mb(binaryBytes)})`);
console.log(`GENERATOR ${json.asset?.generator || "unknown"}`);

const extensions = new Set([
  ...(json.extensionsUsed || []),
  ...(json.extensionsRequired || []),
]);
console.log(
  `EXTENSIONS ${extensions.size ? [...extensions].join(", ") : "none"}`,
);
const needsDraco = extensions.has("KHR_draco_mesh_compression");
const needsBasis = extensions.has("KHR_texture_basisu");
const needsMeshopt = extensions.has("EXT_meshopt_compression");

// --- triangles -----------------------------------------------------------
let triangles = 0;
let primitives = 0;
for (const mesh of json.meshes || []) {
  for (const primitive of mesh.primitives || []) {
    primitives += 1;
    const accessor =
      primitive.indices !== undefined
        ? json.accessors?.[primitive.indices]
        : json.accessors?.[primitive.attributes?.POSITION];
    if (accessor?.count) triangles += Math.floor(accessor.count / 3);
  }
}
console.log(
  `GEOMETRY  ${json.meshes?.length || 0} meshes · ${primitives} primitives · ~${triangles.toLocaleString()} triangles${
    needsDraco ? " (Draco-compressed — counts are pre-decode)" : ""
  }`,
);

// --- textures ------------------------------------------------------------
const images = json.images || [];
let imageBytes = 0;
for (const image of images) {
  const bufferView = json.bufferViews?.[image.bufferView];
  if (bufferView?.byteLength) imageBytes += bufferView.byteLength;
}
console.log(
  `TEXTURES  ${images.length} images (${mb(imageBytes)} embedded) · ${json.materials?.length || 0} materials`,
);

// --- animations ----------------------------------------------------------
if (json.animations?.length) {
  console.log(
    `ANIMATION ${json.animations.length}: ${json.animations
      .map((clip, index) => clip.name || `clip_${index}`)
      .join(", ")}`,
  );
}

// --- node tree -----------------------------------------------------------
console.log(`\nNODES (${json.nodes?.length || 0})`);
const nodes = json.nodes || [];
const childOf = new Set();
for (const node of nodes) for (const child of node.children || []) childOf.add(child);
const roots = nodes.map((_, index) => index).filter((index) => !childOf.has(index));

const MAX_LINES = 120;
let printed = 0;
const walk = (index, depth) => {
  if (printed >= MAX_LINES) return;
  const node = nodes[index];
  const kind =
    node.mesh !== undefined
      ? ` [mesh ${node.mesh}]`
      : node.camera !== undefined
        ? " [camera]"
        : "";
  console.log(`${"  ".repeat(depth)}${node.name || `node_${index}`}${kind}`);
  printed += 1;
  for (const child of node.children || []) walk(child, depth + 1);
};
for (const root of roots) walk(root, 0);
if (printed >= MAX_LINES) console.log(`  … (${nodes.length - printed} more)`);

// --- verdict -------------------------------------------------------------
console.log("\nVERDICT");
if (needsDraco) console.log("  · needs DRACOLoader (decoder ships in public/draco/)");
if (needsMeshopt) console.log("  · needs MeshoptDecoder (bundled with three)");
if (needsBasis) console.log("  · needs KTX2Loader + a basis transcoder — tell me and I will add it");
if (bytes.length > 25 * 1024 * 1024) {
  console.log(
    `  · ${mb(bytes.length)} is heavy for the web — I would compress geometry and downscale textures`,
  );
} else if (bytes.length > 8 * 1024 * 1024) {
  console.log(`  · ${mb(bytes.length)} is workable; worth compressing for mobile`);
} else {
  console.log(`  · ${mb(bytes.length)} is a comfortable web weight`);
}
const named = nodes.filter((node) => node.name).length;
console.log(
  `  · ${named}/${nodes.length} nodes are named${
    named > 1 ? " — I can bind gameplay to them by name" : " — I will place gameplay procedurally on top"
  }`,
);
console.log("");
