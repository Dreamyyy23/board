"use client";

import { useCallback, useSyncExternalStore } from "react";

const COACH_KEY = "obscur-coach-v1";

type CoachTopic =
  | "intent"
  | "cast"
  | "bend"
  | "witness"
  | "reaction"
  | "oracle"
  | "council";

const COACH_COPY: Record<CoachTopic, string> = {
  intent:
    "Read the six roads first. CLAIM presses for reward, SHELTER softens harm, BIND ties your route to another traveler — hover an Intent to see what it does to each road.",
  cast: "Your Intent is sealed. Cast whenever you're ready — the authority owns the die and everyone sees the natural result before you may Bend.",
  bend: "You see the truth before paying: Bending moves the result one step for 1 Focus. Accepting is always free.",
  witness:
    "You're never idle: predict the class of this cast. A correct call pays 1 Focus — a correct BOLD call on a minority road adds an Echo.",
  reaction:
    "Give Oxygen to prevent 2 harm and form a Golden Thread. Threads are tiebreaker currency, and no traveler survives alone.",
  oracle: "Both answers are real prices. Read the burden line before you choose.",
  council:
    "Stones are secret until the reveal. Each choice shows its projected table-wide law — vote for the round you want to live in.",
};

let dismissedCache: Record<string, boolean> | null = null;
const listeners = new Set<() => void>();

function readDismissed(): Record<string, boolean> {
  if (dismissedCache) return dismissedCache;
  if (typeof window === "undefined") return {};
  try {
    dismissedCache = JSON.parse(localStorage.getItem(COACH_KEY) || "{}");
  } catch {
    dismissedCache = {};
  }
  return dismissedCache || {};
}

function dismissTopic(topic: CoachTopic) {
  const next = { ...readDismissed(), [topic]: true };
  dismissedCache = next;
  try {
    localStorage.setItem(COACH_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable; the hint simply returns next visit.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A single-line, dismissible coaching strip shown beside the live control it
 * explains. It never blocks input and never pauses the authority clock.
 */
export function CoachHint({ topic }: { topic: CoachTopic }) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => Boolean(readDismissed()[topic]),
    () => true,
  );
  const dismiss = useCallback(() => dismissTopic(topic), [topic]);
  if (dismissed) return null;
  return (
    <aside className="coach-hint" data-topic={topic}>
      <i aria-hidden="true">✎</i>
      <p>{COACH_COPY[topic]}</p>
      <button aria-label="Dismiss hint" onClick={dismiss} type="button">
        Got it
      </button>
    </aside>
  );
}
