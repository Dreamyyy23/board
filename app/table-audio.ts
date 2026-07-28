"use client";

/**
 * THE TABLE'S OWN SOUND.
 *
 * The board used to make eight bare oscillator beeps, and it opened a
 * fresh AudioContext for each one and never closed it. Browsers cap you at
 * around six live contexts, so sound simply stopped part-way through a
 * game and never came back. Everything here shares one context, created
 * lazily on the first real gesture (autoplay policy) and resumed if the
 * browser suspended it.
 *
 * The cues are synthesised rather than sampled, because the things this
 * table does are physical events with short, bright transients — a bone
 * landing on stone, a socket taking light, a thread pulling taut — and
 * those are cheap to build out of filtered noise and a resonant body. It
 * also means the board carries no audio payload at all.
 *
 * Any cue can be replaced by a recorded or generated clip: drop a file at
 * `public/audio/<cue>.webm` and it wins over the synth for that cue and
 * that cue only. Nothing else has to change.
 */

export type Cue =
  | "turn"
  | "cast"
  | "land"
  | "bend"
  | "intent"
  | "oxygen"
  | "key"
  | "thread"
  | "error"
  | "fracture"
  | "static"
  | "victory"
  | "view";

type Voice = {
  /** Peak loudness relative to the master bus. */
  gain: number;
  build: (context: AudioContext, at: number, out: AudioNode) => number;
};

let context: AudioContext | null = null;
let master: GainNode | null = null;
let bodyImpulse: AudioBuffer | null = null;
const clips = new Map<Cue, AudioBuffer | null>();
let assetBase = "";
let enabled = true;

/** Where `public/` is served from differs between dev and the Pages build. */
export function setAudioBase(base: string) {
  assetBase = base;
}

export function setAudioEnabled(value: boolean) {
  enabled = value;
  if (master && context) {
    master.gain.setTargetAtTime(value ? 0.9 : 0, context.currentTime, 0.05);
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) {
    // Browsers suspend the context when a tab sleeps; nothing plays again
    // until it is resumed, which looks exactly like broken audio.
    if (context.state === "suspended") void context.resume();
    return context;
  }
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return null;
  context = new AudioContextClass();
  master = context.createGain();
  master.gain.value = enabled ? 0.9 : 0;

  // A short plate of reverb so the table sounds like a room rather than a
  // set of clicks. Built rather than fetched: it is three lines of noise
  // with an exponential tail.
  const seconds = 1.5;
  const rate = context.sampleRate;
  const impulse = context.createBuffer(2, Math.floor(rate * seconds), rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      const decay = Math.pow(1 - i / data.length, 2.6);
      data[i] = (Math.random() * 2 - 1) * decay * 0.5;
    }
  }
  const convolver = context.createConvolver();
  convolver.buffer = impulse;
  const wet = context.createGain();
  wet.gain.value = 0.22;
  master.connect(convolver);
  convolver.connect(wet);
  wet.connect(context.destination);
  master.connect(context.destination);
  bodyImpulse = impulse;
  return context;
}

/* ------------------------------------------------------------------ *
 * building blocks
 * ------------------------------------------------------------------ */

function noiseBuffer(target: AudioContext, seconds: number) {
  const buffer = target.createBuffer(
    1,
    Math.max(1, Math.floor(target.sampleRate * seconds)),
    target.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A struck object: a noise transient through a resonant band-pass. */
function strike(
  target: AudioContext,
  out: AudioNode,
  at: number,
  {
    frequency,
    q = 9,
    decay = 0.22,
    level = 0.6,
    tone = 1,
  }: {
    frequency: number;
    q?: number;
    decay?: number;
    level?: number;
    tone?: number;
  },
) {
  const source = target.createBufferSource();
  source.buffer = noiseBuffer(target, decay + 0.05);
  const band = target.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = frequency;
  band.Q.value = q;
  const shelf = target.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 2200;
  shelf.gain.value = (tone - 1) * 12;
  const gain = target.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  source.connect(band);
  band.connect(shelf);
  shelf.connect(gain);
  gain.connect(out);
  source.start(at);
  source.stop(at + decay + 0.06);
  return decay;
}

/** A sung note: the thing that carries meaning rather than material. */
function tone(
  target: AudioContext,
  out: AudioNode,
  at: number,
  {
    from,
    to = from,
    type = "sine",
    decay = 0.4,
    level = 0.24,
  }: {
    from: number;
    to?: number;
    type?: OscillatorType;
    decay?: number;
    level?: number;
  },
) {
  const oscillator = target.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, at);
  if (to !== from) {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, to),
      at + decay * 0.82,
    );
  }
  const gain = target.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  oscillator.connect(gain);
  gain.connect(out);
  oscillator.start(at);
  oscillator.stop(at + decay + 0.05);
  return decay;
}

