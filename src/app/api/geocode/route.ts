import { z } from "zod";
import { geocodePlace } from "@/lib/geo/geocode";

export const maxDuration = 60;

const querySchema = z
  .object({
    q: z.string().trim().min(2, "q must be at least 2 characters").max(200),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    lang: z.enum(["en", "ja", "zh-TW", "ko"]).optional(),
  })
  .refine((v) => (v.lat === undefined) === (v.lon === undefined), {
    message: "lat and lon must be given together",
  });

function numParam(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    lat: numParam(url.searchParams.get("lat")),
    lon: numParam(url.searchParams.get("lon")),
    lang: url.searchParams.get("lang") ?? undefined,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      { error: `Invalid request: ${first?.path.join(".") || "q"} ${first?.message ?? ""}`.trim() },
      { status: 400 },
    );
  }
  try {
    const results = await geocodePlace(parsed.data);
    return Response.json({ results });
  } catch (err) {
    console.error("geocode route failed", err);
    return Response.json({ error: "Place search is unavailable right now." }, { status: 502 });
  }
}
