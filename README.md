# ForensIA2

Reconstrucción forense de accidentes de tránsito en 3D. Simula colisiones entre vehículos, dibuja las trayectorias en tiempo real, ofrece varias perspectivas de cámara y exporta video de la simulación para presentaciones.

## Características

- **Escenarios de choque** predefinidos: impacto lateral (T-bone), frontal, alcance por atrás y roce lateral.
- **Trayectorias dibujadas en vivo**: línea sólida = recorrido, punteada = predicción; flechas de vector de velocidad.
- **7 perspectivas de cámara**: libre 360°, persecución A, persecución B, aérea, lateral, cabina y cinemática orbital.
- **Grabación en video**: descarga `.mp4` (o `.webm` como respaldo). Modo **multi-perspectiva** que graba un solo video rotando entre 6 cámaras.
- **Controles amigables**: barra inferior con timeline, atajos de teclado (`1`–`7`, `Espacio`, `R`, `T`), telemetría en vivo.
- **Física simplificada**: conservación de momento con coeficiente de restitución + fricción post-impacto para el desplazamiento residual.

## Desarrollo local

```bash
npm install
npm run dev
# http://localhost:3000
```

## Deploy

Este proyecto está pensado para Vercel — hacer push a `main` (o importar el repo desde Vercel) y desplegar sin configuración.

## Stack

- Next.js 14 (App Router)
- React Three Fiber + drei + Three.js
- MediaRecorder API para grabación del canvas WebGL