/* ------------------------------------------------------------------ *
 * the cues
 * ------------------------------------------------------------------ */

const VOICES: Record<Cue, Voice> = {
  // A bone die tumbling onto stone: three strikes, tightening.
  cast: {
    gain: 1,
    build: (target, at, out) => {
      strike(target, out, at, {
        frequency: 900,
        q: 5,
        decay: 0.09,
        level: 0.5,
      });
      strike(target, out, at + 0.075, {
        frequency: 1180,
        q: 6,
        decay: 0.08,
        level: 0.42,
      });
      strike(target, out, at + 0.135, {
        frequency: 760,
        q: 8,
        decay: 0.22,
        level: 0.55,
      });
      return 0.42;
    },
  },
  // Landing in a carved socket: a dull stone knock, then the ring taking
  // light — the arrival flare has a sound.
  land: {
    gain: 1,
    build: (target, at, out) => {
      strike(target, out, at, {
        frequency: 240,
        q: 4,
        decay: 0.2,
        level: 0.6,
        tone: 0.6,
      });
      tone(target, out, at + 0.04, {
        from: 523,
        to: 784,
        decay: 0.5,
        level: 0.14,
      });
      return 0.55;
    },
  },
  // The road bending: a slide, not a step.
  bend: {
    gain: 1,
    build: (target, at, out) => {
      tone(target, out, at, {
        from: 392,
        to: 262,
        type: "triangle",
        decay: 0.42,
        level: 0.2,
      });
      strike(target, out, at + 0.02, {
        frequency: 1500,
        q: 12,
        decay: 0.16,
        level: 0.22,
      });
      return 0.46;
    },
  },
  // Choosing an intent: a soft wooden set-down.
  intent: {
    gain: 0.8,
    build: (target, at, out) => {
      strike(target, out, at, {
        frequency: 420,
        q: 6,
        decay: 0.12,
        level: 0.4,
        tone: 0.7,
      });
      return 0.16;
    },
  },
  // Authority passing to a new traveller.
  turn: {
    gain: 0.9,
    build: (target, at, out) => {
      tone(target, out, at, { from: 294, to: 392, decay: 0.5, level: 0.18 });
      tone(target, out, at + 0.09, { from: 440, decay: 0.44, level: 0.12 });
      return 0.56;
    },
  },
  // A thread pulled taut between two travellers.
  thread: {
    gain: 0.9,
    build: (target, at, out) => {
      tone(target, out, at, {
        from: 660,
        to: 990,
        type: "triangle",
        decay: 0.6,
        level: 0.14,
      });
      strike(target, out, at, {
        frequency: 2600,
        q: 16,
        decay: 0.3,
        level: 0.16,
      });
      return 0.64;
    },
  },
  oxygen: {
    gain: 1,
    build: (target, at, out) => {
      tone(target, out, at, { from: 238, to: 492, decay: 0.55, level: 0.2 });
      return 0.6;
    },
  },
  key: {
    gain: 1,
    build: (target, at, out) => {
      tone(target, out, at, {
        from: 523,
        type: "triangle",
        decay: 0.34,
        level: 0.18,
      });
      tone(target, out, at + 0.1, {
        from: 784,
        type: "triangle",
        decay: 0.42,
        level: 0.16,
      });
      tone(target, out, at + 0.2, {
        from: 1046,
        type: "triangle",
        decay: 0.5,
        level: 0.13,
      });
      return 0.72;
    },
  },
  // Refusal: short, low, unmusical, and quiet enough not to punish.
  error: {
    gain: 0.7,
    build: (target, at, out) => {
      tone(target, out, at, {
        from: 118,
        to: 74,
        type: "square",
        decay: 0.18,
        level: 0.1,
      });
      return 0.2;
    },
  },
  // The table breaking.
  fracture: {
    gain: 1.15,
    build: (target, at, out) => {
      strike(target, out, at, {
        frequency: 140,
        q: 2,
        decay: 0.7,
        level: 0.75,
        tone: 0.4,
      });
      tone(target, out, at, {
        from: 88,
        to: 41,
        type: "sawtooth",
        decay: 0.8,
        level: 0.2,
      });
      strike(target, out, at + 0.11, {
        frequency: 320,
        q: 3,
        decay: 0.5,
        level: 0.4,
      });
      return 0.9;
    },
  },
  // Static climbing the rim — a rising hiss, no pitch.
  static: {
    gain: 0.8,
    build: (target, at, out) => {
      const source = target.createBufferSource();
      source.buffer = noiseBuffer(target, 0.9);
      const band = target.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.setValueAtTime(700, at);
      band.frequency.exponentialRampToValueAtTime(2600, at + 0.7);
      band.Q.value = 1.4;
      const gain = target.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.16, at + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.85);
      source.connect(band);
      band.connect(gain);
      gain.connect(out);
      source.start(at);
      source.stop(at + 0.95);
      return 0.9;
    },
  },
  victory: {
    gain: 1.1,
    build: (target, at, out) => {
      [294, 392, 523, 659].forEach((frequency, index) => {
        tone(target, out, at + index * 0.11, {
          from: frequency,
          type: "triangle",
          decay: 0.7,
          level: 0.16,
        });
      });
      return 1.1;
    },
  },
  // Turning the table: a low stone scrape, brief enough to spam.
  view: {
    gain: 0.5,
    build: (target, at, out) => {
      strike(target, out, at, {
        frequency: 180,
        q: 2.5,
        decay: 0.13,
        level: 0.3,
        tone: 0.5,
      });
      return 0.15;
    },
  },
};

