import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(() => {
  // The published Pages bundle must never inherit a developer's .env —
  // baking localhost:3001 into index.html killed the live table for
  // everyone. Only an EXPLICIT shell variable (used for local preview
  // builds) may override the production authority.
  const gameServerUrl =
    process.env.VITE_GAME_SERVER_URL ||
    process.env.NEXT_PUBLIC_GAME_SERVER_URL ||
    "https://obscur-sixfold-road-v4.h-ar-d5-33-5-3.chatgpt.site/api/authority";

  return {
    root: "github-pages",
    base: "/board/",
    publicDir: false,
    define: {
      "process.env.NEXT_PUBLIC_GAME_SERVER_URL": JSON.stringify(gameServerUrl),
    },
    plugins: [react()],
    build: {
      outDir: "../pages-dist",
      emptyOutDir: true,
      assetsDir: "pages-assets",
    },
  };
});
