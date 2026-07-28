import { useMemo, useState } from "react";
import { BOARD_SIZE, KIND_NAMES, SPACE_KINDS } from "../game-data";
import type {
  Intent,
  Player,
  RoomState,
  SpaceClass,
} from "../game-types";
import { CoachHint } from "./coach-hint";
import { MaskPortrait } from "./mask-portrait";
import { RollPicker } from "./roll-picker";
import { TransmissionStage } from "./transmission-stage";

const INTENT_COPY: Record<Intent, { title: string; body: string }> = {
  claim: {
    title: "CLAIM",
    body: "Press for reward. LIGHT pays more; TEETH feeds Static.",
  },
  shelter: {
    title: "SHELTER",
    body: "Reduce visible harm, but soften safe rewards.",
  },
  bind: {
    title: "BIND",
    body: "Tie this route to another traveler and form connection.",
  },
};

const INTENT_MARKS: Record<Intent, string> = {
  claim: "▲",
  shelter: "⬡",
  bind: "∞",
};

const WITNESS_COPY: Record<SpaceClass, string> = {
  light: "Reward road",
  threshold: "Oracle or Council",
  teeth: "Rift or Snare",
};

const OMEN_COPY: Record<string, string> = {
  flame: "The next positive Echo reward gains one.",
  mirror: "The first point of visible harm is reflected away.",
  door: "The next Bend costs no Focus.",
  moth: "The natural destination's exact event is revealed.",
  thread: "The next Give Oxygen is free and threads both travelers.",
  static: "The next reward grows, and Static rises with it.",
};

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
      <b>
        {value}/{max}
      </b>
    </div>
  );
}

