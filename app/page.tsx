"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { CrashSceneHandle, CameraMode } from "./components/CrashScene";
import { SCENARIOS, computeFrame, speedKmh, type Scenario } from "@/lib/simulation";
import {
  scenarioFromAi,
  computeAiFrame,
  isAiScenario,
  type AiScenario,
  type AiPayload,
  type Infrastructure,
  type LightingEngine,
} from "@/lib/aiSimulation";
import { CanvasRecorder } from "@/lib/recorder";

const CrashScene = dynamic(() => import("./components/CrashScene").then((m) => m.CrashScene), {
  ssr: false,
}) as unknown as React.ForwardRefExoticComponent<
  React.RefAttributes<CrashSceneHandle> & {
    scenario: Scenario | AiScenario;
    time: number;
    cameraMode: CameraMode;
    showTrajectories: boolean;
    infrastructure?: Infrastructure;
    lighting?: LightingEngine;
    onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  }
>;

type MultiPerspectiveState = null | { total: number; index: number; cam: CameraMode };

const PERSPECTIVES: { mode: CameraMode; label: string; hint: string }[] = [
  { mode: "orbit", label: "Libre 360°", hint: "Arrastrar para rotar · scroll para zoom" },
  { mode: "chase-a", label: "Persecución A", hint: "Detrás del vehículo A" },
  { mode: "chase-b", label: "Persecución B", hint: "Detrás del vehículo B" },
  { mode: "top", label: "Aérea", hint: "Vista cenital tipo dron" },
  { mode: "side", label: "Lateral", hint: "Ángulo forense de perfil" },
  { mode: "cockpit-a", label: "Cabina A", hint: "POV del conductor A" },
  { mode: "dramatic", label: "Cinemática", hint: "Orbital lenta sobre el impacto" },
];

const AI_MODELS = [
  "openai",
  "gpt-5.4",
  "gpt-5.4-mini",
  "llama",
  "llama-maverick",
  "qwen-coder",
  "mistral",
  "deepseek",
  "gemini",
  "claude",
];

