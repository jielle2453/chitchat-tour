import "server-only";
import OpenAI from "openai";

// Meta Model API is OpenAI-SDK compatible. Without META_API_KEY every module
// runs in mock mode, so the app is usable before the key arrives.

export const META_BASE_URL = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";

export const MODELS = {
  text: process.env.META_TEXT_MODEL ?? "muse-spark-1.3",
  sam: "sam-3.1",
  image: "muse-image-1.0",
  transcribe: "muse-voice-transcribe-1.0",
} as const;

export function isMockMode(): boolean {
  return !process.env.META_API_KEY;
}

let client: OpenAI | null = null;

export function metaClient(): OpenAI {
  if (isMockMode()) throw new Error("META_API_KEY is not set (mock mode)");
  client ??= new OpenAI({ baseURL: META_BASE_URL, apiKey: process.env.META_API_KEY });
  return client;
}

// Optional open-weight backend (Muse Spark Open on a partner such as Baseten),
// used only for narration when GUIDE_MODEL_BACKEND=open.
export function openWeightClient(): { client: OpenAI; model: string } | null {
  if (process.env.GUIDE_MODEL_BACKEND !== "open") return null;
  const apiKey = process.env.OPEN_MODEL_API_KEY;
  const baseURL = process.env.OPEN_MODEL_BASE_URL;
  const model = process.env.OPEN_MODEL_NAME ?? "meta-models/muse-spark-open-1026";
  if (!apiKey || !baseURL) return null;
  return { client: new OpenAI({ baseURL, apiKey }), model };
}
