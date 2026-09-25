"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { VehicleState } from "@/lib/simulation";

type Props = {
  state: VehicleState;
  color: string;
  label?: string;
};

// Simple stylized car built from primitives — visible from any angle.
export function Car({ state, color }: Props) {
  const bodyColor = useMemo(() => new THREE.Color(color), [color]);
  const rimColor = useMemo(() => new THREE.Color(color).offsetHSL(0, 0, -0.15), [color]);

  return (
    <group
      position={[state.position.x, state.position.y, state.position.z]}
      rotation={[0, state.heading, 0]}
    >
      {/* main body */}
      <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[4.4, 0.9, 1.9]} />
        <meshStandardMaterial color={bodyColor} metalness={0.55} roughness={0.35} />
      </mesh>
      {/* cabin */}
      <mesh castShadow position={[-0.15, 1.15, 0]}>
        <boxGeometry args={[2.3, 0.7, 1.7]} />
        <meshStandardMaterial color={rimColor} metalness={0.6} roughness={0.25} />
      </mesh>
      {/* windshield tint */}
      <mesh position={[0.95, 1.2, 0]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.05, 0.6, 1.55]} />
        <meshStandardMaterial color="#0d1a2c" metalness={0.9} roughness={0.1} opacity={0.7} transparent />
      </mesh>
      {/* rear window */}
      <mesh position={[-1.25, 1.2, 0]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.05, 0.55, 1.55]} />
        <meshStandardMaterial color="#0d1a2c" metalness={0.9} roughness={0.1} opacity={0.7} transparent />
      </mesh>
      {/* headlights */}
      <mesh position={[2.15, 0.55, 0.6]}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshStandardMaterial color="#fff8d6" emissive="#fff8d6" emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[2.15, 0.55, -0.6]}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshStandardMaterial color="#fff8d6" emissive="#fff8d6" emissiveIntensity={1.6} />
      </mesh>
      {/* tail lights */}
      <mesh position={[-2.15, 0.55, 0.6]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#ff2b3d" emissive="#ff2b3d" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[-2.15, 0.55, -0.6]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#ff2b3d" emissive="#ff2b3d" emissiveIntensity={1.4} />
      </mesh>
      {/* wheels */}
      {[
        [1.5, 0.35, 1.0],
        [1.5, 0.35, -1.0],
        [-1.5, 0.35, 1.0],
        [-1.5, 0.35, -1.0],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 0.35, 20]} />
          <meshStandardMaterial color="#111" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
