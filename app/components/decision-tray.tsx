import { useEffect, useMemo, useRef, useState } from "react";
import { BOARD_SIZE, KIND_NAMES, SPACE_KINDS } from "../game-data";
import type { Intent, Player, RoomState, SpaceClass } from "../game-types";
import { RollPicker } from "./roll-picker";

const INTENT_LABELS: Record<
  Intent,
  { mark: string; title: string; hint: string }
> = {
  claim: { mark: "▲", title: "CLAIM", hint: "Press for reward" },
  shelter: { mark: "⬡", title: "SHELTER", hint: "Reduce visible harm" },
  bind: { mark: "∞", title: "BIND", hint: "Tie routes together" },
};

const WITNESS_HINTS: Record<SpaceClass, string> = {
  light: "Reward road",
  threshold: "Oracle or Council",
  teeth: "Rift or Snare",
};

/**
 * The Decision Tray keeps the CURRENT legal decision, its cost, and the
 * authority timer visible without scrolling — the board may stay above it,
 * but a five-second Bend or Oxygen window must never sit off-screen. It is
 * derived purely from public room state; the authority still owns every
 * outcome. Rendered as a fixed dock on compact layouts via entity-v5.css.
 */
export function DecisionTray({
  room,
  self,
  busy,
  onIntent,
  onCast,
  onBend,
  onPrediction,
  onGiveOxygen,
  onMaskPower,
  onUseRelic,
  onChoice,
  onCouncilVote,
}: {
  room: RoomState;
  self: Player | null;
  busy: boolean;
  onIntent: (intent: Intent, targetSeat?: number) => void;
  onCast: () => void;
  onBend: (delta: number, useAshEvent?: boolean) => void;
  onPrediction: (prediction: SpaceClass, bold?: boolean) => void;
  onGiveOxygen: () => void;
  onMaskPower: (payload?: Record<string, unknown>) => void;
  onUseRelic: (id: string, extra?: Record<string, unknown>) => void;
  onChoice: (id: string) => void;
  onCouncilVote: (id: string) => void;
}) {
  const [bindOpen, setBindOpen] = useState(false);
  const [heldReaction, setHeldReaction] = useState<string | null>(null);
  const [witnessedTurn, setWitnessedTurn] = useState<string | null>(null);
  const [boldWitness, setBoldWitness] = useState(false);
  const [moonPickerOpen, setMoonPickerOpen] = useState(false);

  const phase = room.phase || "intent";
  const active = Boolean(self && room.currentSeat === self.seat);
  const seconds = room.secondsLeft ?? null;
  const phaseBudget =
    room.phaseBudgets?.[phase] ??
    (phase === "bend" || phase === "reaction"
      ? 5
      : phase === "fracture"
        ? 3
        : phase === "council-reveal"
          ? 1
          : 61);
  const urgent = seconds !== null && seconds <= 5;
  const intent = room.turn?.intent || null;
  const natural = room.turn?.naturalRoll || null;
  const currentPlayer =
    room.currentSeat === null ? null : room.players[room.currentSeat];
  const witnessKey = room.turn?.id || `${room.round}:${room.turnNumber}`;

  const bendOptions = useMemo(() => {
    if (natural === null) return [];
    return [-1, 0, 1]
      .map((delta) => {
        const roll = Math.max(1, Math.min(6, natural + delta));
        const destination = room.turn?.reachable?.find(
          (candidate) => candidate.roll === roll,
        );
        return { delta, roll, destination };
      })
      .filter(({ delta, roll }) => delta === 0 || roll !== natural);
  }, [natural, room.turn?.reachable]);

  if (!self || room.status !== "playing") return null;

  const reaction = room.pendingReaction || null;
  const reactionVictim = Boolean(reaction && reaction.victimSeat === self.seat);
  // Mirrors the authority's HARM_FIELDS: Echoes, Resolve, and movement.
  const reactionHarm = reaction
    ? ["deltaEchoes", "deltaResolve", "move"]
        .map((field) =>
          Math.max(
            0,
            -Number((reaction.event as Record<string, unknown>)[field] || 0),
          ),
        )
        .reduce((total, amount) => total + amount, 0)
    : 0;
  const hasMirrorShard = self.relics.some(
    (relic) => relic.id === "mirror-shard",
  );
  const freeBend = room.turn?.omen === "door" && !room.turn?.freeBendUsed;
  const bindTarget =
    room.turn?.bindTargetSeat === null ||
    room.turn?.bindTargetSeat === undefined
      ? null
      : room.players[room.turn.bindTargetSeat];
  const council = room.pendingCouncil;
  const votedSeats =
    council?.votedSeats || Object.keys(council?.votes || {}).map(Number);
  const alreadyVoted = votedSeats.includes(self.seat);
  const oracleMine = room.pendingChoice?.seat === self.seat;
  const canWitness =
    phase === "intent" &&
    !active &&
    Boolean(self.predictionAvailable) &&
    witnessedTurn !== witnessKey;
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
  const priority = reaction?.priority || null;
  const priorityHolder = priority === null ? null : room.players[priority.seat];
  const emberPreview = (() => {
    if (self.mask.id !== "ember" || natural === null) return null;
    const steps = natural + 2;
    const destination = (self.position + steps) % BOARD_SIZE;
    const kind = SPACE_KINDS[destination];
    return {
      kind,
      crossesHearth: self.position + steps >= BOARD_SIZE,
    };
  })();

  let decisionLabel = "";
  let body: React.ReactNode = null;

  if (phase === "intent" && active && !intent) {
    decisionLabel = "Choose your Intent";
    body = (
      <>
        <div aria-label="The six roads by class" className="tray-class-strip">
          {classCounts
            .filter(({ count }) => count > 0)
            .map(({ kind, count }) => (
              <i className={`road-class--${kind}`} key={kind}>
                {kind.toUpperCase()} ×{count}
              </i>
            ))}
        </div>
        <div className="tray-row tray-row--three">
          {(Object.keys(INTENT_LABELS) as Intent[]).map((choice) => (
            <button
              className={`tray-button tray-intent tray-intent--${choice}`}
              disabled={busy}
              key={choice}
              onClick={() => {
                if (choice === "bind") setBindOpen((value) => !value);
                else onIntent(choice);
              }}
              type="button"
            >
              <em aria-hidden="true">{INTENT_LABELS[choice].mark}</em>
              <b>{INTENT_LABELS[choice].title}</b>
              <small>{INTENT_LABELS[choice].hint}</small>
            </button>
          ))}
        </div>
        {bindOpen && (
          <div className="tray-row tray-row--targets">
            {(previews?.bindTargets || [])
              .filter((target) => target.seat !== self.seat)
              .map((target) => (
                <button
                  className="tray-button tray-target"
                  disabled={busy}
                  key={target.seat}
                  onClick={() => {
                    onIntent("bind", target.seat);
                    setBindOpen(false);
                  }}
                  type="button"
                >
                  <b>{target.sigil}</b>
                  <small>
                    {target.echoes}E · {target.resolve}R
                    {target.threadStrength > 0
                      ? ` · ⌁${target.threadStrength}`
                      : ""}
                  </small>
                </button>
              ))}
          </div>
        )}
        {self.maskCharge === 1 && self.mask.id === "moon" && (
          <div className="tray-row">
            {moonPickerOpen ? (
              <RollPicker
                busy={busy}
                compact
                hint="Both revealed events become public knowledge."
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
                className="tray-button tray-power"
                disabled={busy}
                onClick={() => setMoonPickerOpen(true)}
                type="button"
              >
                <b>HEAR TWO ROADS</b>
                <small>Moon&apos;s charge · choose the reveals yourself</small>
              </button>
            )}
          </div>
        )}
      </>
    );
  } else if (phase === "intent" && active && intent) {
    decisionLabel = `Intent locked · ${intent.toUpperCase()}${
      intent === "bind" && bindTarget ? ` → ${bindTarget.sigil}` : ""
    }`;
    body = (
      <div className="tray-row">
        <button
          className="tray-button tray-cast"
          disabled={busy}
          onClick={onCast}
          type="button"
        >
          <em aria-hidden="true">◆</em>
          <b>CAST THE BONE</b>
          <small>Server rolls the natural d6</small>
        </button>
      </div>
    );
  } else if (phase === "intent" && canWitness) {
    decisionLabel = `Witness ${currentPlayer?.name || "the cast"} · predict the class`;
    body = (
      <>
        <div className="tray-row tray-row--three">
          {(["light", "threshold", "teeth"] as SpaceClass[]).map(
            (prediction) => {
              const count =
                classCounts.find(({ kind }) => kind === prediction)?.count || 0;
              const minority = count > 0 && count < maxClassCount;
              return (
                <button
                  className={`tray-button tray-witness tray-witness--${prediction}`}
                  disabled={busy || count === 0}
                  key={prediction}
                  onClick={() => {
                    setWitnessedTurn(witnessKey);
                    onPrediction(prediction, boldWitness);
                    setBoldWitness(false);
                  }}
                  type="button"
                >
                  <b>
                    {prediction.toUpperCase()} ×{count}
                  </b>
                  <small>
                    {WITNESS_HINTS[prediction]}
                    {minority ? " · minority" : ""}
                  </small>
                </button>
              );
            },
          )}
        </div>
        <div className="tray-row">
          <button
            aria-pressed={boldWitness}
            className={`tray-button tray-bold-toggle${boldWitness ? " is-armed" : ""}`}
            disabled={busy}
            onClick={() => setBoldWitness((value) => !value)}
            type="button"
          >
            <b>{boldWitness ? "BOLD CALL ARMED" : "SWEAR A BOLD CALL"}</b>
            <small>Correct minority road pays +1 Echo with the Focus</small>
          </button>
        </div>
      </>
    );
  } else if (phase === "bend" && active) {
    decisionLabel = `Natural ${natural} · Bend or accept`;
    body = (
      <>
        <div
          className={`tray-row ${bendOptions.length >= 3 ? "tray-row--three" : "tray-row--two"}`}
        >
          {bendOptions.map(({ delta, roll, destination }) => (
            <button
              className={`tray-button tray-bend road-class--${destination?.class || "light"}${
                delta === 0 ? " is-natural" : ""
              }`}
              disabled={busy || (delta !== 0 && !freeBend && self.focus < 1)}
              key={delta}
              onClick={() => onBend(delta)}
              type="button"
            >
              <em>{delta === 0 ? "ACCEPT" : delta < 0 ? "−1" : "+1"}</em>
              <b>
                {roll} · {destination ? KIND_NAMES[destination.kind] : "Road"}
              </b>
              <small>
                {(destination?.class || "light").toUpperCase()}
                {delta === 0 ? "" : freeBend ? " · free" : " · 1 Focus"}
              </small>
            </button>
          ))}
        </div>
        {self.maskCharge === 1 && self.mask.id === "ember" && (
          <div className="tray-row">
            <button
              className="tray-button tray-power"
              disabled={busy}
              onClick={() => onMaskPower()}
              type="button"
            >
              <b>CARRY THE FLAME</b>
              <small>
                {emberPreview
                  ? `→ ${KIND_NAMES[emberPreview.kind]}${emberPreview.crossesHearth ? " · crosses the Hearth +2E" : ""} · +2 Static`
                  : "Move natural +2 · +2 Static · spends the charge"}
              </small>
            </button>
          </div>
        )}
        {self.maskCharge === 1 && self.mask.id === "thorn" && (
          <div className="tray-row tray-row--two">
            {[-1, 1]
              .filter(
                (delta) =>
                  natural !== null &&
                  Math.max(1, Math.min(6, natural + delta)) !== natural,
              )
              .map((delta) => (
                <button
                  className="tray-button tray-power"
                  disabled={busy}
                  key={delta}
                  onClick={() => onMaskPower({ delta })}
                  type="button"
                >
                  <b>CROOKED {delta < 0 ? "−1" : "+1"}</b>
                  <small>Free edge · spends the charge</small>
                </button>
              ))}
          </div>
        )}
        {room.turn?.ashAlternative && (
          <div className="tray-row">
            <button
              className="tray-button tray-power"
              disabled={busy}
              onClick={() => onBend(0, true)}
              type="button"
            >
              <b>LAST WITNESS</b>
              <small>{room.turn.ashAlternative.title}</small>
            </button>
          </div>
        )}
      </>
    );
  } else if (phase === "reaction" && reaction && heldReaction !== reaction.id) {
    const victimName = room.players[reaction.victimSeat]?.name || "A traveler";
    if (self.oxygenAvailable) {
      const iAmBound = priority?.seat === self.seat;
      decisionLabel = iAmBound
        ? `${victimName} faces ${reactionHarm} harm · YOUR bound claim`
        : `${victimName} faces ${reactionHarm} harm`;
      body = (
        <>
          {priority && priorityHolder && !iAmBound && (
            <div className="tray-priority-note">
              {priorityHolder.sigil} {priorityHolder.name} holds the bound first
              claim for a moment.
            </div>
          )}
          <div className="tray-row tray-row--two">
            <button
              className="tray-button tray-oxygen"
              disabled={busy}
              onClick={onGiveOxygen}
              type="button"
            >
              <b>GIVE OXYGEN</b>
              <small>
                Prevent 2 harm · Resolve, then Echo · forms a Thread
              </small>
            </button>
            <button
              className="tray-button tray-hold"
              disabled={busy}
              onClick={() => setHeldReaction(reaction.id)}
              type="button"
            >
              <b>HOLD</b>
              <small>Keep your resources this time</small>
            </button>
          </div>
        </>
      );
    } else if (reactionVictim && hasMirrorShard) {
      decisionLabel = `You face ${reactionHarm} harm`;
      body = (
        <div className="tray-row">
          <button
            className="tray-button tray-oxygen"
            disabled={busy}
            onClick={() => onUseRelic("mirror-shard")}
            type="button"
          >
            <b>MIRROR SHARD</b>
            <small>
              Prevent up to 2 of {reactionHarm} harm · consumes relic
            </small>
          </button>
        </div>
      );
    }
  } else if (
    phase === "oracle" &&
    oracleMine &&
    room.pendingChoice?.event.choices
  ) {
    decisionLabel = "The Oracle waits on your answer";
    body = (
      <div
        className={`tray-row ${
          room.pendingChoice.event.choices.length >= 3
            ? "tray-row--three"
            : "tray-row--two"
        }`}
      >
        {room.pendingChoice.event.choices.map((choice) => (
          <button
            className="tray-button tray-choice"
            disabled={busy}
            key={choice.id}
            onClick={() => onChoice(choice.id)}
            type="button"
          >
            <b>{choice.label}</b>
            <small>{choice.result}</small>
          </button>
        ))}
      </div>
    );
  } else if (
    phase === "council-vote" &&
    council?.event.choices &&
    council.stage !== "reveal" &&
    !alreadyVoted
  ) {
    decisionLabel = "Place your secret stone";
    body = (
      <div className="tray-row tray-row--three">
        {council.event.choices.map((choice) => (
          <button
            className="tray-button tray-choice"
            disabled={busy}
            key={choice.id}
            onClick={() => onCouncilVote(choice.id)}
            type="button"
          >
            <b>{choice.label}</b>
            <small>{choice.projection || choice.result}</small>
          </button>
        ))}
      </div>
    );
  }

  return (
    <TrayShell
      body={body}
      decisionLabel={decisionLabel}
      mine={active || canWitness || oracleMine || Boolean(reaction)}
      phase={phase}
      phaseBudget={phaseBudget}
      seconds={seconds}
      turnKey={[
        witnessKey,
        phase,
        intent ? "locked" : "open",
        room.pendingChoice?.event?.id ?? "",
        room.pendingReaction?.id ?? "",
        room.council?.stage ?? "",
      ].join("|")}
      urgent={urgent}
    />
  );
}

