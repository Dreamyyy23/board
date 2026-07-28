"use client";

import { useEffect, useRef, useState } from "react";
import type { Player, RoomState } from "../game-types";
import { MaskPortrait } from "./mask-portrait";

const BANNER_MS = 1_900;

/**
 * A short cinematic stinger when authority changes hands: the incoming
 * mask's portrait sweeps in with their name and the phase kicker, then
 * yields. Pure presentation over public state — it never blocks input,
 * never pauses the clock, and skips itself under reduced motion.
 */
export function TurnBanner({ room }: { room: RoomState }) {
  const [banner, setBanner] = useState<{
    player: Player;
    turnNumber: number;
    mode: string;
  } | null>(null);
  const lastTurnRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const turnId = room.turn?.id || null;
  const currentSeat = room.currentSeat;
  const status = room.status;
  const mode = room.turn?.mode || "normal";

  useEffect(() => {
    if (status !== "playing" || turnId === null || currentSeat === null) return;
    if (lastTurnRef.current === turnId) return;
    const isFirstObservedTurn = lastTurnRef.current === null;
    lastTurnRef.current = turnId;
    // Don't replay a banner for the turn already in progress on reconnect.
    if (isFirstObservedTurn && room.turnNumber > 1) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const player = room.players[currentSeat];
    if (!player) return;
    const snapshot = { player, turnNumber: room.turnNumber, mode };
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const showTimer = window.setTimeout(() => {
      setBanner(snapshot);
      timerRef.current = window.setTimeout(() => setBanner(null), BANNER_MS);
    }, 0);
    return () => {
      window.clearTimeout(showTimer);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId, currentSeat, status]);

  if (!banner) return null;
  const finalOrbit = banner.mode === "final-orbit" || banner.mode === "hard-final";
  return (
    <div
      aria-hidden="true"
      className={`turn-banner${finalOrbit ? " turn-banner--final" : ""} turn-banner--seat-${banner.player.seat}`}
    >
      <div className="turn-banner__plate">
        <MaskPortrait seat={banner.player.seat} />
        <div className="turn-banner__copy">
          <small>
            {finalOrbit
              ? "FINAL ORBIT · LAST CROSSING"
              : `TURN ${String(banner.turnNumber).padStart(2, "0")} · THE ROAD TURNS`}
          </small>
          <b>
            {banner.player.sigil} · {banner.player.name}
          </b>
          <span>
            {finalOrbit ? "One last turn. Make it remembered." : "reads the road"}
          </span>
        </div>
      </div>
      <i className="turn-banner__sweep" />
    </div>
  );
}
