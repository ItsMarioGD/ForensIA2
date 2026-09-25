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

export const SCENARIOS: Scenario[] = [
  {
    id: "t-bone",
    label: "Impacto lateral (T-bone)",
    description: "Vehículo A (sedán) cruza la intersección; Vehículo B (SUV) impacta desde la derecha.",
    duration: 6,
    impactTime: 2.4,
    frictionAfterImpact: 5.5,
    a: {
      name: "Vehículo A",
      color: "#4b7cff",
      mass: 1400,
      start: { x: -22, y: 0, z: 0 },
      velocity: { x: kmh(55), y: 0, z: 0 },
      heading: 0,
    },
    b: {
      name: "Vehículo B",
      color: "#ff5b6b",
      mass: 2100,
      start: { x: 10, y: 0, z: -22 },
      velocity: { x: 0, y: 0, z: kmh(70) },
      heading: Math.PI / 2,
    },
  },
  {
    id: "head-on",
    label: "Choque frontal",
    description: "Dos vehículos en trayectoria de colisión frontal por invasión de carril.",
    duration: 5,
    impactTime: 2.0,
    frictionAfterImpact: 6.5,
    a: {
      name: "Vehículo A",
      color: "#4b7cff",
      mass: 1500,
      start: { x: -25, y: 0, z: 0 },
      velocity: { x: kmh(65), y: 0, z: 0 },
      heading: 0,
    },
    b: {
      name: "Vehículo B",
      color: "#ff5b6b",
      mass: 1600,
      start: { x: 25, y: 0, z: 0 },
      velocity: { x: -kmh(55), y: 0, z: 0 },
      heading: Math.PI,
    },
  },
  {
    id: "rear-end",
    label: "Alcance por atrás",
    description: "Vehículo B alcanza al Vehículo A que frena bruscamente delante.",
    duration: 6,
    impactTime: 2.6,
    frictionAfterImpact: 4.0,
    a: {
      name: "Vehículo A",
      color: "#4b7cff",
      mass: 1400,
      start: { x: 0, y: 0, z: 0 },
      velocity: { x: kmh(40), y: 0, z: 0 },
      heading: 0,
    },
    b: {
      name: "Vehículo B",
      color: "#ff5b6b",
      mass: 1800,
      start: { x: -20, y: 0, z: 0 },
      velocity: { x: kmh(85), y: 0, z: 0 },
      heading: 0,
    },
  },
  {
    id: "sideswipe",
    label: "Roce lateral (sideswipe)",
    description: "Vehículo B invade el carril y roza al Vehículo A; ambos pierden control.",
    duration: 6,
    impactTime: 2.2,
    frictionAfterImpact: 4.5,
    a: {
      name: "Vehículo A",
      color: "#4b7cff",
      mass: 1400,
      start: { x: -22, y: 0, z: -1.6 },
      velocity: { x: kmh(70), y: 0, z: 0 },
      heading: 0,
    },
    b: {
      name: "Vehículo B",
      color: "#ff5b6b",
      mass: 1500,
      start: { x: -18, y: 0, z: 1.6 },
      velocity: { x: kmh(90), y: 0, z: -kmh(6) },
      heading: -0.08,
    },
  },
];

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

    // Impact point roughly at midpoint
    impactPoint = {
      x: (posA.x + posB.x) / 2,
      y: 0.6,
      z: (posA.z + posB.z) / 2,
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
