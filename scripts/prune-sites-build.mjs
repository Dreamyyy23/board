import { rmSync } from "node:fs";
import { join } from "node:path";

// Vinext copies public assets into both sides of the build. The client copy is
// served through the platform's static-assets binding; retaining a second copy
// in the Worker bundle wastes more than 10 MiB and can exceed upload limits.
const duplicatedPublicAssets = [
  "mask-sheet.webp",
  "og.png",
  "omen-sheet-v2.webp",
  "table-bg.webp",
];

for (const filename of duplicatedPublicAssets) {
  rmSync(join("dist", "server", filename), { force: true });
}

// The editable PNG masters stay in source control, but the runtime uses their
// much smaller WebP derivatives. Vinext copies the whole public directory, so
// remove unused masters from the deployable client bundle.
for (const filename of [
  "mask-sheet.png",
  "omen-sheet-v2.png",
  "table-bg.png",
]) {
  rmSync(join("dist", "client", filename), { force: true });
  rmSync(join("dist", "server", filename), { force: true });
}
