"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Sky, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import { Car, type VehicleType } from "./Car";
import { Trajectory, VelocityArrow } from "./Trajectory";
import { CrashEffects, ImpactMarker, SkidMarks } from "./CrashEffects";
import { computeFrame, sampleTrajectory, type Scenario, type Frame } from "@/lib/simulation";
import {
  computeAiFrame,
  isAiScenario,
  sampleAiTrajectory,
  type AiScenario,
  type Infrastructure,
} from "@/lib/aiSimulation";

const KNOWN_TYPES: VehicleType[] = ["sedan", "suv", "camioneta", "hatchback", "deportivo", "camion"];
function resolveVehicleType(raw: string | undefined, fallback: VehicleType): VehicleType {
  if (!raw) return fallback;
  const t = raw.toLowerCase().trim();
  return (KNOWN_TYPES as string[]).includes(t) ? (t as VehicleType) : fallback;
}

export type CameraMode = "orbit" | "chase-a" | "chase-b" | "top" | "side" | "cockpit-a" | "dramatic";

type Props = {
  scenario: Scenario | AiScenario;
  time: number;
  cameraMode: CameraMode;
  showTrajectories: boolean;
  infrastructure?: Infrastructure;
  lighting?: "daylight" | "night" | "overcast" | "sunset";
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
};

export type CrashSceneHandle = {
  getCanvas: () => HTMLCanvasElement | null;
};

// The road/environment — draws different layouts based on infrastructure type
function Environment3D({ infrastructure = "interseccion_cruciforme" }: { infrastructure?: Infrastructure }) {
  return (
    <group>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#1a1f33" roughness={1} />
      </mesh>

      {infrastructure === "interseccion_cruciforme" && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
            <planeGeometry args={[120, 10]} />
            <meshStandardMaterial color="#2a2f45" roughness={0.95} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]} receiveShadow>
            <planeGeometry args={[10, 120]} />
            <meshStandardMaterial color="#2a2f45" roughness={0.95} />
          </mesh>
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
        </>
      )}

      {infrastructure === "recta" && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
            <planeGeometry args={[220, 14]} />
            <meshStandardMaterial color="#2a2f45" roughness={0.95} />
          </mesh>
          {Array.from({ length: 40 }).map((_, i) => (
            <mesh
              key={`c-${i}`}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[-108 + i * 6, 0.02, 0]}
            >
              <planeGeometry args={[3, 0.18]} />
              <meshStandardMaterial color="#eae4c3" emissive="#8f8560" emissiveIntensity={0.3} />
            </mesh>
          ))}
        </>
      )}

      {infrastructure === "curva" && (
        <>
          {Array.from({ length: 60 }).map((_, i) => {
            const t = i / 60;
            const angle = -Math.PI / 3 + t * (Math.PI * 0.9);
            const R = 60;
            const cx = Math.cos(angle) * R;
            const cz = Math.sin(angle) * R;
            return (
              <mesh
                key={`curve-${i}`}
                rotation={[-Math.PI / 2, 0, angle + Math.PI / 2]}
                position={[cx, 0.01 + i * 0.0002, cz]}
                receiveShadow
              >
                <planeGeometry args={[6, 14]} />
                <meshStandardMaterial color="#2a2f45" roughness={0.95} />
              </mesh>
            );
          })}
        </>
      )}

      {infrastructure === "rotonda" && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
            <ringGeometry args={[14, 26, 64]} />
            <meshStandardMaterial color="#2a2f45" roughness={0.95} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <circleGeometry args={[13, 48]} />
            <meshStandardMaterial color="#3a5a45" roughness={0.9} />
          </mesh>
          {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a, i) => (
            <mesh
              key={`ent-${i}`}
              rotation={[-Math.PI / 2, 0, a]}
              position={[Math.cos(a) * 45, 0.011, Math.sin(a) * 45]}
              receiveShadow
            >
              <planeGeometry args={[46, 10]} />
              <meshStandardMaterial color="#2a2f45" roughness={0.95} />
            </mesh>
          ))}
        </>
      )}

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

function CameraDirector({
  mode,
  frame,
  orbitTargetRef,
  shakeRef,
}: {
  mode: CameraMode;
  frame: Frame;
  orbitTargetRef: React.MutableRefObject<THREE.Vector3>;
  shakeRef: React.MutableRefObject<number>;
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

    // Apply post-lerp shake, decaying towards 0
    if (shakeRef.current > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shakeRef.current * 0.4;
      camera.position.y += (Math.random() - 0.5) * shakeRef.current * 0.4;
      camera.position.z += (Math.random() - 0.5) * shakeRef.current * 0.4;
      shakeRef.current = Math.max(0, shakeRef.current - dt * 1.8);
    }
  });

  return null;
}

