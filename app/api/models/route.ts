// Ports controllers/ModelsController.php — lists the recommended Pollinations
// text models exposed by the original ForensAI config.

import { NextResponse } from "next/server";

const BASE = process.env.POLLINATIONS_BASE_URL || "https://gen.pollinations.ai";
const DEFAULT = process.env.POLLINATIONS_MODEL || "openai";

const RECOMMENDED = [
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

export async function GET() {
  return NextResponse.json({
    installed: RECOMMENDED,
    recommended: RECOMMENDED,
    default: DEFAULT,
    provider: "pollinations",
    api_url: BASE,
  });
}
