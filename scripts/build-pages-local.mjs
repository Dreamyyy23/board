// Build a Pages bundle that talks to a local authority.
//
//   npm run build:pages:local
//
// This exists because `VAR=value command` in an npm script does not work on
// Windows, and because the alternative — setting `$env:NEXT_PUBLIC_GAME_SERVER_URL`
// by hand — survives for the whole PowerShell session. Build again in that
// same window and you silently publish a bundle pointing at localhost, which
// nobody notices until someone else opens the site and the table never
// answers. Setting it here, for one process, cannot leak.
import { spawnSync } from "node:child_process";

const environment = {
  ...process.env,
  BOARD_LOCAL_AUTHORITY: "1",
  NEXT_PUBLIC_GAME_SERVER_URL:
    process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:3001",
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: environment,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("npx", ["vite", "build", "--config", "vite.pages.config.ts"]);
run("node", ["scripts/publish-pages.mjs"]);

console.log(
  `\nLocal bundle built against ${environment.NEXT_PUBLIC_GAME_SERVER_URL}.` +
    `\nRun \`npm run build:pages\` before publishing — that one always targets` +
    `\nthe production authority.\n`,
);
