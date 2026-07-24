import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const gameServerUrl =
    process.env.VITE_GAME_SERVER_URL ||
    process.env.NEXT_PUBLIC_GAME_SERVER_URL ||
    env.VITE_GAME_SERVER_URL ||
    env.NEXT_PUBLIC_GAME_SERVER_URL ||
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
