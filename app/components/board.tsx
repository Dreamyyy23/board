import { BOARD_POINTS, KIND_MARKS, KIND_NAMES, SPACE_KINDS } from "../game-data";
import type { Player, RoomState } from "../game-types";

function makeRoadPath(points: typeof BOARD_POINTS) {
  if (points.length < 2) return "";
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    const controlOne = {
      x: current.x + (next.x - before.x) / 6,
      y: current.y + (next.y - before.y) / 6,
    };
    const controlTwo = {
      x: next.x - (after.x - current.x) / 6,
      y: next.y - (after.y - current.y) / 6,
    };
    commands.push(
      `C ${controlOne.x} ${controlOne.y}, ${controlTwo.x} ${controlTwo.y}, ${next.x} ${next.y}`,
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
  const phase = room.pendingCouncil
    ? "Council vote"
    : room.pendingChoice
      ? "Oracle answer"
      : room.status === "lobby"
        ? "Choose masks"
        : room.status === "finished"
          ? "Road complete"
          : "Casting phase";
  const aheadFrom = activePlayer?.position ?? 0;
  const roadAhead = Array.from({ length: 4 }, (_, offset) => {
    const index = (aheadFrom + offset + 1) % SPACE_KINDS.length;
    const kind = SPACE_KINDS[index];
    return { index, kind };
  });

  return (
    <section className="board-panel" aria-label="The Sixfold Road board">
      <div className="board-table-image" />
      <div className="board-atmosphere" />
      <div className="table-candle-glow table-candle-glow--left" />
      <div className="table-candle-glow table-candle-glow--right" />

      <div className="board-phase-plaque">
        <small>Round {String(room.round).padStart(2, "0")}</small>
        <strong>{phase}</strong>
        <span>
          {activePlayer ? `${activePlayer.name} · ${activePlayer.sigil}` : "The table is waiting"}
        </span>
      </div>

      {self && (
        <div className="journey-plaque">
          <small>Your crossing</small>
          <div>
            <span><b>{self.echoes}</b> / {room.objective.echoes}<i>Echoes</i></span>
            <span><b>{self.keys}</b> / {room.objective.keys}<i>Key</i></span>
            <span><b>{self.laps}</b> / {room.objective.laps}<i>Circuit</i></span>
          </div>
        </div>
      )}

      <div className="north-mark" aria-hidden="true">
        <span>NORTH</span>
        <i />
      </div>

      <div className="board-track">
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
        </svg>

        {BOARD_POINTS.map((point, index) => {
          const players = room.players.filter(
            (player): player is Player => player?.position === index,
          );
          const kind = SPACE_KINDS[index];
          const active =
            room.currentSeat !== null &&
            room.players[room.currentSeat]?.position === index;
          return (
            <div
              className={`board-space board-space--${kind}${active ? " is-active" : ""}`}
              key={index}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              title={`${String(index + 1).padStart(2, "0")} · ${KIND_NAMES[kind]}`}
            >
              <span className="space-mark">{KIND_MARKS[kind]}</span>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <div className="token-stack">
                {players.map((player, tokenIndex) => {
                  const token = TOKEN_LAYOUTS[players.length][tokenIndex];
                  return (
                    <span
                      className={`player-token${player.id === self?.id ? " is-self" : ""}`}
                      key={player.id}
                      title={`${player.name} · ${player.sigil}`}
                      style={
                        {
                          "--token-color": player.color,
                          "--token-size": `${token.size}px`,
                          "--token-x": `${token.x}px`,
                          "--token-y": `${token.y}px`,
                          zIndex: tokenIndex + 1,
                        } as React.CSSProperties
                      }
                    >
                      {player.sigil.slice(0, 1)}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          aria-label={canRoll ? "Cast the bone" : "The ritual heart of the board"}
          className={`board-heart${canRoll ? " is-actionable" : ""}`}
          disabled={!canRoll || busy}
          onClick={canRoll ? onRoll : undefined}
          type="button"
        >
          <div className="heart-dial">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
            <span className="heart-die">
              {room.lastRoll?.die || "◆"}
            </span>
          </div>
          <small>
            {canRoll
              ? `YOUR TURN · ${room.secondsLeft ?? 20} SECONDS`
              : room.lastRoll
                ? `LAST CAST · ${room.lastRoll.die}`
                : "THE BONE WAITS"}
          </small>
          <strong>{canRoll ? "CAST THE BONE" : "OBSCUR"}</strong>
          <span>{canRoll ? "Server decides 1–6" : "13 Echoes · 1 Key · One circuit"}</span>
          {room.lastRoll?.tuning !== 0 && room.lastRoll && (
            <em>
              Natural {room.lastRoll.naturalDie} · tuned {room.lastRoll.tuning > 0 ? "+" : ""}
              {room.lastRoll.tuning}
            </em>
          )}
        </button>
      </div>

      <div className="road-ahead">
        <div>
          <small>Road ahead</small>
          <strong>{activePlayer ? `${activePlayer.name} is approaching` : "The road is still"}</strong>
        </div>
        <ol>
          {roadAhead.map(({ index, kind }, offset) => (
            <li className={`road-ahead--${kind}`} key={index}>
              <span>{KIND_MARKS[kind]}</span>
              <div>
                <small>+{offset + 1}</small>
                <b>{KIND_NAMES[kind]}</b>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="board-legend">
        {["echo", "relic", "archive", "council", "oracle", "key", "rift", "snare"].map(
          (kind) => (
            <span key={kind}>
              <i className={`legend-mark legend-mark--${kind}`}>{KIND_MARKS[kind]}</i>
              {KIND_NAMES[kind]}
            </span>
          ),
        )}
      </div>

      {room.hazard && (
        <div className="hazard-ribbon">
          <b>{room.hazard.title}</b>
          <span>{room.hazard.body}</span>
        </div>
      )}
    </section>
  );
}
