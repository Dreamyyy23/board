import { useState } from "react";
import type { Player, RoomState } from "../game-types";
import { MaskPortrait } from "./mask-portrait";
import { TransmissionStage } from "./transmission-stage";

function Pips({
  value,
  max,
  label,
  kind,
}: {
  value: number;
  max: number;
  label: string;
  kind: string;
}) {
  return (
    <div className={`large-pips large-pips--${kind}`}>
      <span>{label}</span>
      <div>
        {Array.from({ length: max }, (_, index) => (
          <i className={index < value ? "is-filled" : ""} key={index} />
        ))}
      </div>
      <b>{value}/{max}</b>
    </div>
  );
}

export function CommandRail({
  room,
  self,
  isHost,
  busy,
  onChoice,
  onCouncilVote,
  onStart,
  onAddBot,
  onTune,
  onUseRelic,
  onGift,
  onTransmissionFailure,
}: {
  room: RoomState;
  self: Player | null;
  isHost: boolean;
  busy: boolean;
  onChoice: (id: string) => void;
  onCouncilVote: (id: string) => void;
  onStart: () => void;
  onAddBot: () => void;
  onTune: (amount: number) => void;
  onUseRelic: (id: string) => void;
  onGift: (seat: number) => void;
  onTransmissionFailure?: (failure: {
    transmissionId: string;
    videoId: string;
    errorCode: number;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [tab, setTab] = useState<"event" | "chronicle">("event");
  const [tacticsOpen, setTacticsOpen] = useState(false);
  const active = room.currentSeat === self?.seat;
  const choiceIsMine = room.pendingChoice?.seat === self?.seat;
  const council = room.pendingCouncil;
  const event = council?.event || room.pendingChoice?.event || room.lastEvent;
  const transmission = room.activeTransmission;
  const seconds = room.secondsLeft ?? 20;
  const progress = Math.max(0, Math.min(100, (seconds / 20) * 100));
  const currentPlayer =
    room.currentSeat === null ? null : room.players[room.currentSeat];
  const landingPlayer =
    transmission?.landingSeat === undefined
      ? null
      : room.players[transmission.landingSeat]?.name ||
        `Mask ${transmission.landingSeat + 1}`;
  const alreadyVoted = Boolean(
    council && self && council.votes[self.seat],
  );
  const canAct =
    Boolean(active && self && room.status === "playing") &&
    !room.pendingChoice &&
    !room.pendingCouncil;
  const outcomes = [
    event.deltaEchoes && `${event.deltaEchoes > 0 ? "+" : ""}${event.deltaEchoes} Echoes`,
    event.deltaKeys && `${event.deltaKeys > 0 ? "+" : ""}${event.deltaKeys} Key`,
    event.deltaFocus && `${event.deltaFocus > 0 ? "+" : ""}${event.deltaFocus} Focus`,
    event.deltaResolve && `${event.deltaResolve > 0 ? "+" : ""}${event.deltaResolve} Resolve`,
    event.move && `${event.move > 0 ? "+" : ""}${event.move} spaces`,
    event.staticDelta && `${event.staticDelta > 0 ? "+" : ""}${event.staticDelta} Static`,
    event.relic && "Relic found",
  ].filter(Boolean) as string[];

  return (
    <aside className="command-rail">
      <div className="turn-console">
        <div
          className="clock-ring"
          style={{ "--time-progress": `${progress * 3.6}deg` } as React.CSSProperties}
        >
          <strong>{room.status === "playing" ? seconds : "—"}</strong>
          <span>seconds</span>
        </div>
        <div className="turn-copy">
          <small>
            {room.pendingCouncil
              ? "Council phase"
              : room.pendingChoice
                ? "Oracle phase"
                : room.status === "lobby"
                  ? "Lobby phase"
                  : `Turn ${room.turnNumber} · Round ${room.round}`}
          </small>
          <h2>
            {room.status === "finished"
              ? "The road named a winner"
              : currentPlayer
                ? `${currentPlayer.name}'s crossing`
                : "The table is quiet"}
          </h2>
          <span className={`authority-state${active ? " is-yours" : ""}`}>
            {active ? "YOUR AUTHORITY" : "OBSERVING"}
          </span>
        </div>
      </div>

      <TransmissionStage
        event={transmission}
        landingPlayer={landingPlayer}
        onPlaybackFailure={onTransmissionFailure}
        spaceLabel={
          transmission?.landingSpace !== undefined
            ? `space ${String(transmission.landingSpace + 1).padStart(2, "0")}`
            : null
        }
      />

      <div className="rail-tabs">
        <button
          className={tab === "event" ? "is-active" : ""}
          onClick={() => setTab("event")}
          type="button"
        >
          Current event
        </button>
        <button
          className={tab === "chronicle" ? "is-active" : ""}
          onClick={() => setTab("chronicle")}
          type="button"
        >
          Chronicle
        </button>
      </div>

      {tab === "event" ? (
        <article className={`event-card event-card--${event.tone}`}>
          <div className="event-eyebrow">
            <span>{event.tone}</span>
            <i>
              {room.lastRoll
                ? `space ${String(room.lastRoll.to + 1).padStart(2, "0")}`
                : "table event"}
            </i>
          </div>
          <div className="event-art">
            <span>
              {event.tone === "signal"
                ? "◉"
                : event.tone === "danger"
                  ? "×"
                  : event.tone === "gold"
                    ? "⚿"
                    : event.tone === "council"
                      ? "6"
                      : event.tone === "relic"
                        ? "◇"
                        : "✦"}
            </span>
            <i />
          </div>
          <h3>{event.title}</h3>
          <p>{event.body}</p>
          {outcomes.length > 0 && (
            <div className="event-outcomes" aria-label="Event consequences">
              {outcomes.map((outcome) => <span key={outcome}>{outcome}</span>)}
            </div>
          )}

          {transmission?.videoId && (
            <div className="transmission-assignment">
              <span>Authority-selected channel broadcast</span>
              <b>
                {transmission.videoTitle ||
                  transmission.videoLabel ||
                  "Assigned transmission"}
              </b>
              <small>
                {transmission.videoSource || room.youtubeChannel.title} · now
                staged for the whole table
              </small>
            </div>
          )}

          {event.choices && room.pendingChoice && (
            <div className="choice-stack">
              {event.choices.map((choice) => (
                <button
                  disabled={!choiceIsMine || busy}
                  key={choice.id}
                  onClick={() => onChoice(choice.id)}
                  type="button"
                >
                  <span>{choice.label}</span>
                  <small>
                    {choiceIsMine ? choice.result : "Reserved for the active mask"}
                  </small>
                </button>
              ))}
            </div>
          )}

          {event.choices && council && (
            <div className="council-stack">
              <div className="vote-progress">
                <span>Votes placed</span>
                <b>
                  {Object.keys(council.votes).length}/{room.players.filter(Boolean).length}
                </b>
              </div>
              {event.choices.map((choice) => {
                const votes = Object.values(council.votes).filter(
                  (value) => value === choice.id,
                ).length;
                return (
                  <button
                    className={council.votes[self?.seat ?? -1] === choice.id ? "is-chosen" : ""}
                    disabled={!self || alreadyVoted || busy}
                    key={choice.id}
                    onClick={() => onCouncilVote(choice.id)}
                    type="button"
                  >
                    <span>{choice.label}<b>{votes}</b></span>
                    <small>{choice.result}</small>
                  </button>
                );
              })}
              {alreadyVoted && <p className="vote-wait">Your stone is placed. Waiting for the other masks.</p>}
            </div>
          )}
        </article>
      ) : (
        <section className="chronicle">
          <div className="chronicle-header">
            <span>Newest first</span>
            <b>{room.log.length} entries held</b>
          </div>
          <ol>
            {room.log.slice(-12).reverse().map((entry, index) => (
              <li key={entry.id}>
                <span>{String(room.log.length - index).padStart(2, "0")}</span>
                <p>{entry.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {self && (
        <section className="inventory-rack">
          <div className="rack-mask">
            <MaskPortrait seat={self.seat} small />
            <div>
              <small>Your mask</small>
              <strong>{self.sigil}</strong>
              <span>{self.mask.title}</span>
            </div>
          </div>
          <div className="rack-resources">
            <Pips value={self.focus} max={3} label="Focus" kind="focus" />
            <Pips value={self.resolve} max={3} label="Resolve" kind="resolve" />
          </div>
          <div className="rack-status">
            <span className={self.warded ? "is-active" : ""}>
              <i>◇</i>{self.warded ? "Ward armed" : "No ward"}
            </span>
            <span className={self.tuning ? "is-active" : ""}>
              <i>{self.tuning > 0 ? "+1" : self.tuning < 0 ? "-1" : "·"}</i>
              {self.tuning ? "Bone tuned" : "Bone natural"}
            </span>
          </div>
          <div className="vow-card">
            <div>
              <small>Personal vow</small>
              <strong>{self.vow.title}</strong>
            </div>
            <span>{self.vow.complete ? "FULFILLED" : `${self.vow.progress}/${self.vow.target}`}</span>
            <i>
              <b
                style={{
                  width: `${Math.min(100, (self.vow.progress / self.vow.target) * 100)}%`,
                }}
              />
            </i>
            <p>Complete it for five Echoes and one Focus.</p>
          </div>
          <div className="relic-slots">
            <span>Relics · {self.relics.length}/2</span>
            <div>
              {self.relics.map((relic) => (
                <button
                  disabled={!canAct || busy}
                  key={relic.id}
                  onClick={() => onUseRelic(relic.id)}
                  title={relic.description}
                  type="button"
                >
                  <b>{relic.mark}</b>
                  <span>{relic.title}</span>
                  <small>Use on your turn</small>
                </button>
              ))}
              {Array.from({ length: Math.max(0, 2 - self.relics.length) }, (_, index) => (
                <span className="empty-relic" key={index}>
                  <b>·</b>
                  Empty reliquary
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="action-dock">
        {room.status === "lobby" && isHost && (
          <>
            <button
              className="game-button game-button--primary"
              onClick={onStart}
              disabled={busy}
              type="button"
            >
              <span className="button-icon">◆</span>
              <span><b>Begin the crossing</b><small>Lock masks and start the authority clock</small></span>
            </button>
            {room.players.some((player) => player === null) && (
              <button className="game-button" onClick={onAddBot} disabled={busy} type="button">
                <span className="button-icon">◌</span>
                <span><b>Call an Echo traveler</b><small>Practice with a server-controlled mask</small></span>
              </button>
            )}
          </>
        )}

        {canAct && self && (
          <>
            <button
              className={`tactics-toggle${tacticsOpen ? " is-open" : ""}`}
              onClick={() => setTacticsOpen((value) => !value)}
              type="button"
            >
              <span>Pre-cast tactics</span>
              <small>{self.focus} Focus · {self.echoes} Echoes available</small>
              <b>{tacticsOpen ? "−" : "+"}</b>
            </button>
            {tacticsOpen && (
              <div className="tactics-drawer">
                <div className="tune-actions">
                  <span>Tune the bone · spend 1 Focus</span>
                  <button
                    disabled={self.focus < 1 || Boolean(self.tuning) || busy}
                    onClick={() => onTune(-1)}
                    type="button"
                  >
                    <b>−1</b><small>Edge low</small>
                  </button>
                  <button
                    disabled={self.focus < 1 || Boolean(self.tuning) || busy}
                    onClick={() => onTune(1)}
                    type="button"
                  >
                    <b>+1</b><small>Edge high</small>
                  </button>
                </div>
                <div className="gift-actions">
                  <span>Give one Echo · once this turn</span>
                  <div>
                    {room.players
                      .filter((player): player is Player => Boolean(player && player.id !== self.id))
                      .map((player) => (
                        <button
                          disabled={self.echoes < 1 || busy}
                          key={player.id}
                          onClick={() => onGift(player.seat)}
                          title={`Give one Echo to ${player.name}`}
                          type="button"
                        >
                          <MaskPortrait seat={player.seat} small />
                          <span>{player.name}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {room.status === "playing" && !canAct && !room.pendingCouncil && !room.pendingChoice && (
          <div className="waiting-plaque">
            <i>◌</i>
            <span>
              <b>Watch the crossing</b>
              <small>Waiting for {currentPlayer?.name || "the next mask"}</small>
            </span>
          </div>
        )}

        {room.status === "finished" && isHost && (
          <button
            className="game-button game-button--primary"
            onClick={onStart}
            disabled={busy}
            type="button"
          >
            <span className="button-icon">↻</span>
            <span><b>Open another road</b><small>Reset every resource, vow, and position</small></span>
          </button>
        )}
      </section>
    </aside>
  );
}
