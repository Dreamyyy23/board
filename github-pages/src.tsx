import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GameClient } from "../app/game-client";
import "../app/globals.css";
import "../app/entity-v5.css";
import "./static-shell.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The Sixfold Road could not find its root.");
}

createRoot(root).render(
  <StrictMode>
    <GameClient />
  </StrictMode>,
);
