// Ports controllers/StatusController.php — probes Pollinations with a tiny
// chat completion and reports availability.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BASE = process.env.POLLINATIONS_BASE_URL || "https://gen.pollinations.ai";
const APP_VERSION = "3.0.0-nextjs-vercel";

export async function GET() {
  const apiKey = process.env.POLLINATIONS_API_KEY;
  let running = false;
  let detail = "";

  if (!apiKey) {
    detail = "Falta la variable POLLINATIONS_API_KEY en el servidor.";
  } else {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(BASE.replace(/\/$/, "") + "/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "openai",
          messages: [{ role: "user", content: "OK" }],
          max_tokens: 10,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      running = r.status === 200;
      if (!running) detail = `Pollinations respondió HTTP ${r.status}`;
    } catch (e: any) {
      detail = "No se pudo contactar a gen.pollinations.ai: " + (e?.message ?? String(e));
    }
  }

  return NextResponse.json({
    ai_active: running,
    provider: "pollinations",
    api_url: BASE,
    version: APP_VERSION,
    error: running ? "" : detail,
  });
}
