"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "@/lib/simulation";

// Reusable particle field + expanding shockwave ring — spawns on `impacted`
// rising edge and fades out over ~2 seconds. Ports the visual language of
// ForensAI's `spawnImpactParticles` (sparks, debris, additive ring).

type Props = {
  impactPoint: Vec3 | null;
  active: boolean;
};

const PARTICLE_COUNT = 90;
const DEBRIS_COUNT = 30;

export function CrashEffects({ impactPoint, active }: Props) {
  const sparksRef = useRef<THREE.Points>(null!);
  const debrisRef = useRef<THREE.Group>(null!);
  const shockwaveRef = useRef<THREE.Mesh>(null!);
  const lightRef = useRef<THREE.PointLight>(null!);

  const sparkGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT * 3);
    const life = new Float32Array(PARTICLE_COUNT);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    (g as any)._vel = vel;
    (g as any)._life = life;
    return g;
  }, []);

  const sparkTex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,220,140,1)");
    g.addColorStop(0.4, "rgba(255,140,60,0.7)");
    g.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const debrisMeshes = useMemo(
    () =>
      Array.from({ length: DEBRIS_COUNT }).map(() => ({
        color: Math.random() > 0.4 ? "#bbddff" : "#ff4444",
        size: [
          Math.random() * 0.2 + 0.05,
          Math.random() * 0.03 + 0.01,
          Math.random() * 0.2 + 0.05,
        ] as [number, number, number],
      })),
    []
  );
  const debrisState = useRef(
    Array.from({ length: DEBRIS_COUNT }).map(() => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rotVel: new THREE.Vector3(),
      life: 0,
    }))
  );

  const impactedRef = useRef(false);
  const shockwaveState = useRef({ life: 0 });

  // Reset when impact triggers
  useEffect(() => {
    if (active && !impactedRef.current && impactPoint) {
      impactedRef.current = true;
      const cx = impactPoint.x;
      const cy = impactPoint.y;
      const cz = impactPoint.z;

      const pos = sparkGeom.attributes.position.array as Float32Array;
      const vel = (sparkGeom as any)._vel as Float32Array;
      const life = (sparkGeom as any)._life as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        pos[i * 3] = cx + (Math.random() - 0.5) * 1.6;
        pos[i * 3 + 1] = cy + Math.random() * 0.8;
        pos[i * 3 + 2] = cz + (Math.random() - 0.5) * 1.6;
        const theta = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 8;
        vel[i * 3] = Math.cos(theta) * speed;
        vel[i * 3 + 1] = 2 + Math.random() * 6;
        vel[i * 3 + 2] = Math.sin(theta) * speed;
        life[i] = 1;
      }
      sparkGeom.attributes.position.needsUpdate = true;

      for (const d of debrisState.current) {
        d.pos.set(cx + (Math.random() - 0.5) * 2, cy + Math.random() * 1.5, cz + (Math.random() - 0.5) * 2);
        d.vel.set(
          (Math.random() - 0.5) * 6,
          2 + Math.random() * 4,
          (Math.random() - 0.5) * 6
        );
        d.rotVel.set(
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6
        );
        d.life = 1;
      }

      shockwaveState.current.life = 1;
      if (lightRef.current) lightRef.current.intensity = 15;
      if (shockwaveRef.current) {
        shockwaveRef.current.position.set(cx, 0.15, cz);
        shockwaveRef.current.scale.set(0.5, 0.5, 0.5);
      }
    }
    if (!active) impactedRef.current = false;
  }, [active, impactPoint, sparkGeom]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const pos = sparkGeom.attributes.position.array as Float32Array;
    const vel = (sparkGeom as any)._vel as Float32Array;
    const life = (sparkGeom as any)._life as Float32Array;
    let anyAlive = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt * 0.9;
      vel[i * 3 + 1] -= 9.8 * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.05) {
        pos[i * 3 + 1] = 0.05;
        vel[i * 3 + 1] *= -0.3;
        vel[i * 3] *= 0.6;
        vel[i * 3 + 2] *= 0.6;
        life[i] -= 0.1;
      }
      if (life[i] > 0) anyAlive = true;
    }
    sparkGeom.attributes.position.needsUpdate = true;
    if (sparksRef.current) {
      (sparksRef.current.material as THREE.PointsMaterial).opacity = anyAlive ? 1 : 0;
    }

    // Debris
    if (debrisRef.current) {
      for (let i = 0; i < DEBRIS_COUNT; i++) {
        const d = debrisState.current[i];
        const mesh = debrisRef.current.children[i] as THREE.Mesh | undefined;
        if (!mesh) continue;
        if (d.life <= 0) {
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        d.life -= dt * 0.6;
        d.vel.y -= 9.8 * dt;
        d.pos.addScaledVector(d.vel, dt);
        if (d.pos.y < 0.06) {
          d.pos.y = 0.06;
          d.vel.y *= -0.3;
          d.vel.x *= 0.75;
          d.vel.z *= 0.75;
        }
        mesh.position.copy(d.pos);
        mesh.rotation.x += d.rotVel.x * dt;
        mesh.rotation.y += d.rotVel.y * dt;
        mesh.rotation.z += d.rotVel.z * dt;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = Math.max(0, Math.min(1, d.life));
      }
    }

    // Shockwave
    if (shockwaveRef.current) {
      const s = shockwaveState.current;
      if (s.life > 0) {
        s.life = Math.max(0, s.life - dt * 0.7);
        const scale = 0.5 + (1 - s.life) * 18;
        shockwaveRef.current.scale.set(scale, scale, scale);
        (shockwaveRef.current.material as THREE.MeshBasicMaterial).opacity = s.life * 0.7;
        shockwaveRef.current.visible = true;
      } else {
        shockwaveRef.current.visible = false;
      }
    }

    if (lightRef.current) {
      lightRef.current.intensity = Math.max(0, lightRef.current.intensity * 0.93);
    }
  });

  return (
    <group>
      {/* Sparks */}
      <points ref={sparksRef} geometry={sparkGeom} frustumCulled={false}>
        <pointsMaterial
          size={0.7}
          map={sparkTex ?? undefined}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color="#ffb84b"
          opacity={0}
        />
      </points>

      {/* Debris */}
      <group ref={debrisRef}>
        {debrisMeshes.map((d, i) => (
          <mesh key={`deb-${i}`} visible={false}>
            <boxGeometry args={d.size} />
            <meshStandardMaterial color={d.color} transparent opacity={0} roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* Shockwave */}
      <mesh ref={shockwaveRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.1, 1.5, 48]} />
        <meshBasicMaterial
          color="#ff8844"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Impact light burst */}
      {impactPoint && (
        <pointLight
          ref={lightRef}
          position={[impactPoint.x, 1.5, impactPoint.z]}
          intensity={0}
          distance={35}
          color="#ff7833"
        />
      )}
    </group>
  );
}

