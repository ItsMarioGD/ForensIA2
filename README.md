# ForensIA2 — Reconstrucción Forense con IA (versión Vercel)

Puerto a la nube del proyecto **ForensAI** (originalmente PHP + Apache + Ollama):
ahora corre en **Next.js 14 + React Three Fiber**, con la misma tubería IA
(Pollinations) para traducir un relato de siniestro en una simulación 3D + dictamen.

## Cómo lo usás

1. **Motor de IA (NIC-RF)** — Panel arriba a la izquierda: escribes el relato
   del siniestro, elegís modelo (openai, gpt-5.4, llama, claude, …) y pulsás
   *Generar con IA*. La respuesta llega como JSON con `infraestructura`,
   `dictamen_tecnico` y `animacion_actores` (keyframes) y arma un escenario
   reproducible al instante.
2. **Presets** — Cuatro escenarios físicos incluidos: T-bone, frontal, alcance
   por atrás y roce lateral (para probar el sistema sin llamar a la IA).
3. **Trayectorias vivas** — línea sólida = recorrido cumplido, punteada =
   predicción; flechas de vector de velocidad sobre cada vehículo.
4. **7 cámaras** — Libre 360°, Persecución A/B, Aérea, Lateral, Cabina,
   Cinemática. Atajos `1`–`7`.
5. **Grabación de video** — botón `● Grabar MP4` captura el canvas y descarga
   el archivo automáticamente. `🎬 Multi-perspectiva` graba un solo video
   rotando entre 6 cámaras del mismo choque.
6. **Controles amigables** — timeline arrastrable, velocidad 0.25×–2×,
   telemetría en vivo (km/h, velocidad de cierre, tiempo al impacto),
   atajos `Espacio` pausa, `R` reinicia, `T` alterna trayectorias.

## Variables de entorno

Configurar en Vercel → Settings → Environment Variables:

| Variable | Descripción |
|---|---|
| `POLLINATIONS_API_KEY` | API key de Pollinations (obligatoria) |
| `POLLINATIONS_BASE_URL` | Default `https://gen.pollinations.ai` |
| `POLLINATIONS_MODEL` | Default `openai` |

## Desarrollo local

```bash
cp .env.local.example .env.local  # y pega tu POLLINATIONS_API_KEY
npm install
npm run dev
# http://localhost:3000
```

## Stack

- Next.js 14 (App Router) + React 18
- React Three Fiber + drei + Three.js
- API Route `/api/simulate` — reemplaza `SimulateController.php` de ForensAI
- MediaRecorder API para grabación del canvas WebGL
