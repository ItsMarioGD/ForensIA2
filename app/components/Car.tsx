"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { VehicleState } from "@/lib/simulation";

export type VehicleType = "sedan" | "suv" | "camioneta" | "hatchback" | "deportivo" | "camion";

type Props = {
  state: VehicleState;
  color: string;
  emissive?: string;
  type?: VehicleType;
  wheelSpin?: number; // rotations per second — 0 stops the wheels
  brakeGlow?: number; // 0..1 taillight glow multiplier
  deformation?: number; // 0..1 — amount of squash applied after impact
};

// Comprehensive stylized vehicle — ports the geometry from ForensAI's
// `_makeVehicle` (chassis, cabin, wheels with spokes and calipers, glass with
// transmission, chrome bumpers/grille, mirrors, seats, wipers, antenna, neon
// underglow) so the on-screen model matches the original app.
export function Car({
  state,
  color,
  emissive,
  type = "sedan",
  wheelSpin = 6,
  brakeGlow = 1,
  deformation = 0,
}: Props) {
  const groupRef = useRef<THREE.Group>(null!);
  const wheelsRef = useRef<THREE.Group[]>([]);
  wheelsRef.current = [];

  const isSUV = type === "suv";
  const isPickup = type === "camioneta";
  const isSport = type === "deportivo";

  const bodyLen = isPickup ? 4.6 : isSUV ? 4.6 : isSport ? 3.8 : 4.5;
  const bodyWid = isPickup ? 1.9 : isSUV ? 1.9 : isSport ? 1.9 : 1.8;
  const bodyH = isPickup ? 0.75 : isSUV ? 0.8 : isSport ? 0.5 : 0.6;
  const cabinLen = isPickup ? 1.8 : isSUV ? 3.2 : isSport ? 1.8 : 2.2;
  const cabinW = bodyWid - 0.2;
  const cabinH = isSUV ? 1.0 : isPickup ? 0.9 : isSport ? 0.7 : 0.8;
  const wheelR = isSUV ? 0.35 : isSport ? 0.28 : 0.3;
  const wheelW = 0.22;
  const axleHalf = bodyLen / 2.8;
  const hoodLen = bodyLen * 0.25;
  const cabinY = bodyH + cabinH / 2;
  const cabinZ = isPickup ? -(bodyLen / 2 - hoodLen - cabinLen / 2) : 0;

  const bodyColorThree = useMemo(() => new THREE.Color(color), [color]);
  const emissiveHex = emissive ?? shiftHex(color, -0.15);

  // Spin wheels
  useFrame((_, dt) => {
    if (wheelSpin > 0) {
      for (const w of wheelsRef.current) {
        if (w) w.children[0] && (w.children[0].rotation.x += wheelSpin * dt);
      }
    }
    // apply subtle deformation as a squash on the group
    if (groupRef.current) {
      const target = 1 - deformation * 0.12;
      groupRef.current.scale.x = THREE.MathUtils.lerp(groupRef.current.scale.x, target, 0.15);
      groupRef.current.scale.z = THREE.MathUtils.lerp(groupRef.current.scale.z, target, 0.15);
    }
  });

  const wheelPositions: [number, number, number][] = [
    [-bodyWid / 2, wheelR, -axleHalf],
    [bodyWid / 2, wheelR, -axleHalf],
    [-bodyWid / 2, wheelR, axleHalf],
    [bodyWid / 2, wheelR, axleHalf],
  ];

  return (
    <group
      ref={groupRef}
      position={[state.position.x, state.position.y + wheelR, state.position.z]}
      rotation={[0, state.heading, 0]}
    >
      {/* 1. Chassis base */}
      <mesh castShadow receiveShadow position={[0, bodyH / 2, 0]}>
        <boxGeometry args={[bodyWid, bodyH, bodyLen]} />
        <meshPhysicalMaterial color={bodyColorThree} metalness={0.85} roughness={0.15} clearcoat={1} clearcoatRoughness={0.1} reflectivity={1} />
      </mesh>

      {/* 2. Hood (front) */}
      <mesh castShadow position={[0, bodyH * 0.65 * 0.5, -(bodyLen / 2 - hoodLen / 2)]}>
        <boxGeometry args={[bodyWid * 0.92, bodyH * 0.65, hoodLen]} />
        <meshPhysicalMaterial color={bodyColorThree} metalness={0.85} roughness={0.15} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>

      {/* 3. Trunk (rear) — not for pickup */}
      {!isPickup && (
        <mesh castShadow position={[0, bodyH * 0.65 * 0.5, bodyLen / 2 - bodyLen * 0.1]}>
          <boxGeometry args={[bodyWid * 0.88, bodyH * 0.65, bodyLen * 0.2]} />
          <meshPhysicalMaterial color={bodyColorThree} metalness={0.85} roughness={0.15} clearcoat={1} clearcoatRoughness={0.1} />
        </mesh>
      )}

      {/* 4. Cabin */}
      <mesh castShadow position={[0, cabinY, cabinZ]}>
        <boxGeometry args={[cabinW, cabinH, cabinLen]} />
        <meshPhysicalMaterial color={bodyColorThree} metalness={0.85} roughness={0.15} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>

      {/* 5. Pickup cargo bed */}
      {isPickup && (() => {
        const bedLen = bodyLen - hoodLen - cabinLen - 0.1;
        const bedZ = bodyLen / 2 - bedLen / 2;
        return (
          <group>
            <mesh castShadow position={[0, bodyH * 0.5, bedZ]}>
              <boxGeometry args={[bedLen, 0.06, bodyWid * 0.85]} />
              <meshPhysicalMaterial color="#332222" roughness={0.85} metalness={0.1} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={`bed-${s}`} position={[0, bodyH * 0.7, s * bodyWid * 0.42]}>
                <boxGeometry args={[bedLen, 0.4, 0.04]} />
                <meshPhysicalMaterial color={bodyColorThree} metalness={0.85} roughness={0.15} />
              </mesh>
            ))}
            <mesh position={[bodyLen / 2, bodyH * 0.7, 0]}>
              <boxGeometry args={[0.04, 0.4, bodyWid * 0.85]} />
              <meshPhysicalMaterial color={bodyColorThree} metalness={0.85} roughness={0.15} />
            </mesh>
          </group>
        );
      })()}

      {/* 6. Wheels — tire + rim + 5 spokes + hub cap + brake caliper */}
      {wheelPositions.map((pos, i) => (
        <group
          key={`wheel-${i}`}
          position={pos}
          ref={(g) => {
            if (g) wheelsRef.current[i] = g;
          }}
        >
          {/* tire — rotated so cylinder axis is X, the axle */}
          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[wheelR, wheelR, wheelW, 32]} />
            <meshPhysicalMaterial color="#1a1a1a" roughness={0.9} metalness={0.0} />
          </mesh>
          {/* rim */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[wheelR * 0.65, wheelR * 0.65, wheelW * 0.8, 32]} />
            <meshPhysicalMaterial color="#e0e0e0" roughness={0.05} metalness={1} />
          </mesh>
          {/* 5 spokes */}
          {Array.from({ length: 5 }).map((_, s) => {
            const a = (s / 5) * Math.PI * 2;
            return (
              <mesh key={`sp-${s}`} position={[Math.sin(a) * wheelR * 0.35, Math.cos(a) * wheelR * 0.35, 0]}>
                <boxGeometry args={[wheelR * 0.08, wheelR * 0.25, wheelW * 0.55]} />
                <meshPhysicalMaterial color="#e0e0e0" roughness={0.05} metalness={1} />
              </mesh>
            );
          })}
          {/* hub cap */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[wheelR * 0.18, wheelR * 0.2, wheelW * 0.12, 16]} />
            <meshPhysicalMaterial color="#e0e0e0" roughness={0.05} metalness={1} />
          </mesh>
          {/* brake caliper */}
          <mesh position={[0, 0, wheelW * 0.45]}>
            <boxGeometry args={[wheelR * 0.08, wheelR * 0.18, wheelW * 0.25]} />
            <meshPhysicalMaterial color="#cc1111" roughness={0.3} metalness={0.6} />
          </mesh>
        </group>
      ))}

      {/* 7. Glass — windshield, rear, sides */}
      <mesh position={[0, cabinY, cabinZ - cabinLen / 2 + 0.01]} rotation={[0.15, Math.PI, 0]}>
        <planeGeometry args={[cabinW, cabinH * 0.8]} />
        <meshPhysicalMaterial color="#020c18" roughness={0.05} metalness={0} transparent opacity={0.55} transmission={0.9} thickness={0.3} ior={1.45} clearcoat={1} />
      </mesh>
      <mesh position={[0, cabinY, cabinZ + cabinLen / 2 - 0.01]} rotation={[-0.15, 0, 0]}>
        <planeGeometry args={[cabinW, cabinH * 0.7]} />
        <meshPhysicalMaterial color="#020c18" roughness={0.05} metalness={0} transparent opacity={0.55} transmission={0.9} thickness={0.3} ior={1.45} clearcoat={1} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`sw-${s}`} position={[s * (cabinW / 2 + 0.01), cabinY, cabinZ]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[cabinLen * 0.8, cabinH * 0.7]} />
          <meshPhysicalMaterial color="#020c18" roughness={0.05} metalness={0} transparent opacity={0.55} transmission={0.9} thickness={0.3} ior={1.45} clearcoat={1} />
        </mesh>
      ))}

      {/* 8. Headlights */}
      {[-1, 1].map((s) => (
        <group key={`hl-${s}`}>
          <mesh position={[s * bodyWid * 0.42, bodyH * 0.55, -(bodyLen / 2 + 0.04)]}>
            <boxGeometry args={[0.15, 0.14, 0.08]} />
            <meshPhysicalMaterial color="#020202" roughness={0.3} metalness={0.1} />
          </mesh>
          <mesh position={[s * bodyWid * 0.42, bodyH * 0.55, -(bodyLen / 2 + 0.05)]}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshStandardMaterial color="#fffce0" emissive="#fffce0" emissiveIntensity={3.5} />
          </mesh>
          <pointLight
            position={[s * bodyWid * 0.42, bodyH * 0.55, -(bodyLen / 2 + 0.5)]}
            intensity={0.6}
            distance={18}
            color="#ffffcc"
          />
        </group>
      ))}

      {/* 9. Tail lights */}
      {[-1, 1].map((s) => (
        <group key={`tl-${s}`}>
          <mesh position={[s * bodyWid * 0.42, bodyH * 0.55, bodyLen / 2 + 0.04]}>
            <boxGeometry args={[0.15, 0.14, 0.06]} />
            <meshPhysicalMaterial color="#ff0000" roughness={0.05} metalness={0} transparent opacity={0.75} transmission={0.6} thickness={0.15} />
          </mesh>
          <mesh position={[s * bodyWid * 0.42, bodyH * 0.55, bodyLen / 2 + 0.05]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color="#ff2b3d" emissive="#ff2b3d" emissiveIntensity={2.5 * brakeGlow} />
          </mesh>
        </group>
      ))}

      {/* 10. Bumpers & grille */}
      <mesh position={[0, bodyH * 0.2, -(bodyLen / 2 + 0.06)]}>
        <boxGeometry args={[bodyWid * 0.55, 0.25, 0.12]} />
        <meshPhysicalMaterial color="#111" roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[0, bodyH * 0.15, bodyLen / 2 + 0.06]}>
        <boxGeometry args={[bodyWid * 0.55, 0.3, 0.12]} />
        <meshPhysicalMaterial color="#111" roughness={0.7} metalness={0.2} />
      </mesh>
      {/* grille bars */}
      {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
        <mesh key={`grill-${i}`} position={[0, bodyH * 0.55 + i * 0.04, -(bodyLen / 2 + 0.07)]}>
          <boxGeometry args={[bodyWid * 0.28, 0.015, 0.01]} />
          <meshPhysicalMaterial color="#e0e0e0" roughness={0.05} metalness={1} />
        </mesh>
      ))}

      {/* 11. Side mirrors */}
      {[-1, 1].map((s) => (
        <group key={`mir-${s}`} position={[s * (cabinW / 2 + 0.15), cabinY + cabinH * 0.4, cabinZ + cabinLen * 0.3]}>
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[0.04, 0.08, 0.15]} />
            <meshPhysicalMaterial color={bodyColorThree} metalness={0.85} roughness={0.15} />
          </mesh>
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[0.02, 0.06, 0.03]} />
            <meshPhysicalMaterial color="#e0e0e0" roughness={0.05} metalness={1} />
          </mesh>
        </group>
      ))}

      {/* 12. Door lines */}
      {[-1, 1].map((s) => (
        <mesh key={`dl-${s}`} position={[s * (bodyWid / 2 + 0.001), bodyH * 0.6, 0]}>
          <boxGeometry args={[0.005, bodyH * 0.5, bodyLen * 0.45]} />
          <meshPhysicalMaterial color="#020202" roughness={0.3} metalness={0.1} />
        </mesh>
      ))}

      {/* 13. Dashboard + steering wheel + seats */}
      <mesh position={[0, bodyH + 0.12, cabinZ + cabinLen * 0.25]}>
        <boxGeometry args={[cabinW * 0.8, 0.12, cabinLen * 0.35]} />
        <meshPhysicalMaterial color="#020202" roughness={0.3} metalness={0.1} />
      </mesh>
      <mesh position={[0, bodyH + 0.45, cabinZ + cabinLen * 0.2]} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[0.15, 0.025, 12, 24]} />
        <meshPhysicalMaterial color="#111" roughness={0.7} metalness={0.1} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={`seat-${s}`} position={[s * cabinW * 0.2, bodyH + 0.05, cabinZ - cabinLen * 0.05]}>
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.25, 0.08, 0.25]} />
            <meshPhysicalMaterial color="#222" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.2, -0.05]} rotation={[0.15, 0, 0]}>
            <boxGeometry args={[0.22, 0.25, 0.04]} />
            <meshPhysicalMaterial color="#222" roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* 14. Wipers + antenna */}
      {[-0.15, 0.15].map((s, i) => (
        <mesh key={`wp-${i}`} position={[s * cabinW * 0.2, bodyH + cabinH + 0.12, cabinZ - cabinLen / 2 + 0.1]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.002, 0.01, cabinW * 0.35]} />
          <meshPhysicalMaterial color="#020202" />
        </mesh>
      ))}
      {!isSport && (
        <mesh position={[0, bodyH + cabinH + 0.25, cabinZ - cabinLen * 0.2]}>
          <cylinderGeometry args={[0.008, 0.015, 0.25, 8]} />
          <meshPhysicalMaterial color="#020202" />
        </mesh>
      )}

      {/* 15. Sport spoiler */}
      {isSport && (
        <mesh position={[0, bodyH + cabinH + 0.05, bodyLen / 2 - 0.1]}>
          <boxGeometry args={[bodyWid * 0.45, 0.06, 0.06]} />
          <meshPhysicalMaterial color="#020202" />
        </mesh>
      )}

      {/* 16. Neon underglow */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[bodyWid * 0.7, 0.04, bodyLen * 0.7]} />
        <meshPhysicalMaterial
          color={emissiveHex}
          emissive={emissiveHex}
          emissiveIntensity={2.5}
          transparent
          opacity={0.85}
        />
      </mesh>
      <pointLight position={[0, 0.15, 0]} intensity={1.5} distance={12} color={emissiveHex} />
    </group>
  );
}

// Slightly darker/brighter color helper (approx of `offsetHSL(0,0,dl)` used by ForensAI).
function shiftHex(hex: string, dl: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, dl);
  return "#" + c.getHexString();
}
