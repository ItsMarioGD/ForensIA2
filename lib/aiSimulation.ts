// AI-driven simulation source: takes the JSON returned by Pollinations
// (the same schema ForensAI/PHP already uses) and turns it into a "playable"
// scenario that our renderer can consume alongside the physics-based presets.
//
// The AI returns keyframes in `animacion_actores` at seconds `segundo`, with
// (x, y, angulo) for each of two vehicles. We interpolate linearly between
// consecutive keyframes and derive velocity by numerical differentiation.

import type { Scenario, Vec3, Frame, VehicleState } from "./simulation";

export type AiFrame = {
  segundo: number;
  v1_x: number;
  v1_y: number;
  v1_angulo: number;
  v2_x: number;
  v2_y: number;
  v2_angulo: number;
};

export type Infrastructure =
  | "interseccion_cruciforme"
  | "recta"
  | "curva"
  | "rotonda";

export type LightingEngine = "daylight" | "night" | "overcast" | "sunset";
export type EnvironmentKind = "rural" | "urban" | "highway";

export type AiPayload = {
  infraestructura: Infrastructure;
  dictamen_tecnico: string;
  v1_color?: string;
  v2_color?: string;
  v1_tipo?: string;
  v2_tipo?: string;
  animacion_actores: AiFrame[];
  vehicle_model?: string;
  smooth_shading?: boolean;
  environment?: EnvironmentKind;
  lighting_engine?: LightingEngine;
  physics_engine?: string;
  part_detachment?: boolean;
  tire_marks?: boolean;
};

export type AiScenario = Scenario & {
  ai: AiPayload;
  keyframes: AiFrame[];
  fixedImpactPoint: Vec3;
};

// Named CSS colors used by the PHP payload (rojo/azul/etc.) → hex fallback
const COLOR_MAP: Record<string, string> = {
  rojo: "#ff5b6b",
  red: "#ff5b6b",
  azul: "#4b7cff",
  blue: "#4b7cff",
  verde: "#4bd0a3",
  green: "#4bd0a3",
  amarillo: "#ffd24b",
  yellow: "#ffd24b",
  negro: "#2b2f45",
  black: "#2b2f45",
  blanco: "#e6ecff",
  white: "#e6ecff",
  gris: "#8ea0c8",
  gray: "#8ea0c8",
  grey: "#8ea0c8",
  naranja: "#ff9b4b",
  orange: "#ff9b4b",
};

function resolveColor(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.startsWith("#")) return trimmed;
  return COLOR_MAP[trimmed] ?? fallback;
}

import { VEHICLE_HALF } from "./simulation";

// Convert AI raw frames (v1_y = north/south in the story, v1_angulo in degrees)
// into our internal convention: world z = -v1_y (so "hacia el norte" maps to
// −z in Three.js), heading = -(angulo * PI/180) — same mapping the original
// ForensAI frontend applied when placing meshes.
function normalizeFrames(raw: AiFrame[]): AiFrame[] {
  return raw
    .slice()
    .sort((a, b) => a.segundo - b.segundo)
    .map((f) => ({
      segundo: f.segundo,
      v1_x: f.v1_x,
      v1_y: -f.v1_y,
      v1_angulo: -((f.v1_angulo * Math.PI) / 180),
      v2_x: f.v2_x,
      v2_y: -f.v2_y,
      v2_angulo: -((f.v2_angulo * Math.PI) / 180),
    }));
}

