import "server-only";
import * as OpenCC from "opencc-js";
import type { Lang } from "@/lib/types";
import { META_BASE_URL, MODELS, isMockMode } from "@/lib/meta/client";

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const LANGUAGE_NAMES: Record<Lang, string> = {
  en: "English",
  ja: "Japanese",
  "zh-TW": "Mandarin Chinese",
  ko: "Korean",
};

const MOCK_TEXT: Record<Lang, string> = {
  en: "Why is there a little box painted on the road at the front of the scooters?",
  ja: "どうしてバイクの前に四角い待機スペースが描いてあるんですか？",
  "zh-TW": "為什麼路口前面會畫一個給機車停的方格子？",
  ko: "스쿠터 앞에 네모난 칸이 그려져 있는 이유가 뭐예요?",
};

let toTaiwan: ((s: string) => string) | null = null;
export function toTraditional(text: string): string {
  toTaiwan ??= OpenCC.Converter({ from: "cn", to: "twp" });
  return toTaiwan(text);
}

export function isWav(bytes: Uint8Array): boolean {
  const tag = (o: number) => String.fromCharCode(...bytes.slice(o, o + 4));
  return bytes.length > 44 && tag(0) === "RIFF" && tag(8) === "WAVE";
}

export function parseKeywords(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export function buildTranscribeRequest(lang: Lang, keywords: string[]) {
  return { model: MODELS.transcribe, audioEncoding: "WAV", languageBias: [LANGUAGE_NAMES[lang]], keywords };
}

// Documented response: { sessionId, transcript, audioDurationMs, turns[] }; older shapes kept as fallbacks.
export function extractTranscript(body: unknown): string {
  if (typeof body === "string") return body.trim();
  if (!body || typeof body !== "object") return "";
  const o = body as Record<string, unknown>;
  for (const key of ["text", "transcript"]) if (typeof o[key] === "string") return (o[key] as string).trim();
  for (const key of ["turns", "segments", "transcripts"]) {
    const list = o[key];
    if (Array.isArray(list)) {
      return list
        .map((t) => (typeof t === "string" ? t : extractTranscript(t)))
        .filter(Boolean)
        .join(" ")
        .trim();
    }
  }
  return "";
}

export async function transcribe(audio: Blob, lang: Lang, keywords: string[]): Promise<string> {
  if (isMockMode()) return MOCK_TEXT[lang];

  const form = new FormData();
  form.append(
    "request",
    new Blob([JSON.stringify(buildTranscribeRequest(lang, keywords))], { type: "application/json" }),
    "request.json",
  );
  form.append("audio", audio, "audio.wav");

  const res = await fetch(`${META_BASE_URL}/asr/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.META_API_KEY}`, Accept: "application/json" },
    body: form,
  });
  if (!res.ok) throw new Error(`Voice Transcribe ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const raw = await res.text();
  let body: unknown = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    // plain text
  }
  const text = extractTranscript(body);
  return lang === "zh-TW" ? toTraditional(text) : text;
}
