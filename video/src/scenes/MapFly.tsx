import maplibregl, { type LayerSpecification, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useEffect, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import route from "../data/route.json";
import stories from "../data/stories.json";
import { Sticker } from "../components/ui";
import { C, FONT } from "../theme";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

const PAINT: Record<string, Record<string, unknown>> = {
  background: { "background-color": "#EFEDE9" },
  park: { "fill-color": "#D5E2CB" },
  water: { "fill-color": "#C9D9E4" },
  landuse_residential: { "fill-color": "#ECE9E4" },
  highway_minor: { "line-color": "#FFFFFF", "line-opacity": 1 },
  highway_path: { "line-color": "#FFFFFF" },
  highway_major_casing: { "line-color": "#DCD7D0" },
  highway_major_inner: { "line-color": "#FFFFFF" },
  highway_major_subtle: { "line-color": "#FFFFFF" },
  railway_transit: { "line-color": "#DCD7D0" },
};
const HIDDEN = [/^boundary/, /shield/, /^aeroway/, /^airport$/, /dashline$/, /^label_(country|state)/, /^landcover_(ice|glacier)/, /^poi/, /^building/];

function restyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers
    .filter((l) => !HIDDEN.some((re) => re.test(l.id)))
    .map((l) => {
      const next = { ...l } as LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown> };
      if (PAINT[l.id]) next.paint = { ...(next.paint ?? {}), ...PAINT[l.id] };
      if (l.type === "symbol") {
        next.layout = { ...(next.layout ?? {}), "text-field": ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]] };
        next.paint = { ...(next.paint ?? {}), "text-color": "#8A8580", "text-halo-color": "#EFEDE9", "text-halo-width": 1.4, "text-opacity": 0.75 };
      }
      return next as LayerSpecification;
    });
  const firstSymbol = layers.findIndex((l) => l.type === "symbol");
  const extrusion = {
    id: "v-buildings",
    type: "fill-extrusion",
    source: "openmaptiles",
    "source-layer": "building",
    minzoom: 13,
    paint: {
      "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 0, "#F3EFEA", 15, "#EDE6DE", 35, "#E4DAD0", 80, "#D6CABD"],
      "fill-extrusion-height": ["*", 0.7, ["coalesce", ["get", "render_height"], 6]],
      "fill-extrusion-base": ["*", 0.7, ["coalesce", ["get", "render_min_height"], 0]],
      "fill-extrusion-opacity": 0.95,
      "fill-extrusion-vertical-gradient": true,
    },
  } as unknown as LayerSpecification;
  layers.splice(firstSymbol < 0 ? layers.length : firstSymbol, 0, extrusion);
  return { ...style, layers, light: { anchor: "viewport", color: "#FFF1DE", intensity: 0.3, position: [1.4, 230, 35] }, sky: { "sky-color": "#8FBCE0", "horizon-color": "#F6D3AE", "fog-color": "#F1DCC2", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.6, "atmosphere-blend": 0.8 } } as StyleSpecification;
}

type LL = [number, number];
const coords = route.coords as LL[];