/* ------------------------------------------------------------------ *
 * playback
 * ------------------------------------------------------------------ */

/**
 * A recorded clip at `public/audio/<cue>.webm` replaces the synth for
 * that cue. Fetched once, cached, and a miss is remembered so a missing
 * file costs exactly one request rather than one per play.
 */
async function loadClip(target: AudioContext, cue: Cue) {
  if (clips.has(cue)) return clips.get(cue) ?? null;
  clips.set(cue, null);
  try {
    const response = await fetch(`${assetBase}/audio/${cue}.webm`);
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    if (type.includes("text/html")) return null; // a 404 page
    const decoded = await target.decodeAudioData(await response.arrayBuffer());
    clips.set(cue, decoded);
    return decoded;
  } catch {
    return null;
  }
}

// Rate-limit: a burst of identical cues in the same frame is one cue.
const lastPlayed = new Map<Cue, number>();

export function playCue(cue: Cue, options: { gain?: number } = {}) {
  if (!enabled) return;
  const target = ensureContext();
  if (!target || !master) return;

  const now = target.currentTime;
  const previous = lastPlayed.get(cue) ?? -1;
  if (now - previous < 0.045) return;
  lastPlayed.set(cue, now);

  const voice = VOICES[cue];
  const bus = target.createGain();
  bus.gain.value = (voice?.gain ?? 1) * (options.gain ?? 1);
  bus.connect(master);

  const clip = clips.get(cue);
  if (clip) {
    const source = target.createBufferSource();
    source.buffer = clip;
    source.connect(bus);
    source.start(now);
    return;
  }

  voice?.build(target, now + 0.001, bus);
  // Ask for the recorded version in the background; the next play uses it.
  void loadClip(target, cue);
}

/** Called on the first user gesture so the context is unlocked and warm. */
export function primeAudio() {
  const target = ensureContext();
  if (!target) return;
  if (target.state === "suspended") void target.resume();
}

/** Exposed for tests and teardown. */
export function releaseAudio() {
  void context?.close();
  context = null;
  master = null;
  bodyImpulse = null;
  clips.clear();
  lastPlayed.clear();
}

export const AUDIO_INTERNALS = {
  get impulse() {
    return bodyImpulse;
  },
};
