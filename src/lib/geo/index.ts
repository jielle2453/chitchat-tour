// Location sources (real GPS and simulated walks) and map lookups.
// Runs in the browser. Implementation: geo module owner.
import type { GeoFix, Lang, LocalizedText, LocationSource, NearbyPoi, Poi, RouteDef } from "@/lib/types";
import poisJson from "@data/osm/yongkang.json";
import yongkangRoute from "@data/routes/yongkang.json";
import jinhuaRoute from "@data/routes/jinhua.json";
import areasJson from "@data/areas/yongkang.json";
import { isNativeApp } from "@/lib/client/native";
import { t } from "@/lib/client/i18n";
import { bearingDeg, haversineM, pointInPolygon, polygonAreaM2 } from "./math";

export interface SimulatedSource extends LocationSource {
  setSpeedMultiplier(multiplier: number): void; // 1 = walking pace
  progress(): number; // 0..1 along the route
}

const POIS = poisJson as unknown as Poi[];
const ROUTES = [yongkangRoute, jinhuaRoute] as unknown as RouteDef[];
const AREAS = (areasJson as unknown as { id: string; name: LocalizedText; polygon: [number, number][] }[])
  .map((a) => ({ ...a, areaM2: polygonAreaM2(a.polygon) }))
  .sort((a, b) => a.areaM2 - b.areaM2);

const MAX_ACCURACY_M = 100;
const SMOOTHING_WINDOW = 3;
const MIN_HEADING_MOVE_M = 5;

interface RawFix {
  lat: number;
  lon: number;
  accuracy: number;
  heading: number | null | undefined;
  speed: number | null | undefined;
  timestamp: number;
}

export function createGpsSource(lang: Lang = "en"): LocationSource {
  let stopper: (() => void) | null = null;
  let active = false;
  let recent: { lat: number; lon: number }[] = [];
  let lastHeadingPoint: { lat: number; lon: number } | null = null;
  let lastHeading: number | null = null;

  // Shared by the browser and native paths: accuracy filter, smoothing, heading.
  function handle(raw: RawFix, onFix: (fix: GeoFix) => void) {
    if (raw.accuracy > MAX_ACCURACY_M) return;
    recent.push({ lat: raw.lat, lon: raw.lon });
    if (recent.length > SMOOTHING_WINDOW) recent.shift();
    const lat = recent.reduce((s, p) => s + p.lat, 0) / recent.length;
    const lon = recent.reduce((s, p) => s + p.lon, 0) / recent.length;

    let heading: number | null = raw.heading != null && !Number.isNaN(raw.heading) ? raw.heading : null;
    if (heading === null) {
      if (!lastHeadingPoint) lastHeadingPoint = { lat, lon };
      else if (haversineM(lastHeadingPoint, { lat, lon }) > MIN_HEADING_MOVE_M) {
        lastHeading = bearingDeg(lastHeadingPoint, { lat, lon });
        lastHeadingPoint = { lat, lon };
      }
      heading = lastHeading;
    } else {
      lastHeading = heading;
      lastHeadingPoint = { lat, lon };
    }

    onFix({
      lat,
      lon,
      accuracy: raw.accuracy,
      heading,
      speed: raw.speed != null && !Number.isNaN(raw.speed) ? raw.speed : null,
      timestamp: raw.timestamp || Date.now(),
    });
  }

  // Android app: a foreground service keeps GPS running with the screen off.
  async function startNative(onFix: (fix: GeoFix) => void, onError?: (e: Error) => void) {
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const plugin = registerPlugin<import("@capacitor-community/background-geolocation").BackgroundGeolocationPlugin>(
        "BackgroundGeolocation",
      );
      const id = await plugin.addWatcher(
        {
          backgroundTitle: t(lang, "nativeNotifTitle"),
          backgroundMessage: t(lang, "nativeNotifBody"),
          requestPermissions: true,
          stale: false,
          distanceFilter: 3,
        },
        (loc, err) => {
          if (err) {
            onError?.(
              new Error(
                err.code === "NOT_AUTHORIZED"
                  ? "Location permission is off. Allow location for Chitchat Tour in Android settings."
                  : err.message,
              ),
            );
            return;
          }
          if (!loc) return;
          handle(
            {
              lat: loc.latitude,
              lon: loc.longitude,
              accuracy: loc.accuracy,
              heading: loc.bearing,
              speed: loc.speed,
              timestamp: loc.time ?? Date.now(),
            },
            onFix,
          );
        },
      );
      if (!active) void plugin.removeWatcher({ id });
      else stopper = () => void plugin.removeWatcher({ id });
    } catch (e) {
      active = false;
      onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }

  return {
    start(onFix, onError) {
      if (active) return;
      if (isNativeApp()) {
        active = true;
        void startNative(onFix, onError);
        return;
      }
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        onError?.(new Error("Geolocation is not available"));
        return;
      }
      active = true;
      const watchId = navigator.geolocation.watchPosition(
        (pos) =>
          handle(
            {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
              timestamp: pos.timestamp,
            },
            onFix,
          ),
        (err) => onError?.(new Error(err.message)),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
      );
      stopper = () => navigator.geolocation.clearWatch(watchId);
    },
    stop() {
      active = false;
      stopper?.();
      stopper = null;
      recent = [];
      lastHeadingPoint = null;
      lastHeading = null;
    },
  };
}

