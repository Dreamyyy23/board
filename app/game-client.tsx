"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import {
  authorityModeFromProtocol,
  createAuthorityCompatibility,
} from "./authority-compat.mjs";
import { Board } from "./components/board";
import { CommandRail } from "./components/command-rail";
import { MaskPortrait } from "./components/mask-portrait";
import { SeatRail } from "./components/seat-rail";
import { SupportPortal } from "./components/support-portal";
import type {
  Intent,
  RoomState,
  ServerReply,
  Session,
  SpaceClass,
} from "./game-types";

const SERVER_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL || "/api/authority";
const HTTP_AUTHORITY = SERVER_URL.endsWith("/api/authority");
const SESSION_KEY = "obscur-sixfold-session";
const DEFAULT_CHANNEL_URL = "https://www.youtube.com/@FoxyAlchemyStudio";
type AuthorityMode = "unknown" | "v1" | "v2" | "v4";

const CREATOR_CHANNELS = [
  {
    id: "obscur",
    name: "Foxy Alchemy",
    handle: "@FoxyAlchemyStudio",
    url: DEFAULT_CHANNEL_URL,
    motif: "The original signal",
  },
  {
    id: "inkblot",
    name: "Margaret",
    handle: "@MargaretWorldFoxy",
    url: "https://www.youtube.com/@MargaretWorldFoxy",
    motif: "Inkblot / ivory / ember",
  },
  {
    id: "fateweaver",
    name: "Fada",
    handle: "@EleanorJames09",
    url: "https://www.youtube.com/@EleanorJames09",
    motif: "Gold thread / cyan / black",
  },
  {
    id: "chromed-sakura",
    name: "Melody",
    handle: "@MelodySakura-x",
    url: "https://www.youtube.com/@MelodySakura-x",
    motif: "Chrome / sakura / signal",
  },
] as const;

const MASK_PREVIEWS = [
  ["EMBER", "Kindle the first Echo"],
  ["VEIL", "Unmake the first Snare"],
  ["THORN", "Rifts carry four Echoes"],
  ["MOON", "Hear Archives twice"],
  ["MOSS", "Tend the returning Hearth"],
  ["ASH", "Quiet every landing"],
];

async function requestAuthority(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<ServerReply> {
  const response = await fetch(SERVER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const reply = (await response.json()) as ServerReply;
  if (!response.ok && !reply.error) {
    reply.error = "The room authority refused the request.";
  }
  return reply;
}

function playTone(
  kind:
    | "turn"
    | "roll"
    | "bend"
    | "oxygen"
    | "key"
    | "error"
    | "fracture"
    | "victory",
) {
  if (typeof window === "undefined") return;
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type =
    kind === "error" || kind === "fracture"
      ? "sawtooth"
      : kind === "key" || kind === "victory"
        ? "triangle"
        : "sine";
  const frequencies = {
    turn: [246, 329],
    roll: [164, 392],
    bend: [330, 218],
    oxygen: [238, 492],
    key: [392, 784],
    error: [92, 58],
    fracture: [72, 38],
    victory: [294, 659],
  } as const;
  const [start, end] = frequencies[kind];
  const duration =
    kind === "fracture" || kind === "victory"
      ? 0.82
      : kind === "oxygen" || kind === "key"
        ? 0.52
        : 0.36;
  oscillator.frequency.setValueAtTime(start, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    end,
    context.currentTime + duration * 0.76,
  );
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.11, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    context.currentTime + duration,
  );
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration + 0.02);
  oscillator.addEventListener("ended", () => void context.close());
}

function saveSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? (JSON.parse(value) as Session) : null;
  } catch {
    return null;
  }
}

