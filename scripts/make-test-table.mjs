// Build a stand-in "temple table" GLB — a wide low plate with a raised
// block in the middle — so the model loader's walkway measurement can be
// exercised without waiting on real art.
//
//   node scripts/make-test-table.mjs public/table-model.glb
//
// The shape is deliberately the same class as the real sculpt: plate
// radius 1.0, centre mass radius 0.45. A correct measurement should put
// the road in the band between them.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const out = process.argv[2] || "public/table-model.glb";

const positions = [];
const indices = [];

/** A closed prism: top face, bottom face, and a wall between them. */
function drum(radius, bottom, top, segments) {
  const first = positions.length / 3;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    positions.push(x, top, z, x, bottom, z);
  }
  const topCentre = positions.length / 3;
  positions.push(0, top, 0);
  const bottomCentre = positions.length / 3;
  positions.push(0, bottom, 0);

  for (let i = 0; i < segments; i += 1) {
    const a = first + i * 2;
    const b = first + ((i + 1) % segments) * 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1); // wall
    indices.push(topCentre, b, a); // top cap
    indices.push(bottomCentre, a + 1, b + 1); // bottom cap
  }
}

drum(1.0, 0, 0.08, 24); // the plate
drum(0.45, 0.08, 0.42, 16); // whatever stands in the middle

const positionBytes = new Float32Array(positions);
const indexBytes = new Uint32Array(indices);
const pad4 = (n) => (4 - (n % 4)) % 4;

const positionLength = positionBytes.byteLength;
const indexOffset = positionLength + pad4(positionLength);
const binaryLength = indexOffset + indexBytes.byteLength;

const binary = Buffer.alloc(binaryLength + pad4(binaryLength));
Buffer.from(positionBytes.buffer).copy(binary, 0);
Buffer.from(indexBytes.buffer).copy(binary, indexOffset);

let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i += 3) {
  for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis], positions[i + axis]);
    max[axis] = Math.max(max[axis], positions[i + axis]);
  }
}

const json = {
  asset: { version: "2.0", generator: "obscur-test-table" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: "TableRoot", children: [1] },
    { name: "table_plate", mesh: 0 },
  ],
  meshes: [
    { name: "table", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] },
  ],
  materials: [
    {
      name: "stone",
      pbrMetallicRoughness: {
        baseColorFactor: [0.22, 0.2, 0.19, 1],
        metallicFactor: 0.15,
        roughnessFactor: 0.8,
      },
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: positions.length / 3,
      type: "VEC3",
      min,
      max,
    },
    { bufferView: 1, componentType: 5125, count: indices.length, type: "SCALAR" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positionLength, target: 34962 },
    {
      buffer: 0,
      byteOffset: indexOffset,
      byteLength: indexBytes.byteLength,
      target: 34963,
    },
  ],
  buffers: [{ byteLength: binary.length }],
};

// The spec says pad the JSON chunk with spaces, not NULs — a NUL-padded
// chunk trips strict parsers (including my own inspector, once).
const jsonText = JSON.stringify(json);
const jsonChunk = Buffer.from(
  jsonText + " ".repeat(pad4(Buffer.byteLength(jsonText))),
  "utf8",
);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // glTF
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binary.length, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4); // JSON

const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binary.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4); // BIN

await writeFile(
  resolve(process.cwd(), out),
  Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binary]),
);
console.log(`wrote ${out}`);
