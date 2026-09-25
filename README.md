# ForensIA2

Puerto **1:1 del frontend de [ForensAI](https://github.com/ItsMarioGD/ForensAI)** (PHP + XAMPP) a Vercel.

- `public/index.html`, `public/app.js`, `public/styles.css`, `public/vendor/*` son los archivos originales sin modificar.
- Los cuatro endpoints PHP (`/api/status`, `/api/models`, `/api/simulate`, `/api/turtle-script`) se reimplementaron como Next.js API routes en `app/api/*` con el mismo contrato JSON — la key de Pollinations vive en `POLLINATIONS_API_KEY` en el servidor.
- Agregado único: **`public/recorder.js`** — botón flotante "● Grabar MP4" que captura el `<canvas>` de Three.js con `MediaRecorder` y descarga el video al detener.

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Descripción |
|---|---|
| `POLLINATIONS_API_KEY` | API key de Pollinations (obligatoria) |
| `POLLINATIONS_BASE_URL` | Default `https://gen.pollinations.ai` |
| `POLLINATIONS_MODEL` | Default `openai` |

## Local

```bash
npm install
npm run dev          # http://localhost:3000
```
