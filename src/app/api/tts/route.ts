import { z } from "zod";
import { MAX_TTS_CHARS, TtsUnavailableError, synthesize } from "@/lib/tts";

export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_TTS_CHARS),
  lang: z.enum(["en", "ja", "zh-TW", "ko"]),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid request: " + parsed.error.message }, { status: 400 });
  try {
    const audio = await synthesize(parsed.data.text, parsed.data.lang);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof TtsUnavailableError) return Response.json({ error: e.message }, { status: 501 });
    return Response.json({ error: `TTS failed: ${String(e)}` }, { status: 502 });
  }
}
