"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomState } from "../game-types";
import { playCue } from "../table-audio";

/**
 * THE CARVED TABLE — a real WebGL stage for the Sixfold Road.
 *
 * This is presentation only. The authority still owns every outcome; the
 * scene reads public room state and stages it: a descending spiral of 36
 * carved sockets, standing mask tokens, Golden Threads strung between
 * bound travelers, Static bleeding into the rim, candlelight, drifting
 * embers, and a camera that leans in on the beats that matter.
 *
 * three.js is imported dynamically so the entry screen never pays for it,
 * and the whole layer removes itself when WebGL is missing or the player
 * asked for reduced motion — the flat board underneath keeps working.
 */

const BOARD_SIZE = 36;
const WORLD_RADIUS = 4.6;
const DAIS_RADIUS = 6.5;
const SPIRAL_DROP = 0.024;

/**
 * The spiral's shape is data, not a constant, because a sculpted table
 * decides where the road can physically go: a temple in the middle leaves
 * only an outer walkway, and the road has to live in that band or it sinks
 * into the stonework. Defaults reproduce the flat board's spiral exactly
 * (radius 4.6 at space 0, linearly in to 2.083 at space 35).
 */
const roadShape = {
  outer: WORLD_RADIUS,
  inner: (WORLD_RADIUS * (43.5 - 35 * 0.68)) / 43.5,
  drop: SPIRAL_DROP,
};

/** Same spiral the flat board draws, lifted into world space. */
function spacePosition(index: number) {
  const angle = ((92 - index * 34) * Math.PI) / 180;
  const t = index / (BOARD_SIZE - 1);
  const radius = roadShape.outer + (roadShape.inner - roadShape.outer) * t;
  return {
    x: Math.cos(angle) * radius,
    y: -roadShape.drop * index,
    z: -Math.sin(angle) * radius,
  };
}

const SPACE_KIND = Array.from({ length: BOARD_SIZE }, (_, index) => {
  if (index === 0) return "hearth";
  if ([3, 15, 27].includes(index)) return "relic";
  if ([6, 18, 30].includes(index)) return "archive";
  if ([8, 20, 32].includes(index)) return "council";
  if ([9, 21, 33].includes(index)) return "oracle";
  if ([12, 24].includes(index)) return "key";
  if ([5, 11, 17, 23, 29, 35].includes(index)) return "rift";
  if ([4, 10, 16, 22, 28, 34].includes(index)) return "snare";
  return "echo";
});

const CLASS_OF: Record<string, "light" | "threshold" | "teeth"> = {
  hearth: "light",
  echo: "light",
  archive: "light",
  relic: "light",
  key: "light",
  oracle: "threshold",
  council: "threshold",
  rift: "teeth",
  snare: "teeth",
};

const CLASS_COLOR = {
  light: 0xd9b465,
  threshold: 0x7ec7c9,
  teeth: 0xc9605a,
} as const;

const SEAT_TINT = [0xd05a3c, 0xe6dcc0, 0x8e8a94, 0xc9cddb, 0x7fa066, 0xa8a29c];

/** Camera framings keyed to what the authority says is happening. */
const SHOTS: Record<
  string,
  { pos: [number, number, number]; look: number; fov: number }
> = {
  default: { pos: [0, 6.5, 8.2], look: 0, fov: 38 },
  "turn-opening": { pos: [0, 6.9, 8.6], look: 0, fov: 38 },
  "intent-locked": { pos: [0, 5.9, 7.4], look: 0.1, fov: 36 },
  cast: { pos: [0, 4.2, 5.4], look: 0.25, fov: 33 },
  "bend-decision": { pos: [0, 4.6, 5.9], look: 0.2, fov: 34 },
  "token-travel": { pos: [0, 5.2, 6.6], look: 0.15, fov: 35 },
  "event-reveal": { pos: [0, 4.8, 6.2], look: 0.2, fov: 34 },
  "oxygen-rescue": { pos: [0, 4.4, 6.0], look: 0.2, fov: 34 },
  "mask-power": { pos: [0, 4.6, 6.2], look: 0.2, fov: 34 },
  oracle: { pos: [0, 5.4, 6.8], look: 0.15, fov: 35 },
  "council-voting": { pos: [0, 7.4, 7.2], look: 0, fov: 40 },
  "council-reveal": { pos: [0, 6.6, 6.6], look: 0.1, fov: 38 },
  fracture: { pos: [0, 3.2, 4.6], look: 0.4, fov: 46 },
  qualification: { pos: [0, 5.6, 7.0], look: 0.15, fov: 36 },
  "final-orbit": { pos: [0, 5.0, 7.6], look: 0.1, fov: 37 },
  "vow-completion": { pos: [0, 4.8, 6.4], look: 0.2, fov: 35 },
  "key-found": { pos: [0, 4.6, 6.0], look: 0.2, fov: 34 },
  winner: { pos: [0, 8.4, 8.0], look: 0, fov: 42 },
  "house-victory": { pos: [0, 2.6, 5.2], look: 0.5, fov: 50 },
};

type SceneHandle = {
  update: (room: RoomState) => void;
  dispose: () => void;
} & ViewControls;

/** Turning the table: exposed so buttons and the keyboard can do it too. */
export type ViewControls = {
  orbitBy: (yaw: number, pitch: number) => void;
  zoomBy: (factor: number) => void;
  resetView: () => void;
};

/**
 * Optional tuning that ships next to the model as `table-model.json`, so a
 * sculpted table can be positioned without a rebuild. Everything here is
 * optional: absent a file, the loader measures the model and fits the road
 * to it. These are the overrides for when the measurement guesses wrong.
 *
 *   { "scale": 1, "offsetY": 0, "rotationY": 0,
 *     "roadY": -1.2, "roadOuter": 5.4, "roadInner": 3.6, "roadDrop": 0,
 *     "autoFitRoad": true, "hideDais": true, "hideMedallion": false }
 */
