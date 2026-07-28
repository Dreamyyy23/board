"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomState } from "../game-types";

const STINGER_MS = 2_400;

/**
 * Full-bleed takeover for the table's loudest beat: a Static Fracture.
 * Painted scene art + the installed law, held for ~2.4 seconds (inside the
 * authority's own 2.5s Fracture phase), then released. Skipped entirely
 * under reduced motion; information also lives in the hazard ribbon.
 */
export function StingerOverlay({ room }: { room: RoomState }) {
  const [visible, setVisible] = useState(false);
  const lastFractureRef = useRef<number>(room.fractures || 0);
  const timerRef = useRef<number | null>(null);

  const fractures = room.fractures || 0;

  useEffect(() => {
    const rose = fractures > lastFractureRef.current && room.status === "playing";
    lastFractureRef.current = fractures;
    if (!rose) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const showTimer = window.setTimeout(() => {
      setVisible(true);
      timerRef.current = window.setTimeout(() => setVisible(false), STINGER_MS);
    }, 0);
    return () => {
      window.clearTimeout(showTimer);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [fractures, room.status]);

  if (!visible) return null;
  const law = room.fractureModifier;
  return (
    <div aria-hidden="true" className="fracture-stinger">
      <div className="fracture-stinger__art" />
      <div className="fracture-stinger__veins">
        {Array.from({ length: 8 }, (_, index) => (
          <i key={index} style={{ "--vein-i": index } as React.CSSProperties} />
        ))}
      </div>
      <div className="fracture-stinger__title">
        <small>THE TABLE BREAKS</small>
        <b>
          FRACTURE {fractures}
          <span>/3</span>
        </b>
        {law && (
          <p>
            <em>{law.title}</em>
            {law.body}
          </p>
        )}
      </div>
    </div>
  );
}
