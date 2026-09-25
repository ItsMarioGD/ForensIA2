// Deterministic 2-vehicle crash simulation with configurable scenarios.
// Physics is simplified: constant-velocity approach, inelastic collision using
// conservation of momentum, then linear deceleration due to friction.
// Coordinates are in world units (meters). +Z is "north". Y is up.

export type Vec3 = { x: number; y: number; z: number };

export type VehicleState = {
  position: Vec3;
  velocity: Vec3;
  heading: number; // yaw in radians
  spinning: number; // angular velocity after impact (rad/s)
};

export type Scenario = {
  id: string;
  label: string;
  description: string;
  duration: number; // seconds
  impactTime: number; // seconds
  frictionAfterImpact: number; // m/s^2 deceleration
  a: VehicleInit;
  b: VehicleInit;
};

export type VehicleInit = {
  color: string;
  name: string;
  mass: number; // kg
  start: Vec3;
  velocity: Vec3; // m/s
  heading: number;
};

export type Frame = {
  t: number;
  a: VehicleState;
  b: VehicleState;
  impacted: boolean;
  impactPoint: Vec3 | null;
};

const kmh = (v: number) => v / 3.6;

// Half-body radius for collision purposes (matches car length in Car.tsx ≈ 4.5m).
export const VEHICLE_HALF = 2.25;

// Helper: given a desired impact position, an impact time and a velocity vector,
// compute the start position so that the vehicle's CENTER is exactly at
// `impactPos + offset` at t = impactTime (offset lets bumpers touch instead of
// centers overlapping).
function startForImpact(impactPos: Vec3, offset: Vec3, velocity: Vec3, t: number): Vec3 {
  return {
    x: impactPos.x + offset.x - velocity.x * t,
    y: 0,
    z: impactPos.z + offset.z - velocity.z * t,
  };
}

