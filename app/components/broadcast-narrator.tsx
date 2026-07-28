import type { Player, RoomState, SpaceClass } from "../game-types";

const CLASS_ORDER: SpaceClass[] = ["light", "threshold", "teeth"];

/**
 * Read-only narration derived ONLY from public room state, sized for
 * 1920×1080 and 1280×720 capture. A stranger should read: who is acting,
 * what decision is open, how long remains, how much danger the table holds,
 * and what just happened — within three seconds.
 */
export function BroadcastNarrator({ room }: { room: RoomState }) {
  const active: Player | null =
    room.currentSeat === null ? null : room.players[room.currentSeat];
  const phase = room.phase || room.status;
  const seconds = room.secondsLeft;
  const turn = room.turn;
  const natural = turn?.naturalRoll ?? null;
  const final = turn?.finalRoll ?? null;
  const bindTarget =
    turn?.bindTargetSeat === null || turn?.bindTargetSeat === undefined
      ? null
      : room.players[turn.bindTargetSeat];
  const classCounts = CLASS_ORDER.map((kind) => ({
    kind,
    count: (turn?.reachable || []).filter(
      (destination) => destination.class === kind,
    ).length,
  }));
  const needs = active
    ? {
        echoes: Math.max(0, room.objective.echoes - active.echoes),
        keys: Math.max(0, room.objective.keys - active.keys),
        laps: Math.max(0, room.objective.laps - active.laps),
      }
    : null;
  const captions = (room.recentEvents || []).slice(-3);
  const latest = captions.at(-1);

  return (
    <section aria-label="Match narration" className="broadcast-narrator">
      <div className="broadcast-narrator__active">
        <small>ACTIVE</small>
        <b>{active ? `${active.sigil} · ${active.name}` : "THE HOUSE"}</b>
        <span>
          {String(phase).replace("-", " ").toUpperCase()}
          {turn?.intent
            ? ` · ${turn.intent.toUpperCase()}${bindTarget ? ` → ${bindTarget.sigil}` : ""}`
            : ""}
        </span>
      </div>
      <div className="broadcast-narrator__clock" data-urgent={Boolean(seconds !== null && seconds <= 5)}>
        <b>{room.status === "playing" ? (seconds ?? "—") : "—"}</b>
        <small>SEC</small>
      </div>
      <div className="broadcast-narrator__cast">
        <small>CAST</small>
        <b>
          {natural === null
            ? "—"
            : final !== null && final !== natural
              ? `${natural} → ${final}`
              : `${natural}`}
        </b>
        <span>
          {classCounts.map(({ kind, count }) => (
            <i className={`road-class--${kind}`} key={kind}>
              {kind.slice(0, 1).toUpperCase()}
              {count}
            </i>
          ))}
        </span>
      </div>
      <div className="broadcast-narrator__pressure">
        <small>STATIC {room.signal}/{room.signalMax}</small>
        <div className="broadcast-narrator__static">
          <i style={{ width: `${(room.signal / room.signalMax) * 100}%` }} />
        </div>
        <span>
          FRACTURES {room.fractures || 0}/3
          {needs
            ? ` · NEEDS ${needs.echoes}E ${needs.keys}K ${needs.laps}C`
            : ""}
        </span>
      </div>
      <div className="broadcast-narrator__captions">
        {latest && (
          <b className="broadcast-narrator__latest">
            {latest.summary || latest.title}
          </b>
        )}
        <ol>
          {captions.slice(0, -1).map((event) => (
            <li key={event.id}>{event.summary || event.title}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
