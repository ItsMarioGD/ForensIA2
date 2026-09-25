// Server-side endpoint that mirrors ForensAI/PHP's SimulateController.
// Takes a natural-language accident narrative and returns the JSON payload
// used to drive the 3D reconstruction. The Pollinations API key stays on the
// server and is read from the POLLINATIONS_API_KEY environment variable.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const POLLINATIONS_BASE_URL =
  process.env.POLLINATIONS_BASE_URL || "https://gen.pollinations.ai";
const DEFAULT_MODEL = process.env.POLLINATIONS_MODEL || "openai";

const SYSTEM_PROMPT = `ROL Y OBJETIVO:
Eres el motor de procesamiento lógico de "ForensIA", un simulador forense 3D hiperrealista. Tu función es analizar el "Relato del Siniestro" del usuario y traducirlo en parámetros y variables exactas para el motor de renderizado y físicas, evitando siempre los valores por defecto.

REGLAS OBLIGATORIAS:

1. INCLUIR SIEMPRE los campos originales del frontend (compatibilidad total):
   - "infraestructura": "interseccion_cruciforme | recta | curva | rotonda"
   - "dictamen_tecnico": "Explicación forense sintetizada de cómo ocurrió el hecho."
   - "v1_color": "rojo"
   - "v2_color": "azul"
   - "v1_tipo": "sedan"
   - "v2_tipo": "suv"
   - "animacion_actores": [array con frames]

2. AGREGAR campos de realismo y físicas dinámicas (RENDERIZADO):
   - "vehicle_model": "high_poly"
   - "smooth_shading": true
   - "environment": "rural | urban | highway" (basado en relato)
   - "lighting_engine": "daylight | night | overcast | sunset" (basado en hora)

3. AGREGAR campos de física dinámica (AVANZADO):
   - "physics_engine": "advanced"
   - "part_detachment": true (si impacto > 30km/h) o false
   - "tire_marks": true (si frenado en seco o lluvia) o false

FORMATO DE SALIDA OBLIGATORIO:
Al procesar el relato del usuario, siempre debes responder ÚNICAMENTE con un objeto JSON válido.
Incluye TODOS los 14 campos exactos listados arriba.
Cada frame de "animacion_actores" debe tener: segundo, v1_x, v1_y, v1_angulo, v2_x, v2_y, v2_angulo (todos numéricos). Genera al menos 8 frames que cubran pre-impacto, impacto y post-impacto.
NO agregues texto adicional, NO uses markdown, NO envuelvas en contenedores.
El JSON debe estar en la raíz de la respuesta.`;

// Balanced brace extraction (mirrors extractJsonBlock in PHP)
function extractJsonBlock(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  return null;
}

type Frame = {
  segundo: number;
  v1_x: number;
  v1_y: number;
  v1_angulo: number;
  v2_x: number;
  v2_y: number;
  v2_angulo: number;
};

function validate(payload: any): payload is { animacion_actores: Frame[] } {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.infraestructura !== "string") return false;
  if (typeof payload.dictamen_tecnico !== "string") return false;
  if (!Array.isArray(payload.animacion_actores)) return false;
  if (payload.animacion_actores.length < 2) return false;
  const keys: (keyof Frame)[] = [
    "segundo",
    "v1_x",
    "v1_y",
    "v1_angulo",
    "v2_x",
    "v2_y",
    "v2_angulo",
  ];
  for (const f of payload.animacion_actores) {
    if (!f || typeof f !== "object") return false;
    for (const k of keys) {
      const v = (f as any)[k];
      if (typeof v !== "number" && !(typeof v === "string" && !isNaN(parseFloat(v)))) {
        return false;
      }
    }
  }
  return true;
}

function coerce(payload: any) {
  const keys: (keyof Frame)[] = [
    "segundo",
    "v1_x",
    "v1_y",
    "v1_angulo",
    "v2_x",
    "v2_y",
    "v2_angulo",
  ];
  for (const f of payload.animacion_actores) {
    for (const k of keys) {
      f[k] = parseFloat(String(f[k]));
    }
  }
  return payload;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: 'Body inválido. Se esperaba JSON con { "relato": "..." }.' },
        { status: 400 }
      );
    }
    const relato = typeof body.relato === "string" ? body.relato.trim() : "";
    if (!relato) {
      return NextResponse.json({ error: 'El campo "relato" es obligatorio.' }, { status: 400 });
    }
    const model = typeof body.model === "string" && body.model ? body.model : DEFAULT_MODEL;

    const apiKey = process.env.POLLINATIONS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Falta la variable de entorno POLLINATIONS_API_KEY en el servidor. Configúrala en Vercel → Settings → Environment Variables.",
        },
        { status: 401 }
      );
    }

    const userPrompt =
      "Analiza el siguiente relato de accidente de tránsito y genera la simulación forense en JSON estricto, respetando EXACTAMENTE la estructura indicada en las reglas.\n\nRELATO:\n" +
      relato;

    const resp = await fetch(POLLINATIONS_BASE_URL.replace(/\/$/, "") + "/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 2048,
      }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      let errMsg = text;
      try {
        const parsed = JSON.parse(text);
        errMsg = parsed?.error?.message ?? errMsg;
      } catch {}
      return NextResponse.json(
        { error: `Pollinations devolvió HTTP ${resp.status}: ${errMsg}` },
        { status: 502 }
      );
    }

    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Respuesta no-JSON de Pollinations: " + text.slice(0, 300) },
        { status: 502 }
      );
    }

    const content: string =
      data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
    if (!content) {
      return NextResponse.json(
        { error: "Pollinations devolvió una respuesta vacía." },
        { status: 502 }
      );
    }

    let payload: any = null;
    try {
      payload = JSON.parse(content);
    } catch {
      const block = extractJsonBlock(content);
      if (block) {
        try {
          payload = JSON.parse(block);
        } catch {}
      }
    }
    if (!payload) {
      return NextResponse.json(
        { error: "No se encontró JSON en la respuesta de la IA.\n\n" + content.slice(0, 500) },
        { status: 502 }
      );
    }

    if (!validate(payload)) {
      return NextResponse.json(
        {
          error:
            "El JSON devuelto no cumple el esquema esperado. Faltan claves 'infraestructura', 'dictamen_tecnico' o 'animacion_actores' con frames válidos.",
          received: payload,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(coerce(payload));
  } catch (err: any) {
    return NextResponse.json(
      { error: "Error inesperado: " + (err?.message ?? String(err)) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST { relato: '...' } to generate a forensic scenario.",
    model: DEFAULT_MODEL,
  });
}