// The AI often produces trajectories where the two vehicles pass wide of each
// other or "impact" from meters apart. This rewrites the keyframes so at the
// closest-approach frame the two vehicles' centers are exactly at 2·HALF along
// the line that connects them (bumpers touching). Frames adjacent to the
// impact frame are blended with a triangular window so the correction fades
// smoothly across the animation instead of teleporting anyone.
function enforceCollision(frames: AiFrame[]): {
  frames: AiFrame[];
  impactIndex: number;
  impactPoint: { x: number; z: number };
} {
  // 1. Find frame with minimum inter-vehicle center distance.
  let minDist = Infinity;
  let k = 0;
  for (let i = 0; i < frames.length; i++) {
    const dx = frames[i].v1_x - frames[i].v2_x;
    const dz = frames[i].v1_y - frames[i].v2_y;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < minDist) {
      minDist = d;
      k = i;
    }
  }

  // 2. At frame k, compute where each vehicle should be so bumpers touch.
  const f = frames[k];
  const dx = f.v1_x - f.v2_x;
  const dz = f.v1_y - f.v2_y;
  const dist = Math.max(1e-4, Math.sqrt(dx * dx + dz * dz));
  const ux = dx / dist;
  const uz = dz / dist;
  const midX = (f.v1_x + f.v2_x) / 2;
  const midZ = (f.v1_y + f.v2_y) / 2;
  const targetA = { x: midX + ux * VEHICLE_HALF, z: midZ + uz * VEHICLE_HALF };
  const targetB = { x: midX - ux * VEHICLE_HALF, z: midZ - uz * VEHICLE_HALF };
  const deltaAx = targetA.x - f.v1_x;
  const deltaAz = targetA.z - f.v1_y;
  const deltaBx = targetB.x - f.v2_x;
  const deltaBz = targetB.z - f.v2_y;

  // 3. Apply a triangular blend of the correction across all frames.
  //    Weight is 1.0 at frame k, falling linearly to 0 at the ends.
  const N = frames.length;
  const out = frames.map((raw, i) => {
    const w = 1 - Math.abs(i - k) / Math.max(1, Math.max(k, N - 1 - k));
    const wc = Math.max(0, w);
    return {
      ...raw,
      v1_x: raw.v1_x + deltaAx * wc,
      v1_y: raw.v1_y + deltaAz * wc,
      v2_x: raw.v2_x + deltaBx * wc,
      v2_y: raw.v2_y + deltaBz * wc,
    };
  });

  return {
    frames: out,
    impactIndex: k,
    impactPoint: { x: midX, z: midZ },
  };
}

// Build an AiScenario from raw payload. All physics-based fields (mass, etc.)
// are still populated so the shared telemetry code keeps working.
export function scenarioFromAi(payload: AiPayload): AiScenario {
  const normalized = normalizeFrames(payload.animacion_actores);
  if (normalized.length < 2) throw new Error("Se requieren al menos 2 keyframes.");
  const enforced = enforceCollision(normalized);
  const frames = enforced.frames;

  const first = frames[0];
  const last = frames[frames.length - 1];
  const duration = Math.max(1, last.segundo - first.segundo);

  const startA: Vec3 = { x: first.v1_x, y: 0, z: first.v1_y };
  const startB: Vec3 = { x: first.v2_x, y: 0, z: first.v2_y };
  // Approximate initial velocities from the first two frames
  const dt0 = frames[1].segundo - frames[0].segundo || 0.1;
  const velA: Vec3 = {
    x: (frames[1].v1_x - frames[0].v1_x) / dt0,
    y: 0,
    z: (frames[1].v1_y - frames[0].v1_y) / dt0,
  };
  const velB: Vec3 = {
    x: (frames[1].v2_x - frames[0].v2_x) / dt0,
    y: 0,
    z: (frames[1].v2_y - frames[0].v2_y) / dt0,
  };

  // Impact time = the frame at which vehicles collide (already enforced).
  const impactTime = Math.max(
    0,
    Math.min(duration, frames[enforced.impactIndex].segundo - first.segundo)
  );

  const scenario: AiScenario = {
    id: "ai",
    label: "IA · " + (payload.dictamen_tecnico?.slice(0, 40) ?? "Escenario generado"),
    description: payload.dictamen_tecnico ?? "Simulación generada por IA.",
    duration,
    impactTime,
    frictionAfterImpact: 4.5,
    a: {
      name: "Vehículo 1",
      color: resolveColor(payload.v1_color, "#4b7cff"),
      mass: 1500,
      start: startA,
      velocity: velA,
      heading: first.v1_angulo,
    },
    b: {
      name: "Vehículo 2",
      color: resolveColor(payload.v2_color, "#ff5b6b"),
      mass: 1500,
      start: startB,
      velocity: velB,
      heading: first.v2_angulo,
    },
    ai: payload,
    keyframes: frames,
    fixedImpactPoint: { x: enforced.impactPoint.x, y: 0.6, z: enforced.impactPoint.z },
  };
  return scenario;
}