// Build the four physics-based presets so vehicles ACTUALLY meet at the stated
// impact time — bumpers touching at the origin, not a made-up moment in space.
function buildPresets(): Scenario[] {
  const impact = { x: 0, y: 0, z: 0 };
  const HALF = VEHICLE_HALF;

  // ── 1. T-bone (A east, B coming from south heading north): meet at origin at t=1.6s ──
  const tBoneT = 1.6;
  const velA1: Vec3 = { x: kmh(55), y: 0, z: 0 };
  // B moves north in world convention (−Z direction); its front will touch A's side at origin
  const velB1: Vec3 = { x: 0, y: 0, z: -kmh(70) };
  const startA1 = startForImpact(impact, { x: -HALF, y: 0, z: 0 }, velA1, tBoneT);
  const startB1 = startForImpact(impact, { x: 0, y: 0, z: HALF }, velB1, tBoneT);

  // ── 2. Head-on (A east, B west) — front-to-front at origin ──
  const headT = 1.5;
  const velA2: Vec3 = { x: kmh(65), y: 0, z: 0 };
  const velB2: Vec3 = { x: -kmh(55), y: 0, z: 0 };
  const startA2 = startForImpact(impact, { x: -HALF, y: 0, z: 0 }, velA2, headT);
  const startB2 = startForImpact(impact, { x: HALF, y: 0, z: 0 }, velB2, headT);

  // ── 3. Rear-end (B catches A on the same lane) ──
  const rearT = 1.8;
  const velA3: Vec3 = { x: kmh(40), y: 0, z: 0 };
  const velB3: Vec3 = { x: kmh(85), y: 0, z: 0 };
  // B's front hits A's rear at the origin: A's center is at +HALF, B's at -HALF
  const startA3 = startForImpact(impact, { x: HALF, y: 0, z: 0 }, velA3, rearT);
  const startB3 = startForImpact(impact, { x: -HALF, y: 0, z: 0 }, velB3, rearT);

  // ── 4. Sideswipe (parallel lanes, B drifts into A) — offset in Z, touch at origin ──
  const swipeT = 1.8;
  const velA4: Vec3 = { x: kmh(70), y: 0, z: 0 };
  const velB4: Vec3 = { x: kmh(90), y: 0, z: -kmh(9) };
  // A stays in its lane at z=-1.0; B drifts down from z=+1.0 to z=-1.0 by impact
  const startA4 = startForImpact(impact, { x: -HALF * 0.4, y: 0, z: -1.0 }, velA4, swipeT);
  const startB4 = startForImpact(impact, { x: HALF * 0.4, y: 0, z: 1.0 }, velB4, swipeT);

  // Car meshes face -Z at heading=0 (north); +π/2 rotates them to face +X (east).
  const EAST = Math.PI / 2;
  const WEST = -Math.PI / 2;

  return [
    {
      id: "t-bone",
      label: "Impacto lateral (T-bone)",
      description:
        "Vehículo A (sedán) cruza la intersección de oeste a este; Vehículo B (SUV) impacta el lateral izquierdo desde el sur.",
      duration: 6,
      impactTime: tBoneT,
      frictionAfterImpact: 5.5,
      a: {
        name: "Vehículo A",
        color: "#4b7cff",
        mass: 1400,
        start: startA1,
        velocity: velA1,
        heading: EAST,
      },
      b: {
        name: "Vehículo B",
        color: "#ff5b6b",
        mass: 2100,
        start: startB1,
        velocity: velB1,
        heading: 0, // facing north — same as default (-Z)
      },
    },
    {
      id: "head-on",
      label: "Choque frontal",
      description:
        "Vehículo A y Vehículo B en trayectoria de colisión frontal — sus bumpers se encuentran en el origen a los 1.5 s.",
      duration: 5,
      impactTime: headT,
      frictionAfterImpact: 6.5,
      a: {
        name: "Vehículo A",
        color: "#4b7cff",
        mass: 1500,
        start: startA2,
        velocity: velA2,
        heading: EAST,
      },
      b: {
        name: "Vehículo B",
        color: "#ff5b6b",
        mass: 1600,
        start: startB2,
        velocity: velB2,
        heading: WEST,
      },
    },
    {
      id: "rear-end",
      label: "Alcance por atrás",
      description:
        "Vehículo B se aproxima a alta velocidad y alcanza al Vehículo A que circula más lento en el mismo carril.",
      duration: 6,
      impactTime: rearT,
      frictionAfterImpact: 4.0,
      a: {
        name: "Vehículo A",
        color: "#4b7cff",
        mass: 1400,
        start: startA3,
        velocity: velA3,
        heading: EAST,
      },
      b: {
        name: "Vehículo B",
        color: "#ff5b6b",
        mass: 1800,
        start: startB3,
        velocity: velB3,
        heading: EAST,
      },
    },
    {
      id: "sideswipe",
      label: "Roce lateral (sideswipe)",
      description:
        "Vehículo B invade el carril izquierdo y roza lateralmente al Vehículo A a alta velocidad.",
      duration: 6,
      impactTime: swipeT,
      frictionAfterImpact: 4.5,
      a: {
        name: "Vehículo A",
        color: "#4b7cff",
        mass: 1400,
        start: startA4,
        velocity: velA4,
        heading: EAST,
      },
      b: {
        name: "Vehículo B",
        color: "#ff5b6b",
        mass: 1500,
        start: startB4,
        velocity: velB4,
        heading: EAST - 0.08,
      },
    },
  ];
}

export const SCENARIOS: Scenario[] = buildPresets();

const clone = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const mag = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

function decelerate(velocity: Vec3, dv: number): Vec3 {
  const m = mag(velocity);
  if (m < 1e-4) return { x: 0, y: 0, z: 0 };
  const factor = Math.max(0, m - dv) / m;
  return scale(velocity, factor);
}

// Distance threshold used to consider two vehicles "in contact".
export const COLLISION_DISTANCE = VEHICLE_HALF * 2 + 0.2;

