import { rmSync } from "node:fs";
import { join } from "node:path";

// Vinext copies public assets into both sides of the build. The client copy is
// served through the platform's static-assets binding; retaining a second copy
// in the Worker bundle wastes more than 10 MiB and can exceed upload limits.
const duplicatedPublicAssets = [
  "mask-sheet.png",
  "og.png",
  "omen-sheet-v2.png",
  "table-bg.png",
];

for (const filename of duplicatedPublicAssets) {
  rmSync(join("dist", "server", filename), { force: true });
}