type ModelConfig = {
  scale?: number;
  offsetY?: number;
  rotationY?: number;
  /** World-space height of the road plane. */
  roadY?: number;
  /** Radius of space 0 and of space 35 respectively. */
  roadOuter?: number;
  roadInner?: number;
  /** Descent per space; 0 lays the road flat on a walkway. */
  roadDrop?: number;
  /** Set false to keep the authored spiral and only swap the table. */
  autoFitRoad?: boolean;
  /** Height of the centre readout, as a fraction of the model's height. */
  heartY?: number;
  hideDais?: boolean;
  hideMedallion?: boolean;
  /** Legacy names, still honoured. */
  spiralY?: number;
  spiralRadius?: number;
};

/**
 * Where can the road physically go on this sculpt?
 *
 * Bin every vertex by its distance from the axis and record the highest
 * point in each ring. The outer rings are the plate; scanning inward, the
 * first ring that rises meaningfully above the plate is where the temple
 * (or tower, or whatever the artist put in the middle) begins. The band
 * between those two is the walkway — the only place a 36-space road can
 * lie without sinking into stonework.
 */
function measureWalkway(
  THREE: typeof import("three"),
  root: import("three").Object3D,
) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const half = Math.max(size.x, size.z) / 2;
  const height = size.y;
  if (half <= 0 || height <= 0) return null;

  const BINS = 28;
  const top = new Float64Array(BINS).fill(-Infinity);
  const hits = new Uint32Array(BINS);
  const point = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as import("three").Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry?.attributes?.position;
    if (!position) return;
    // 60k samples is plenty to find a step in the profile and keeps this
    // well under a frame even on a phone.
    const stride = Math.max(1, Math.floor(position.count / 60_000));
    for (let i = 0; i < position.count; i += stride) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const radius = Math.hypot(point.x - centre.x, point.z - centre.z) / half;
      const bin = Math.min(BINS - 1, Math.max(0, Math.floor(radius * BINS)));
      hits[bin] += 1;
      if (point.y > top[bin]) top[bin] = point.y;
    }
  });

  // The plate's height is what the outermost populated rings agree on.
  const outerTops: number[] = [];
  for (let bin = BINS - 1; bin >= Math.floor(BINS * 0.72); bin -= 1) {
    if (hits[bin] > 0) outerTops.push(top[bin]);
  }
  if (!outerTops.length) return null;
  outerTops.sort((a, b) => a - b);
  const plateTop = outerTops[Math.floor(outerTops.length / 2)];

  // Walk inward until the profile steps up out of the walkway.
  const step = plateTop + height * 0.06;
  let innerBin = 0;
  for (let bin = BINS - 1; bin >= 0; bin -= 1) {
    if (hits[bin] > 0 && top[bin] > step) {
      innerBin = bin + 1;
      break;
    }
  }
  let outerBin = BINS;
  for (let bin = BINS - 1; bin >= 0; bin -= 1) {
    if (hits[bin] > 0) {
      outerBin = bin + 1;
      break;
    }
  }

  const outerFraction = outerBin / BINS;
  const innerFraction = innerBin / BINS;
  // Too thin a band means the measurement found a lip, not a walkway.
  if (outerFraction - innerFraction < 0.14) return null;

  return {
    plateTop,
    plateRadius: half,
    outerFraction,
    innerFraction,
  };
}

/**
 * Where the public art actually lives differs per build: the dev server
 * serves it from `/`, the published Pages bundle from `/board/public/`.
 * Rather than guess, read it off the stylesheet — the same CSS rewrite
 * that fixes `url("/board-medallion.webp")` tells us the truth.
 */