// Small pulsing marker on the ground at impact point
export function ImpactMarker({ position, active }: { position: Vec3 | null; active: boolean }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    if (!ref.current || !position) return;
    const pulse = 0.8 + 0.2 * Math.sin(performance.now() * 0.005);
    ref.current.scale.setScalar(pulse);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = active ? 0.9 : 0.35;
  });
  if (!position) return null;
  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[position.x, 0.06, position.z]}
    >
      <ringGeometry args={[0.9, 1.6, 40]} />
      <meshBasicMaterial color="#ff1111" side={THREE.DoubleSide} transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
}

// Skid marks laid down from the pre-impact trajectory sample.
export function SkidMarks({
  points,
  impactTime,
  duration,
  progress,
}: {
  points: Vec3[];
  impactTime: number;
  duration: number;
  progress: number;
}) {
  // Only draw the pre-impact section, and stop growing once past impact.
  const cut = useMemo(() => {
    const preFrac = impactTime / duration;
    const showFrac = Math.min(progress, preFrac);
    return Math.max(2, Math.floor(points.length * showFrac));
  }, [points.length, impactTime, duration, progress]);

  const segments = useMemo(() => {
    const arr: {
      pos: [number, number, number];
      rot: number;
      len: number;
    }[] = [];
    for (let i = 1; i < cut; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.05) continue;
      arr.push({
        pos: [(p0.x + p1.x) / 2, 0.03, (p0.z + p1.z) / 2],
        rot: -Math.atan2(dz, dx),
        len,
      });
    }
    return arr;
  }, [points, cut]);

  return (
    <group>
      {segments.map((s, i) => (
        <group key={i} position={s.pos} rotation={[-Math.PI / 2, 0, s.rot]}>
          {[-0.6, 0.6].map((off, j) => (
            <mesh key={j} position={[0, off, 0]}>
              <planeGeometry args={[s.len, 0.18]} />
              <meshBasicMaterial color="#0a0a0a" transparent opacity={0.35} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
