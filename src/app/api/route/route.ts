import { z } from "zod";
import { getRoute, RouteTooLongError } from "@/lib/geo/routing";

export const maxDuration = 60;

const pairSchema = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);

const querySchema = z.object({
  from: pairSchema,
  to: pairSchema,
  lang: z.enum(["en", "ja", "zh-TW", "ko"]).optional(),
});

function parseLatLon(value: string | null): [number, number] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return [Number.NaN, Number.NaN];
  return [parts[0], parts[1]];
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    from: parseLatLon(url.searchParams.get("from")),
    to: parseLatLon(url.searchParams.get("to")),
    lang: url.searchParams.get("lang") ?? undefined,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      { error: `Invalid request: ${first?.path.join(".") || "from"} ${first?.message ?? ""}`.trim() },
      { status: 400 },
    );
  }
  const from = { lat: parsed.data.from[0], lon: parsed.data.from[1] };
  const to = { lat: parsed.data.to[0], lon: parsed.data.to[1] };
  try {
    const { route, fallback } = await getRoute(from, to);
    if (fallback) {
      console.error("route: served straight-line fallback");
      return Response.json({ route }, { headers: { "x-route-fallback": "straight-line" } });
    }
    return Response.json({ route });
  } catch (err) {
    if (err instanceof RouteTooLongError) {
      return Response.json({ error: "Route is too long for walking (over 8 km)." }, { status: 400 });
    }
    console.error("route route failed", err);
    return Response.json({ error: "Routing is unavailable right now." }, { status: 502 });
  }
}
