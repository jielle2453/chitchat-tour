import { z } from "zod";
import { getRoute, RouteTooLongError } from "@/lib/geo/routing";
import { getRouteOptions } from "@/lib/geo/routeOptions";

export const maxDuration = 60;

const pairSchema = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);

const querySchema = z.object({
  from: pairSchema,
  to: pairSchema,
  lang: z.enum(["en", "ja", "zh-TW", "ko"]).optional(),
  alternatives: z.enum(["0", "1"]).optional(),
  hometown: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
});

function parseLatLon(value: string | null): [number, number] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return [Number.NaN, Number.NaN];
  return [parts[0], parts[1]];
}

// Pure param parsing (exported for tests): from/to as "lat,lon",
// alternatives=1 for fastest + "hear more" options, hometown as ISO code.
export function parseRouteParams(search: URLSearchParams) {
  return querySchema.safeParse({
    from: parseLatLon(search.get("from")),
    to: parseLatLon(search.get("to")),
    lang: search.get("lang") ?? undefined,
    alternatives: search.get("alternatives") ?? undefined,
    hometown: search.get("hometown") ?? undefined,
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = parseRouteParams(url.searchParams);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      { error: `Invalid request: ${first?.path.join(".") || "from"} ${first?.message ?? ""}`.trim() },
      { status: 400 },
    );
  }
  try {
    if (parsed.data.alternatives === "1") {
      const origin = { lat: parsed.data.from[0], lon: parsed.data.from[1] };
      const dest = { lat: parsed.data.to[0], lon: parsed.data.to[1] };
      const { fastest, hearMore, stories, fallback } = await getRouteOptions(origin, dest, parsed.data.hometown);
      const body = hearMore ? { route: fastest, routes: [fastest, hearMore], stories } : { route: fastest, routes: [fastest], stories };
      return Response.json(body, fallback ? { headers: { "x-route-fallback": "straight-line" } } : undefined);
    }
    const origin = { lat: parsed.data.from[0], lon: parsed.data.from[1] };
    const dest = { lat: parsed.data.to[0], lon: parsed.data.to[1] };
    const { route, fallback } = await getRoute(origin, dest);
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
