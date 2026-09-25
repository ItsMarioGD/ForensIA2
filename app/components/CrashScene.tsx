"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Sky, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import { Car } from "./Car";
import { Trajectory, VelocityArrow } from "./Trajectory";
import { computeFrame, sampleTrajectory, type Scenario, type Frame } from "@/lib/simulation";

export type CameraMode = "orbit" | "chase-a" | "chase-b" | "top" | "side" | "cockpit-a" | "dramatic";

type Props = {
  scenario: Scenario;
  time: number;
  cameraMode: CameraMode;
  showTrajectories: boolean;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
};

export type CrashSceneHandle = {
  getCanvas: () => HTMLCanvasElement | null;
};

// The road/environment
function Environment3D() {
  return (
    <group>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#1a1f33" roughness={1} />
      </mesh>
      {/* Road strip east-west */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[120, 10]} />
        <meshStandardMaterial color="#2a2f45" roughness={0.95} />
      </mesh>
      {/* Road strip north-south */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]} receiveShadow>
        <planeGeometry args={[10, 120]} />
        <meshStandardMaterial color="#2a2f45" roughness={0.95} />
      </mesh>
      {/* Lane markings east-west (dashed center) */}
      {Array.from({ length: 20 }).map((_, i) => (
        <mesh
          key={`ew-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-58 + i * 6, 0.02, 0]}
        >
          <planeGeometry args={[3, 0.18]} />
          <meshStandardMaterial color="#eae4c3" emissive="#8f8560" emissiveIntensity={0.3} />
        </mesh>
      ))}
      {/* Lane markings north-south */}
      {Array.from({ length: 20 }).map((_, i) => (
        <mesh
          key={`ns-${i}`}
          rotation={[-Math.PI / 2, 0, Math.PI / 2]}
          position={[0, 0.02, -58 + i * 6]}
        >
          <planeGeometry args={[3, 0.18]} />
          <meshStandardMaterial color="#eae4c3" emissive="#8f8560" emissiveIntensity={0.3} />
        </mesh>
      ))}
      {/* Distance grid for scale */}
      <Grid
        position={[0, 0.03, 0]}
        args={[200, 200]}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#3a4569"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#576191"
        fadeDistance={90}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
      />
    </group>
  );
}

function ImpactBurst({ position, active, scale }: { position: THREE.Vector3; active: boolean; scale: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const target = active ? scale : 0;
    ref.current.scale.lerp(new THREE.Vector3(target, target, target), Math.min(1, dt * 4));
    (ref.current.material as THREE.MeshStandardMaterial).opacity = active ? 0.7 : 0;
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[1, 20, 20]} />
      <meshStandardMaterial
        color="#ffb84b"
        emissive="#ff6b2b"
        emissiveIntensity={2.2}
        transparent
        opacity={0}
      />
    </mesh>
  );
}

function CameraDirector({
  mode,
  frame,
  orbitTargetRef,
}: {
  mode: CameraMode;
  frame: Frame;
  orbitTargetRef: React.MutableRefObject<THREE.Vector3>;
}) {
  const { camera } = useThree();

  useFrame((_, dt) => {
    const lerp = Math.min(1, dt * 4);
    const carA = new THREE.Vector3(frame.a.position.x, 0.6, frame.a.position.z);
    const carB = new THREE.Vector3(frame.b.position.x, 0.6, frame.b.position.z);
    const mid = carA.clone().add(carB).multiplyScalar(0.5);
    let target = mid;
    let want: THREE.Vector3 | null = null;

    switch (mode) {
      case "chase-a": {
        // Behind vehicle A
        const behind = new THREE.Vector3(-Math.cos(frame.a.heading), 0, -Math.sin(frame.a.heading));
        want = carA.clone().add(behind.multiplyScalar(9)).add(new THREE.Vector3(0, 4.5, 0));
        target = carA;
        break;
      }
      case "chase-b": {
        const behind = new THREE.Vector3(-Math.cos(frame.b.heading), 0, -Math.sin(frame.b.heading));
        want = carB.clone().add(behind.multiplyScalar(9)).add(new THREE.Vector3(0, 4.5, 0));
        target = carB;
        break;
      }
      case "top":
        want = new THREE.Vector3(mid.x, 55, mid.z + 0.001);
        target = mid;
        break;
      case "side":
        want = new THREE.Vector3(mid.x + 0.001, 12, mid.z + 42);
        target = mid;
        break;
      case "cockpit-a": {
        const forward = new THREE.Vector3(Math.cos(frame.a.heading), 0, Math.sin(frame.a.heading));
        want = carA.clone().add(new THREE.Vector3(0, 1.3, 0)).add(forward.clone().multiplyScalar(0.4));
        target = carA.clone().add(forward.multiplyScalar(20));
        break;
      }
      case "dramatic": {
        // slow orbit around impact midpoint
        const t = performance.now() / 3000;
        const r = 22;
        want = new THREE.Vector3(mid.x + Math.cos(t) * r, 8 + Math.sin(t * 0.6) * 3, mid.z + Math.sin(t) * r);
        target = mid;
        break;
      }
      case "orbit":
      default:
        // Let OrbitControls handle it — but still update its target
        orbitTargetRef.current.lerp(mid, lerp * 0.4);
        return;
    }

    if (want) {
      camera.position.lerp(want, lerp);
      camera.lookAt(target);
    }
  });

  return null;
}

export const CrashScene = forwardRef<CrashSceneHandle, Props>(function CrashScene(
  { scenario, time, cameraMode, showTrajectories, onCanvasReady },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
  }));

  const frame = useMemo(() => computeFrame(scenario, time), [scenario, time]);
  const trajectories = useMemo(() => sampleTrajectory(scenario, 300), [scenario]);
  const progress = time / scenario.duration;
  const orbitTargetRef = useRef(new THREE.Vector3(0, 0, 0));

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [30, 22, 30], fov: 45 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        canvasRef.current = gl.domElement;
        onCanvasReady?.(gl.domElement);
      }}
    >
      <color attach="background" args={["#0a0e1a"]} />
      <fog attach="fog" args={["#0a0e1a", 60, 220]} />

      <ambientLight intensity={0.35} />
      <directionalLight
        position={[30, 40, 20]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <hemisphereLight args={["#8fb0ff", "#20243a", 0.4]} />

      <Environment3D />

      <Car state={frame.a} color={scenario.a.color} />
      <Car state={frame.b} color={scenario.b.color} />

      {showTrajectories && (
        <>
          <Trajectory points={trajectories.a} progress={progress} color={scenario.a.color} dashed />
          <Trajectory points={trajectories.b} progress={progress} color={scenario.b.color} dashed />
          <VelocityArrow position={frame.a.position} velocity={frame.a.velocity} color="#8fb0ff" />
          <VelocityArrow position={frame.b.position} velocity={frame.b.velocity} color="#ffb0b8" />
        </>
      )}

      {frame.impactPoint && (
        <ImpactBurst
          position={new THREE.Vector3(frame.impactPoint.x, 0.8, frame.impactPoint.z)}
          active={frame.impacted && time - scenario.impactTime < 0.8}
          scale={2.2}
        />
      )}

      <CameraDirector mode={cameraMode} frame={frame} orbitTargetRef={orbitTargetRef} />
      {cameraMode === "orbit" && (
        <OrbitControls
          makeDefault
          target={orbitTargetRef.current}
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={0.7}
          zoomSpeed={0.8}
          panSpeed={0.7}
          minDistance={6}
          maxDistance={120}
          maxPolarAngle={Math.PI / 2.15}
          screenSpacePanning
        />
      )}
    </Canvas>
  );
});