export const CrashScene = forwardRef<CrashSceneHandle, Props>(function CrashScene(
  { scenario, time, cameraMode, showTrajectories, infrastructure, lighting, onCanvasReady },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
  }));

  const isAi = isAiScenario(scenario);
  const frame = useMemo(
    () => (isAi ? computeAiFrame(scenario as AiScenario, time) : computeFrame(scenario, time)),
    [scenario, time, isAi]
  );
  const trajectories = useMemo(
    () =>
      isAi ? sampleAiTrajectory(scenario as AiScenario, 300) : sampleTrajectory(scenario, 300),
    [scenario, isAi]
  );
  const progress = time / scenario.duration;
  const orbitTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const shakeRef = useRef(0);
  const wasImpactedRef = useRef(false);
  const infra: Infrastructure = infrastructure ?? "interseccion_cruciforme";
  const lightingKind = lighting ?? "daylight";

  // Trigger a shake pulse on the impact frame's rising edge
  useEffect(() => {
    if (frame.impacted && !wasImpactedRef.current) {
      shakeRef.current = 1.5;
      wasImpactedRef.current = true;
    } else if (!frame.impacted && wasImpactedRef.current) {
      wasImpactedRef.current = false;
    }
  }, [frame.impacted]);

  const aiPayload = isAi ? (scenario as AiScenario).ai : null;
  const typeA = resolveVehicleType(aiPayload?.v1_tipo, "sedan");
  const typeB = resolveVehicleType(aiPayload?.v2_tipo, isAi ? "suv" : "sedan");

  // Approx wheel spin from vehicle speed (rad/s from m/s, wheel radius ~0.3m)
  const spinA = Math.min(60, Math.hypot(frame.a.velocity.x, frame.a.velocity.z) / 0.3);
  const spinB = Math.min(60, Math.hypot(frame.b.velocity.x, frame.b.velocity.z) / 0.3);

  // Brake glow: bright pre-impact when decelerating, dim afterward
  const preImpact = time < scenario.impactTime;
  const brakeGlow = preImpact ? 1.6 : 0.8;

  // Deformation ramps from 0 to 1 in the first 0.4s after impact
  const deformation = frame.impacted
    ? Math.min(1, (time - scenario.impactTime) / 0.4)
    : 0;

  const isNight = lightingKind === "night";
  const isSunset = lightingKind === "sunset";
  const isOvercast = lightingKind === "overcast";
  const bgColor = isNight
    ? "#03060f"
    : isSunset
    ? "#241227"
    : isOvercast
    ? "#1a1e2c"
    : "#0a0e1a";
  const sunIntensity = isNight ? 0.2 : isOvercast ? 0.7 : isSunset ? 0.9 : 1.15;
  const ambient = isNight ? 0.15 : isOvercast ? 0.5 : 0.35;

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
      <color attach="background" args={[bgColor]} />
      <fog attach="fog" args={[bgColor, 60, 220]} />

      <ambientLight intensity={ambient} />
      <directionalLight
        position={[30, 40, 20]}
        intensity={sunIntensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <hemisphereLight args={["#8fb0ff", "#20243a", 0.4]} />

      <Environment3D infrastructure={infra} />

      <Car
        state={frame.a}
        color={scenario.a.color}
        type={typeA}
        wheelSpin={spinA}
        brakeGlow={brakeGlow}
        deformation={deformation * 0.7}
      />
      <Car
        state={frame.b}
        color={scenario.b.color}
        type={typeB}
        wheelSpin={spinB}
        brakeGlow={brakeGlow}
        deformation={deformation}
      />

      {/* Skid marks (pre-impact tire trails for both vehicles) */}
      <SkidMarks
        points={trajectories.a}
        impactTime={scenario.impactTime}
        duration={scenario.duration}
        progress={progress}
      />
      <SkidMarks
        points={trajectories.b}
        impactTime={scenario.impactTime}
        duration={scenario.duration}
        progress={progress}
      />

      {showTrajectories && (
        <>
          <Trajectory points={trajectories.a} progress={progress} color={scenario.a.color} dashed />
          <Trajectory points={trajectories.b} progress={progress} color={scenario.b.color} dashed />
          <VelocityArrow position={frame.a.position} velocity={frame.a.velocity} color="#8fb0ff" />
          <VelocityArrow position={frame.b.position} velocity={frame.b.velocity} color="#ffb0b8" />
        </>
      )}

      {/* Impact effects: particles, debris, shockwave, burst light */}
      <CrashEffects impactPoint={frame.impactPoint} active={frame.impacted} />
      <ImpactMarker position={frame.impactPoint} active={frame.impacted && time - scenario.impactTime < 0.8} />

      <CameraDirector mode={cameraMode} frame={frame} orbitTargetRef={orbitTargetRef} shakeRef={shakeRef} />
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
