import { BOARD_POINTS, KIND_MARKS, KIND_NAMES, SPACE_KINDS } from "../game-data";
import type {
  Player,
  ReachableDestination,
  RoomState,
  SpaceClass,
} from "../game-types";

function makeRoadPath(points: typeof BOARD_POINTS) {
  if (points.length < 2) return "";
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    commands.push(
      `C ${current.x + (next.x - before.x) / 6} ${
        current.y + (next.y - before.y) / 6
      }, ${next.x - (after.x - current.x) / 6} ${
        next.y - (after.y - current.y) / 6
      }, ${next.x} ${next.y}`,
    );
  }
  return commands.join(" ");
}

const ROAD_PATH = makeRoadPath(BOARD_POINTS);
const TOKEN_LAYOUTS: Array<Array<{ x: number; y: number; size: number }>> = [
  [],
  [{ x: 0, y: 0, size: 22 }],
  [
    { x: -6, y: 0, size: 14 },
    { x: 6, y: 0, size: 14 },
  ],
  [
    { x: 0, y: -6, size: 12 },
    { x: -6, y: 5, size: 12 },
    { x: 6, y: 5, size: 12 },
  ],
  [
    { x: -6, y: -6, size: 12 },
    { x: 6, y: -6, size: 12 },
    { x: -6, y: 6, size: 12 },
    { x: 6, y: 6, size: 12 },
  ],
  [
    { x: -6, y: -5, size: 10 },
    { x: 0, y: -5, size: 10 },
    { x: 6, y: -5, size: 10 },
    { x: -3, y: 5, size: 10 },
    { x: 3, y: 5, size: 10 },
  ],
  [
    { x: -6, y: -5, size: 10 },
    { x: 0, y: -5, size: 10 },
    { x: 6, y: -5, size: 10 },
    { x: -6, y: 5, size: 10 },
    { x: 0, y: 5, size: 10 },
    { x: 6, y: 5, size: 10 },
  ],
];

const PHASE_LABELS: Record<string, string> = {
  lobby: "Choose masks",
  intent: "Choose an Intent",
  bend: "Bend window",
  reaction: "Give Oxygen",
  oracle: "Oracle answer",
  "council-vote": "Secret Council",
  "council-reveal": "Stones reveal",
  fracture: "Static Fracture",
  finished: "Road complete",
};

const CLASS_LABELS: Record<SpaceClass, string> = {
  light: "LIGHT",
  threshold: "THRESHOLD",
  teeth: "TEETH",
};

const DIE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DieFace({ value }: { value: number | null }) {
  const visible = new Set(value ? DIE_PIPS[value] || [] : []);
  return (
    <span
      aria-hidden="true"
      className={`heart-die die-face${value ? ` die-face--${value}` : ""}`}
      data-value={value || 0}
    >
      {Array.from({ length: 9 }, (_, index) => (
        <i className={visible.has(index) ? "is-visible" : ""} key={index} />
      ))}
      {!value && <b>◆</b>}
    </span>
  );
}

function fallbackReachable(position: number): ReachableDestination[] {
  return Array.from({ length: 6 }, (_, index) => {
    const roll = index + 1;
    const destination = (position + roll) % SPACE_KINDS.length;
    const kind = SPACE_KINDS[destination];
    const spaceClass: SpaceClass =
      kind === "oracle" || kind === "council"
        ? "threshold"
        : kind === "rift" || kind === "snare"
          ? "teeth"
          : "light";
    return { roll, destination, kind, class: spaceClass };
  });
}