export function computeFrame(scenario: Scenario, t: number): Frame {
  const T = Math.max(0, Math.min(scenario.duration, t));
  const preT = Math.min(T, scenario.impactTime);
  const postT = Math.max(0, T - scenario.impactTime);

  // Pre-impact
  let posA = add(scenario.a.start, scale(scenario.a.velocity, preT));
  let posB = add(scenario.b.start, scale(scenario.b.velocity, preT));
  let velA = clone(scenario.a.velocity);
  let velB = clone(scenario.b.velocity);
  let headingA = scenario.a.heading;
  let headingB = scenario.b.heading;
  let spinA = 0;
  let spinB = 0;
  let impactPoint: Vec3 | null = null;
  const impacted = T >= scenario.impactTime;

  if (impacted) {
    // Compute impact velocities via conservation of momentum (inelastic partial).
    const mA = scenario.a.mass;
    const mB = scenario.b.mass;
    // Use a coefficient of restitution based on scenario type (roughly).
    const e = scenario.id === "sideswipe" ? 0.35 : scenario.id === "rear-end" ? 0.25 : 0.15;

    // 1D-ish combined result on each axis with restitution
    const combine = (uA: number, uB: number) => {
      const vA = (mA * uA + mB * uB - mB * e * (uA - uB)) / (mA + mB);
      const vB = (mA * uA + mB * uB + mA * e * (uA - uB)) / (mA + mB);
      return [vA, vB] as const;
    };

    const [vAx, vBx] = combine(velA.x, velB.x);
    const [vAz, vBz] = combine(velA.z, velB.z);
    const postVelA = { x: vAx, y: 0, z: vAz };
    const postVelB = { x: vBx, y: 0, z: vBz };

    // Impact point at the actual meeting position (posA and posB at t=impactTime
    // are close by construction). Use them directly rather than a mid-air point.
    const impactPosA = add(scenario.a.start, scale(scenario.a.velocity, scenario.impactTime));
    const impactPosB = add(scenario.b.start, scale(scenario.b.velocity, scenario.impactTime));
    impactPoint = {
      x: (impactPosA.x + impactPosB.x) / 2,
      y: 0.6,
      z: (impactPosA.z + impactPosB.z) / 2,
    };

    // Apply post-impact motion with friction
    const dv = scenario.frictionAfterImpact * postT;
    velA = decelerate(postVelA, dv);
    velB = decelerate(postVelB, dv);

    // Simple integration
    const avgVelA = decelerate(postVelA, dv / 2);
    const avgVelB = decelerate(postVelB, dv / 2);
    posA = add(posA, scale(avgVelA, postT));
    posB = add(posB, scale(avgVelB, postT));

    // Spin depending on scenario and mass ratio
    const swirl = scenario.id === "t-bone" ? 2.2 : scenario.id === "sideswipe" ? 1.6 : 0.8;
    spinA = (swirl * mB) / (mA + mB) * Math.sign(velB.z - velA.z || 1);
    spinB = -(swirl * mA) / (mA + mB) * Math.sign(velA.x - velB.x || 1);
    // Damp spin over time
    const damp = Math.exp(-postT * 0.6);
    spinA *= damp;
    spinB *= damp;
    headingA += spinA * postT;
    headingB += spinB * postT;
  } else {
    // heading follows velocity when moving straight (no change here)
  }

  return {
    t: T,
    impacted,
    impactPoint,
    a: { position: posA, velocity: velA, heading: headingA, spinning: spinA },
    b: { position: posB, velocity: velB, heading: headingB, spinning: spinB },
  };
}

export function sampleTrajectory(scenario: Scenario, samples = 240): { a: Vec3[]; b: Vec3[] } {
  const a: Vec3[] = [];
  const b: Vec3[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * scenario.duration;
    const f = computeFrame(scenario, t);
    a.push({ x: f.a.position.x, y: 0.05, z: f.a.position.z });
    b.push({ x: f.b.position.x, y: 0.05, z: f.b.position.z });
  }
  return { a, b };
}

export function speedKmh(v: Vec3): number {
  return mag(v) * 3.6;
}