function metres(a: LL, b: LL) {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la = (a[1] * Math.PI) / 180;
  const lb = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const cum = coords.reduce<number[]>((acc, c, i) => [...acc, i === 0 ? 0 : acc[i - 1] + metres(coords[i - 1], c)], []);
const TOTAL = cum[cum.length - 1];

function along(m: number): { pt: LL; walked: LL[] } {
  const d = Math.max(0, Math.min(TOTAL, m));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const t = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  const a = coords[i - 1];
  const b = coords[i];
  const pt: LL = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { pt, walked: [...coords.slice(0, i), pt] };
}

const START: LL = coords[0];
const DESCEND = 66;
export function reachFrame(atM: number, dur: number) {
  const u = Math.max(0, Math.min(1, (atM + 2) / TOTAL));
  return DESCEND + (Math.acos(1 - 2 * u) / Math.PI) * (dur - DESCEND);
}
const E = Easing.bezier(0.45, 0, 0.2, 1);

function camera(f: number, dur: number) {
  const descend = DESCEND;
  if (f < descend) {
    const t = E(Math.min(1, f / descend));
    return {
      center: [START[0] + 0.0012 * (1 - t), START[1] + 0.0016 * (1 - t)] as LL,
      zoom: interpolate(t, [0, 1], [14.2, 17.9]),
      pitch: interpolate(t, [0, 1], [20, 64]),
      bearing: interpolate(t, [0, 1], [-40, 172]),
      walkM: 0,
    };
  }
  const t = (f - descend) / Math.max(1, dur - descend);
  const walkM = TOTAL * Easing.inOut(Easing.sin)(Math.min(1, t));
  const { pt } = along(walkM);
  return {
    center: [pt[0], pt[1] - 0.00028] as LL,
    zoom: 17.7 + 0.3 * t,
    pitch: 64,
    bearing: 172 + 14 * t,
    walkM,
  };
}

export const MapFly: React.FC<{ showLabels?: boolean }> = ({ showLabels = true }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [loadHandle] = useState(() => delayRender("map load", { timeoutInMilliseconds: 60000 }));
  const [proj, setProj] = useState<{ x: number; y: number }[]>([]);
  const [walker, setWalker] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const style = restyle(await (await fetch(STYLE_URL)).json());
      if (cancelled || !ref.current) return;
      const cam = camera(0, durationInFrames);
      const m = new maplibregl.Map({
        container: ref.current,
        style,
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
        center: cam.center,
        zoom: cam.zoom,
        pitch: cam.pitch,
        bearing: cam.bearing,
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
        maxPitch: 75,
      });
      m.on("load", () => {
        m.addSource("all", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } });
        m.addSource("walked", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [coords[0], coords[0]] } } });
        m.addLayer({ id: "all", type: "line", source: "all", paint: { "line-color": "#FFFFFF", "line-width": 9, "line-opacity": 0.9 }, layout: { "line-cap": "round" } });
        m.addLayer({ id: "walked", type: "line", source: "walked", paint: { "line-color": C.ink, "line-width": 7 }, layout: { "line-cap": "round", "line-join": "round" } });
        m.once("idle", () => {
          setMap(m);
          continueRender(loadHandle);
        });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    const h = delayRender(`map frame ${frame}`, { timeoutInMilliseconds: 30000 });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      continueRender(h);
    };
    const cam = camera(frame, durationInFrames);
    map.jumpTo({ center: cam.center, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing });
    const { pt, walked } = along(cam.walkM);
    (map.getSource("walked") as maplibregl.GeoJSONSource).setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: walked.length > 1 ? walked : [pt, pt] } });
    setProj(stories.map((st) => map.project([st.lon, st.lat])));
    setWalker(frame > DESCEND ? map.project(pt) : null);
    map.once("idle", finish);
    map.triggerRepaint();
    const t = setTimeout(finish, 4000);
    return () => clearTimeout(t);
  }, [map, frame]);

  const cam = camera(frame, durationInFrames);

  return (
    <AbsoluteFill style={{ background: "#EFEDE9", fontFamily: FONT }}>
      <div ref={ref} style={{ position: "absolute", inset: 0, width, height }} />
      {walker && (
        <div style={{ position: "absolute", left: walker.x - 16, top: walker.y - 16, width: 32, height: 32, borderRadius: 99, background: C.ink, border: "6px solid #fff", boxShadow: "0 6px 18px rgba(0,0,0,0.3)" }} />
      )}
      {showLabels &&
        stories.map((st, i) => {
          const p = proj[i];
          if (!p) return null;
          const since = frame - reachFrame(st.atM, durationInFrames);
          const k = interpolate(since, [0, 7, 11, 15], [0, 1.12, 0.96, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          if (k <= 0) return null;
          const next = stories[i + 1];
          const nextSince = next ? frame - reachFrame(next.atM, durationInFrames) : -1;
          const shrink = interpolate(nextSince, [0, 14], [1, 0.62], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const labelOn = interpolate(nextSince, [0, 10], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const right = i % 2 === 0;
          const size = 150;
          return (
            <div
              key={st.itemId}
              style={{
                position: "absolute",
                left: right ? p.x + 40 : p.x - 40 - size,
                top: p.y - size - 30,
                width: size,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                transform: `scale(${k * shrink})`,
                transformOrigin: right ? "left bottom" : "right bottom",
              }}
            >
              <Sticker id={st.itemId} size={size} style={{ transform: `rotate(${right ? 6 : -6}deg)` }} />
              <div style={{ marginTop: 8, background: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 24, fontWeight: 600, boxShadow: "0 6px 18px rgba(0,0,0,0.1)", whiteSpace: "nowrap", opacity: labelOn }}>{st.title}</div>
            </div>
          );
        })}
      <div style={{ position: "absolute", right: 28, bottom: 20, fontSize: 16, color: C.faint }}>© OpenStreetMap contributors · OpenFreeMap</div>
    </AbsoluteFill>
  );
};