/**
 * Wraps the live decision so it can take focus when it opens.
 *
 * A five-second Bend window is useless to anyone driving by keyboard if
 * reaching it costs eleven tab presses. When a decision that belongs to
 * this player appears, focus moves to its first choice — but only on the
 * transition into that decision, never on the re-renders the clock causes,
 * or the player would be thrown back to the first button every second.
 */
function TrayShell({
  body,
  decisionLabel,
  mine,
  phase,
  phaseBudget,
  seconds,
  turnKey,
  urgent,
}: {
  body: React.ReactNode;
  decisionLabel: string;
  mine: boolean;
  phase: string;
  phaseBudget: number;
  seconds: number | null;
  turnKey: string;
  urgent: boolean;
}) {
  const shellRef = useRef<HTMLElement | null>(null);
  const claimed = useRef<string | null>(null);

  useEffect(() => {
    if (!body || !mine) return;
    const gate = `${turnKey}:${phase}`;
    if (claimed.current === gate) return;
    claimed.current = gate;
    // Only pull focus if it is still sitting somewhere incidental. A player
    // who has deliberately tabbed elsewhere keeps their place.
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      shellRef.current?.contains(active)
    ) {
      return;
    }
    const first = shellRef.current?.querySelector<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled])",
    );
    first?.focus({ preventScroll: true });
  }, [body, mine, phase, turnKey]);

  if (!body) return null;

  return (
    <section
      aria-label="Decision tray"
      aria-live="polite"
      className={`decision-tray${urgent ? " is-urgent" : ""}`}
      data-phase={phase}
      ref={shellRef}
    >
      <header className="tray-status">
        <span aria-live="polite">{decisionLabel}</span>
        <b
          aria-label={
            seconds === null ? "No timer" : `${seconds} seconds remaining`
          }
          className="tray-clock"
          style={
            {
              "--tray-progress": `${
                seconds === null
                  ? 0
                  : Math.max(0, Math.min(100, (seconds / phaseBudget) * 100))
              }%`,
            } as React.CSSProperties
          }
        >
          {seconds === null ? "—" : seconds}
        </b>
      </header>
      {body}
    </section>
  );
}
