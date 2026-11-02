import { z } from "zod";
import { MAX_AUDIO_BYTES, isWav, parseKeywords, transcribe } from "@/lib/voice";
import type { TranscribeResponse } from "@/lib/types";

export const maxDuration = 60;

const langSchema = z.enum(["en", "ja", "zh-TW", "ko"]).catch("en");

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "Missing audio field" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) return Response.json({ error: "Audio too large" }, { status: 413 });
  if (!isWav(new Uint8Array(await audio.slice(0, 64).arrayBuffer()))) {
    return Response.json({ error: "Audio must be a 16 kHz mono 16-bit WAV" }, { status: 400 });
  }
  const lang = langSchema.parse(form.get("lang") ?? undefined);
  const keywords = parseKeywords(typeof form.get("keywords") === "string" ? (form.get("keywords") as string) : null);
  try {
    const body: TranscribeResponse = { text: await transcribe(audio, lang, keywords) };
    return Response.json(body);
  } catch (e) {
    return Response.json({ error: `Transcription failed: ${String(e)}` }, { status: 502 });
  }
}
