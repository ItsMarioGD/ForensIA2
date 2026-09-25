"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/lib/simulation";

type Props = {
  points: Vec3[];
  progress: number; // 0..1 — how much of the trajectory to draw
  color: string;
  width?: number;
  dashed?: boolean;
};

// Draws a line for the trajectory up to `progress`, plus a fainter dashed
// preview of the remaining path. Uses simple Line materials (no post-processing
// dependencies) so it works with plain three.js.
export function Trajectory({ points, progress, color, dashed = false }: Props) {
  const total = points.length;
  const cut = Math.max(2, Math.floor(total * Math.min(1, Math.max(0, progress))));

  const traveled = useMemo(() => {
    const arr = points.slice(0, cut);
    return new Float32Array(arr.flatMap((p) => [p.x, p.y, p.z]));
  }, [points, cut]);

  const remaining = useMemo(() => {
    if (cut >= total) return null;
    const arr = points.slice(cut - 1);
    return new Float32Array(arr.flatMap((p) => [p.x, p.y, p.z]));
  }, [points, cut, total]);

  return (
    <group>
      {/* traveled path — solid, glowing */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[traveled, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} linewidth={2} transparent opacity={0.9} />
      </line>
      {/* remaining path preview */}
      {remaining && (
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[remaining, 3]}
            />
          </bufferGeometry>
          <lineDashedMaterial
            color={color}
            dashSize={0.5}
            gapSize={0.35}
            transparent
            opacity={dashed ? 0.35 : 0.15}
          />
        </line>
      )}
    </group>
  );
}

// Marker at current position showing motion vector
export function VelocityArrow({
  position,
  velocity,
  color,
}: {
  position: Vec3;
  velocity: Vec3;
  color: string;
}) {
  const dir = useMemo(() => {
    const v = new THREE.Vector3(velocity.x, 0, velocity.z);
    const len = v.length();
    if (len < 0.1) return null;
    v.normalize();
    return { v, len };
  }, [velocity.x, velocity.z]);

  if (!dir) return null;
  const arrowLen = Math.min(6, 1 + dir.len * 0.12);
  const end: [number, number, number] = [
    position.x + dir.v.x * arrowLen,
    0.1,
    position.z + dir.v.z * arrowLen,
  ];
  const start: [number, number, number] = [position.x, 0.1, position.z];

  const positions = new Float32Array([...start, ...end]);
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} linewidth={3} />
    </line>
  );
}
