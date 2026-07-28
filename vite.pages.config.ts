import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const PRODUCTION_AUTHORITY =
  "https://obscur-sixfold-road-v4.h-ar-d5-33-5-3.chatgpt.site/api/authority";

const isLoopback = (url: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)([:/]|$)/i.test(url);

export default defineConfig(() => {
  // The published Pages bundle must never inherit a developer's .env —
  // baking localhost:3001 into index.html killed the live table for
  // everyone. Only an EXPLICIT shell variable may override the production
  // authority.
  const requested =
    process.env.VITE_GAME_SERVER_URL ||
    process.env.NEXT_PUBLIC_GAME_SERVER_URL ||
    "";
  const gameServerUrl = requested || PRODUCTION_AUTHORITY;

  // A PowerShell session keeps `$env:` set until it is closed, and
  // HOW-TO-RUN tells you to set it for local play. Build in that same
  // window afterwards and a localhost authority is silently published,
  // which is invisible until someone else opens the site and the table
  // never answers. Say so, loudly, at the moment it happens.
  if (isLoopback(gameServerUrl)) {
    const local = process.env.BOARD_LOCAL_AUTHORITY === "1";
    const banner = local ? "note" : "WARNING";
    console.log(
      `\n[pages] ${banner}: this bundle points at ${gameServerUrl}.\n` +
        `[pages] Anyone opening it who is not running that server sees\n` +
        `[pages] "The room authority is offline".\n` +
        (local
          ? `[pages] BOARD_LOCAL_AUTHORITY=1 is set, so this is deliberate.\n`
          : `[pages] Use \`npm run build:pages:local\` for a local bundle, or\n` +
            `[pages] clear the variable before publishing:\n` +
            `[pages]   Remove-Item Env:NEXT_PUBLIC_GAME_SERVER_URL\n`),
    );
  }

  return {
    root: "github-pages",
    base: "/board/",
    publicDir: false,
    define: {
      "process.env.NEXT_PUBLIC_GAME_SERVER_URL": JSON.stringify(gameServerUrl),
      // Shipped alongside so a bundle that was built against a local
      // server can still recover itself when it is served from anywhere
      // else. See `resolveAuthority` in game-client.tsx.
      "process.env.NEXT_PUBLIC_FALLBACK_AUTHORITY":
        JSON.stringify(PRODUCTION_AUTHORITY),
    },
    plugins: [react()],
    build: {
      outDir: "../pages-dist",
      emptyOutDir: true,
      assetsDir: "pages-assets",
    },
  };
});