function resolveAssetBase(): string {
  try {
    const probe = document.createElement("div");
    probe.className = "asset-base-probe";
    probe.setAttribute("aria-hidden", "true");
    document.body.appendChild(probe);
    const raw = getComputedStyle(probe).backgroundImage;
    probe.remove();
    const found = /url\(["']?(.*?)["']?\)/.exec(raw || "");
    if (!found?.[1]) return "";
    const url = new URL(found[1], document.baseURI);
    return url.pathname.replace(/\/[^/]*$/, "");
  } catch {
    return "";
  }
}

export function Table3D({
  room,
  onReady,
  onView,
}: {
  room: RoomState;
  onReady?: (live: boolean) => void;
  /** Hands the board a way to turn the table for keyboard and button use. */
  onView?: (view: ViewControls | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const readyRef = useRef(onReady);
  const viewRef = useRef(onView);
  const [live, setLive] = useState(false);

  useEffect(() => {
    readyRef.current = onReady;
    viewRef.current = onView;
  }, [onReady, onView]);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    // Cheap WebGL probe before we pay for the three.js chunk.
    try {
      const probe = document.createElement("canvas");
      const ok = probe.getContext("webgl2") || probe.getContext("webgl");
      if (!ok) return;
    } catch {
      return;
    }

    void (async () => {
      try {
        const THREE = await import("three");
        if (cancelled || !hostRef.current) return;
        const handle = buildScene(THREE, hostRef.current, resolveAssetBase());
        if (cancelled) {
          handle.dispose();
          return;
        }
        sceneRef.current = handle;
        setLive(true);
        readyRef.current?.(true);
        viewRef.current?.({
          orbitBy: handle.orbitBy,
          zoomBy: handle.zoomBy,
          resetView: handle.resetView,
        });
      } catch {
        // A missing WebGL context or a blocked chunk simply leaves the
        // flat board in charge. The table is never gated on the stage.
        readyRef.current?.(false);
      }
    })();

    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      readyRef.current?.(false);
      viewRef.current?.(null);
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.update(room);
  }, [room]);

  return (
    <div
      aria-hidden="true"
      className={`table-3d${live ? " is-live" : ""}`}
      ref={hostRef}
    />
  );
}

/* ------------------------------------------------------------------ */

function buildScene(
  THREE: typeof import("three"),
  host: HTMLDivElement,
  assetBase: string,
): SceneHandle {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(host.clientWidth || 1, host.clientHeight || 1);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07090c, 0.026);

  const camera = new THREE.PerspectiveCamera(
    38,
    (host.clientWidth || 1) / (host.clientHeight || 1),
    0.1,
    120,
  );
  camera.position.set(0, 6.5, 8.2);

  const loader = new THREE.TextureLoader();
  const texture = (file: string) => {
    const map = loader.load(`${assetBase}/${file}`);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  };

  /* ---------------- the dais ---------------- */
  const woodMap = texture("table-bg.webp");
  woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
  woodMap.repeat.set(1.4, 1.4);

  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(6.15, 6.4, 0.62, 96, 1),
    new THREE.MeshStandardMaterial({
      map: woodMap,
      color: 0xd8bb96,
      roughness: 0.7,
      metalness: 0.1,
      emissive: 0x140d07,
      emissiveIntensity: 0.9,
    }),
  );
  dais.position.y = -1.62;
  scene.add(dais);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(6.16, 0.085, 16, 128),
    new THREE.MeshStandardMaterial({
      color: 0x8a6f3c,
      roughness: 0.35,
      metalness: 0.92,
      emissive: 0x2a1c08,
      emissiveIntensity: 0.5,
    }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -1.31;
  scene.add(rim);

  /* ---------------- the spiral road ---------------- */
  // A remount must not inherit the previous sculpt's tuning.
  roadShape.outer = WORLD_RADIUS;
  roadShape.inner = (WORLD_RADIUS * (43.5 - 35 * 0.68)) / 43.5;
  roadShape.drop = SPIRAL_DROP;

  const roadGroup = new THREE.Group();
  scene.add(roadGroup);

  /**
   * Gameplay must stay legible through scenery.
   *
   * The sculpt has buttresses and arms that arch out over its own walkway,
   * so from a low angle behind the temple they lie across the road and hide
   * whole stretches of it. Raising the road would make it float and cutting
   * the arms would damage the art, so instead every piece of the road gets a
   * second, faint draw with depth testing off. Where a socket is plainly
   * visible you see the solid one and the ghost is lost in it; where stone
   * is in the way you see the ghost alone, and the road reads through the
   * temple as a thin glow. It is the convention games use for characters
   * behind walls, and it costs one extra draw per piece.
   */
  const ghostOf = (
    mesh: import("three").Mesh,
    color: number,
    opacity = 0.26,
  ) => {
    const ghost = new THREE.Mesh(
      mesh.geometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ghost.renderOrder = 12;
    // Parented to the real piece, so it inherits every later move for free.
    mesh.add(ghost);
    return ghost;
  };

  const socketRing = new THREE.TorusGeometry(0.235, 0.036, 12, 28);
  const socketWell = new THREE.CircleGeometry(0.215, 28);
  const sockets: Array<{
    ring: import("three").Mesh;
    well: import("three").Mesh;
    ringMat: import("three").MeshStandardMaterial;
    wellMat: import("three").MeshStandardMaterial;
    base: number;
  }> = [];

  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const at = spacePosition(index);
    const kind = SPACE_KIND[index];
    const tone = CLASS_COLOR[CLASS_OF[kind]];
    const hearth = kind === "hearth";

    const ringMat = new THREE.MeshStandardMaterial({
      color: hearth ? 0xe8c477 : 0x7d6944,
      roughness: 0.38,
      metalness: 0.88,
      emissive: tone,
      emissiveIntensity: hearth ? 0.5 : 0.12,
    });
    const ring = new THREE.Mesh(socketRing, ringMat);
    ring.position.set(at.x, at.y, at.z);
    ring.rotation.x = Math.PI / 2;
    roadGroup.add(ring);
    ghostOf(ring, hearth ? 0xf0c882 : tone, hearth ? 0.5 : 0.3);

    const wellMat = new THREE.MeshStandardMaterial({
      color: 0x0a0b0c,
      roughness: 0.95,
      metalness: 0.1,
      emissive: tone,
      emissiveIntensity: hearth ? 0.32 : 0.05,
    });
    const well = new THREE.Mesh(socketWell, wellMat);
    well.position.set(at.x, at.y - 0.014, at.z);
    well.rotation.x = -Math.PI / 2;
    roadGroup.add(well);

    sockets.push({
      ring,
      well,
      ringMat,
      wellMat,
      base: hearth ? 0.5 : 0.12,
    });
  }

  // Brass rails threading the spiral.
  const railGeometry = () =>
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        Array.from({ length: BOARD_SIZE * 5 }, (_, step) => {
          const at = spacePosition(step / 5);
          return new THREE.Vector3(at.x, at.y + 0.005, at.z);
        }),
      ),
      420,
      0.014,
      8,
      false,
    );
  const rail = new THREE.Mesh(
    railGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0xb08c46,
      roughness: 0.3,
      metalness: 0.95,
      emissive: 0x3a2a0e,
      emissiveIntensity: 0.6,
    }),
  );
  roadGroup.add(rail);

  /* ---------------- arrival flares ----------------
   * A move needs a moment of arrival or the whole turn reads as a token
   * quietly sliding. When a traveller lands, the socket under them throws
   * a ring outward and dies away. Six are pooled and reused, which is
   * more than the board can ever need at once. */
  const flareGeometry = new THREE.RingGeometry(0.2, 0.3, 40);
  const flares = Array.from({ length: 6 }, () => {
    const mesh = new THREE.Mesh(
      flareGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xf2c876,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.renderOrder = 3;
    roadGroup.add(mesh);
    return { mesh, life: 0 };
  });
  let nextFlare = 0;

  const igniteSocket = (index: number, tint: number) => {
    const at = spacePosition(index);
    const flare = flares[nextFlare % flares.length];
    nextFlare += 1;
    flare.mesh.position.set(at.x, at.y + 0.02, at.z);
    flare.mesh.visible = true;
    flare.life = 1;
    // The arrival has a sound as well as a light.
    playCue("land");
    (flare.mesh.material as import("three").MeshBasicMaterial).color.setHex(
      tint,
    );
  };

  /**
   * Re-run the layout after `roadShape` changes. Tokens and threads read
   * `spacePosition` every frame so they follow on their own; only the road
   * itself is baked geometry and has to be moved by hand.
   */
  const relayoutRoad = () => {
    sockets.forEach((socket, index) => {
      const at = spacePosition(index);
      socket.ring.position.set(at.x, at.y, at.z);
      socket.well.position.set(at.x, at.y - 0.014, at.z);
    });
    rail.geometry.dispose();
    rail.geometry = railGeometry();
    railGhost.geometry = rail.geometry;
  };

  /* ---------------- the medallion ---------------- */
  const medallion = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 64),
    new THREE.MeshStandardMaterial({
      map: texture("board-medallion.webp"),
      roughness: 0.55,
      metalness: 0.7,
      emissive: 0xffffff,
      emissiveMap: texture("board-medallion.webp"),
      emissiveIntensity: 0.55,
    }),
  );
  medallion.rotation.x = -Math.PI / 2;
  medallion.position.y = -1.24;
  scene.add(medallion);

  /* ---------------- mask standees ---------------- */
  const maskMap = texture("mask-sheet-v3.webp");
  const tokenGroup = new THREE.Group();
  scene.add(tokenGroup);

  /** A soft round falloff, painted once and shared. */
  const radialTexture = (inner: string) => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2,
      );
      gradient.addColorStop(0, inner);
      gradient.addColorStop(0.55, inner.replace(/[\d.]+\)$/, "0.28)"));
      gradient.addColorStop(1, inner.replace(/[\d.]+\)$/, "0)"));
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  };
  const shadowMap = radialTexture("rgba(0,0,0,0.78)");
  const haloMap = radialTexture("rgba(255,255,255,0.6)");
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);

  type Token = {
    group: import("three").Group;
    card: import("three").Group;
    plate: import("three").Mesh;
    shadow: import("three").Mesh;
    halo: import("three").Mesh;
    glow: import("three").PointLight;
    target: import("three").Vector3;
    space: number;
    hop: number;
  };
  const tokens = new Map<number, Token>();

  const makeToken = (seat: number) => {
    const group = new THREE.Group();
    const tint = SEAT_TINT[seat] ?? 0x999999;

    // What sold the old tokens as paper cutouts was that nothing they did
    // touched the table. A traveller now casts a shadow onto the stone and
    // spills a little of their own colour onto it.
    const shadow = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({
        map: shadowMap,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    shadow.scale.setScalar(0.78);
    shadow.renderOrder = 1;
    group.add(shadow);

    const halo = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({
        map: haloMap,
        color: tint,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.012;
    halo.scale.setScalar(0.62);
    halo.renderOrder = 2;
    group.add(halo);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.245, 0.085, 28),
      new THREE.MeshStandardMaterial({
        color: 0x2a2118,
        roughness: 0.34,
        metalness: 0.88,
        emissive: tint,
        emissiveIntensity: 0.2,
      }),
    );
    plinth.position.y = 0.042;
    group.add(plinth);

    // The mask stands up out of the plinth, cropped from the sheet, with a
    // slab of stone behind it so it has a back as well as a face.
    const card = new THREE.Group();
    card.position.y = 0.42;
    group.add(card);

    // No slab behind the mask: the painted mask already carries its own
    // carved frame, and a second rectangle behind it is exactly what made
    // these read as cards standing on the board rather than pieces.
    const plateMap = maskMap.clone();
    plateMap.needsUpdate = true;
    plateMap.repeat.set(1 / 3, 1 / 2);
    plateMap.offset.set((seat % 3) / 3, seat < 3 ? 0.5 : 0);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.54, 0.64),
      new THREE.MeshStandardMaterial({
        map: plateMap,
        roughness: 0.6,
        metalness: 0.25,
        emissive: 0xffffff,
        emissiveMap: plateMap,
        emissiveIntensity: 0.42,
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    card.add(plate);

    // A traveller hidden behind a buttress is the worst thing to lose.
    const plateGhost = new THREE.Mesh(
      plate.geometry,
      new THREE.MeshBasicMaterial({
        map: plateMap,
        color: tint,
        transparent: true,
        opacity: 0.34,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    plateGhost.renderOrder = 13;
    plate.add(plateGhost);

    const glow = new THREE.PointLight(tint, 0.5, 1.6, 2);
    glow.position.y = 0.44;
    group.add(glow);

    tokenGroup.add(group);
    return {
      group,
      card,
      plate,
      shadow,
      halo,
      glow,
      target: new THREE.Vector3(),
      space: -1,
      hop: 0,
    } as Token;
  };

  /* ---------------- golden threads ---------------- */
  const threadGroup = new THREE.Group();
  scene.add(threadGroup);
  const threadMat = new THREE.MeshBasicMaterial({
    color: 0xf0cf82,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  /* ---------------- static bleeding into the rim ---------------- */
  const veinGroup = new THREE.Group();
  scene.add(veinGroup);
  const veins: import("three").Mesh[] = [];
  for (let index = 0; index < 12; index += 1) {
    const vein = new THREE.Mesh(
      new THREE.TorusGeometry(6.16, 0.052, 8, 24, (Math.PI * 2) / 13),
      new THREE.MeshBasicMaterial({
        color: 0xd8483c,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    vein.rotation.x = Math.PI / 2;
    vein.rotation.z = (index / 12) * Math.PI * 2;
    vein.position.y = -1.31;
    veinGroup.add(vein);
    veins.push(vein);
  }

  /* ---------------- embers ---------------- */
  const emberCount = 190;
  const emberPos = new Float32Array(emberCount * 3);
  const emberSeed = new Float32Array(emberCount);
  for (let index = 0; index < emberCount; index += 1) {
    const radius = 0.8 + Math.random() * 5.6;
    const angle = Math.random() * Math.PI * 2;
    emberPos[index * 3] = Math.cos(angle) * radius;
    emberPos[index * 3 + 1] = -1.2 + Math.random() * 3.2;
    emberPos[index * 3 + 2] = Math.sin(angle) * radius;
    emberSeed[index] = 0.25 + Math.random() * 0.9;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  const embers = new THREE.Points(
    emberGeo,
    new THREE.PointsMaterial({
      color: 0xffc46b,
      size: 0.045,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  scene.add(embers);

  /* ---------------- candlelight ---------------- */
  const ambient = new THREE.AmbientLight(0x3d372c, 1.15);
  scene.add(ambient);
  const sky = new THREE.HemisphereLight(0x6a5c44, 0x0a0906, 0.85);
  scene.add(sky);
  const key = new THREE.DirectionalLight(0xffd9a0, 1.25);
  key.position.set(3, 9, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fb4c4, 0.35);
  fill.position.set(-5, 4, -4);
  scene.add(fill);

  // Four flames are painted; only two of them are real lights. Dynamic
  // lights are the single most expensive thing in this scene, so the table
  // spends them where they are actually felt.
  const candles = [
    [4.6, 1.5, 3.2, 1],
    [-4.8, 1.5, 2.4, 1],
    [3.4, 1.5, -4.2, 0],
    [-3.2, 1.5, -4.6, 0],
  ].map(([x, y, z, lit]) => {
    let light: import("three").PointLight | null = null;
    if (lit) {
      light = new THREE.PointLight(0xffb45e, 7.5, 18, 2);
      light.position.set(x, y, z);
      scene.add(light);
    }
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd39a }),
    );
    flame.position.set(x, y, z);
    scene.add(flame);
    return { light, flame, phase: Math.random() * Math.PI * 2 };
  });

  // The lamp that rides with the active traveler.
  const authorityLamp = new THREE.PointLight(0xffd9a0, 0, 3.2, 2);
  scene.add(authorityLamp);
  let activeToken: Token | null = null;

  const centerGlow = new THREE.PointLight(0xffbe72, 3.4, 8.5, 2);
  centerGlow.position.set(0, 0.6, 0);
  scene.add(centerGlow);

  /* ---------------- state the loop reads ---------------- */
  let shot = SHOTS.default;
  let shake = 0;
  let flash = 0;
  let lastFractures = 0;
  let lastTurnId: string | null = null;
  let orbit = 0;
  let disposed = false;

  /* ---------------- the reader's own view ----------------
   * A physical board is something you lean around. The authored shots
   * still choose where the camera lives for each beat; these offsets ride
   * on top of them, so turning the table never costs you the framing that
   * the Council or a Fracture is supposed to have. */
  const view = { yaw: 0, pitch: 0, zoom: 1, dirty: false };
  const PITCH_LIMIT = 0.62;
  const orbitBy = (yaw: number, pitch: number) => {
    view.yaw += yaw;
    view.pitch = Math.min(
      PITCH_LIMIT,
      Math.max(-PITCH_LIMIT, view.pitch + pitch),
    );
    view.dirty = true;
  };
  const zoomBy = (factor: number) => {
    view.zoom = Math.min(1.9, Math.max(0.55, view.zoom * factor));
    view.dirty = true;
  };
  const resetView = () => {
    view.yaw = 0;
    view.pitch = 0;
    view.zoom = 1;
    view.dirty = false;
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;

  const onPointerDown = (event: PointerEvent) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
    host.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && spread > 0) zoomBy(pinch / spread);
      pinch = spread;
      return;
    }
    orbitBy(-dx * 0.0055, -dy * 0.0032);
  };

  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
    host.releasePointerCapture?.(event.pointerId);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    zoomBy(1 + Math.sign(event.deltaY) * 0.09);
  };

  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointercancel", onPointerUp);
  host.addEventListener("wheel", onWheel, { passive: false });

  const camTarget = new THREE.Vector3(0, 6.5, 8.2);
  const orbitPivot = new THREE.Vector3();
  const orbitOffset = new THREE.Vector3();
  const orbitSpherical = new THREE.Spherical();
  const lookTarget = new THREE.Vector3(0, 0, 0);
  const lookNow = new THREE.Vector3(0, 0, 0);
  // The dais has to fit whatever shape the panel is. Rather than pick a
  // distance and hope, solve for one that clears the rim on both axes.
  let frameScale = 1;
  // A sculpted table is taller than the flat dais, so the thing the camera
  // has to clear is not a constant — the model tells us its own size when
  // it mounts, and the shot pulls back and tilts up to suit.
  let frameRadius = DAIS_RADIUS;
  let frameLift = 0;
  // The "cast the bone" readout is a DOM button at the centre of the
  // panel, and `lookAt` puts its target at the centre of the view — so
  // aiming the camera at the sculpt's hearth is what welds the two
  // together. Per-shot look offsets are damped rather than dropped, so
  // the sixteen framings still breathe without walking the button off
  // the table.
  let lookDamping = 1;
  const computeFrame = () => {
    const vertical = Math.tan((camera.fov * Math.PI) / 360);
    const horizontal = vertical * camera.aspect;
    const needed = frameRadius / Math.min(vertical, horizontal);
    const base = Math.hypot(shot.pos[1], shot.pos[2]) || 1;
    frameScale = Math.max(1, (needed * 1.06) / base);
  };

  const update = (next: RoomState) => {
    // --- camera shot selection ---
    shot = SHOTS[next.presentationState || ""] || SHOTS.default;
    computeFrame();
    camTarget.set(
      shot.pos[0] * frameScale,
      shot.pos[1] * frameScale,
      shot.pos[2] * frameScale,
    );
    lookTarget.set(0, shot.look * lookDamping + frameLift, 0);

    // --- beats that punch ---
    const fractures = next.fractures || 0;
    if (fractures > lastFractures) {
      shake = 1;
      flash = 1;
    }
    lastFractures = fractures;
    if (next.turn?.id && next.turn.id !== lastTurnId) {
      lastTurnId = next.turn.id;
      orbit = 0;
    }

    // --- tokens follow the authority ---
    let activeSeatToken: Token | null = null;
    const seatsSeen = new Set<number>();
    for (const player of next.players || []) {
      if (!player) continue;
      seatsSeen.add(player.seat);
      let token = tokens.get(player.seat);
      if (!token) {
        token = makeToken(player.seat);
        tokens.set(player.seat, token);
        const start = spacePosition(player.position || 0);
        token.group.position.set(start.x, start.y, start.z);
      }
      const at = spacePosition(player.position || 0);
      // Fan tokens sharing a space so nobody hides behind a mask.
      const sharing = (next.players || []).filter(
        (other) => other && other.position === player.position,
      );
      const slot = sharing.findIndex((other) => other?.seat === player.seat);
      const spread = sharing.length > 1 ? 0.36 : 0;
      const fan = (slot - (sharing.length - 1) / 2) * spread;
      const outward = Math.atan2(at.z, at.x);
      token.target.set(
        at.x + Math.cos(outward + Math.PI / 2) * fan,
        at.y,
        at.z + Math.sin(outward + Math.PI / 2) * fan,
      );
      const landed = player.position || 0;
      if (token.space >= 0 && token.space !== landed) {
        igniteSocket(landed, SEAT_TINT[player.seat] ?? 0xf2c876);
      }
      token.space = landed;

      const active = next.currentSeat === player.seat;
      const material = token.plate
        .material as import("three").MeshStandardMaterial;
      material.emissiveIntensity = active ? 0.95 : 0.4;
      material.opacity = player.online === false ? 0.45 : 1;
      if (active) activeSeatToken = token;
    }
    for (const [seat, token] of tokens) {
      if (seatsSeen.has(seat)) continue;
      tokenGroup.remove(token.group);
      tokens.delete(seat);
    }
    // A single lamp follows whoever holds the authority.
    activeToken = activeSeatToken;

    // --- reachable roads light up under the die ---
    const reachable = new Map<number, string>();
    for (const destination of next.turn?.reachable || []) {
      reachable.set(destination.destination, destination.class);
    }
    const finalRoll = next.turn?.finalRoll ?? null;
    const finalSpace =
      finalRoll && next.currentSeat !== null
        ? ((next.players?.[next.currentSeat]?.position || 0) + finalRoll) %
          BOARD_SIZE
        : null;
    sockets.forEach((socket, index) => {
      const lit = reachable.has(index);
      const chosen = finalSpace === index;
      socket.ringMat.emissiveIntensity = chosen
        ? 2.4
        : lit
          ? 0.85
          : socket.base;
      socket.wellMat.emissiveIntensity = chosen ? 1.1 : lit ? 0.36 : 0.05;
    });

    // --- golden threads between bound travelers ---
    while (threadGroup.children.length) {
      const child = threadGroup.children[0] as import("three").Mesh;
      threadGroup.remove(child);
      child.geometry.dispose();
    }
    const drawn = new Set<string>();
    for (const player of next.players || []) {
      if (!player) continue;
      for (const [key, value] of Object.entries(player.relationships || {})) {
        if (!value) continue;
        const otherSeat = Number(key);
        const pairKey = [player.seat, otherSeat].sort().join(":");
        if (drawn.has(pairKey)) continue;
        drawn.add(pairKey);
        const other = (next.players || []).find(
          (candidate) => candidate?.seat === otherSeat,
        );
        if (!other) continue;
        const a = spacePosition(player.position || 0);
        const b = spacePosition(other.position || 0);
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(a.x, a.y + 0.2, a.z),
          new THREE.Vector3(
            (a.x + b.x) / 2,
            Math.max(a.y, b.y) + 1.15,
            (a.z + b.z) / 2,
          ),
          new THREE.Vector3(b.x, b.y + 0.2, b.z),
        );
        const thread = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 48, 0.012, 6, false),
          threadMat,
        );
        threadGroup.add(thread);
      }
    }

    // --- Static bleeding around the rim ---
    const signal = Math.max(0, Math.min(12, next.signal || 0));
    veins.forEach((vein, index) => {
      const material = vein.material as import("three").MeshBasicMaterial;
      material.opacity = index < signal ? 0.5 : 0;
    });

    // Endgame drains the warmth out of the room.
    const endgame = next.endgame?.mode;
    const tension = signal / 12;
    scene.fog!.color.setHex(
      endgame === "final-orbit" || endgame === "hard-final"
        ? 0x0a0508
        : 0x05070a,
    );
    centerGlow.color.setHSL(0.09 - tension * 0.07, 0.75, 0.55);
  };

  /* ---------------- a sculpted table, if one is supplied ----------------
   * Drop `table-model.glb` into public/ and it replaces the procedural
   * dais. The spiral, tokens, threads and Static stay — they are gameplay,
   * not scenery — and simply ride on top of the sculpt. Absent the file,
   * nothing here runs and the carved-in-code table stands as before. */
  let modelRoot: import("three").Object3D | null = null;

  const mountModel = async () => {
    const modelUrl = `${assetBase}/table-model.glb`;
    try {
      const head = await fetch(modelUrl, { method: "HEAD" });
      if (!head.ok) return;
      const type = head.headers.get("content-type") || "";
      if (type.includes("text/html")) return; // a 404 page, not a model
    } catch {
      return;
    }

    let config: ModelConfig = {};
    try {
      const response = await fetch(`${assetBase}/table-model.json`);
      if (response.ok) config = (await response.json()) as ModelConfig;
    } catch {
      // Tuning is optional; sensible defaults follow.
    }

    const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] =
      await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/loaders/DRACOLoader.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js"),
      ]);

    const gltfLoader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath(`${assetBase}/draco/`);
    gltfLoader.setDRACOLoader(draco);
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);

    const gltf = await gltfLoader.loadAsync(modelUrl);
    if (disposed) return;
    const root = gltf.scene;

    // Sit the sculpt where the procedural dais was: centred on the axis,
    // scaled so its footprint matches the board the spiral is drawn for.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const footprint = Math.max(size.x, size.z) || 1;
    const scale = config.scale ?? (DAIS_RADIUS * 2) / footprint;
    root.scale.setScalar(scale);
    root.position.set(
      -centre.x * scale,
      -box.min.y * scale - 1.62 + (config.offsetY ?? 0),
      -centre.z * scale,
    );
    root.rotation.y = config.rotationY ?? 0;

    root.traverse((object) => {
      const mesh = object as import("three").Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as import("three").MeshStandardMaterial;
      if (material && "envMapIntensity" in material) {
        material.envMapIntensity = 0.85;
      }
    });

    scene.add(root);
    modelRoot = root;

    // Reframe around what actually got added. Without this a tall sculpt
    // is cropped: the shot was solved for a flat 6.5-unit dais. The
    // bounding sphere would be far too generous for a squat diorama seen
    // at a three-quarter angle, so weight the height down rather than
    // leaving the table swimming in empty panel.
    const worldBox = new THREE.Box3().setFromObject(root);
    const worldSize = worldBox.getSize(new THREE.Vector3());
    frameRadius = Math.max(
      DAIS_RADIUS,
      Math.hypot(Math.max(worldSize.x, worldSize.z) / 2, worldSize.y * 0.46),
    );
    // Aim at the sculpt's hearth. That is both the most interesting part
    // of the model and, because `lookAt` centres its target, the thing
    // the centre readout ends up sitting on.
    frameLift = Math.max(
      0,
      worldBox.min.y + worldSize.y * (config.heartY ?? 0.36),
    );
    lookDamping = 0.3;

    // Dark carved stone eats the candlelight the flat dais was lit for.
    ambient.intensity = 1.75;
    sky.intensity = 1.35;
    key.intensity = 2.1;
    fill.intensity = 0.8;

    // The sculpt is the table now.
    if (config.hideDais !== false) {
      dais.visible = false;
      rim.visible = false;
    }
    // Where the road lands. Measure the sculpt first, then let the config
    // override any part of the answer.
    const walkway =
      config.autoFitRoad === false ? null : measureWalkway(THREE, root);

    // A sculpt with a walkway has its own centrepiece; the painted
    // medallion would only clip through it.
    const hideMedallion = config.hideMedallion ?? Boolean(walkway);
    if (hideMedallion) medallion.visible = false;

    if (walkway) {
      // Inset from the rim, and stand clear of whatever rises in the middle.
      roadShape.outer =
        config.roadOuter ?? walkway.plateRadius * walkway.outerFraction * 0.9;
      roadShape.inner =
        config.roadInner ??
        Math.max(
          walkway.plateRadius * walkway.innerFraction * 1.1,
          roadShape.outer * 0.4,
        );
      roadShape.drop = config.roadDrop ?? 0;
      // Keep the spiral from inverting if the measurement is odd.
      if (roadShape.inner >= roadShape.outer) {
        roadShape.inner = roadShape.outer * 0.6;
      }
      relayoutRoad();
    } else if (
      config.roadOuter ||
      config.roadInner ||
      config.roadDrop != null
    ) {
      roadShape.outer = config.roadOuter ?? roadShape.outer;
      roadShape.inner = config.roadInner ?? roadShape.inner;
      roadShape.drop = config.roadDrop ?? roadShape.drop;
      relayoutRoad();
    }

    // Lift the road so it rides the sculpt rather than sinking into it.
    // With a measured walkway we know its exact height; without one, fall
    // back to sitting on top of the whole bounding box.
    const lift =
      config.roadY ??
      config.spiralY ??
      (walkway
        ? walkway.plateTop + 0.05
        : (box.max.y - box.min.y) * scale - 1.62 + 0.06);
    roadGroup.position.y = lift;
    tokenGroup.position.y = lift;
    threadGroup.position.y = lift;
    if (!hideMedallion) medallion.position.y = lift - 0.04;
    if (config.spiralRadius) {
      const factor = config.spiralRadius / WORLD_RADIUS;
      roadGroup.scale.setScalar(factor);
      tokenGroup.scale.setScalar(factor);
      threadGroup.scale.setScalar(factor);
    }
  };

  void mountModel().catch(() => {
    // A malformed or unreachable model must never take the table down.
  });

  /* ---------------- the loop ---------------- */
  const clock = new THREE.Clock();
  let frame = 0;

  // --- adaptive quality ---------------------------------------------
  // Software rasterisers and weak integrated GPUs cannot carry the full
  // scene. Rather than guess from a device string, watch the actual frame
  // cost for two seconds and shed load in two steps if it is too high.
  let quality = 2;
  let judged = false;
  let sampled = 0;
  let sampleCost = 0;
  const degrade = () => {
    quality -= 1;
    // Glow is the most expensive thing here and the first to go.
    if (composer && glowOverride !== "1") {
      composer.dispose?.();
      composer = null;
    }
    if (quality === 1) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
      (embers.material as import("three").PointsMaterial).opacity = 0.35;
      scene.remove(rail);
    } else if (quality <= 0) {
      renderer.setPixelRatio(0.7);
      embers.visible = false;
      authorityLamp.intensity = 0;
      for (const candle of candles) {
        if (candle.light) candle.light.intensity = 0;
      }
      ambient.intensity = 2.1;
      key.intensity = 2.0;
    }
  };

  /* ---------------- glow ----------------
   * Emissive materials on their own only ever get as bright as white.
   * A bloom pass is what turns the hearth crystal, the gold inlay and
   * the Static into things that actually throw light at the reader.
   * It costs a full-screen blur chain, so it is only fitted after the
   * frame-cost sampler has proved the machine can carry it, and it is
   * the first thing dropped when the machine cannot. */
  let composer: {
    render: (delta: number) => void;
    setSize: (w: number, h: number) => void;
    dispose?: () => void;
  } | null = null;

  // `?glow=1` fits the pass regardless of measured frame cost and `?glow=0`
  // suppresses it — the only way to see the glow on a machine without a
  // GPU, which is exactly the machine this gets tested on.
  const glowOverride = new URLSearchParams(window.location.search).get("glow");

  const fitBloom = async () => {
    if (composer || glowOverride === "0") return;
    if (quality < 2 && glowOverride !== "1") return;
    const [
      { EffectComposer },
      { RenderPass },
      { UnrealBloomPass },
      { OutputPass },
    ] = await Promise.all([
      import("three/examples/jsm/postprocessing/EffectComposer.js"),
      import("three/examples/jsm/postprocessing/RenderPass.js"),
      import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
      import("three/examples/jsm/postprocessing/OutputPass.js"),
    ]);
    if (disposed || (quality < 2 && glowOverride !== "1")) return;
    const built = new EffectComposer(renderer);
    built.addPass(new RenderPass(scene, camera));
    built.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(host.clientWidth || 1, host.clientHeight || 1),
        // Strength, radius, threshold. The threshold is high on purpose:
        // only things meant to be burning should bloom, or the whole
        // table turns to fog.
        0.58,
        0.72,
        0.84,
      ),
    );
    built.addPass(new OutputPass());
    built.setSize(host.clientWidth || 1, host.clientHeight || 1);
    composer = built;
  };

  const tick = () => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    const rawDelta = clock.getDelta();
    const delta = Math.min(rawDelta, 0.05);
    const time = clock.elapsedTime;

    if (quality > 0 && !judged && time > 0.9) {
      sampled += 1;
      sampleCost += rawDelta;
      if (sampleCost > 2) {
        judged = true;
        const average = sampleCost / Math.max(1, sampled);
        if (average > 0.1) {
          degrade();
          degrade();
        } else if (average > 0.042) {
          degrade();
        }
        void fitBloom().catch(() => {
          // No bloom is a worse-looking table, not a broken one.
        });
      }
    }

    // Camera eases to the current shot, with a slow living drift.
    orbit += delta * 0.06;
    const bob = Math.cos(orbit * 0.8) * 0.26;
    const breath = Math.sin(orbit * 0.62) * 0.18;
    // The authored shot, then the reader's own angle on top of it.
    orbitPivot.set(0, lookTarget.y, 0);
    orbitOffset
      .set(camTarget.x, camTarget.y + bob, camTarget.z + breath)
      .sub(orbitPivot);
    if (view.dirty) {
      orbitSpherical.setFromVector3(orbitOffset);
      orbitSpherical.theta += view.yaw;
      // Below about twenty degrees above the horizon the sculpt's own
      // arms cross the road end-on and no amount of ghosting reads well,
      // so the tilt stops there rather than allowing a useless view.
      orbitSpherical.phi = Math.min(
        1.24,
        Math.max(0.22, orbitSpherical.phi - view.pitch),
      );
      orbitSpherical.radius *= view.zoom;
      orbitOffset.setFromSpherical(orbitSpherical);
    }
    camera.position.lerp(
      orbitOffset.add(orbitPivot),
      1 - Math.pow(0.0016, delta),
    );
    if (shake > 0.001) {
      shake *= Math.pow(0.02, delta);
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.4;
    }
    camera.fov += (shot.fov - camera.fov) * (1 - Math.pow(0.004, delta));
    camera.updateProjectionMatrix();
    lookNow.lerp(lookTarget, 1 - Math.pow(0.004, delta));
    camera.lookAt(lookNow);

    // Tokens glide the spiral and always face the reader. A traveller in
    // motion rises off the stone and its shadow spreads and thins, which
    // is what makes the move read as a move rather than a slide.
    for (const token of tokens.values()) {
      const distance = token.group.position.distanceTo(token.target);
      token.group.position.lerp(token.target, 1 - Math.pow(0.006, delta));
      token.card.quaternion.copy(camera.quaternion);

      const travelling = Math.min(1, distance * 1.9);
      token.hop += (travelling - token.hop) * (1 - Math.pow(0.02, delta));
      const lift = token.hop * 0.26;
      token.card.position.y = 0.42 + lift;
      token.glow.position.y = 0.44 + lift;
      const shadowMaterial = token.shadow
        .material as import("three").MeshBasicMaterial;
      shadowMaterial.opacity = 0.85 - token.hop * 0.45;
      token.shadow.scale.setScalar(0.78 + token.hop * 0.34);
      token.halo.scale.setScalar(0.62 + Math.sin(time * 2.4) * 0.03);
    }
    if (activeToken) {
      authorityLamp.position.set(
        activeToken.group.position.x,
        activeToken.group.position.y + 0.55,
        activeToken.group.position.z,
      );
      authorityLamp.intensity += (2.6 - authorityLamp.intensity) * 0.08;
    } else {
      authorityLamp.intensity *= 0.9;
    }

    // Candles breathe.
    for (const candle of candles) {
      const flicker =
        7.0 +
        Math.sin(time * 7 + candle.phase) * 0.9 +
        Math.sin(time * 17.3 + candle.phase * 2) * 0.5;
      if (candle.light) candle.light.intensity = flicker;
      candle.flame.scale.setScalar(0.85 + (flicker - 7.0) * 0.16);
    }

    // Fracture flash washes the whole table red.
    if (flash > 0.001) {
      flash *= Math.pow(0.06, delta);
      renderer.toneMappingExposure = 1.15 + flash * 1.5;
      scene.fog!.color.setHex(0x2a0806);
    } else {
      renderer.toneMappingExposure +=
        (1.15 - renderer.toneMappingExposure) * 0.1;
    }

    // Embers rise and wrap.
    const positions = emberGeo.attributes.position.array as Float32Array;
    for (let index = 0; index < emberCount; index += 1) {
      const i3 = index * 3;
      positions[i3 + 1] += delta * emberSeed[index] * 0.32;
      positions[i3] += Math.sin(time * 0.5 + index) * delta * 0.06;
      if (positions[i3 + 1] > 2.4) {
        positions[i3 + 1] = -1.25;
      }
    }
    emberGeo.attributes.position.needsUpdate = true;

    // Arrival rings open and fade.
    for (const flare of flares) {
      if (flare.life <= 0) continue;
      flare.life -= delta * 1.5;
      if (flare.life <= 0) {
        flare.mesh.visible = false;
        continue;
      }
      const grown = 1 + (1 - flare.life) * 2.6;
      flare.mesh.scale.set(grown, grown, 1);
      (flare.mesh.material as import("three").MeshBasicMaterial).opacity =
        flare.life * flare.life * 0.9;
    }

    // Threads shimmer along their length.
    threadMat.opacity = 0.5 + Math.sin(time * 2.2) * 0.22;

    // The medallion turns, slowly, the way the road does.
    medallion.rotation.z -= delta * 0.05;

    if (composer) composer.render(delta);
    else renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(tick);

  /* ---------------- resize ---------------- */
  const resize = () => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    computeFrame();
    camTarget.set(
      shot.pos[0] * frameScale,
      shot.pos[1] * frameScale,
      shot.pos[2] * frameScale,
    );
  };
  const observer =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  window.addEventListener("resize", resize);
  resize();

  return {
    update,
    orbitBy,
    zoomBy,
    resetView,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointercancel", onPointerUp);
      host.removeEventListener("wheel", onWheel);
      if (modelRoot) scene.remove(modelRoot);
      scene.traverse((object) => {
        const mesh = object as import("three").Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as
          import("three").Material | import("three").Material[] | undefined;
        if (Array.isArray(material))
          material.forEach((entry) => entry.dispose());
        else material?.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