export function createSimulatedSource(
  route: RouteDef,
  opts: { speedMps?: number; tickMs?: number } = {},
): SimulatedSource {
  const speedMps = opts.speedMps ?? 1.3;
  const tickMs = opts.tickMs ?? 1000;
  const pts = route.coordinates.map(([lon, lat]) => ({ lat, lon }));
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineM(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1] ?? 0;

  let multiplier = 1;
  let travelled = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function fixAt(distance: number, speed: number): GeoFix {
    const d = Math.min(Math.max(distance, 0), total);
    let i = 1;
    while (i < pts.length - 1 && cum[i] < d) i++;
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(i, pts.length - 1)];
    const segLen = cum[i] - cum[i - 1] || 1;
    const t = pts.length > 1 ? Math.min(1, Math.max(0, (d - cum[i - 1]) / segLen)) : 0;
    return {
      lat: a.lat + (b.lat - a.lat) * t,
      lon: a.lon + (b.lon - a.lon) * t,
      accuracy: 5,
      heading: a === b ? null : bearingDeg(a, b),
      speed,
      timestamp: Date.now(),
      simulated: true,
    };
  }

  return {
    start(onFix) {
      if (timer !== null || pts.length === 0) return;
      onFix(fixAt(travelled, speedMps * multiplier));
      timer = setInterval(() => {
        travelled = Math.min(total, travelled + speedMps * multiplier * (tickMs / 1000));
        const atEnd = travelled >= total;
        onFix(fixAt(travelled, atEnd ? 0 : speedMps * multiplier));
        if (atEnd && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      }, tickMs);
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    setSpeedMultiplier(m) {
      multiplier = Math.max(0, m);
    },
    progress() {
      return total > 0 ? travelled / total : 1;
    },
  };
}

export function listRoutes(): RouteDef[] {
  return ROUTES;
}

export function nearbyPois(fix: GeoFix, radiusM: number): NearbyPoi[] {
  const out: NearbyPoi[] = [];
  for (const p of POIS) {
    const d = haversineM(fix, p);
    if (d <= radiusM) out.push({ ...p, distanceM: d, bearingDeg: bearingDeg(fix, p) });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

// Neighbourhood / district name for the "area" layer, e.g. "Yongkang Street".
export function areaNameAt(fix: GeoFix): string | null {
  for (const a of AREAS) if (pointInPolygon(fix, a.polygon)) return a.name.en;
  return null;
}

// Display name of an area returned by areaNameAt, in the UI language.
export function areaLabel(englishName: string | null, lang: keyof LocalizedText): string | null {
  if (!englishName) return null;
  const area = AREAS.find((a) => a.name.en === englishName);
  return area?.name[lang] ?? englishName;
}

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return haversineM(a, b);
}
