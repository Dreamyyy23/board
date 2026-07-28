import { useState } from "react";
import type { Player, RoomState } from "../game-types";
import { MaskPortrait } from "./mask-portrait";

const OBSCUR_URL = "https://psycheorsike.com/obscur.html";
const DEPTH_URL = "https://psycheorsike.com/deep/depth-847.html";

function chronicleText(room: RoomState): string {
  const chronicle = room.chronicle;
  if (!chronicle) return "";
  const outcome =
    chronicle.outcome === "house"
      ? "THE HOUSE REMEMBERS — no traveler escaped."
      : `${chronicle.winnerMask} (${chronicle.winnerName}) escaped the Sixfold Road.`;
  const highlights = chronicle.highlights
    .slice(0, 3)
    .map((highlight, index) => `${index + 1}. ${highlight.summary || highlight.title}`)
    .join("\n");
  return `OBSCUR · THE SIXFOLD ROAD · room ${room.code}\n${outcome}\n${highlights}\nhttps://dreamyyy23.github.io/board/`;
}

/**
 * The privacy-safe result card: outcome, decisive beats, threads, and the
 * road back into the House. Contains only public Chronicle data — never
 * tokens, private votes, or unrevealed predictions.
 */
export function ChronicleCard({
  room,
  self,
  isHost,
  busy,
  onRematch,
}: {
  room: RoomState;
  self: Player | null;
  isHost: boolean;
  busy: boolean;
  onRematch: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const chronicle = room.chronicle;
  if (!chronicle || dismissed) return null;
  const house = chronicle.outcome === "house";
  const players = room.players.filter((player): player is Player =>
    Boolean(player),
  );
  const strongestThreadHolder = [...players].sort(
    (left, right) => (right.goldenThreads || 0) - (left.goldenThreads || 0),
  )[0];

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(chronicleText(room));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="chronicle-backdrop" role="presentation">
      <section
        aria-labelledby="chronicle-title"
        className={`chronicle-card${house ? " chronicle-card--house" : " chronicle-card--traveler"}`}
        role="dialog"
      >
        <button
          aria-label="Close the Chronicle"
          className="chronicle-card__close"
          onClick={() => setDismissed(true)}
          type="button"
        >
          ×
        </button>
        <span className="brand-kicker">
          {house ? "THE ROAD CLOSED" : "A CROSSING COMPLETE"}
        </span>
        <h2 id="chronicle-title">
          {house
            ? "The House remembers"
            : `${chronicle.winnerMask} escapes the Sixfold Road`}
        </h2>
        {chronicle.winnerSeat !== null && !house && (
          <div className="chronicle-card__winner">
            <MaskPortrait seat={chronicle.winnerSeat} />
            <div>
              <b>{chronicle.winnerName}</b>
              <small>
                wearing {chronicle.winnerMask} · seat{" "}
                {chronicle.winnerSeat + 1}
              </small>
            </div>
          </div>
        )}
        {chronicle.decisiveTurn && (
          <p className="chronicle-card__decisive">
            <small>
              DECISIVE · round {chronicle.decisiveTurn.round} · turn{" "}
              {chronicle.decisiveTurn.turnNumber}
            </small>
            {chronicle.decisiveTurn.summary || chronicle.decisiveTurn.title}
          </p>
        )}
        <ol className="chronicle-card__beats">
          {chronicle.highlights.slice(0, 3).map((highlight) => (
            <li key={highlight.id}>
              <b>{highlight.title}</b>
              {highlight.summary && <span>{highlight.summary}</span>}
            </li>
          ))}
        </ol>
        <div className="chronicle-card__table">
          {players.map((player) => (
            <span
              className={player.vow.complete ? "is-vowed" : ""}
              key={player.id}
            >
              <b>{player.sigil}</b>
              {player.echoes} Echoes · {player.goldenThreads || 0} Threads
              {player.vow.complete ? " · VOW KEPT" : ""}
            </span>
          ))}
        </div>
        {strongestThreadHolder && (strongestThreadHolder.goldenThreads || 0) > 0 && (
          <p className="chronicle-card__thread">
            Strongest Golden Thread ·{" "}
            <b>
              {strongestThreadHolder.sigil} {strongestThreadHolder.name}
            </b>{" "}
            with {strongestThreadHolder.goldenThreads} threads.
          </p>
        )}
        <div className="chronicle-card__actions">
          {isHost && (
            <button
              className="chronicle-card__rematch"
              disabled={busy}
              onClick={() => {
                setDismissed(true);
                onRematch();
              }}
              type="button"
            >
              <b>OPEN ANOTHER ROAD</b>
              <small>Same masks · fresh resources</small>
            </button>
          )}
          <button onClick={copyResult} type="button">
            {copied ? "Copied" : "Copy result"}
          </button>
          <a href={DEPTH_URL}>Return to Depth 847</a>
          <a href={OBSCUR_URL}>Return to Obscur</a>
        </div>
        {self && !isHost && (
          <small className="chronicle-card__wait">
            The table keeper can open another road — or carry your Chronicle
            back into the House.
          </small>
        )}
      </section>
    </div>
  );
}