export function Board({
  room,
  self,
  canRoll,
  busy,
  onRoll,
}: {
  room: RoomState;
  self: Player | null;
  canRoll: boolean;
  busy: boolean;
  onRoll: () => void;
}) {
  const activePlayer =
    room.currentSeat === null ? null : room.players[room.currentSeat];
  const phase = room.phase || (room.status === "lobby" ? "lobby" : "intent");
  const reachable =
    room.turn?.reachable || fallbackReachable(activePlayer?.position ?? 0);
  const links = room.players.flatMap((player) => {
    if (!player?.relationships) return [];
    return Object.entries(player.relationships)
      .map(([targetSeat, strength]) => ({
        from: player,
        to: room.players[Number(targetSeat)],
        strength,
      }))
      .filter(
        (link): link is { from: Player; to: Player; strength: number } =>
          Boolean(link.to && link.from.seat < link.to.seat && link.strength > 0),
      );
  });
  const natural = room.turn?.naturalRoll ?? room.lastRoll?.naturalDie ?? null;
  const final = room.turn?.finalRoll ?? room.lastRoll?.die ?? null;
  const intentLocked = Boolean(room.turn?.intent);
  const reachableByDestination = new Map(
    reachable.map((destination) => [destination.destination, destination]),
  );
  const occupiedPositions = new Map<number, Player[]>();
  for (const player of room.players.filter(
    (candidate): candidate is Player => Boolean(candidate),
  )) {
    const group = occupiedPositions.get(player.position) || [];
    group.push(player);
    occupiedPositions.set(player.position, group);
  }
  const staticIntensity = Math.min(
    1,
    room.signal / Math.max(1, room.signalMax || 12),
  );
  const presentation =
    room.presentationState || room.lastEvent?.presentationState || phase;

  return (
    <section
      aria-label="The Sixfold Road board"
      className={`board-panel board-phase--${phase}`}
      data-event-tone={room.lastEvent?.tone || "quiet"}
      data-omen={room.omen || "none"}
      data-phase={phase}
      data-presentation={presentation}
      data-static-state={room.staticState?.label?.toLowerCase() || "whispering"}
      style={
        {
          "--static-intensity": staticIntensity,
        } as React.CSSProperties
      }
    >
      <div className="board-table-image" />
      <div className="board-atmosphere" />
      <div className="table-candle-glow table-candle-glow--left" />
      <div className="table-candle-glow table-candle-glow--right" />
      <div
        aria-hidden="true"
        className="phase-transition-cue"
        key={`${room.turnNumber}-${phase}`}
      >
        <span>{PHASE_LABELS[phase] || phase}</span>
        <b>{activePlayer?.sigil || "THE HOUSE"}</b>
      </div>

      <div className="board-phase-plaque" data-phase={phase}>
        <small>
          Round {String(room.round).padStart(2, "0")} · turn{" "}
          {String(room.turnNumber).padStart(2, "0")}
        </small>
        <strong>{PHASE_LABELS[phase] || phase}</strong>
        <span>
          {activePlayer
            ? `${activePlayer.name} · ${activePlayer.sigil}`
            : "The table is waiting"}
        </span>
      </div>

      <div
        className="board-authority-beacon"
        data-self-active={self?.seat === room.currentSeat ? "true" : "false"}
      >
        <div>
          <small>Active authority</small>
          <strong>{activePlayer?.name || "The House"}</strong>
          <span>{PHASE_LABELS[phase] || phase}</span>
        </div>
        <b aria-label={`${room.secondsLeft ?? 20} seconds remaining`}>
          {room.status === "playing" ? room.secondsLeft ?? 20 : "—"}
          <small>SEC</small>
        </b>
      </div>

      {self && (
        <div className="journey-plaque">
          <small>Your crossing</small>
          <div>
            <span>
              <b>{self.echoes}</b> / {room.objective.echoes}
              <i>Echoes</i>
            </span>
            <span>
              <b>{self.keys}</b> / {room.objective.keys}
              <i>Key</i>
            </span>
            <span>
              <b>{self.laps}</b> / {room.objective.laps}
              <i>Circuit</i>
            </span>
          </div>
        </div>
      )}

      <div className="omen-plaque" data-omen={room.omen || "none"}>
        <small>Current Omen</small>
        <strong>{room.omen ? room.omen.toUpperCase() : "NO OMEN"}</strong>
        <span>
          {room.omen
            ? "Applies to this ordinary turn, then is consumed."
            : room.nextOmen
              ? `${room.nextOmen.toUpperCase()} waits in the latest transmission.`
              : "The next accepted transmission will name one."}
        </span>
      </div>

      <div className="north-mark" aria-hidden="true">
        <span>NORTH</span>
        <i />
      </div>

      <div className="board-track">
        <div aria-hidden="true" className="static-veins">
          {Array.from({ length: 12 }, (_, index) => (
            <i
              className={index < room.signal ? "is-live" : ""}
              key={index}
              style={
                {
                  "--vein-index": index,
                  "--vein-angle": `${index * 30}deg`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <svg
          aria-hidden="true"
          className="road-svg"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <path className="road-shadow" d={ROAD_PATH} pathLength="1" />
          <path className="road-metal" d={ROAD_PATH} pathLength="1" />
          <path
            className="road-progress"
            d={ROAD_PATH}
            pathLength="1"
            style={
              {
                strokeDasharray: `${
                  activePlayer
                    ? Math.max(
                        0.018,
                        activePlayer.position / (BOARD_POINTS.length - 1),
                      )
                    : 0
                } 1`,
              } as React.CSSProperties
            }
          />
          {links.map(({ from, to, strength }) => {
            const start = BOARD_POINTS[from.position];
            const end = BOARD_POINTS[to.position];
            return (
              <line
                className="golden-thread-line"
                key={`${from.seat}-${to.seat}`}
                x1={start.x}
                x2={end.x}
                y1={start.y}
                y2={end.y}
                style={{ opacity: Math.min(0.72, 0.24 + strength * 0.1) }}
              />
            );
          })}
        </svg>

        {BOARD_POINTS.map((point, index) => {
          const kind = SPACE_KINDS[index];
          const active =
            room.currentSeat !== null &&
            room.players[room.currentSeat]?.position === index;
          const destination = reachableByDestination.get(index);
          const isNatural = Boolean(
            destination && natural && destination.roll === natural,
          );
          const isFinal = Boolean(
            destination && final && destination.roll === final,
          );
          return (
            <div
              className={`board-space board-space--${kind}${
                active ? " is-active" : ""
              }${destination ? ` is-reachable road-class--${destination.class}` : ""}${
                isNatural ? " is-natural-result" : ""
              }${isFinal ? " is-final-result" : ""}${
                isNatural && final && natural !== final ? " is-bent-away" : ""
              }`}
              data-reachable-roll={destination?.roll || undefined}
              key={index}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              title={`${String(index + 1).padStart(2, "0")} · ${
                KIND_NAMES[kind]
              }`}
            >
              <span className="space-mark">{KIND_MARKS[kind]}</span>
              <small>{String(index + 1).padStart(2, "0")}</small>
              {destination && (
                <span aria-hidden="true" className="reachable-roll">
                  {destination.roll}
                </span>
              )}
            </div>
          );
        })}

        {room.players
          .filter((player): player is Player => Boolean(player))
          .map((player) => {
            const point = BOARD_POINTS[player.position];
            const group = occupiedPositions.get(player.position) || [player];
            const tokenIndex = Math.max(
              0,
              group.findIndex((candidate) => candidate.id === player.id),
            );
            const layout =
              TOKEN_LAYOUTS[Math.min(group.length, TOKEN_LAYOUTS.length - 1)][
                tokenIndex
              ] || TOKEN_LAYOUTS[1][0];
            return (
              <span
                aria-label={`${player.name} · ${player.sigil}`}
                className={`traveling-token${
                  player.id === self?.id ? " is-self" : ""
                }${player.seat === room.currentSeat ? " is-active" : ""}`}
                key={player.id}
                style={
                  {
                    "--token-color": player.color,
                    "--token-size": `${layout.size}px`,
                    "--token-x": `${layout.x}px`,
                    "--token-y": `${layout.y}px`,
                    left: `${point.x}%`,
                    top: `${point.y}%`,
                    zIndex: tokenIndex + 31,
                  } as React.CSSProperties
                }
                title={`${player.name} · ${player.sigil}`}
              >
                {player.sigil.slice(0, 1)}
              </span>
            );
          })}

        <div
          aria-hidden="true"
          className="event-reaction-mark"
          key={room.lastEvent?.id || "table-wakes"}
        >
          <span>{KIND_MARKS[room.lastEvent?.spaceKind || "echo"] || "◆"}</span>
        </div>

        <button
          aria-label={canRoll ? "Cast the bone" : "The ritual heart of the board"}
          className={`board-heart${canRoll ? " is-actionable" : ""}`}
          disabled={!canRoll || busy}
          onClick={canRoll ? onRoll : undefined}
          type="button"
        >
          <div className="heart-dial">
            {Array.from({ length: 12 }, (_, index) => (
              <i key={index} />
            ))}
            <DieFace value={final} />
          </div>
          <small>
            {phase === "bend" && natural
              ? `NATURAL ${natural} · BEND WINDOW`
              : canRoll
                ? `INTENT ${room.turn?.intent?.toUpperCase()} · ${
                    room.secondsLeft ?? 20
                  } SECONDS`
                : phase === "intent" && activePlayer
                  ? intentLocked
                    ? "THE BONE IS READY"
                    : "CHOOSE AN INTENT"
                  : final
                    ? `FINAL CAST · ${final}`
                    : "THE BONE WAITS"}
          </small>
          <strong>{canRoll ? "CAST THE BONE" : "OBSCUR"}</strong>
          <span>
            {natural && final && natural !== final
              ? `Natural ${natural} → final ${final}`
              : "Server-owned result · visible Bend"}
          </span>
        </button>
      </div>

      <div className="road-ahead road-ahead--six">
        <div>
          <small>Read the Road</small>
          <strong>Six reachable destinations · events remain hidden</strong>
        </div>
        <ol>
          {reachable.map((destination) => (
            <li
              aria-current={
                final === destination.roll
                  ? "step"
                  : natural === destination.roll
                    ? "true"
                    : undefined
              }
              className={`road-ahead--${destination.kind} road-class--${destination.class}${
                natural === destination.roll ? " is-natural-result" : ""
              }${final === destination.roll ? " is-final-result" : ""}${
                natural === destination.roll && final && natural !== final
                  ? " is-bent-away"
                  : ""
              }`}
              key={destination.roll}
            >
              <span>{destination.roll}</span>
              <div>
                <small>{CLASS_LABELS[destination.class]}</small>
                <b>{KIND_NAMES[destination.kind] || destination.kind}</b>
              </div>
              {room.turn?.revealedEvents?.[destination.roll] && (
                <em title={room.turn.revealedEvents[destination.roll].body}>
                  {room.turn.revealedEvents[destination.roll].title}
                </em>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="board-legend">
        {["echo", "relic", "archive", "council", "oracle", "key", "rift", "snare"].map(
          (kind) => (
            <span key={kind}>
              <i className={`legend-mark legend-mark--${kind}`}>
                {KIND_MARKS[kind]}
              </i>
              {KIND_NAMES[kind]}
            </span>
          ),
        )}
      </div>

      {(room.fractureModifier || room.councilModifier) && (
        <div className="table-modifier-ribbon">
          <b>{(room.fractureModifier || room.councilModifier)?.title}</b>
          <span>{(room.fractureModifier || room.councilModifier)?.body}</span>
        </div>
      )}

      {room.hazard && (
        <div className="hazard-ribbon">
          <b>{room.hazard.title}</b>
          <span>{room.hazard.body}</span>
        </div>
      )}
    </section>
  );
}