export default function Page() {
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0].id);
  const [aiScenario, setAiScenario] = useState<AiScenario | null>(null);

  const activeScenario: Scenario | AiScenario = useMemo(() => {
    if (scenarioId === "ai" && aiScenario) return aiScenario;
    return SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  }, [scenarioId, aiScenario]);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [multiPerspective, setMultiPerspective] = useState<MultiPerspectiveState>(null);

  const [relato, setRelato] = useState<string>(
    "En una intersección cruciforme urbana a las 15:00 del día, un sedán rojo circulaba de oeste a este a 55 km/h y un SUV azul cruzaba de sur a norte a 70 km/h. El SUV no respetó la señal de ALTO e impactó lateralmente al sedán en la parte del conductor. El pavimento estaba seco."
  );
  const [model, setModel] = useState<string>("openai");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<CanvasRecorder | null>(null);
  const sceneRef = useRef<CrashSceneHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (playing) {
        setTime((t) => {
          const next = t + dt * speed;
          if (next >= activeScenario.duration) return activeScenario.duration;
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [playing, speed, activeScenario.duration]);

  useEffect(() => {
    if (time >= activeScenario.duration && playing && !multiPerspective && !isRecording) {
      const id = setTimeout(() => setTime(0), 800);
      return () => clearTimeout(id);
    }
  }, [time, activeScenario.duration, playing, multiPerspective, isRecording]);

  const showToast = useCallback((msg: string, ms = 2400) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }, []);

  const generateWithAi = useCallback(async () => {
    if (isGenerating) return;
    if (!relato.trim()) {
      setAiError("Escribe el relato del siniestro primero.");
      return;
    }
    setIsGenerating(true);
    setAiError(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relato, model }),
      });
      const body = await res.json();
      if (!res.ok) {
        setAiError(body?.error ?? `HTTP ${res.status}`);
        showToast("La IA no pudo generar el escenario.", 3000);
        return;
      }
      const payload = body as AiPayload;
      const scenario = scenarioFromAi(payload);
      setAiScenario(scenario);
      setScenarioId("ai");
      setTime(0);
      setPlaying(true);
      showToast("Simulación generada con IA · listo para reproducir.", 3000);
    } catch (err: any) {
      setAiError(err?.message ?? String(err));
      showToast("Error de red al llamar a la IA.", 3000);
    } finally {
      setIsGenerating(false);
    }
  }, [relato, model, isGenerating, showToast]);

  const startRecording = useCallback(async () => {
    const canvas = sceneRef.current?.getCanvas() ?? canvasRef.current;
    if (!canvas) {
      showToast("Aún no está lista la escena, intenta de nuevo.");
      return;
    }
    const rec = new CanvasRecorder({ fps: 60, bitrate: 10_000_000 });
    if (!rec.isSupported()) {
      showToast("Tu navegador no soporta grabación de canvas.");
      return;
    }
    try {
      rec.start(canvas);
      recorderRef.current = rec;
      setIsRecording(true);
      setTime(0);
      setPlaying(true);
      showToast(`Grabando · formato ${rec.bestExtension().toUpperCase()}`);

      const totalMs = (activeScenario.duration + 0.5) * 1000;
      setTimeout(async () => {
        if (recorderRef.current?.isRecording()) {
          const { filename } = await recorderRef.current.stopAndDownload(
            `forensia2-${activeScenario.id}`
          );
          setIsRecording(false);
          recorderRef.current = null;
          showToast(`Video descargado: ${filename}`, 3800);
        }
      }, totalMs);
    } catch (err) {
      console.error(err);
      showToast("Error al iniciar grabación.");
      setIsRecording(false);
    }
  }, [activeScenario.duration, activeScenario.id, showToast]);

  const stopRecording = useCallback(async () => {
    if (!recorderRef.current) return;
    const { filename } = await recorderRef.current.stopAndDownload(
      `forensia2-${activeScenario.id}`
    );
    setIsRecording(false);
    recorderRef.current = null;
    showToast(`Video descargado: ${filename}`, 3600);
  }, [activeScenario.id, showToast]);

  const recordMultiPerspective = useCallback(async () => {
    const canvas = sceneRef.current?.getCanvas() ?? canvasRef.current;
    if (!canvas) return;
    const rec = new CanvasRecorder({ fps: 60, bitrate: 10_000_000 });
    if (!rec.isSupported()) {
      showToast("Tu navegador no soporta grabación de canvas.");
      return;
    }
    const cams: CameraMode[] = ["dramatic", "chase-a", "top", "chase-b", "side", "cockpit-a"];
    try {
      rec.start(canvas);
      recorderRef.current = rec;
      setIsRecording(true);
      showToast(`Grabando ${cams.length} perspectivas seguidas…`, 3200);

      for (let i = 0; i < cams.length; i++) {
        setCameraMode(cams[i]);
        setMultiPerspective({ total: cams.length, index: i, cam: cams[i] });
        setTime(0);
        setPlaying(true);
        await new Promise((r) => setTimeout(r, (activeScenario.duration + 0.4) * 1000));
      }

      const { filename } = await rec.stopAndDownload(
        `forensia2-${activeScenario.id}-multiperspectiva`
      );
      setIsRecording(false);
      recorderRef.current = null;
      setMultiPerspective(null);
      showToast(`Video multi-perspectiva descargado: ${filename}`, 4200);
    } catch (err) {
      console.error(err);
      showToast("Error durante la grabación multi-perspectiva.");
      setIsRecording(false);
      setMultiPerspective(null);
    }
  }, [activeScenario.duration, activeScenario.id, showToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "r" || e.key === "R") {
        setTime(0);
      } else if (e.key === "t" || e.key === "T") {
        setShowTrajectories((v) => !v);
      } else if (e.key >= "1" && e.key <= "7") {
        const idx = parseInt(e.key, 10) - 1;
        const p = PERSPECTIVES[idx];
        if (p) setCameraMode(p.mode);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const frame = useMemo(
    () =>
      isAiScenario(activeScenario)
        ? computeAiFrame(activeScenario, time)
        : computeFrame(activeScenario, time),
    [activeScenario, time]
  );
  const speedA = speedKmh(frame.a.velocity);
  const speedB = speedKmh(frame.b.velocity);
  const closingSpeed = useMemo(() => {
    if (time > activeScenario.impactTime) return 0;
    const dvx = activeScenario.a.velocity.x - activeScenario.b.velocity.x;
    const dvz = activeScenario.a.velocity.z - activeScenario.b.velocity.z;
    return Math.sqrt(dvx * dvx + dvz * dvz) * 3.6;
  }, [time, activeScenario]);

  const aiPayload = isAiScenario(activeScenario) ? activeScenario.ai : null;
  const infrastructure: Infrastructure =
    aiPayload?.infraestructura ?? "interseccion_cruciforme";
  const lighting: LightingEngine = aiPayload?.lighting_engine ?? "daylight";

  return (
    <div className="app">
      <div className="canvas-wrap">
        <CrashScene
          ref={sceneRef as any}
          scenario={activeScenario}
          time={time}
          cameraMode={cameraMode}
          showTrajectories={showTrajectories}
          infrastructure={infrastructure}
          lighting={lighting}
          onCanvasReady={(c) => (canvasRef.current = c)}
        />
      </div>

      <div className="header">
        <div className="brand">
          <div className="brand-mark">F2</div>
          <div>
            <h1>ForensIA2 · Reconstrucción Forense con IA</h1>
            <div className="subtitle">Relato → 3D · Trayectorias · Multi-cámara · Video MP4</div>
          </div>
        </div>
      </div>

      {isRecording && (
        <div className="recording-indicator">
          <div className="record-dot" />
          {multiPerspective
            ? `Grabando ${multiPerspective.index + 1}/${multiPerspective.total} · ${labelFor(multiPerspective.cam)}`
            : "Grabando video…"}
        </div>
      )}

      {/* Left HUD */}
      <div className="hud">
        <div className="panel">
          <h3>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Motor de IA · NIC-RF</span>
              <button
                className="btn ghost small"
                style={{ padding: "2px 8px", fontSize: 11 }}
                onClick={() => setAiPanelOpen((v) => !v)}
              >
                {aiPanelOpen ? "−" : "+"}
              </button>
            </span>
          </h3>
          {aiPanelOpen && (
            <>
              <textarea
                value={relato}
                onChange={(e) => setRelato(e.target.value)}
                placeholder="Describe el siniestro: vehículos, dirección, velocidades, condiciones, hora, punto de impacto…"
                rows={5}
                style={{
                  width: "100%",
                  padding: 8,
                  fontSize: 12,
                  color: "#e6ecff",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  lineHeight: 1.4,
                }}
              />
              <div className="row" style={{ marginTop: 6 }}>
                <select value={model} onChange={(e) => setModel(e.target.value)} style={{ flex: 1 }}>
                  {AI_MODELS.map((m) => (
                    <option key={m} value={m}>
                      Modelo: {m}
                    </option>
                  ))}
                </select>
                <button
                  className="btn primary"
                  onClick={generateWithAi}
                  disabled={isGenerating}
                >
                  {isGenerating ? "Generando…" : "Generar con IA"}
                </button>
              </div>
              {aiError && (
                <p className="help-tip" style={{ color: "#ffb0b8", marginTop: 6 }}>
                  {aiError}
                </p>
              )}
              {aiPayload && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#b8c6ec", lineHeight: 1.5 }}>
                  <div><strong style={{ color: "#e6ecff" }}>Dictamen:</strong> {aiPayload.dictamen_tecnico}</div>
                  <div style={{ marginTop: 4 }}>
                    Infra: <strong style={{ color: "#e6ecff" }}>{aiPayload.infraestructura}</strong> · Luz: <strong style={{ color: "#e6ecff" }}>{aiPayload.lighting_engine ?? "daylight"}</strong> · Entorno: <strong style={{ color: "#e6ecff" }}>{aiPayload.environment ?? "urban"}</strong>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="panel">
          <h3>Escenario</h3>
          <select
            value={scenarioId}
            onChange={(e) => {
              setScenarioId(e.target.value);
              setTime(0);
            }}
            style={{ width: "100%" }}
          >
            {aiScenario && <option value="ai">🤖 IA · Escenario generado</option>}
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="help-tip" style={{ marginTop: 6 }}>{activeScenario.description}</p>
        </div>

        <div className="panel">
          <h3>Cámara</h3>
          <div className="cam-grid">
            {PERSPECTIVES.map((p, i) => (
              <button
                key={p.mode}
                className={`btn small ${cameraMode === p.mode ? "active" : ""}`}
                onClick={() => setCameraMode(p.mode)}
                title={p.hint}
              >
                {i + 1}. {p.label}
              </button>
            ))}
          </div>
          <p className="help-tip">
            {cameraMode === "orbit" ? (
              <>
                <kbd>Click izq</kbd> rotar · <kbd>Click der</kbd> desplazar · <kbd>Scroll</kbd> zoom
              </>
            ) : (
              PERSPECTIVES.find((p) => p.mode === cameraMode)?.hint
            )}
          </p>
          <p className="help-tip">Atajos: <kbd>1</kbd>–<kbd>7</kbd> cámaras · <kbd>Espacio</kbd> pausa · <kbd>R</kbd> reiniciar · <kbd>T</kbd> trayectorias</p>
        </div>

        <div className="panel">
          <h3>Video</h3>
          <div className="row">
            {!isRecording ? (
              <>
                <button className="btn primary" onClick={startRecording}>
                  ● Grabar MP4
                </button>
                <button
                  className="btn"
                  onClick={recordMultiPerspective}
                  title="Graba un solo video que rota entre 6 perspectivas"
                >
                  🎬 Multi-perspectiva
                </button>
              </>
            ) : (
              <button className="btn danger" onClick={stopRecording}>
                ■ Detener y descargar
              </button>
            )}
          </div>
          <p className="help-tip">
            La grabación captura el lienzo 3D en tiempo real y descarga un archivo <strong>.mp4</strong> (o <strong>.webm</strong> si tu navegador no soporta MP4).
          </p>
        </div>
      </div>

      {/* Right HUD */}
      <div className="right-hud">
        <div className="panel">
          <h3>Telemetría</h3>
          <div className="stat"><span style={{ color: activeScenario.a.color }}>● {activeScenario.a.name}</span><strong>{speedA.toFixed(1)} km/h</strong></div>
          <div className="stat"><span style={{ color: activeScenario.b.color }}>● {activeScenario.b.name}</span><strong>{speedB.toFixed(1)} km/h</strong></div>
          <div className="stat"><span>Velocidad de cierre</span><strong>{closingSpeed.toFixed(1)} km/h</strong></div>
          <div className="stat"><span>Tiempo al impacto</span><strong>{Math.max(0, activeScenario.impactTime - time).toFixed(2)} s</strong></div>
          <div className="stat"><span>Estado</span><strong>{frame.impacted ? "Post-impacto" : "Pre-impacto"}</strong></div>
        </div>

        <div className="panel">
          <h3>Trayectorias</h3>
          <div className="row">
            <button
              className={`btn small ${showTrajectories ? "active" : ""}`}
              onClick={() => setShowTrajectories((v) => !v)}
            >
              {showTrajectories ? "✓ Visibles" : "Ocultas"}
            </button>
          </div>
          <div className="legend" style={{ marginTop: 8 }}>
            <div className="legend-item"><span className="dot" style={{ background: activeScenario.a.color, color: activeScenario.a.color }} /> Trayectoria A (sólida = recorrida, punteada = predicha)</div>
            <div className="legend-item"><span className="dot" style={{ background: activeScenario.b.color, color: activeScenario.b.color }} /> Trayectoria B</div>
            <div className="legend-item"><span className="dot" style={{ background: "#ffb84b", color: "#ffb84b" }} /> Punto de impacto</div>
          </div>
        </div>
      </div>

      {/* Bottom perspective strip */}
      <div className="perspective-strip">
        {PERSPECTIVES.map((p) => (
          <button
            key={p.mode}
            className={`pill ${cameraMode === p.mode ? "active" : ""}`}
            onClick={() => setCameraMode(p.mode)}
            title={p.hint}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Timeline / transport controls */}
      <div className="controls-bar">
        <button className="btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? "⏸ Pausa" : "▶ Reproducir"}
        </button>
        <button className="btn ghost" onClick={() => setTime(0)}>⟲ Reiniciar</button>
        <div className="timeline">
          <span className="time-label">{time.toFixed(2)}s</span>
          <input
            type="range"
            min={0}
            max={activeScenario.duration}
            step={0.01}
            value={time}
            onChange={(e) => {
              setPlaying(false);
              setTime(parseFloat(e.target.value));
            }}
          />
          <span className="time-label">{activeScenario.duration.toFixed(1)}s</span>
        </div>
        <select value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))}>
          <option value={0.25}>0.25×</option>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={1.5}>1.5×</option>
          <option value={2}>2×</option>
        </select>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function labelFor(m: CameraMode) {
  return PERSPECTIVES.find((p) => p.mode === m)?.label ?? m;
}
