import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the board exposes native roll, reachability, movement, and reaction states", async () => {
  const board = await read("../app/components/board.tsx");

  for (const contract of [
    "board-authority-beacon",
    "die-face",
    "phase-transition-cue",
    "is-reachable",
    "traveling-token",
    "data-event-tone",
    "data-static-state",
  ]) {
    assert.match(board, new RegExp(contract));
  }
});

test("the vertical slice makes current decisions and destinations explicit", async () => {
  const [client, commandRail, css] = await Promise.all([
    read("../app/game-client.tsx"),
    read("../app/components/command-rail.tsx"),
    read("../app/entity-v5.css"),
  ]);

  assert.match(client, /entry-ritual-preview/);
  assert.match(client, /data-presentation/);
  assert.match(commandRail, /intent-choice--\$\{intent\}/);
  assert.match(commandRail, /const INTENT_COPY/);
  assert.match(commandRail, /claim:[\s\S]*?shelter:[\s\S]*?bind:/);
  assert.match(commandRail, /bend-destinations/);
  assert.match(css, /\.board-panel \{\s*order: 0;/);
  assert.match(css, /\.command-rail \{\s*order: 1;/);
});

test("supplemental transmissions cannot obstruct ordinary or compact turns", async () => {
  const stage = await read("../app/components/transmission-stage.tsx");

  assert.match(stage, /const dramaticArrival =/);
  assert.match(stage, /event\?\.severity === "critical"/);
  assert.match(stage, /event\?\.severity === "major"/);
  assert.match(stage, /hasTransmission \? \(dramaticArrival \? "takeover" : "docked"\)/);
  assert.match(stage, /setCollapsedTransmission\(transmissionKey\)/);
  assert.match(stage, /\}, 1_800\);/);
});

test("responsive and broadcast layouts keep a reduced-motion path", async () => {
  const css = await read("../app/entity-v5.css");

  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.is-broadcast-mode \.action-dock[\s\S]*?display: none/);
  assert.match(
    css,
    /\.is-broadcast-mode \{[\s\S]*?width: 100%;[\s\S]*?max-width: 100%;/,
  );
});

test("adaptive audio reacts to the decisive v4 event families", async () => {
  const client = await read("../app/game-client.tsx");

  for (const cue of [
    'playTone("turn")',
    'playTone("roll")',
    'playTone("bend")',
    'playTone("oxygen")',
    'playTone("key")',
    'playTone("fracture")',
    'playTone("victory")',
  ]) {
    assert.match(client, new RegExp(cue.replace(/[()"]/g, "\\$&")));
  }
});

test("social metadata is wired into both render targets", async () => {
  const [layout, pages, publisher] = await Promise.all([
    read("../app/layout.tsx"),
    read("../github-pages/index.html"),
    read("../scripts/publish-pages.mjs"),
  ]);

  assert.match(layout, /og\.png/);
  assert.match(layout, /width: 1672/);
  assert.match(layout, /height: 941/);
  assert.match(pages, /\/board\/public\/og\.png/);
  assert.match(publisher, /"og\.png"/);
});