function EntryScreen({
  connected,
  busy,
  error,
  name,
  roomCode,
  youtubeChannelUrl,
  authorityMode,
  onSupport,
  onName,
  onRoomCode,
  onYoutubeChannelUrl,
  onCreate,
  onJoin,
}: {
  connected: boolean;
  busy: boolean;
  error: string;
  name: string;
  roomCode: string;
  youtubeChannelUrl: string;
  authorityMode: AuthorityMode;
  onSupport: () => void;
  onName: (value: string) => void;
  onRoomCode: (value: string) => void;
  onYoutubeChannelUrl: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onJoin: (event: FormEvent) => void;
}) {
  const legacyCompatibility = authorityMode === "v1";
  const v4Online = authorityMode === "v4";
  return (
    <main className="entry-screen">
      <div className="entry-table-image" />
      <div className="entry-noise" />
      <section className="entry-intro">
        <div
          className={`entry-ruleset-seal${v4Online ? " is-live" : ""}`}
          role="status"
        >
          <i aria-hidden="true" />
          <span>RULESET IV</span>
          <b>{v4Online ? "AUTHORITY ONLINE" : "SEEKING AUTHORITY"}</b>
        </div>
        <span className="brand-kicker">THE WATCHING TABLE · A FOXYVERSE GAME</span>
        <h1>OBSCUR</h1>
        <h2>THE SIXFOLD ROAD</h2>
        <p>
          One traveler may escape. No traveler survives alone. Read six possible
          roads, declare your Intent, Bend the revealed bone, and decide who
          receives your oxygen before the House reaches its third Fracture.
        </p>
        <div className="entry-objective" aria-label="Victory condition">
          <span><b>13</b> Echoes</span>
          <i aria-hidden="true" />
          <span><b>1</b> Alabaster Key</span>
          <i aria-hidden="true" />
          <span><b>1</b> Full Circuit</span>
        </div>
        <div className="entry-laws">
          <span><b>01</b> Read · Intent · Cast</span>
          <span><b>02</b> Server-owned Bend windows</span>
          <span><b>03</b> Oxygen and Golden Threads</span>
          <span><b>04</b> Final Orbit before escape</span>
        </div>
        <ol className="entry-cycle" aria-label="Ruleset four turn sequence">
          <li><b>01</b><span>Read six outcomes</span></li>
          <li><b>02</b><span>Choose an Intent</span></li>
          <li><b>03</b><span>Witness the cast</span></li>
          <li><b>04</b><span>Bend after reveal</span></li>
          <li><b>05</b><span>Give Oxygen</span></li>
          <li><b>06</b><span>Survive Final Orbit</span></li>
        </ol>
      </section>

      <section
        className="entry-ritual-preview"
        aria-label="Six masks surrounding the sixty-one-second authority clock"
      >
        <div className="entry-orbit">
          <div className="entry-orbit-runes" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
          {MASK_PREVIEWS.map(([mask], index) => (
            <article key={mask}>
              <MaskPortrait seat={index} small />
              <span>{mask}</span>
            </article>
          ))}
          <div className="entry-orbit-heart">
            <small>AUTHORITY</small>
            <b>61</b>
            <span>SECONDS</span>
          </div>
        </div>
        <p>
          <span>1 ESCAPES</span>
          <i aria-hidden="true" />
          <span>6 DECIDE</span>
          <i aria-hidden="true" />
          <span>3 FRACTURES</span>
        </p>
      </section>

      <section className="entry-card">
        <div className="entry-card-heading">
          <div className="entry-emblem" aria-hidden="true">
            <span>6</span>
            {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
          </div>
          <div>
            <small>{v4Online ? "Ruleset IV · live authority" : "Room signal"}</small>
            <h3>Take a mask</h3>
          </div>
          <span className={`connection-seal${connected ? " is-online" : ""}`}>
            <i />
            {v4Online ? "V4 LIVE" : connected ? "FOUND" : "SEEKING"}
          </span>
        </div>
        <p className="entry-card-copy">
          {legacyCompatibility
            ? "The live checkpoint currently stages a Foxy Alchemy Studio transmission on every landing."
            : "Every active turn now carries an informed choice, a public natural roll, a Bend window, and a chance for the other masks to intervene."}
        </p>
        {legacyCompatibility ? (
          <div className="entry-compat-notice" role="status">
            <b>FOXY-ONLY COMPATIBILITY MODE</b>
            <span>
              Custom creator channels require the next authority release.
              Tables created here use the current Foxy Alchemy catalog.
            </span>
          </div>
        ) : null}

        <form onSubmit={onCreate}>
          <label>
            <span>Your name at the table</span>
            <input
              maxLength={18}
              onChange={(event) => onName(event.target.value)}
              value={name}
              autoComplete="nickname"
            />
          </label>
          <fieldset
            className={`channel-terminal${legacyCompatibility ? " is-compat-locked" : ""}`}
            disabled={legacyCompatibility}
          >
            <legend>
              <span>Channel bound to this room</span>
              <small>Resolved once, drawn by the authority on every landing</small>
            </legend>
            <div className="channel-presets">
              {CREATOR_CHANNELS.map((channel) => {
                const selected = youtubeChannelUrl === channel.url;
                return (
                  <button
                    aria-pressed={selected}
                    className={`channel-preset channel-preset--${channel.id}${selected ? " is-selected" : ""}`}
                    key={channel.id}
                    onClick={() => onYoutubeChannelUrl(channel.url)}
                    type="button"
                  >
                    <i aria-hidden="true" />
                    <span>
                      <b>{channel.name}</b>
                      <small>{channel.handle}</small>
                    </span>
                    <em>{channel.motif}</em>
                  </button>
                );
              })}
            </div>
            <label className="channel-url-field">
              <span>YouTube channel URL</span>
              <input
                inputMode="url"
                onChange={(event) => onYoutubeChannelUrl(event.target.value)}
                placeholder="https://www.youtube.com/@yourchannel"
                required
                type="url"
                value={youtubeChannelUrl}
              />
            </label>
          </fieldset>
          <button className="entry-primary" disabled={!connected || busy} type="submit">
            <b aria-hidden="true">◆</b>
            <span>
              {legacyCompatibility
                ? "Create Foxy compatibility table"
                : "Open a Ruleset IV table"}
              <small>
                {legacyCompatibility
                  ? "Every landing stages one authority-selected Foxy transmission"
                  : "Six seats · 61-second authority · Witness · Oxygen · Fractures · Final Orbit"}
              </small>
            </span>
            <i aria-hidden="true">→</i>
          </button>
        </form>

        <div className="entry-divider"><span>or answer an existing signal</span></div>

        <form className="join-form" onSubmit={onJoin}>
          <label>
            <span>Five-letter room code</span>
            <input
              className="code-input"
              maxLength={5}
              onChange={(event) =>
                onRoomCode(
                  event.target.value.replace(/[^a-z]/gi, "").toUpperCase(),
                )
              }
              placeholder="NORTH"
              value={roomCode}
              autoComplete="off"
            />
          </label>
          <button disabled={!connected || busy || roomCode.length !== 5} type="submit">
            Join
          </button>
        </form>

        {error && <p className="entry-error" role="status">{error}</p>}
        <p className="entry-privacy">
          The receiver attempts each authority-selected transmission
          immediately. If the browser requires a gesture, one start control
          appears beside it. Watch duration never changes rewards.
        </p>
        <div className="entry-assurances" aria-label="Room properties">
          <span>No account</span>
          <span>Six seats</span>
          <span>24-hour signal</span>
        </div>
        <button
          className="entry-support-trigger"
          onClick={onSupport}
          type="button"
        >
          <b aria-hidden="true">Ξ</b>
          <span>
            Support the table
            <small>Open the Legend Nexus address</small>
          </span>
          <i aria-hidden="true">◇</i>
        </button>
      </section>

      <section className="entry-mask-strip" aria-label="The six playable masks">
        <header>
          <span>The masks waiting</span>
          <small>Choose a law before the first cast</small>
        </header>
        {MASK_PREVIEWS.map(([name, passive], index) => (
          <article key={name}>
            <MaskPortrait seat={index} />
            <div>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <strong>{name}</strong>
              <span>{passive}</span>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function RulesModal({
  room,
  onClose,
}: {
  room: RoomState;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    modal?.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !modal) return;
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prior?.focus();
    };
  }, [onClose]);

  return (
    <div className="rules-backdrop" role="presentation">
      <section
        className="rules-modal rules-modal--deep"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        ref={modalRef}
      >
        <button
          className="rules-close"
          onClick={onClose}
          aria-label="Close rules"
          type="button"
        >
          ×
        </button>
        <span className="brand-kicker">THE TABLE LAW · RULES V4</span>
        <h2 id="rules-title">Cross the road. Return changed.</h2>
        <p className="rules-lead">
          Qualify with a circuit, thirteen Echoes, and an Alabaster Key. Finish
          the round, survive one Final Orbit, then win by visible tiebreakers.
        </p>

        <div className="rules-grid">
          <article>
            <span>TURN</span>
            <h3>Read, intend, cast</h3>
            <p>Read six broad destination classes, choose CLAIM, SHELTER, or BIND, then let the authority cast.</p>
          </article>
          <article>
            <span>FOCUS</span>
            <h3>Bend after the cast</h3>
            <p>See the natural result first. Spend one Focus during the five-second Bend window to move one edge.</p>
          </article>
          <article>
            <span>RESOLVE</span>
            <h3>Give Oxygen</h3>
            <p>A helper may pay Resolve, then Echo, to prevent harm and form a visible Golden Thread.</p>
          </article>
          <article>
            <span>STATIC</span>
            <h3>Shared pressure</h3>
            <p>At twelve, Static Fractures, installs one round law, and resets. The third Fracture gives the House victory.</p>
          </article>
          <article>
            <span>VOWS</span>
            <h3>Chosen behavior</h3>
            <p>Vows are public and behavioral. Completion grants three Echoes, one Focus, and recharges the active.</p>
          </article>
          <article>
            <span>COUNCIL</span>
            <h3>Hidden stones</h3>
            <p>The table shows who voted, never how, until stones reveal one by one in seat order.</p>
          </article>
          <article>
            <span>TRANSMISSION</span>
            <h3>Every landing leaves an Omen</h3>
            <p>The accepted upload deterministically names an Omen for the next ordinary turn. Rejected embeds fail forward.</p>
          </article>
        </div>

        <div className="mask-codex">
          <span>The six mask laws</span>
          <div>
            {room.masks.map((mask, index) => (
              <article key={mask.id}>
                <MaskPortrait seat={index} small />
                <div>
                  <strong>{mask.name} · {mask.title}</strong>
                  <p>{mask.passive}</p>
                  {mask.active && (
                    <small>
                      {mask.active.title} · {mask.active.description}
                    </small>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>

        <button className="entry-primary" onClick={onClose} type="button">
          <span>Return to the table</span>
          <small>The authority clock may still be moving</small>
        </button>
      </section>
    </div>
  );
}

export function GameClient() {
  const socketRef = useRef<Socket | null>(null);
  const compatibilityRef = useRef(createAuthorityCompatibility());
  const authorityModeRef = useRef<AuthorityMode>(
    HTTP_AUTHORITY ? "unknown" : "v4",
  );
  const [connected, setConnected] = useState(false);
  const [authorityMode, setAuthorityMode] = useState<AuthorityMode>(
    HTTP_AUTHORITY ? "unknown" : "v4",
  );
  const [room, setRoom] = useState<RoomState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState("Wanderer");
  const [roomCode, setRoomCode] = useState("");
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState(
    DEFAULT_CHANNEL_URL,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sound, setSound] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [broadcastMode] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("broadcast") === "1",
  );
  const openSupport = useCallback(() => setSupportOpen(true), []);
  const closeSupport = useCallback(() => setSupportOpen(false), []);
  const lastRollRef = useRef<string>("");
  const naturalRollRef = useRef<string>("");
  const lastTurnRef = useRef<number | null>(null);
  const collapseRef = useRef(0);
  const eventCueRef = useRef<string>("");
  const commandSequenceRef = useRef(0);

  const nextCommandId = useCallback((action: string) => {
    commandSequenceRef.current += 1;
    return `${action}-${Date.now().toString(36)}-${commandSequenceRef.current.toString(36)}`;
  }, []);

  const rememberAuthorityMode = useCallback((mode: AuthorityMode) => {
    authorityModeRef.current = mode;
    setAuthorityMode(mode);
  }, []);

  const receiveRoomState = useCallback(
    (state: RoomState, protocol?: string) => {
      const normalized = compatibilityRef.current.normalize(
        state,
        protocol || authorityModeRef.current,
      );
      rememberAuthorityMode(normalized.mode as AuthorityMode);
      setRoom(normalized.room as RoomState);
    },
    [rememberAuthorityMode],
  );

  useEffect(() => {
    if (HTTP_AUTHORITY) {
      let stopped = false;
      let inFlight = false;
      let firstRequest = true;

      const synchronize = async () => {
        if (inFlight || stopped) return;
        inFlight = true;
        const saved = readSession();
        const deepLink = new URLSearchParams(window.location.search);
        const deepLinkCode = (deepLink.get("room") || "")
          .replace(/[^a-z]/gi, "")
          .toUpperCase()
          .slice(0, 5);
        const deepLinkName = (deepLink.get("name") || "Wanderer").slice(0, 18);
        const joiningDeepLink =
          firstRequest &&
          !saved &&
          deepLink.get("join") === "1" &&
          deepLinkCode.length === 5;
        const action =
          saved && firstRequest && !saved.spectator
            ? "join_room"
            : joiningDeepLink
              ? "join_room"
            : saved
              ? "get_state"
              : "health";
        firstRequest = false;
        try {
          const reply = await requestAuthority(
            action,
            saved
              ? {
                  code: saved.code,
                  name: saved.name,
                  token: saved.token,
                }
              : joiningDeepLink
                ? {
                    code: deepLinkCode,
                    name: deepLinkName,
                  }
              : {},
          );
          if (stopped) return;
          if (!reply.ok) {
            if (action !== "health") {
              setError(reply.error || "The table did not answer.");
            }
            if (action === "join_room") saveSession(null);
            return;
          }

          const replyMode = authorityModeFromProtocol(reply.protocol);
          if (replyMode) rememberAuthorityMode(replyMode as AuthorityMode);
          setConnected(true);
          setError("");
          if (reply.state) {
            receiveRoomState(reply.state, reply.protocol);
            if (action === "join_room") {
              const restored = {
                code: reply.code || saved?.code || deepLinkCode,
                name: saved?.name || deepLinkName,
                token: reply.token ?? saved?.token ?? null,
                playerId: reply.playerId ?? saved?.playerId ?? null,
                spectator: reply.spectator,
              };
              setSession(restored);
              saveSession(restored);
            } else if (saved) {
              setSession(saved);
            }
          }
        } catch {
          if (!stopped) {
            setConnected(false);
            setError(
              "The room authority is offline. Reconnection will continue automatically.",
            );
          }
        } finally {
          inFlight = false;
        }
      };

      void synchronize();
      const interval = window.setInterval(() => void synchronize(), 900);
      return () => {
        stopped = true;
        window.clearInterval(interval);
      };
    }

    const nextSocket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 800,
    });
    socketRef.current = nextSocket;
    nextSocket.on("connect", () => {
      rememberAuthorityMode("v4");
      setConnected(true);
      setError("");
      const saved = readSession();
      if (saved) {
        nextSocket.emit(
          "join_room",
          { code: saved.code, name: saved.name, token: saved.token },
          (reply: ServerReply) => {
            if (reply.ok && reply.state) {
              const restored = {
                ...saved,
                token: reply.token ?? saved.token,
                playerId: reply.playerId ?? saved.playerId,
                spectator: reply.spectator,
              };
              setSession(restored);
              saveSession(restored);
              receiveRoomState(reply.state, reply.protocol);
            } else {
              saveSession(null);
            }
          },
        );
      }
    });
    nextSocket.on("disconnect", () => setConnected(false));
    nextSocket.on("connect_error", () => {
      setConnected(false);
      setError("The room authority is offline. Reconnection will continue automatically.");
    });
    nextSocket.on("room_state", (state: RoomState) =>
      receiveRoomState(state, "sixfold-road-v4"),
    );
    return () => {
      socketRef.current = null;
      nextSocket.disconnect();
    };
  }, [receiveRoomState, rememberAuthorityMode]);

  const self = useMemo(
    () =>
      room?.players.find((player) => player?.id === session?.playerId) || null,
    [room, session],
  );
  const isHost = Boolean(
    self &&
      room &&
      self.seat === room.keeperSeat,
  );

  useEffect(() => {
    if (!room?.lastRoll || !sound) return;
    if (Number(room.rulesVersion || 0) >= 4) return;
    const rollKey = `${room.turnNumber}-${room.lastRoll.seat}-${room.lastRoll.die}`;
    if (lastRollRef.current && lastRollRef.current !== rollKey) playTone("roll");
    lastRollRef.current = rollKey;
  }, [room?.lastRoll, room?.rulesVersion, room?.turnNumber, sound]);

  useEffect(() => {
    if (!room?.turn?.naturalRoll || !sound) return;
    const rollKey = `${room.turn.id}-${room.turn.naturalRoll}`;
    if (naturalRollRef.current && naturalRollRef.current !== rollKey) {
      playTone("roll");
    }
    naturalRollRef.current = rollKey;
  }, [room?.turn?.id, room?.turn?.naturalRoll, sound]);

  useEffect(() => {
    if (!room || !sound || self?.seat === undefined) return;
    if (
      lastTurnRef.current !== null &&
      lastTurnRef.current !== room.currentSeat &&
      room.currentSeat === self.seat
    ) {
      playTone("turn");
    }
    lastTurnRef.current = room.currentSeat;
  }, [room, self, sound]);

  useEffect(() => {
    if (!room || !sound) return;
    if (collapseRef.current && room.collapseCount > collapseRef.current) {
      playTone("fracture");
    }
    collapseRef.current = room.collapseCount;
  }, [room, sound]);

  useEffect(() => {
    if (!room || !sound) return;
    const event = room.events?.at(-1);
    if (!event?.id) return;
    if (!eventCueRef.current) {
      eventCueRef.current = event.id;
      return;
    }
    if (eventCueRef.current === event.id) return;
    eventCueRef.current = event.id;
    if (event.type === "oxygen" || event.type === "golden-thread") {
      playTone("oxygen");
    } else if (
      ["key-found", "vow-complete", "qualification"].includes(event.type)
    ) {
      playTone("key");
    } else if (event.type === "bend" && event.finalRoll !== event.naturalRoll) {
      playTone("bend");
    } else if (event.type === "winner") {
      playTone("victory");
    } else if (event.type === "house-victory") {
      playTone("fracture");
    }
  }, [room, sound]);

  function finishEntry(reply: ServerReply, entryName: string) {
    setBusy(false);
    if (!reply.ok || !reply.state || !reply.code) {
      setError(reply.error || "The table did not answer.");
      if (sound) playTone("error");
      return;
    }
    const nextSession: Session = {
      code: reply.code,
      token: reply.token || null,
      playerId: reply.playerId || null,
      name: entryName,
      spectator: reply.spectator,
    };
    setSession(nextSession);
    saveSession(nextSession);
    receiveRoomState(reply.state, reply.protocol);
    setError("");
  }

  function createRoom(event: FormEvent) {
    event.preventDefault();
    if (!connected) {
      setError("The room authority has not connected yet.");
      return;
    }
    const entryName = name.trim() || "Wanderer";
    setBusy(true);
    if (HTTP_AUTHORITY) {
      void requestAuthority("create_room", {
        name: entryName,
        youtubeChannelUrl,
      })
        .then((reply) => finishEntry(reply, entryName))
        .catch(() => {
          setBusy(false);
          setConnected(false);
          setError("The room authority is offline. Please try again.");
        });
      return;
    }
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit(
      "create_room",
      { name: entryName, youtubeChannelUrl },
      (reply: ServerReply) => finishEntry(reply, entryName),
    );
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    if (!connected || !roomCode.trim()) {
      setError("Enter the five-letter room code.");
      return;
    }
    const entryName = name.trim() || "Wanderer";
    setBusy(true);
    if (HTTP_AUTHORITY) {
      void requestAuthority("join_room", {
        code: roomCode.toUpperCase(),
        name: entryName,
      })
        .then((reply) => finishEntry(reply, entryName))
        .catch(() => {
          setBusy(false);
          setConnected(false);
          setError("The room authority is offline. Please try again.");
        });
      return;
    }
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit(
      "join_room",
      { code: roomCode.toUpperCase(), name: entryName },
      (reply: ServerReply) => finishEntry(reply, entryName),
    );
  }

  function emitAction(event: string, payload: Record<string, unknown> = {}) {
    if (!session) return;
    const commandPayload = {
      ...payload,
      commandId: payload.commandId || nextCommandId(event),
    };
    setBusy(true);
    if (HTTP_AUTHORITY) {
      void requestAuthority(event, {
        code: session.code,
        token: session.token,
        ...commandPayload,
      })
        .then((reply) => {
          setBusy(false);
          if (!reply.ok) {
            setError(reply.error || "The table refused the move.");
            if (sound) playTone("error");
          } else {
            if (reply.state) receiveRoomState(reply.state, reply.protocol);
            setError("");
          }
        })
        .catch(() => {
          setBusy(false);
          setConnected(false);
          setError("The room authority is offline. Reconnection will continue.");
        });
      return;
    }
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit(
      event,
      { code: session.code, token: session.token, ...commandPayload },
      (reply: ServerReply) => {
        setBusy(false);
        if (!reply.ok) {
          setError(reply.error || "The table refused the move.");
          if (sound) playTone("error");
        } else {
          setError("");
        }
      },
    );
  }

  async function rerouteTransmission(failure: {
    transmissionId: string;
    videoId: string;
    errorCode: number;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!session) return { ok: false, error: "No table signal is active." };
    if (authorityModeRef.current === "v1") {
      return {
        ok: false,
        error:
          "This compatibility table cannot reroute a refused Foxy transmission.",
      };
    }
    const payload = {
      code: session.code,
      token: session.token,
      commandId: nextCommandId("reject_transmission"),
      ...failure,
    };
    if (HTTP_AUTHORITY) {
      try {
        const reply = await requestAuthority("reject_transmission", payload);
        if (reply.state) receiveRoomState(reply.state, reply.protocol);
        return { ok: reply.ok, error: reply.error };
      } catch {
        return {
          ok: false,
          error: "The room authority could not route another upload.",
        };
      }
    }
    const socket = socketRef.current;
    if (!socket) {
      return { ok: false, error: "The room authority is offline." };
    }
    return new Promise((resolve) => {
      socket.emit(
        "reject_transmission",
        payload,
        (reply: ServerReply) => {
          if (reply.state) receiveRoomState(reply.state, reply.protocol);
          resolve({ ok: reply.ok, error: reply.error });
        },
      );
    });
  }

  function leaveTable() {
    if (session && self) {
      const payload = {
        code: session.code,
        token: session.token,
        commandId: nextCommandId("leave_seat"),
      };
      if (HTTP_AUTHORITY) {
        void requestAuthority("leave_seat", payload);
      } else {
        socketRef.current?.emit("leave_seat", payload, () => undefined);
      }
    }
    setRoom(null);
    setSession(null);
    saveSession(null);
    setError("");
  }

  async function copyCode() {
    if (!room) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(room.code);
      setError("Room code copied. The signal can be shared.");
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = room.code;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand("copy");
      fallback.remove();
      setError(
        copied
          ? "Room code copied. The signal can be shared."
          : `Room code: ${room.code}`,
      );
    }
    window.setTimeout(() => setError(""), 1_500);
  }

  if (!room) {
    return (
      <>
        <EntryScreen
          connected={connected}
          busy={busy}
          error={error}
          name={name}
          roomCode={roomCode}
          youtubeChannelUrl={youtubeChannelUrl}
          authorityMode={authorityMode}
          onSupport={openSupport}
          onName={setName}
          onRoomCode={setRoomCode}
          onYoutubeChannelUrl={setYoutubeChannelUrl}
          onCreate={createRoom}
          onJoin={joinRoom}
        />
        {supportOpen && (
          <SupportPortal onClose={closeSupport} />
        )}
      </>
    );
  }

  const signalPercent = (room.signal / room.signalMax) * 100;
  const signalDanger = room.signal >= 9;
  const v4 = authorityMode === "v4" || Number(room.rulesVersion || 0) >= 4;
  const canRoll = Boolean(
    self &&
      room.status === "playing" &&
      room.currentSeat === self.seat &&
      (v4
        ? room.phase === "intent" && room.turn?.intent
        : !room.pendingChoice && !room.pendingCouncil),
  );
  const latestAnnouncement =
    room.recentEvents?.at(-1)?.summary ||
    room.recentEvents?.at(-1)?.title ||
    room.lastEvent.summary ||
    room.lastEvent.body ||
    room.lastEvent.title;

  return (
    <main
      className={`game-shell entity-v5 mode--${
        room.youtubeChannel?.brand || "obscur"
      }${authorityMode === "v1" ? " is-legacy-authority" : ""}${
        signalDanger ? " signal-danger" : ""
      }${broadcastMode ? " is-broadcast-mode" : ""}`}
      data-active-seat={room.currentSeat ?? "none"}
      data-phase={room.phase || room.status}
      data-presentation={
        room.presentationState || room.lastEvent?.presentationState || room.phase
      }
      data-self-active={self?.seat === room.currentSeat ? "true" : "false"}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {latestAnnouncement}
      </div>
      <header className="game-header">
        <div className="game-brand">
          <div className="mini-emblem">6</div>
          <div>
            <span>Foxyverse real-time table</span>
            <strong>OBSCUR <i>/</i> THE SIXFOLD ROAD</strong>
          </div>
        </div>

        <div className="room-identity">
          <span>
            {authorityMode === "v1"
              ? "Foxy-only compatibility"
              : room.youtubeChannel?.title || "Room signal"}
          </span>
          <button onClick={copyCode} type="button" title="Copy room code">
            {room.code}
            <small>copy</small>
          </button>
          <i className={connected ? "online" : "offline"} />
        </div>

        <div className="signal-console">
          <div className="signal-copy">
            <span>Shared Static</span>
            <b>{room.signal}/{room.signalMax}</b>
          </div>
          <div className="signal-meter">
            <i style={{ width: `${signalPercent}%` }} />
            {Array.from({ length: 12 }, (_, index) => <span key={index} />)}
          </div>
          <small>
            {signalDanger
              ? "FRACTURE IMMINENT"
              : `${room.fractures ?? room.collapseCount}/3 Fractures · third gives the House victory`}
          </small>
        </div>

        <nav className="header-actions" aria-label="Game options">
          <button onClick={() => setHelpOpen(true)} type="button">Codex</button>
          <button
            aria-label="Support the table with Ethereum"
            className="support-nav-button"
            onClick={openSupport}
            type="button"
          >
            <span className="support-nav-label">Support</span>
            <span className="support-nav-short">ETH</span>
          </button>
          <button
            aria-label={sound ? "Mute game sounds" : "Enable game sounds"}
            onClick={() => setSound((value) => !value)}
            type="button"
          >
            {sound ? "Sound on" : "Sound off"}
          </button>
          <button onClick={leaveTable} type="button">Leave</button>
        </nav>
      </header>

      {authorityMode === "v1" && (
        <div className="legacy-authority-banner" role="status">
          LIVE AUTHORITY V1 · Foxy-only compatibility · v4 source features are
          not publicly deployed on this endpoint.
        </div>
      )}

      {broadcastMode && (
        <section className="broadcast-hud" aria-label="Broadcast match status">
          <div>
            <small>OBSCUR · LIVE TABLE</small>
            <strong>
              ROUND {room.round} ·{" "}
              {String(room.phase || room.status).toUpperCase()}
            </strong>
          </div>
          <span>
            STATIC {room.signal}/{room.signalMax} · FRACTURES{" "}
            {room.fractures || 0}/3
          </span>
          <span>OMEN {(room.omen || room.nextOmen || "NONE").toUpperCase()}</span>
          <span>
            {room.endgame?.mode === "normal"
              ? `HARD END IN ${Math.max(0, 12 - room.round)} ROUNDS`
              : String(room.endgame?.mode || "NORMAL").toUpperCase()}
          </span>
        </section>
      )}

      <div className="game-layout">
        <SeatRail
          room={room}
          self={self}
          canManage={isHost}
          onClaimSeat={(seat) => emitAction("claim_seat", { seat })}
          onRemoveBot={(seat) => emitAction("remove_bot", { seat })}
        />
        <Board
          room={room}
          self={self}
          canRoll={canRoll}
          busy={busy}
          onRoll={() => emitAction(v4 ? "cast" : "roll")}
        />
        <CommandRail
          room={room}
          self={self}
          isHost={isHost}
          busy={busy}
          onAddBot={() => emitAction("add_bot")}
          onChoice={(choiceId) => emitAction("answer_choice", { choiceId })}
          onCouncilVote={(choiceId) => emitAction("vote_council", { choiceId })}
          onGift={(targetSeat) => emitAction("gift_echo", { targetSeat })}
          onIntent={(intent: Intent, targetSeat?: number) =>
            emitAction("select_intent", { intent, targetSeat })
          }
          onPrediction={(prediction: SpaceClass) =>
            emitAction("submit_prediction", { prediction })
          }
          onBend={(delta, useAshEvent) =>
            emitAction("bend", { delta, useAshEvent })
          }
          onLegacyTune={(amount) => emitAction("tune_roll", { amount })}
          onGiveOxygen={() => emitAction("give_oxygen")}
          onMaskPower={(payload = {}) => emitAction("use_mask_power", payload)}
          onStreamerMode={(enabled) =>
            emitAction("set_streamer_mode", { enabled })
          }
          onTransmissionFailure={
            authorityMode === "v1" ? undefined : rerouteTransmission
          }
          onStart={() => emitAction("start_game")}
          onUseRelic={(relicId) => emitAction("use_relic", { relicId })}
        />
      </div>

      <footer className="game-footer">
        <span>
          {session?.spectator
            ? `Spectating · ${room.spectatorCount} watchers`
            : self
              ? `${self.name} · ${self.sigil} · seat ${self.seat + 1}`
              : "Watching the road"}
        </span>
        <span>
          {authorityMode === "v1"
            ? "Authority protocol v1 · Foxy-only compatibility · server-owned outcomes"
            : `Authority protocol v${room.rulesVersion || 4} · reconnectable seats · idempotent commands · server-owned outcomes`}
        </span>
        <span>
          {room.status === "playing"
            ? `Round ${room.round} · Turn ${room.turnNumber}`
            : room.status.toUpperCase()}
        </span>
      </footer>

      {error && (
        <button className="table-toast" onClick={() => setError("")} type="button">
          <span>TABLE NOTICE</span>
          {error}
        </button>
      )}

      {helpOpen && <RulesModal room={room} onClose={() => setHelpOpen(false)} />}
      {supportOpen && (
        <SupportPortal onClose={closeSupport} />
      )}
    </main>
  );
}
