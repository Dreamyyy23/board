"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Board } from "./components/board";
import { CommandRail } from "./components/command-rail";
import { MaskPortrait } from "./components/mask-portrait";
import { SeatRail } from "./components/seat-rail";
import type { RoomState, ServerReply, Session } from "./game-types";

const SERVER_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:3001";
const HTTP_AUTHORITY = SERVER_URL.endsWith("/api/authority");
const SESSION_KEY = "obscur-sixfold-session";
const DEFAULT_CHANNEL_URL = "https://www.youtube.com/@FoxyAlchemyStudio";

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
  ["EMBER", "Echoes burn brighter"],
  ["VEIL", "The first Snare misses"],
  ["THORN", "Rifts reach farther"],
  ["MOON", "Archives restore Focus"],
  ["MOSS", "The Hearth restores Resolve"],
  ["ASH", "Every landing calms Static"],
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

function playTone(kind: "turn" | "roll" | "error" | "collapse") {
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
    kind === "error" || kind === "collapse" ? "sawtooth" : "sine";
  const start =
    kind === "roll" ? 164 : kind === "turn" ? 246 : kind === "collapse" ? 72 : 92;
  const end =
    kind === "roll" ? 392 : kind === "turn" ? 329 : kind === "collapse" ? 38 : 58;
  oscillator.frequency.setValueAtTime(start, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    end,
    context.currentTime + (kind === "collapse" ? 0.65 : 0.18),
  );
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.11, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    context.currentTime + (kind === "collapse" ? 0.8 : 0.35),
  );
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + (kind === "collapse" ? 0.82 : 0.36));
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
  onName: (value: string) => void;
  onRoomCode: (value: string) => void;
  onYoutubeChannelUrl: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onJoin: (event: FormEvent) => void;
}) {
  return (
    <main className="entry-screen">
      <div className="entry-table-image" />
      <div className="entry-noise" />
      <section className="entry-intro">
        <span className="brand-kicker">A REAL-TIME FOXYVERSE TABLE</span>
        <h1>OBSCUR</h1>
        <h2>THE SIXFOLD ROAD</h2>
        <p>
          Six masks share one authority. Tune the bone, fulfill your vow,
          survive the Static, and return to the Hearth carrying thirteen
          Echoes and an Alabaster Key.
        </p>
        <div className="entry-objective" aria-label="Victory condition">
          <span><b>13</b> Echoes</span>
          <i aria-hidden="true" />
          <span><b>1</b> Alabaster Key</span>
          <i aria-hidden="true" />
          <span><b>1</b> Full Circuit</span>
        </div>
        <div className="entry-laws">
          <span><b>01</b> Twenty-second turns</span>
          <span><b>02</b> One server-owned die</span>
          <span><b>03</b> Six asymmetric masks</span>
          <span><b>04</b> A table that votes back</span>
        </div>
      </section>

      <section className="entry-card">
        <div className="entry-card-heading">
          <div className="entry-emblem" aria-hidden="true">
            <span>6</span>
            {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
          </div>
          <div>
            <small>Room signal</small>
            <h3>Take a mask</h3>
          </div>
          <span className={`connection-seal${connected ? " is-online" : ""}`}>
            <i />
            {connected ? "FOUND" : "SEEKING"}
          </span>
        </div>
        <p className="entry-card-copy">
          Bind one YouTube channel to the road. Every landing makes the
          authority choose and stage a random public upload for the whole
          table.
        </p>

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
          <fieldset className="channel-terminal">
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
              Bind channel &amp; create table
              <small>
                Public uploads form a private room catalog; refused embeds
                automatically route to a different upload
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
  return (
    <div className="rules-backdrop" role="presentation">
      <section
        className="rules-modal rules-modal--deep"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
      >
        <button
          className="rules-close"
          onClick={onClose}
          aria-label="Close rules"
          type="button"
        >
          ×
        </button>
        <span className="brand-kicker">THE TABLE LAW · PROTOCOL V2</span>
        <h2 id="rules-title">Cross the road. Return changed.</h2>
        <p className="rules-lead">
          The first player to finish a circuit while carrying thirteen Echoes
          and an Alabaster Key wins. Everything else is how the table interferes.
        </p>

        <div className="rules-grid">
          <article>
            <span>TURN</span>
            <h3>Twenty seconds</h3>
            <p>Spend Focus, use relics, or gift one Echo before casting. On timeout, the authority casts for you.</p>
          </article>
          <article>
            <span>FOCUS</span>
            <h3>Tune the bone</h3>
            <p>Spend one Focus to move the final server-generated result exactly one edge higher or lower.</p>
          </article>
          <article>
            <span>RESOLVE</span>
            <h3>Keep your shape</h3>
            <p>Some encounters consume Resolve. Wards cancel an entire harmful consequence before breaking.</p>
          </article>
          <article>
            <span>STATIC</span>
            <h3>Shared pressure</h3>
            <p>Static belongs to the whole room. At twelve it collapses, taking two Echoes from every unwarded mask.</p>
          </article>
          <article>
            <span>VOWS</span>
            <h3>Your private route</h3>
            <p>Every mask begins with a public vow. Complete it for five Echoes and one Focus.</p>
          </article>
          <article>
            <span>COUNCIL</span>
            <h3>One table, six votes</h3>
            <p>Council spaces stop the road until every occupied mask votes or the authority closes the ballot.</p>
          </article>
          <article>
            <span>TRANSMISSION</span>
            <h3>Every landing broadcasts</h3>
            <p>Every resolved space draws one public upload from the room&apos;s bound channel and stages it for every player and spectator. Rejected embeds fail forward.</p>
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
  const [connected, setConnected] = useState(false);
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
  const lastRollRef = useRef<string>("");
  const lastTurnRef = useRef<number | null>(null);
  const collapseRef = useRef(0);

  useEffect(() => {
    if (HTTP_AUTHORITY) {
      let stopped = false;
      let inFlight = false;
      let firstRequest = true;

      const synchronize = async () => {
        if (inFlight || stopped) return;
        inFlight = true;
        const saved = readSession();
        const action =
          saved && firstRequest && !saved.spectator
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

          setConnected(true);
          setError("");
          if (reply.state) {
            setRoom(reply.state);
            if (action === "join_room" && saved) {
              const restored = {
                ...saved,
                token: reply.token ?? saved.token,
                playerId: reply.playerId ?? saved.playerId,
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
              setRoom(reply.state);
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
    nextSocket.on("room_state", (state: RoomState) => setRoom(state));
    return () => {
      socketRef.current = null;
      nextSocket.disconnect();
    };
  }, []);

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
    const rollKey = `${room.turnNumber}-${room.lastRoll.seat}-${room.lastRoll.die}`;
    if (lastRollRef.current && lastRollRef.current !== rollKey) playTone("roll");
    lastRollRef.current = rollKey;
  }, [room?.lastRoll, room?.turnNumber, sound]);

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
      playTone("collapse");
    }
    collapseRef.current = room.collapseCount;
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
    setRoom(reply.state);
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
    setBusy(true);
    if (HTTP_AUTHORITY) {
      void requestAuthority(event, {
        code: session.code,
        token: session.token,
        ...payload,
      })
        .then((reply) => {
          setBusy(false);
          if (!reply.ok) {
            setError(reply.error || "The table refused the move.");
            if (sound) playTone("error");
          } else {
            if (reply.state) setRoom(reply.state);
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
      { code: session.code, token: session.token, ...payload },
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
    const payload = {
      code: session.code,
      token: session.token,
      ...failure,
    };
    if (HTTP_AUTHORITY) {
      try {
        const reply = await requestAuthority("reject_transmission", payload);
        if (reply.state) setRoom(reply.state);
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
          if (reply.state) setRoom(reply.state);
          resolve({ ok: reply.ok, error: reply.error });
        },
      );
    });
  }

  function leaveTable() {
    setRoom(null);
    setSession(null);
    saveSession(null);
    setError("");
  }

  async function copyCode() {
    if (!room) return;
    await navigator.clipboard.writeText(room.code);
    setError("Room code copied. The signal can be shared.");
    window.setTimeout(() => setError(""), 1_500);
  }

  if (!room) {
    return (
      <EntryScreen
        connected={connected}
        busy={busy}
        error={error}
        name={name}
        roomCode={roomCode}
        youtubeChannelUrl={youtubeChannelUrl}
        onName={setName}
        onRoomCode={setRoomCode}
        onYoutubeChannelUrl={setYoutubeChannelUrl}
        onCreate={createRoom}
        onJoin={joinRoom}
      />
    );
  }

  const signalPercent = (room.signal / room.signalMax) * 100;
  const signalDanger = room.signal >= 9;
  const canRoll = Boolean(
    self &&
      room.status === "playing" &&
      room.currentSeat === self.seat &&
      !room.pendingChoice &&
      !room.pendingCouncil,
  );

  return (
    <main
      className={`game-shell entity-v5 mode--${room.youtubeChannel?.brand || "obscur"}${signalDanger ? " signal-danger" : ""}`}
    >
      <header className="game-header">
        <div className="game-brand">
          <div className="mini-emblem">6</div>
          <div>
            <span>Foxyverse real-time table</span>
            <strong>OBSCUR <i>/</i> THE SIXFOLD ROAD</strong>
          </div>
        </div>

        <div className="room-identity">
          <span>{room.youtubeChannel?.title || "Room signal"}</span>
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
          <small>{signalDanger ? "COLLAPSE IMMINENT" : `${room.collapseCount} collapses survived`}</small>
        </div>

        <nav className="header-actions" aria-label="Game options">
          <button onClick={() => setHelpOpen(true)} type="button">Codex</button>
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
          onRoll={() => emitAction("roll")}
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
          onTransmissionFailure={rerouteTransmission}
          onStart={() => emitAction("start_game")}
          onTune={(amount) => emitAction("tune_roll", { amount })}
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
          Authority protocol v2 · reconnectable seats · private tokens · server-owned outcomes
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
    </main>
  );
}
