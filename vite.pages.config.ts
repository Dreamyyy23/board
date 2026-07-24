import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const gameServerUrl =
  process.env.VITE_GAME_SERVER_URL || "http://localhost:3001";

export default defineConfig({
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
});