// Interpolate a keyframe animation at time t
export function computeAiFrame(scenario: AiScenario, tRaw: number): Frame {
  const frames = scenario.keyframes;
  const t0 = frames[0].segundo;
  const t = Math.max(0, Math.min(scenario.duration, tRaw));
  const abs = t + t0;

  // Find segment
  let idx = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    if (abs >= frames[i].segundo && abs <= frames[i + 1].segundo) {
      idx = i;
      break;
    }
    if (abs > frames[i + 1].segundo) idx = i + 1;
  }
  idx = Math.min(idx, frames.length - 2);

  const f0 = frames[idx];
  const f1 = frames[idx + 1];
  const span = f1.segundo - f0.segundo || 1e-6;
  const u = Math.max(0, Math.min(1, (abs - f0.segundo) / span));

  const posA: Vec3 = {
    x: f0.v1_x + (f1.v1_x - f0.v1_x) * u,
    y: 0,
    z: f0.v1_y + (f1.v1_y - f0.v1_y) * u,
  };
  const posB: Vec3 = {
    x: f0.v2_x + (f1.v2_x - f0.v2_x) * u,
    y: 0,
    z: f0.v2_y + (f1.v2_y - f0.v2_y) * u,
  };
  const headingA = shortestAngleLerp(f0.v1_angulo, f1.v1_angulo, u);
  const headingB = shortestAngleLerp(f0.v2_angulo, f1.v2_angulo, u);

  // Velocity via finite differences over the current segment
  const velA: Vec3 = {
    x: (f1.v1_x - f0.v1_x) / span,
    y: 0,
    z: (f1.v1_y - f0.v1_y) / span,
  };
  const velB: Vec3 = {
    x: (f1.v2_x - f0.v2_x) / span,
    y: 0,
    z: (f1.v2_y - f0.v2_y) / span,
  };

  // Impact fires once the vehicle bodies overlap (distance <= 2·HALF + margin)
  // OR the AI-stated impact time has passed. The impact point is the fixed
  // meeting point stored on the scenario (computed by enforceCollision) so it
  // stays anchored even after the vehicles slide past each other.
  const cdx = posA.x - posB.x;
  const cdz = posA.z - posB.z;
  const centerDist = Math.sqrt(cdx * cdx + cdz * cdz);
  const collided = centerDist <= VEHICLE_HALF * 2 + 0.3;
  const impacted = collided || t >= scenario.impactTime;
  const impactPoint: Vec3 | null = impacted ? scenario.fixedImpactPoint : null;

  const a: VehicleState = { position: posA, velocity: velA, heading: headingA, spinning: 0 };
  const b: VehicleState = { position: posB, velocity: velB, heading: headingB, spinning: 0 };
  return { t, a, b, impacted, impactPoint };
}

function shortestAngleLerp(a: number, b: number, u: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * u;
}

export function sampleAiTrajectory(scenario: AiScenario, samples = 240): { a: Vec3[]; b: Vec3[] } {
  const a: Vec3[] = [];
  const b: Vec3[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * scenario.duration;
    const f = computeAiFrame(scenario, t);
    a.push({ x: f.a.position.x, y: 0.05, z: f.a.position.z });
    b.push({ x: f.b.position.x, y: 0.05, z: f.b.position.z });
  }
  return { a, b };
}

export function isAiScenario(s: Scenario | AiScenario): s is AiScenario {
  return (s as AiScenario).keyframes !== undefined;
}
