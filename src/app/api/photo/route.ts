import { z } from "zod";
import { analyzePhoto } from "@/lib/vision";
import type { PhotoRequest } from "@/lib/types";

export const maxDuration = 60;

const bodySchema = z.object({
  profile: z.object({ hometown: z.string(), lang: z.enum(["en", "ja", "zh-TW", "ko"]) }),
  imageDataUrl: z
    .string()
    .max(6_000_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,/),
  width: z.number().int().min(16).max(4096),
  height: z.number().int().min(16).max(4096),
  fix: z.any().optional(),
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
    return Response.json(await analyzePhoto(parsed.data as PhotoRequest));
  } catch (e) {
    return Response.json({ error: `Photo analysis failed: ${String(e)}` }, { status: 502 });
  }
}