function eventOutcomes(room: RoomState) {
  const event =
    room.pendingCouncil?.event || room.pendingChoice?.event || room.lastEvent;
  const legacy = [
    event.deltaEchoes &&
      `${event.deltaEchoes > 0 ? "+" : ""}${event.deltaEchoes} Echoes`,
    event.deltaKeys && `${event.deltaKeys > 0 ? "+" : ""}${event.deltaKeys} Key`,
    event.deltaFocus &&
      `${event.deltaFocus > 0 ? "+" : ""}${event.deltaFocus} Focus`,
    event.deltaResolve &&
      `${event.deltaResolve > 0 ? "+" : ""}${event.deltaResolve} Resolve`,
    event.move && `${event.move > 0 ? "+" : ""}${event.move} spaces`,
    event.staticDelta &&
      `${event.staticDelta > 0 ? "+" : ""}${event.staticDelta} Static`,
    event.relic && "Relic found",
  ].filter(Boolean) as string[];
  const structured = (event.deltas || []).map(
    (delta) =>
      `${delta.amount > 0 ? "+" : ""}${delta.amount} ${delta.resource.replace(
        /([A-Z])/g,
        " $1",
      )}`,
  );
  if (
    event.staticBefore !== undefined &&
    event.staticAfter !== undefined &&
    event.staticBefore !== event.staticAfter
  ) {
    structured.push(
      `${event.staticAfter > event.staticBefore ? "+" : ""}${
        event.staticAfter - event.staticBefore
      } Static`,
    );
  }
  return [...legacy, ...structured];
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
  onIntent,
  onCast,
  onPreviewIntent,
  onPrediction,
  onBend,
  onLegacyTune,
  onGiveOxygen,
  onMaskPower,
  onUseRelic,
  onGift,
  onStreamerMode,
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
  onIntent: (intent: Intent, targetSeat?: number) => void;
  onCast: () => void;
  onPreviewIntent?: (intent: Intent | null) => void;
  onPrediction: (prediction: SpaceClass, bold?: boolean) => void;
  onBend: (delta: number, useAshEvent?: boolean) => void;
  onLegacyTune: (amount: number) => void;
  onGiveOxygen: () => void;
  onMaskPower: (payload?: Record<string, unknown>) => void;
  onUseRelic: (id: string, extra?: Record<string, unknown>) => void;
  onGift: (seat: number) => void;
  onStreamerMode: (enabled: boolean) => void;
  onTransmissionFailure?: (failure: {
    transmissionId: string;
    videoId: string;
    errorCode: number;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [tab, setTab] = useState<"event" | "chronicle">("event");
  const [bindOpen, setBindOpen] = useState(false);
  const [predictedTurn, setPredictedTurn] = useState<string | null>(null);
  const [boldWitness, setBoldWitness] = useState(false);
  const [moonPickerOpen, setMoonPickerOpen] = useState(false);
  const [foxfirePickerOpen, setFoxfirePickerOpen] = useState(false);
  const active = room.currentSeat === self?.seat;
  const phase = room.phase || "intent";
  const v4 = Number(room.rulesVersion || 0) >= 4;
  const choiceIsMine = room.pendingChoice?.seat === self?.seat;
  const council = room.pendingCouncil;
  const event = council?.event || room.pendingChoice?.event || room.lastEvent;
  const transmission = room.activeTransmission;
  const seconds = room.secondsLeft ?? 61;
  const phaseBudget =
    room.phaseBudgets?.[phase] ??
    (phase === "bend" || phase === "reaction"
      ? 5
      : phase === "council-reveal"
        ? 1
        : 61);
  const progress = Math.max(0, Math.min(100, (seconds / phaseBudget) * 100));
  const currentPlayer =
    room.currentSeat === null ? null : room.players[room.currentSeat];
  const landingPlayer =
    transmission?.landingSeat === undefined
      ? null
      : room.players[transmission.landingSeat]?.name ||
        `Mask ${transmission.landingSeat + 1}`;
  const votedSeats =
    council?.votedSeats || Object.keys(council?.votes || {}).map(Number);
  const alreadyVoted = Boolean(self && votedSeats.includes(self.seat));
  const outcomes = eventOutcomes(room);
  const witnessKey = room.turn?.id || `${room.round}:${room.turnNumber}`;
  const spectatorPredicted = predictedTurn === witnessKey;
  const canPredict =
    v4 &&
    room.status === "playing" &&
    phase === "intent" &&
    !active &&
    !spectatorPredicted &&
    (self ? Boolean(self.predictionAvailable) : true);
  const canUseIntentRelic = Boolean(active && phase === "intent");
  const reactionVictim = Boolean(
    phase === "reaction" &&
      room.pendingReaction &&
      room.pendingReaction.victimSeat === self?.seat,
  );
  // Per-relic, per-phase legality mirroring the authority: Quiet Bell and
  // Foxfire Lens act during the owner's Intent; Mirror Shard also answers
  // during the owner's own harmful reaction window.
  const relicLegal = (relicId: string) => {
    if (relicId === "mirror-shard") {
      return canUseIntentRelic || (reactionVictim && active);
    }
    return canUseIntentRelic;
  };
  // Mirrors the authority's HARM_FIELDS: Echoes, Resolve, and movement.
  const reactionHarm = ["deltaEchoes", "deltaResolve", "move"]
    .map((field) =>
      Math.max(
        0,
        -Number(
          (room.pendingReaction?.event as Record<string, unknown> | undefined)?.[
            field
          ] || 0,
        ),
      ),
    )
    .reduce((total, amount) => total + amount, 0);
  const selfMirrorShard = Boolean(
    self?.relics.some((relic) => relic.id === "mirror-shard"),
  );
  const intent = room.turn?.intent || null;
  const bindTarget =
    room.turn?.bindTargetSeat === null || room.turn?.bindTargetSeat === undefined
      ? null
      : room.players[room.turn.bindTargetSeat];
  const freeBend = room.turn?.omen === "door" && !room.turn?.freeBendUsed;
  const natural = room.turn?.naturalRoll || 1;
  // Edge results collapse: never present a paid Bend whose destination equals
  // the natural result (the authority rejects those as no-ops).
  const bendOptions = [-1, 0, 1]
    .map((delta) => {
      const roll = Math.max(1, Math.min(6, natural + delta));
      const destination = room.turn?.reachable?.find(
        (candidate) => candidate.roll === roll,
      );
      return { delta, roll, destination };
    })
    .filter(({ delta, roll }) => delta === 0 || roll !== natural);
  const previews = room.turn?.intentPreviews;
  const classCounts = (["light", "threshold", "teeth"] as SpaceClass[]).map(
    (kind) => ({
      kind,
      count: (room.turn?.reachable || []).filter(
        (destination) => destination.class === kind,
      ).length,
    }),
  );
  const maxClassCount = Math.max(...classCounts.map(({ count }) => count), 0);
  const reactionPriority = room.pendingReaction?.priority || null;
  const priorityHolder =
    reactionPriority === null ? null : room.players[reactionPriority.seat];
  // Veil chooses the EXACT consequence to cancel when several harms exist.
  const veilHarmChoices =
    phase === "reaction" && room.pendingReaction
      ? (
          [
            ["deltaEchoes", "Echo loss"],
            ["deltaResolve", "Resolve loss"],
            ["move", "Forced movement"],
          ] as const
        )
          .map(([field, label]) => ({
            field,
            label,
            amount: Math.abs(
              Math.min(
                0,
                Number(
                  (room.pendingReaction?.event as Record<string, unknown>)[
                    field
                  ] || 0,
                ),
              ),
            ),
          }))
          .filter((candidate) => candidate.amount > 0)
      : [];
  // Ember's Carry the Flame preview: destination, class, Static, Hearth.
  const emberPreview = (() => {
    if (!self || self.mask.id !== "ember" || natural === null) return null;
    const steps = natural + 2;
    const destination = (self.position + steps) % BOARD_SIZE;
    const kind = SPACE_KINDS[destination];
    const kindClass =
      kind === "oracle" || kind === "council"
        ? "threshold"
        : kind === "rift" || kind === "snare"
          ? "teeth"
          : "light";
    return {
      destination,
      kind,
      kindClass,
      crossesHearth: self.position + steps >= BOARD_SIZE,
    };
  })();
  const chronicleEvents = room.events || [];
  const phaseTitle: Record<string, string> = {
    intent: "READ · INTENT · WITNESS",
    bend: "NATURAL CAST · BEND",
    reaction: "RESOLVE · REACT",
    oracle: "ORACLE",
    "council-vote": "SECRET COUNCIL",
    "council-reveal": "COUNCIL REVEAL",
    fracture: "STATIC FRACTURE",
  };

  const maskPowerLegal = useMemo(() => {
    if (!self?.maskCharge || room.status !== "playing") return false;
    const timing = self.mask.active?.timing;
    return (
      (timing === "intent" && active && phase === "intent") ||
      (timing === "bend" && active && phase === "bend") ||
      (timing === "reaction" &&
        phase === "reaction" &&
        Boolean(
          self.mask.id === "veil"
            ? room.pendingReaction?.victimSeat === self.seat ||
                room.pendingReaction?.eligibleSeats.includes(self.seat)
            : room.pendingReaction?.eligibleSeats.includes(self.seat),
        ))
    );
  }, [active, phase, room, self]);

  function predict(prediction: SpaceClass) {
    setPredictedTurn(witnessKey);
    onPrediction(prediction, boldWitness);
    setBoldWitness(false);
  }

  return (
    <aside
      className={`command-rail${active ? " is-active-authority" : ""}`}
      data-phase={phase}
      data-urgent={room.status === "playing" && seconds <= 5 ? "true" : "false"}
    >
      <div className="turn-console">
        <div
          className="clock-ring"
          style={
            { "--time-progress": `${progress * 3.6}deg` } as React.CSSProperties
          }
        >
          <strong>{room.status === "playing" ? seconds : "—"}</strong>
          <span>seconds</span>
        </div>
        <div className="turn-copy">
          <small>
            {phaseTitle[phase] ||
              (room.status === "lobby"
                ? "LOBBY"
                : `TURN ${room.turnNumber} · ROUND ${room.round}`)}
          </small>
          <h2>
            {room.status === "finished"
              ? room.houseVictory
                ? "The House remembers"
                : "A traveler escaped"
              : currentPlayer
                ? `${currentPlayer.name}'s crossing`
                : "The table is quiet"}
          </h2>
          <span className={`authority-state${active ? " is-yours" : ""}`}>
            {active ? "YOUR AUTHORITY" : "OBSERVING"}
          </span>
        </div>
      </div>

      {v4 && (
        <div className="v4-state-strip">
          <span>
            <small>Phase</small>
            <b>{phase.replace("-", " ")}</b>
          </span>
          <span>
            <small>Omen</small>
            <b>{room.omen || "none"}</b>
          </span>
          <span>
            <small>Fractures</small>
            <b>{room.fractures || 0}/3</b>
          </span>
          <span>
            <small>End</small>
            <b>{room.endgame?.mode || "normal"}</b>
          </span>
        </div>
      )}

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

      {v4 && room.omen && (
        <div className={`omen-law omen-law--${room.omen}`} key={room.omen}>
          <i aria-hidden="true" className="omen-sigil" data-omen={room.omen} />
          <div>
            <span>{room.omen.toUpperCase()} OMEN</span>
            <p>{OMEN_COPY[room.omen]}</p>
          </div>
        </div>
      )}

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
        <article className={`event-card event-card--${event.tone || event.type}`}>
          <div className="event-eyebrow">
            <span>{event.severity || event.tone || "table"}</span>
            <i>{event.spaceClass || event.spaceKind || "structured event"}</i>
          </div>
          <div className="event-art" aria-hidden="true">
            <span>
              {event.severity === "critical"
                ? "✦"
                : event.tone === "danger"
                  ? "×"
                  : event.tone === "gold"
                    ? "⚿"
                    : event.tone === "council"
                      ? "6"
                      : "◇"}
            </span>
            <i />
          </div>
          <h3>{event.title}</h3>
          <p aria-live="polite">{event.body || event.summary}</p>
          {outcomes.length > 0 && (
            <div className="event-outcomes" aria-label="Event consequences">
              {outcomes.map((outcome, index) => (
                <span key={`${outcome}-${index}`}>{outcome}</span>
              ))}
            </div>
          )}

          {room.pendingChoice?.event.choices && (
            <div className="choice-stack">
              {choiceIsMine && <CoachHint topic="oracle" />}
              {room.pendingChoice.event.choices.map((choice) => (
                <button
                  disabled={!choiceIsMine || busy}
                  key={choice.id}
                  onClick={() => onChoice(choice.id)}
                  type="button"
                >
                  <span>{choice.label}</span>
                  <small>{choice.result}</small>
                  {choice.burden && <em>Future cost · {choice.burden.title}</em>}
                </button>
              ))}
            </div>
          )}

          {council?.event.choices && (
            <div className="council-stack">
              <div className="vote-progress">
                <span>
                  {council.stage === "reveal"
                    ? "Stones revealed"
                    : "Secret stones placed"}
                </span>
                <b>
                  {council.stage === "reveal"
                    ? council.revealIndex || 0
                    : votedSeats.length}
                  /{room.players.filter(Boolean).length}
                </b>
              </div>
              {council.stage !== "reveal" && self && !alreadyVoted && (
                <CoachHint topic="council" />
              )}
              {council.stage !== "reveal" &&
                council.event.choices.map((choice) => (
                  <button
                    disabled={!self || alreadyVoted || busy}
                    key={choice.id}
                    onClick={() => onCouncilVote(choice.id)}
                    type="button"
                  >
                    <span>{choice.label}</span>
                    <small>{choice.result}</small>
                    {choice.projection && (
                      <em className="council-projection">
                        NOW · {choice.projection}
                      </em>
                    )}
                  </button>
                ))}
              {council.stage === "reveal" && (
                <ol className="council-reveal-list">
                  {(council.revealedVotes || []).map((vote) => (
                    <li key={vote.seat}>
                      <MaskPortrait seat={vote.seat} small />
                      <span>{room.players[vote.seat]?.sigil}</span>
                      <b>{vote.choiceId}</b>
                    </li>
                  ))}
                </ol>
              )}
              {alreadyVoted && council.stage !== "reveal" && (
                <p className="vote-wait">
                  Your stone is placed. Its face remains hidden.
                </p>
              )}
            </div>
          )}
        </article>
      ) : (
        <section className="chronicle">
          <div className="chronicle-header">
            <span>Newest first</span>
            <b>{chronicleEvents.length || room.log.length} entries held</b>
          </div>
          <ol>
            {(chronicleEvents.length
              ? chronicleEvents.slice(-16).reverse()
              : room.log.slice(-16).reverse()
            ).map((entry, index) => (
              <li key={entry.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{"summary" in entry ? entry.summary : entry.text}</p>
              </li>
            ))}
          </ol>
          {room.chronicle && (
            <div className="chronicle-final">
              <strong>
                {room.chronicle.outcome === "house"
                  ? "THE HOUSE REMEMBERS"
                  : `${room.chronicle.winnerMask} ESCAPES`}
              </strong>
              {room.chronicle.highlights.map((highlight) => (
                <p key={highlight.id}>{highlight.title}</p>
              ))}
            </div>
          )}
        </section>
      )}

      {room.audiencePulse?.enabled && (
        <section className="audience-pulse">
          <span>Audience pulse</span>
          <div>
            {(["light", "threshold", "teeth"] as SpaceClass[]).map((kind) => (
              <i key={kind}>
                <b>{room.audiencePulse?.counts[kind] || 0}</b>
                {kind}
              </i>
            ))}
          </div>
          <small>
            {room.audiencePulse.revealed
              ? `${room.audiencePulse.accuracy === null ? 0 : Math.round(
                  room.audiencePulse.accuracy * 100,
                )}% correct`
              : "Predictions remain hidden until the cast."}
          </small>
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
            <b className={`mask-charge${self.maskCharge ? " is-ready" : ""}`}>
              {self.maskCharge ? "CHARGED" : "SPENT"}
            </b>
          </div>
          <div className="rack-resources">
            <Pips value={self.focus} max={3} label="Focus" kind="focus" />
            <Pips value={self.resolve} max={3} label="Resolve" kind="resolve" />
          </div>
          <div className="rack-status">
            <span className={self.warded ? "is-active" : ""}>
              <i>◇</i>
              {self.warded ? "Ward armed" : "No ward"}
            </span>
            <span className={self.exposed ? "is-exposed" : ""}>
              <i>{self.exposed ? "!" : "·"}</i>
              {self.exposed ? "EXPOSED" : "Resolve holds"}
            </span>
            <span className={(self.goldenThreads || 0) > 0 ? "is-active" : ""}>
              <i>⌁</i>
              {self.goldenThreads || 0} Golden Threads
            </span>
          </div>
          <div className="vow-card">
            <div>
              <small>Behavioral vow</small>
              <strong>{self.vow.title}</strong>
            </div>
            <span>
              {self.vow.complete
                ? "FULFILLED"
                : `${self.vow.progress}/${self.vow.target}`}
            </span>
            <i>
              <b
                style={{
                  width: `${Math.min(
                    100,
                    (self.vow.progress / self.vow.target) * 100,
                  )}%`,
                }}
              />
            </i>
            <p>{self.vow.description || "Chosen behavior advances this vow."}</p>
            <small>Reward · +3 Echoes, +1 Focus, recharge active</small>
          </div>
          <div className="relic-slots">
            <span>Relics · {self.relics.length}/2</span>
            <div>
              {self.relics.map((relic) => (
                <button
                  disabled={!relicLegal(relic.id) || busy}
                  key={relic.id}
                  onClick={() =>
                    relic.id === "foxfire-lens"
                      ? setFoxfirePickerOpen(true)
                      : onUseRelic(relic.id)
                  }
                  title={relic.description}
                  type="button"
                >
                  <b>{relic.mark}</b>
                  <span>{relic.title}</span>
                  <small>{relic.description}</small>
                </button>
              ))}
              {Array.from(
                { length: Math.max(0, 2 - self.relics.length) },
                (_, index) => (
                  <span className="empty-relic" key={index}>
                    <b>·</b>
                    Empty reliquary
                  </span>
                ),
              )}
            </div>
            {foxfirePickerOpen && (
              <RollPicker
                busy={busy}
                hint="The Lens burns away when the two roads are revealed."
                onCancel={() => setFoxfirePickerOpen(false)}
                onConfirm={(results) => {
                  setFoxfirePickerOpen(false);
                  onUseRelic("foxfire-lens", { results });
                }}
                room={room}
                title="FOXFIRE LENS"
              />
            )}
          </div>
        </section>
      )}

      <section
        className="action-dock"
        aria-label="Available actions"
        data-action-phase={phase}
        data-self-active={active ? "true" : "false"}
      >
        {room.status === "lobby" && isHost && (
          <>
            <button
              className="game-button game-button--primary"
              onClick={onStart}
              disabled={busy}
              type="button"
            >
              <span className="button-icon">◆</span>
              <span>
                <b>Begin the crossing</b>
                <small>Lock masks and start the authority clock</small>
              </span>
            </button>
            {room.players.some((player) => player === null) && (
              <button
                className="game-button"
                onClick={onAddBot}
                disabled={busy}
                type="button"
              >
                <span className="button-icon">◌</span>
                <span>
                  <b>Call an Echo traveler</b>
                  <small>Seat one server-controlled mask</small>
                </span>
              </button>
            )}
          </>
        )}

        {v4 &&
          room.status === "playing" &&
          phase === "intent" &&
          active &&
          !intent && (
            <div className="phase-actions intent-actions">
              <span>Choose before the server cast</span>
              <CoachHint topic="intent" />
              <div className="intent-grid">
                {(Object.keys(INTENT_COPY) as Intent[]).map((intent) => (
                  <button
                    aria-pressed={room.turn?.intent === intent}
                    className={`intent-choice intent-choice--${intent}`}
                    disabled={busy}
                    key={intent}
                    onBlur={() => onPreviewIntent?.(null)}
                    onClick={() => {
                      if (intent === "bind") setBindOpen(true);
                      else onIntent(intent);
                    }}
                    onFocus={() => onPreviewIntent?.(intent)}
                    onMouseEnter={() => onPreviewIntent?.(intent)}
                    onMouseLeave={() => onPreviewIntent?.(null)}
                    type="button"
                  >
                    <em aria-hidden="true">{INTENT_MARKS[intent]}</em>
                    <span>
                      <b>{INTENT_COPY[intent].title}</b>
                      <small>{INTENT_COPY[intent].body}</small>
                      {previews && (
                        <i className="intent-forecast">
                          {intent === "bind"
                            ? previews.annotations.bind.teeth
                            : classCounts
                                .filter(({ count }) => count > 0)
                                .map(
                                  ({ kind, count }) =>
                                    `${kind.toUpperCase()} ×${count}`,
                                )
                                .join(" · ")}
                        </i>
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {bindOpen && self && (
                <div className="bind-targets">
                  <span>Bind to one occupied mask</span>
                  {(previews?.bindTargets || [])
                    .filter((target) => target.seat !== self.seat)
                    .map((target) => (
                      <button
                        className="bind-target-dossier"
                        disabled={busy}
                        key={target.seat}
                        onClick={() => {
                          onIntent("bind", target.seat);
                          setBindOpen(false);
                        }}
                        type="button"
                      >
                        <b>
                          {target.sigil} · {target.name}
                        </b>
                        <small>
                          {target.echoes} Echoes · {target.resolve} Resolve ·{" "}
                          {target.threadStrength > 0
                            ? `Thread ×${target.threadStrength}`
                            : "No thread yet"}
                        </small>
                        <em>
                          {target.qualified
                            ? "ALREADY QUALIFIED"
                            : `Needs ${target.needs.echoes}E · ${target.needs.keys}K · ${target.needs.circuits}C`}
                          {" · LIGHT gifts them an Echo · first Oxygen claim"}
                        </em>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

        {v4 && room.status === "playing" && phase === "intent" && active && intent && (
          <div className="phase-actions intent-locked-actions">
            <CoachHint topic="cast" />
            <div className="intent-locked-summary" role="status">
              <em aria-hidden="true">{INTENT_MARKS[intent]}</em>
              <span>
                <small>Intent locked · immutable this turn</small>
                <b>
                  {INTENT_COPY[intent].title}
                  {intent === "bind" && bindTarget
                    ? ` → ${bindTarget.sigil} ${bindTarget.name}`
                    : ""}
                </b>
              </span>
            </div>
            <button
              className="game-button game-button--primary cast-now"
              disabled={busy}
              onClick={onCast}
              type="button"
            >
              <span className="button-icon">◆</span>
              <span>
                <b>Cast the bone</b>
                <small>The authority rolls the natural d6 now</small>
              </span>
            </button>
          </div>
        )}

        {canPredict && (
          <div className="phase-actions witness-actions">
            <span>WITNESS · predict the natural destination class</span>
            <CoachHint topic="witness" />
            <div>
              {(["light", "threshold", "teeth"] as SpaceClass[]).map(
                (prediction) => {
                  const count =
                    classCounts.find(({ kind }) => kind === prediction)
                      ?.count || 0;
                  const minority = count > 0 && count < maxClassCount;
                  return (
                    <button
                      className={`witness-choice witness-choice--${prediction}${
                        boldWitness && !minority ? " is-bold-blocked" : ""
                      }`}
                      disabled={busy || count === 0}
                      key={prediction}
                      onClick={() => predict(prediction)}
                      type="button"
                    >
                      <b>
                        {prediction} ×{count}
                      </b>
                      <small>
                        {WITNESS_COPY[prediction]}
                        {minority ? " · minority" : ""}
                      </small>
                    </button>
                  );
                },
              )}
            </div>
            {self && (
              <label className="bold-witness-toggle">
                <input
                  checked={boldWitness}
                  onChange={(event) => setBoldWitness(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <b>Swear a BOLD call</b>
                  <small>
                    A correct minority-road call pays +1 Echo with the Focus.
                  </small>
                </span>
              </label>
            )}
            <small>Correct once per round: +1 Focus.</small>
          </div>
        )}

        {v4 && phase === "bend" && active && (
          <div className="phase-actions bend-actions">
            <span>
              NATURAL {room.turn?.naturalRoll} · choose final destination
            </span>
            <div className="bend-destinations">
              {bendOptions.map(({ delta, roll, destination }) => (
                <button
                  className={`bend-destination road-class--${destination?.class || "light"}${delta === 0 ? " is-natural" : ""}`}
                  disabled={
                    busy || (delta !== 0 && !freeBend && (self?.focus || 0) < 1)
                  }
                  key={delta}
                  onClick={() => onBend(delta)}
                  type="button"
                >
                  <em>{delta === 0 ? "ACCEPT" : delta < 0 ? "−1" : "+1"}</em>
                  <b>
                    {roll} · {destination ? KIND_NAMES[destination.kind] : "Road"}
                  </b>
                  <small>
                    {destination?.class || "light"}
                    {delta === 0
                      ? " · natural"
                      : freeBend
                        ? " · DOOR · free"
                        : " · 1 Focus"}
                  </small>
                </button>
              ))}
            </div>
            {room.turn?.ashAlternative && (
              <button
                className="ash-alternative"
                disabled={busy}
                onClick={() => onBend(0, true)}
                type="button"
              >
                LAST WITNESS · {room.turn.ashAlternative.title}
              </button>
            )}
          </div>
        )}

        {!v4 && active && room.status === "playing" && room.lastRoll && (
          <div className="phase-actions bend-actions">
            <span>
              LEGACY TUNING · CAST {room.lastRoll.naturalDie ?? room.lastRoll.die}
            </span>
            <div>
              <button
                disabled={busy || (self?.focus || 0) < 1}
                onClick={() => onLegacyTune(-1)}
                type="button"
              >
                −1 <small>spend Focus</small>
              </button>
              <button
                disabled={busy || (self?.focus || 0) < 1}
                onClick={() => onLegacyTune(1)}
                type="button"
              >
                +1 <small>spend Focus</small>
              </button>
            </div>
          </div>
        )}

        {v4 && phase === "reaction" && (
          <div className="phase-actions reaction-actions">
            <span>
              {room.players[room.pendingReaction?.victimSeat || 0]?.name} faces{" "}
              {room.pendingReaction?.event.title}
              {reactionHarm > 0 ? ` · ${reactionHarm} harm` : ""}
            </span>
            {self?.oxygenAvailable && <CoachHint topic="reaction" />}
            {reactionPriority && priorityHolder && (
              <small
                className={`oxygen-priority-note${
                  self?.seat === reactionPriority.seat ? " is-yours" : ""
                }`}
              >
                {self?.seat === reactionPriority.seat
                  ? "The Golden Thread gives YOU first claim on this rescue."
                  : `${priorityHolder.sigil} ${priorityHolder.name} holds the bound first claim for a moment.`}
              </small>
            )}
            {self?.oxygenAvailable && (
              <button disabled={busy} onClick={onGiveOxygen} type="button">
                GIVE OXYGEN
                <small>Prevent 2 harm · pay Resolve, then Echo</small>
              </button>
            )}
            {reactionVictim && selfMirrorShard && (
              <button
                className="mirror-shard-reaction"
                disabled={busy}
                onClick={() => onUseRelic("mirror-shard")}
                type="button"
              >
                MIRROR SHARD
                <small>
                  Turn the glass now · prevent up to 2 of {reactionHarm} harm ·
                  consumes the relic
                </small>
              </button>
            )}
            {!self?.oxygenAvailable && !(reactionVictim && selfMirrorShard) && (
              <small>First valid helper resolves this five-second window.</small>
            )}
          </div>
        )}

        {maskPowerLegal && self?.mask.active && (
          <div className="phase-actions mask-power-actions">
            <span>{self.mask.active.title}</span>
            <p>{self.mask.active.description}</p>
            {self.mask.id === "thorn" ? (
              <div>
                {[-1, 1]
                  .filter(
                    (delta) =>
                      Math.max(1, Math.min(6, natural + delta)) !== natural,
                  )
                  .map((delta) => {
                    const roll = Math.max(1, Math.min(6, natural + delta));
                    const destination = room.turn?.reachable?.find(
                      (candidate) => candidate.roll === roll,
                    );
                    return (
                      <button
                        disabled={busy}
                        key={delta}
                        onClick={() => onMaskPower({ delta })}
                        type="button"
                      >
                        CROOKED {delta < 0 ? "−1" : "+1"}
                        <small>
                          {roll} ·{" "}
                          {destination
                            ? `${KIND_NAMES[destination.kind]} · ${destination.class.toUpperCase()}`
                            : "Road"}
                        </small>
                      </button>
                    );
                  })}
              </div>
            ) : self.mask.id === "moon" ? (
              moonPickerOpen ? (
                <RollPicker
                  busy={busy}
                  hint="The exact events under your two chosen roads become public knowledge."
                  onCancel={() => setMoonPickerOpen(false)}
                  onConfirm={(results) => {
                    setMoonPickerOpen(false);
                    onMaskPower({ results });
                  }}
                  room={room}
                  title="HEAR WHAT COMES NEXT"
                />
              ) : (
                <button
                  disabled={busy}
                  onClick={() => setMoonPickerOpen(true)}
                  type="button"
                >
                  CHOOSE TWO ROADS TO HEAR
                </button>
              )
            ) : self.mask.id === "veil" && veilHarmChoices.length > 0 ? (
              <div className="veil-cut-choices">
                {veilHarmChoices.map((candidate) => (
                  <button
                    disabled={busy}
                    key={candidate.field}
                    onClick={() => onMaskPower({ field: candidate.field })}
                    type="button"
                  >
                    CUT {candidate.label.toUpperCase()}
                    <small>
                      Cancel {candidate.amount}{" "}
                      {candidate.label.toLowerCase()} · +1 Echo · +1 Static
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <button
                disabled={busy}
                onClick={() => onMaskPower()}
                type="button"
              >
                USE {self.mask.active.title.toUpperCase()}
              </button>
            )}
            {self.mask.id === "ember" && phase === "bend" && emberPreview && (
              <small className="ember-preview">
                Flame path → space{" "}
                {String(emberPreview.destination + 1).padStart(2, "0")} ·{" "}
                {KIND_NAMES[emberPreview.kind]} ·{" "}
                {emberPreview.kindClass.toUpperCase()} · +2 Static
                {emberPreview.crossesHearth
                  ? " · crosses the Hearth (+2 Echoes)"
                  : ""}
              </small>
            )}
          </div>
        )}

        {v4 && active && phase === "intent" && self && (
          <div className="gift-actions">
            <span>Give one Echo · once this turn</span>
            <div>
              {room.players
                .filter(
                  (player): player is Player =>
                    Boolean(player && player.id !== self.id),
                )
                .map((player) => (
                  <button
                    disabled={self.echoes < 1 || busy}
                    key={player.id}
                    onClick={() => onGift(player.seat)}
                    type="button"
                  >
                    {player.sigil}
                  </button>
                ))}
            </div>
          </div>
        )}

        {room.status === "playing" &&
          !active &&
          !canPredict &&
          phase !== "reaction" &&
          phase !== "council-vote" && (
            <div className="waiting-plaque">
              <i>◌</i>
              <span>
                <b>Watch the crossing</b>
                <small>
                  {phase.replace("-", " ")} ·{" "}
                  {currentPlayer?.name || "the next mask"}
                </small>
              </span>
            </div>
          )}

        {isHost && v4 && (
          <button
            aria-pressed={Boolean(room.streamerMode)}
            className="streamer-toggle"
            onClick={() => onStreamerMode(!room.streamerMode)}
            type="button"
          >
            Audience pulse {room.streamerMode ? "on" : "off"}
          </button>
        )}

        {room.status === "finished" && isHost && (
          <button
            className="game-button game-button--primary"
            onClick={onStart}
            disabled={busy}
            type="button"
          >
            <span className="button-icon">↻</span>
            <span>
              <b>Open another road</b>
              <small>Reset resources, vows, and positions</small>
            </span>
          </button>
        )}
      </section>
    </aside>
  );
}
