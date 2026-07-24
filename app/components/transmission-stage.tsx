"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameEvent } from "../game-types";

type YouTubePlayerStateEvent = {
  data: number;
  target: YouTubePlayer;
};

type YouTubePlayerErrorEvent = {
  data: number;
  target: YouTubePlayer;
};

type YouTubePlayerEvent = {
  target: YouTubePlayer;
};

type YouTubePlayer = {
  destroy: () => void;
  getIframe: () => HTMLIFrameElement;
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  stopVideo: () => void;
};

type YouTubePlayerOptions = {
  host?: string;
  height?: string | number;
  width?: string | number;
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: YouTubePlayerEvent) => void;
    onStateChange?: (event: YouTubePlayerStateEvent) => void;
    onError?: (event: YouTubePlayerErrorEvent) => void;
    onAutoplayBlocked?: (event: YouTubePlayerEvent) => void;
  };
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement | string,
    options?: YouTubePlayerOptions,
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type TransmissionStageEvent = GameEvent & {
  transmissionId?: string;
  videoTitle?: string;
  brand?: string;
};

export type TransmissionStagePhase = "idle" | "takeover" | "docked";

export type TransmissionStageProps = {
  event: TransmissionStageEvent | null;
  landingPlayer?: string | null;
  spaceLabel?: string | null;
  className?: string;
  onPhaseChange?: (phase: TransmissionStagePhase) => void;
  onPlaybackFailure?: (failure: {
    transmissionId: string;
    videoId: string;
    errorCode: number;
  }) => Promise<{ ok: boolean; error?: string }>;
};

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The YouTube player requires a browser."));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => {
      youtubeApiPromise = null;
      reject(new Error("The YouTube player did not answer in time."));
    }, 15_000);

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      window.clearTimeout(timeout);
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        youtubeApiPromise = null;
        reject(new Error("The YouTube player API returned without a player."));
      }
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (existingScript) {
      existingScript.addEventListener(
        "error",
        () => {
          window.clearTimeout(timeout);
          youtubeApiPromise = null;
          reject(new Error("The YouTube player script could not be loaded."));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      youtubeApiPromise = null;
      reject(new Error("The YouTube player script could not be loaded."));
    };
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

function readablePlayerError(code: number) {
  if (code === 2) return "The entity received a malformed video signal.";
  if (code === 5) return "This signal cannot play in the HTML5 receiver.";
  if (code === 100) return "This transmission is private or no longer exists.";
  if (code === 101 || code === 150) {
    return "This creator does not permit the transmission to play here.";
  }
  return "The transmission broke before the receiver could decode it.";
}

function readablePlayerState(state: number) {
  if (state === -1) return "Signal queued";
  if (state === 0) return "Transmission ended";
  if (state === 1) return "Broadcasting now";
  if (state === 2) return "Transmission paused";
  if (state === 3) return "Buffering signal";
  if (state === 5) return "Signal ready";
  return "Receiver online";
}

function safeBrand(value?: string) {
  const normalized = (value || "signal")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "signal";
}

export function TransmissionStage({
  event,
  landingPlayer,
  spaceLabel,
  className = "",
  onPhaseChange,
  onPlaybackFailure,
}: TransmissionStageProps) {
  const stageRef = useRef<HTMLElement>(null);
  const playerMountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerReadyRef = useRef(false);
  const currentVideoRef = useRef<string | null>(null);
  const takeoverTimerRef = useRef<number | null>(null);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const onPlaybackFailureRef = useRef(onPlaybackFailure);
  const currentTransmissionRef = useRef<string | null>(null);
  const reportedFailureRef = useRef<string | null>(null);
  const lastPlayerErrorCodeRef = useRef(0);
  const [phase, setPhase] = useState<TransmissionStagePhase>("idle");
  const [playerStatus, setPlayerStatus] = useState("Receiver starting");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [rerouting, setRerouting] = useState(false);

  const transmissionKey =
    event?.transmissionId || event?.id || event?.videoId || null;
  const brand = safeBrand(event?.channelBrand || event?.brand);
  const title =
    event?.videoTitle || event?.videoLabel || event?.title || "Unknown signal";
  const source = event?.videoSource || "Unknown channel";

  useEffect(() => {
    onPhaseChangeRef.current = onPhaseChange;
  }, [onPhaseChange]);

  useEffect(() => {
    onPlaybackFailureRef.current = onPlaybackFailure;
  }, [onPlaybackFailure]);

  const announcePhase = useCallback(
    (nextPhase: TransmissionStagePhase) => {
      setPhase(nextPhase);
      onPhaseChangeRef.current?.(nextPhase);
    },
    [],
  );

  const loadCurrentTransmission = useCallback(() => {
    const videoId = currentVideoRef.current;
    const player = playerRef.current;
    if (!videoId || !player || !playerReadyRef.current) return;

    setAutoplayBlocked(false);
    setPlayerError(null);
    setRerouting(false);
    setPlayerStatus("Opening signal");
    player.loadVideoById(videoId);
    player.playVideo();
  }, []);

  const requestAlternative = useCallback(async (force = false) => {
    const transmissionId = currentTransmissionRef.current;
    const videoId = currentVideoRef.current;
    const reporter = onPlaybackFailureRef.current;
    const failureKey =
      transmissionId && videoId ? `${transmissionId}:${videoId}` : null;
    if (
      !transmissionId ||
      !videoId ||
      !reporter ||
      (!force && reportedFailureRef.current === failureKey)
    ) {
      return;
    }
    reportedFailureRef.current = failureKey;
    setAutoplayBlocked(false);
    setPlayerError(null);
    setRerouting(true);
    setPlayerStatus("Routing another channel upload");
    try {
      const reply = await reporter({
        transmissionId,
        videoId,
        errorCode: lastPlayerErrorCodeRef.current,
      });
      if (currentTransmissionRef.current !== transmissionId) return;
      if (!reply.ok) {
        reportedFailureRef.current = null;
        setRerouting(false);
        setPlayerError(
          reply.error || "The room could not find another channel transmission.",
        );
        setPlayerStatus("No alternate signal answered");
      }
    } catch {
      if (currentTransmissionRef.current !== transmissionId) return;
      reportedFailureRef.current = null;
      setRerouting(false);
      setPlayerError("The room authority could not route another upload.");
      setPlayerStatus("Signal route unavailable");
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    void loadYouTubeApi()
      .then((youtube) => {
        if (disposed || !playerMountRef.current || playerRef.current) return;

        playerRef.current = new youtube.Player(playerMountRef.current, {
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            controls: 1,
            disablekb: 0,
            enablejsapi: 1,
            fs: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: ({ target }) => {
              if (disposed) return;
              playerReadyRef.current = true;
              const iframe = target.getIframe();
              iframe.title = "Foxyverse landing transmission";
              iframe.allow =
                "autoplay; encrypted-media; fullscreen; picture-in-picture";
              iframe.setAttribute("allowfullscreen", "");
              setPlayerStatus("Receiver online");
              loadCurrentTransmission();
            },
            onStateChange: ({ data }) => {
              if (!disposed) setPlayerStatus(readablePlayerState(data));
            },
            onAutoplayBlocked: () => {
              if (disposed) return;
              setAutoplayBlocked(true);
              setPlayerStatus("Waiting for browser permission");
            },
            onError: ({ data }) => {
              if (disposed) return;
              setAutoplayBlocked(false);
              lastPlayerErrorCodeRef.current = data;
              if (onPlaybackFailureRef.current) {
                void requestAlternative();
              } else {
                setPlayerError(readablePlayerError(data));
                setPlayerStatus("Signal interrupted");
              }
            },
          },
        });
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setPlayerError(
          error instanceof Error
            ? error.message
            : "The YouTube receiver could not be loaded.",
        );
        setPlayerStatus("Receiver offline");
      });

    return () => {
      disposed = true;
      playerReadyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [loadCurrentTransmission, requestAlternative]);

  useEffect(() => {
    const age = event?.transmissionStartedAt
      ? Date.now() - event.transmissionStartedAt
      : Number.POSITIVE_INFINITY;
    const hasTransmission = Boolean(
      event?.transmissionId &&
        event.videoId &&
        age >= -10_000 &&
        age < 120_000,
    );
    currentVideoRef.current = hasTransmission ? event?.videoId || null : null;
    currentTransmissionRef.current = hasTransmission
      ? event?.transmissionId || null
      : null;
    reportedFailureRef.current = null;
    lastPlayerErrorCodeRef.current = 0;
    if (!hasTransmission && playerReadyRef.current) {
      playerRef.current?.stopVideo();
    }

    if (takeoverTimerRef.current !== null) {
      window.clearTimeout(takeoverTimerRef.current);
      takeoverTimerRef.current = null;
    }

    const phaseTimer = window.setTimeout(() => {
      announcePhase(hasTransmission ? "takeover" : "idle");
      if (hasTransmission) loadCurrentTransmission();
    }, 0);

    if (hasTransmission) {
      takeoverTimerRef.current = window.setTimeout(() => {
        announcePhase("docked");
        window.requestAnimationFrame(() => {
          const rail = stageRef.current?.closest<HTMLElement>(".command-rail");
          rail?.scrollTo({
            top: 0,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          });
        });
        takeoverTimerRef.current = null;
      }, 4_200);
    }

    return () => {
      window.clearTimeout(phaseTimer);
      if (takeoverTimerRef.current !== null) {
        window.clearTimeout(takeoverTimerRef.current);
        takeoverTimerRef.current = null;
      }
    };
  }, [
    announcePhase,
    event?.transmissionId,
    event?.transmissionStartedAt,
    event?.videoId,
    loadCurrentTransmission,
    transmissionKey,
  ]);

  const stageClassName = useMemo(
    () =>
      [
        "transmission-stage",
        `transmission-stage--${phase}`,
        `transmission-stage--brand-${brand}`,
        className,
      ]
        .filter(Boolean)
        .join(" "),
    [brand, className, phase],
  );

  return (
    <section
      aria-label="Landing transmission"
      aria-hidden={phase === "idle"}
      className={stageClassName}
      data-brand={brand}
      data-phase={phase}
      hidden={phase === "idle"}
      ref={stageRef}
    >
      <header className="transmission-stage__header">
        <div className="transmission-stage__identity">
          <span className="transmission-stage__eyebrow">
            Landing transmission
          </span>
          <h2>{title}</h2>
          <p>
            <span>{source}</span>
            {landingPlayer ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>received by {landingPlayer}</span>
              </>
            ) : null}
            {spaceLabel ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{spaceLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        <div
          aria-live="polite"
          className="transmission-stage__status"
          role="status"
        >
          <span className="transmission-stage__status-light" aria-hidden="true" />
          {playerStatus}
        </div>
      </header>

      <div className="transmission-stage__body">
        <div
          aria-label={`Video player for ${title}`}
          className="transmission-stage__player-frame"
          role="group"
        >
          <div
            className="transmission-stage__player"
            ref={playerMountRef}
          />
        </div>

        {autoplayBlocked || playerError || rerouting ? (
          <aside
            aria-live="assertive"
            className="transmission-stage__recovery"
          >
            <span className="transmission-stage__recovery-mark" aria-hidden="true">
              {playerError ? "!" : rerouting ? "↻" : "▶"}
            </span>
            <div>
              <strong>
                {playerError
                  ? "Signal interrupted"
                  : rerouting
                    ? "The table is changing frequency"
                    : "Receiver needs a gesture"}
              </strong>
              <p>
                {playerError ||
                  (rerouting
                    ? "This upload refused the receiver. Another candidate is being drawn from the room's private channel catalog."
                    : "Your browser blocked automatic playback. Start the assigned signal here.")}
              </p>
            </div>
            {!rerouting ? (
              <button
                className="transmission-stage__start"
                onClick={
                  playerError && onPlaybackFailure
                    ? () => void requestAlternative(true)
                    : loadCurrentTransmission
                }
                type="button"
              >
                {playerError
                  ? onPlaybackFailure
                    ? "TRY NEXT UPLOAD"
                    : "RETRY SIGNAL"
                  : "START SIGNAL"}
              </button>
            ) : null}
            {playerError && event?.channelUrl ? (
              <a
                className="transmission-stage__channel-link"
                href={event.channelUrl}
                rel="noreferrer noopener"
                target="_blank"
              >
                Open creator channel
              </a>
            ) : null}
          </aside>
        ) : null}
      </div>

      <footer className="transmission-stage__footer">
        <span>Controls remain with the table</span>
        <span aria-hidden="true">◆</span>
        <span>{brand.replace(/-/g, " ")}</span>
      </footer>
    </section>
  );
}
