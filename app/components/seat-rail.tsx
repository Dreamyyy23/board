import type { Player, RoomState } from "../game-types";
import { MaskPortrait } from "./mask-portrait";

function ResourcePips({
  value,
  max,
  kind,
}: {
  value: number;
  max: number;
  kind: string;
}) {
  return (
    <span className={`resource-pips resource-pips--${kind}`}>
      {Array.from({ length: max }, (_, index) => (
        <i className={index < value ? "is-filled" : ""} key={index} />
      ))}
    </span>
  );
}

export function SeatRail({
  room,
  self,
  canManage,
  onRemoveBot,
  onClaimSeat,
}: {
  room: RoomState;
  self: Player | null;
  canManage: boolean;
  onRemoveBot: (seat: number) => void;
  onClaimSeat: (seat: number) => void;
}) {
  const leaderScore = Math.max(
    0,
    ...room.players.map((player) => player?.echoes || 0),
  );

  return (
    <aside className="seat-rail">
      <div className="rail-title">
        <div>
          <small>The occupied masks</small>
          <h2>Travelers</h2>
        </div>
        <span>{room.players.filter(Boolean).length}/6</span>
      </div>

      <div className="seat-list">
        {room.players.map((player, index) => (
          <article
            className={`seat-card${room.currentSeat === index ? " is-turn" : ""}${player?.id === self?.id ? " is-self" : ""}${!player ? " is-empty" : ""}${player && player.echoes === leaderScore && leaderScore > 0 ? " is-leader" : ""}`}
            key={index}
          >
            <MaskPortrait seat={index} />
            <div className="seat-copy">
              <span className="seat-number">Mask {index + 1}</span>
              <strong>{player?.name || room.masks[index]?.name || "Unclaimed"}</strong>
              <small className="mask-title">
                {player?.mask.title || room.masks[index]?.title}
              </small>
              {player ? (
                <>
                  <span className="seat-turn-label">
                    {room.currentSeat === index ? "Casting now" : player.echoes === leaderScore && leaderScore > 0 ? "Leading" : "On the road"}
                  </span>
                  <div className="seat-score">
                    <span><b>{player.echoes}</b> echoes</span>
                    <span><b>{player.keys}</b> keys</span>
                    <span><b>{player.laps}</b> circuits</span>
                  </div>
                  <div className="echo-race" title={`${player.echoes} of ${room.objective.echoes} Echoes`}>
                    <i
                      style={{
                        width: `${Math.min(100, (player.echoes / room.objective.echoes) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="seat-resources">
                    <label>Focus <ResourcePips value={player.focus} max={3} kind="focus" /></label>
                    <label>Resolve <ResourcePips value={player.resolve} max={3} kind="resolve" /></label>
                  </div>
                  <div className="vow-mini">
                    <span>{player.vow.complete ? "Vow fulfilled" : player.vow.title}</span>
                    <i>
                      <b
                        style={{
                          width: `${Math.min(100, (player.vow.progress / player.vow.target) * 100)}%`,
                        }}
                      />
                    </i>
                    <small>{player.vow.progress}/{player.vow.target}</small>
                  </div>
                </>
              ) : (
                <>
                  <p className="empty-passive">{room.masks[index]?.passive}</p>
                  {room.status === "lobby" && self && (
                    <button
                      className="claim-mask"
                      onClick={() => onClaimSeat(index)}
                      type="button"
                    >
                      Claim this mask
                    </button>
                  )}
                </>
              )}
            </div>

            {player && (
              <div className="seat-flags">
                <i className={player.online ? "online" : "offline"} />
                {player.warded && <span className="ward-flag" title="Warded">◇</span>}
                {player.bot && <span className="echo-flag">ECHO</span>}
              </div>
            )}
            {canManage && player?.bot && room.status === "lobby" && (
              <button
                className="remove-bot"
                onClick={() => onRemoveBot(index)}
                aria-label={`Remove ${player.name}`}
                type="button"
              >
                ×
              </button>
            )}
          </article>
        ))}
      </div>

      <div className="rail-note">
        <span>Mask law</span>
        <p>Each mask changes one rule. Empty masks can be claimed before the first cast.</p>
      </div>
    </aside>
  );
}
