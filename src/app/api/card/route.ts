import { z } from "zod";
import { generateCard } from "@/lib/cards";
import type { CardRequest } from "@/lib/types";

export const maxDuration = 60;

const bodySchema = z.object({
  profile: z.object({ hometown: z.string(), lang: z.enum(["en", "ja", "zh-TW", "ko"]) }),
  narration: z.object({ title: z.string().min(1).max(200) }).passthrough(),
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
    return Response.json(await generateCard(parsed.data as unknown as CardRequest));
  } catch (e) {
    return Response.json({ error: `Card generation failed: ${String(e)}` }, { status: 502 });
  }
}
