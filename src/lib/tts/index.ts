import "server-only";
import type { Lang } from "@/lib/types";

export const MAX_TTS_CHARS = 1200;

export type TtsProvider = "azure" | "elevenlabs";

export class TtsUnavailableError extends Error {}

type Env = Record<string, string | undefined>;

export function selectProvider(env: Env = process.env): TtsProvider | null {
  const p = (env.TTS_PROVIDER ?? "none").toLowerCase();
  if (p === "azure" && env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION) return "azure";
  if (p === "elevenlabs" && env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID) return "elevenlabs";
  return null;
}

const AZURE_VOICES: Record<Lang, { voice: string; locale: string }> = {
  "zh-TW": { voice: "zh-TW-HsiaoChenNeural", locale: "zh-TW" },
  ja: { voice: "ja-JP-NanamiNeural", locale: "ja-JP" },
  en: { voice: "en-US-JennyNeural", locale: "en-US" },
  ko: { voice: "ko-KR-SunHiNeural", locale: "ko-KR" },
};

const escapeXml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

export function buildSsml(text: string, lang: Lang): string {
  const { voice, locale } = AZURE_VOICES[lang];
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${voice}">${escapeXml(text)}</voice></speak>`
  );
}

async function ensureOk(res: Response, who: string): Promise<ArrayBuffer> {
  if (!res.ok) throw new Error(`${who} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.arrayBuffer();
}

async function azure(text: string, lang: Lang, env: Env): Promise<ArrayBuffer> {
  const res = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY!,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "roadside-guide",
    },
    body: buildSsml(text, lang),
  });
  return ensureOk(res, "Azure TTS");
}

async function elevenlabs(text: string, env: Env): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID!)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    },
  );
  return ensureOk(res, "ElevenLabs TTS");
}

// Throws TtsUnavailableError when no provider is configured (route answers 501).
export async function synthesize(text: string, lang: Lang, env: Env = process.env): Promise<ArrayBuffer> {
  const provider = selectProvider(env);
  if (!provider) throw new TtsUnavailableError("No TTS provider configured");
  const t = text.slice(0, MAX_TTS_CHARS);
  return provider === "azure" ? azure(t, lang, env) : elevenlabs(t, env);
}
