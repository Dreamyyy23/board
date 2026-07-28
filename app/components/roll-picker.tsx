import { useState } from "react";
import { KIND_NAMES } from "../game-data";
import type { RoomState } from "../game-types";

/**
 * Explicit two-of-six targeting for Moon's Hear What Comes Next and the
 * Foxfire Lens: the player CHOOSES which reachable destinations to reveal
 * instead of the authority selecting randomly on their behalf.
 */
export function RollPicker({
  room,
  busy,
  title,
  hint,
  compact = false,
  onConfirm,
  onCancel,
}: {
  room: RoomState;
  busy: boolean;
  title: string;
  hint: string;
  compact?: boolean;
  onConfirm: (results: number[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const reachable = room.turn?.reachable || [];
  const revealed = room.turn?.revealedEvents || {};

  function toggle(roll: number) {
    setSelected((current) =>
      current.includes(roll)
        ? current.filter((value) => value !== roll)
        : current.length >= 2
          ? [current[1], roll]
          : [...current, roll],
    );
  }

  return (
    <div className={`roll-picker${compact ? " roll-picker--compact" : ""}`}>
      <span className="roll-picker__title">
        {title} · choose exactly two roads
      </span>
      <div className="roll-picker__grid">
        {reachable.map((destination) => {
          const chosen = selected.includes(destination.roll);
          const alreadyRevealed = Boolean(revealed[destination.roll]);
          return (
            <button
              aria-pressed={chosen}
              className={`roll-picker__cell road-class--${destination.class}${
                chosen ? " is-chosen" : ""
              }${alreadyRevealed ? " is-revealed" : ""}`}
              disabled={busy || alreadyRevealed}
              key={destination.roll}
              onClick={() => toggle(destination.roll)}
              type="button"
            >
              <b>{destination.roll}</b>
              <small>
                {alreadyRevealed
                  ? "Known"
                  : KIND_NAMES[destination.kind] || destination.kind}
              </small>
            </button>
          );
        })}
      </div>
      <div className="roll-picker__actions">
        <button
          className="roll-picker__confirm"
          disabled={busy || selected.length !== 2}
          onClick={() => onConfirm([...selected].sort((a, b) => a - b))}
          type="button"
        >
          REVEAL {selected.length}/2
        </button>
        <button
          className="roll-picker__cancel"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Keep them hidden
        </button>
      </div>
      <small className="roll-picker__hint">{hint}</small>
    </div>
  );
}
