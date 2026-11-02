"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { LngLatBounds, Map as MlMap, Marker, setWorkerUrl, type GeoJSONSource, type LayerSpecification, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { GeoFix, Lang } from "@/lib/types";
import type { Pin } from "@/lib/client/useWalk";

const TAIPEI: [number, number] = [25.0335, 121.5305];

// Copied to public/ by scripts/copy-maplibre-worker.mjs (postinstall).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

// OpenFreeMap vector tiles (free, no key), restyled below to match the app.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// Cool grey ground, white streets, quiet labels.
const PAINT: Record<string, Record<string, unknown>> = {
  background: { "background-color": "#F4F4F5" },
  park: { "fill-color": "#E9E9EB" },
  water: { "fill-color": "#DEDFE2" },
  landuse_residential: { "fill-color": "#EFEFF1" },
  building: { "fill-color": "#E7E7E9", "fill-outline-color": "#D9D9DD" },
  highway_minor: { "line-color": "#FFFFFF", "line-opacity": 1 },
  highway_path: { "line-color": "#FFFFFF" },
  highway_major_casing: { "line-color": "#DFDFE3" },
  highway_major_inner: { "line-color": "#FFFFFF" },
  highway_major_subtle: { "line-color": "#FFFFFF" },
  railway_transit: { "line-color": "#DFDFE3" },
};

const HIDDEN = [/^boundary/, /shield/, /^aeroway/, /^airport$/, /dashline$/, /^label_(country|state)/, /^landcover_(ice|glacier)/];

function nameField(lang: Lang): unknown {
  if (lang === "zh-TW") return ["coalesce", ["get", "name:zh-Hant"], ["get", "name"]];
  if (lang === "ja") return ["coalesce", ["get", "name:ja"], ["get", "name"]];
  return ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
}

function restyle(style: StyleSpecification, lang: Lang): StyleSpecification {
  const layers = style.layers
    .filter((l) => !HIDDEN.some((re) => re.test(l.id)))
    .map((l) => {
      const next = { ...l } as LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown> };
      if (PAINT[l.id]) next.paint = { ...(next.paint ?? {}), ...PAINT[l.id] };
      if (l.type === "symbol" && (l.id.startsWith("highway-name") || l.id.startsWith("label_") || l.id.includes("water_name"))) {
        next.layout = { ...(next.layout ?? {}), "text-field": nameField(lang) };
        next.paint = { ...(next.paint ?? {}), "text-color": "#8A8A8E", "text-halo-color": "#F4F4F5", "text-halo-width": 1.2 };
      }
      return next as LayerSpecification;
    });
  return { ...style, layers };
}

function el(className: string, html = ""): HTMLDivElement {
  const d = document.createElement("div");
  d.className = className;
  d.innerHTML = html;
  return d;
}

const CHECK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`;

// Solid ink disc (destination) and white dashed disc (tapped pick point).
function dotNode(kind: "dest" | "pick"): HTMLDivElement {
  const d = document.createElement("div");
  d.style.width = "26px";
  d.style.height = "26px";
  d.style.borderRadius = "999px";
  d.style.background = kind === "dest" ? "#111" : "#fff";
  d.style.border = kind === "dest" ? "3px solid #fff" : "3px dashed #111";
  d.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";
  return d;
}

type LineData = GeoJSON.Feature<GeoJSON.LineString>;
const line = (coords: [number, number][]): LineData => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });

// Split a [lon, lat] polyline into walked / remaining at doneM (equirectangular, city scale).
function splitLine(coords: [number, number][], doneM: number): { done: [number, number][]; left: [number, number][] } {
  if (coords.length === 0) return { done: [], left: [] };
  if (doneM <= 0) return { done: [], left: coords };
  const kx = 111320 * Math.cos((coords[0][1] * Math.PI) / 180);
  const segLen = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 110540);
  let acc = 0;
  const done: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const len = segLen(coords[i - 1], coords[i]);
    if (acc + len >= doneM) {
      const f = len > 0 ? (doneM - acc) / len : 0;
      const cut: [number, number] = [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f];
      done.push(cut);
      return { done, left: [cut, ...coords.slice(i)] };
    }
    acc += len;
    done.push(coords[i]);
  }
  return { done, left: [] };
}

export interface GuideMapProps {
  path: [number, number][]; // [lat, lon] walked so far
  fix: GeoFix | null;
  pins: Pin[];
  checked: { poiId: string; lat: number; lon: number }[];
  routePreview?: [number, number][]; // [lon, lat], faint guide line for simulated walks
  planRoute?: [number, number][]; // [lon, lat] planned destination route
  planDoneM?: number; // metres already walked along the plan (dark part)
  destination?: { lat: number; lon: number } | null;
  pickMode?: boolean; // taps choose a destination point
  onPick?: (lat: number, lon: number) => void;
  pickPoint?: { lat: number; lon: number } | null;
  fitKey?: number; // bump to fit the plan bounds
  follow: boolean;
  recenterKey: number;
  onUserPan: () => void;
  ring?: boolean; // outline-only walker dot (second walker on overlaid maps)
  center?: [number, number];
  lang?: Lang;
}

export default function GuideMap({ path, fix, pins, checked, routePreview, planRoute, planDoneM, destination, pickMode, onPick, pickPoint, fitKey, follow, recenterKey, onUserPan, ring, center, lang = "en" }: GuideMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const loaded = useRef(false);
  const markers = useRef(new globalThis.Map<string, Marker>());
  const walker = useRef<Marker | null>(null);
  const panRef = useRef(onUserPan);
  const pickRef = useRef({ pickMode, onPick });
  const latest = useRef({ path, routePreview });
  useEffect(() => {
    panRef.current = onUserPan;
    latest.current = { path, routePreview };
    pickRef.current = { pickMode, onPick };
  });

  const startLat = fix?.lat ?? center?.[0] ?? routePreview?.[0]?.[1] ?? TAIPEI[0];
  const startLon = fix?.lon ?? center?.[1] ?? routePreview?.[0]?.[0] ?? TAIPEI[1];

  // Create the map once per language (labels depend on it).
  useEffect(() => {
    if (!box.current) return;
    let cancelled = false;
    let map: MlMap | null = null;
    const ms = markers.current;
    const ro = new ResizeObserver(() => map?.resize());
    (async () => {
      let style: StyleSpecification | string = STYLE_URL;
      try {
        const res = await fetch(STYLE_URL);
        if (res.ok) style = restyle((await res.json()) as StyleSpecification, lang);
      } catch {
        // fall back to the stock style
      }
      if (cancelled || !box.current) return;
      map = new MlMap({
        container: box.current,
        style,
        center: [startLon, startLat],
        zoom: 17,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map.touchZoomRotate.disableRotation();
      mapRef.current = map;
      map.on("dragstart", () => panRef.current());
      map.on("click", (e) => {
        if (pickRef.current.pickMode) pickRef.current.onPick?.(e.lngLat.lat, e.lngLat.lng);
      });
      map.on("load", () => {
        if (!map) return;
        const { path: p, routePreview: rp } = latest.current;
        map.addSource("preview", { type: "geojson", data: line(rp ?? []) });
        map.addSource("walked", { type: "geojson", data: line(p.map(([la, lo]) => [lo, la])) });
        map.addLayer({ id: "preview", type: "line", source: "preview", paint: { "line-color": "#111", "line-opacity": 0.22, "line-width": 3, "line-dasharray": [0.5, 2.5] }, layout: { "line-cap": "round" } });
        map.addLayer({ id: "walked", type: "line", source: "walked", paint: { "line-color": "#111", "line-width": 5 }, layout: { "line-cap": "round", "line-join": "round" } });
        map.addSource("plan-done", { type: "geojson", data: line([]) });
        map.addSource("plan-left", { type: "geojson", data: line([]) });
        map.addLayer({ id: "plan-left", type: "line", source: "plan-left", paint: { "line-color": "#111", "line-opacity": 0.35, "line-width": 3.5, "line-dasharray": [2, 2] }, layout: { "line-cap": "round" } });
        map.addLayer({ id: "plan-done", type: "line", source: "plan-done", paint: { "line-color": "#111", "line-opacity": 0.9, "line-width": 5 }, layout: { "line-cap": "round", "line-join": "round" } });
        loaded.current = true;
      });
      ro.observe(box.current);
    })();
    return () => {
      cancelled = true;
      ro.disconnect();
      loaded.current = false;
      ms.forEach((m) => m.remove());
      ms.clear();
      walker.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Route lines: the walked path, the faint sim preview, and the planned
  // destination route split into walked (dark) and remaining (light dashed).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource("walked") as GeoJSONSource | undefined)?.setData(line(path.map(([la, lo]) => [lo, la])));
    (map.getSource("preview") as GeoJSONSource | undefined)?.setData(line(routePreview ?? []));
    const { done, left } = splitLine(planRoute ?? [], planDoneM ?? 0);
    (map.getSource("plan-done") as GeoJSONSource | undefined)?.setData(line(done));
    (map.getSource("plan-left") as GeoJSONSource | undefined)?.setData(line(left));
  }, [path, routePreview, planRoute, planDoneM]);


  // "?" pins and check stickers. Several knowledge items can share one POI; one marker each.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const want = new globalThis.Map<string, { lat: number; lon: number; kind: "pin" | "ok" | "dest" | "pick" }>();
    const checkedIds = new Set(checked.map((c) => c.poiId));
    for (const p of pins) if (!checkedIds.has(p.poiId)) want.set(`pin-${p.poiId}`, { lat: p.lat, lon: p.lon, kind: "pin" });
    if (destination) want.set("dest", { lat: destination.lat, lon: destination.lon, kind: "dest" });
    if (pickPoint) want.set("pick", { lat: pickPoint.lat, lon: pickPoint.lon, kind: "pick" });
    for (const c of checked) want.set(`ok-${c.poiId}`, { lat: c.lat, lon: c.lon, kind: "ok" });
    for (const [key, m] of markers.current) {
      if (!want.has(key)) {
        m.remove();
        markers.current.delete(key);
      }
    }
    for (const [key, v] of want) {
      const existing = markers.current.get(key);
      if (existing) {
        existing.setLngLat([v.lon, v.lat]);
        continue;
      }
      const node = v.kind === "pin" ? el("rg-pin", "?") : v.kind === "ok" ? el("rg-check", CHECK_SVG) : dotNode(v.kind);
      markers.current.set(key, new Marker({ element: node }).setLngLat([v.lon, v.lat]).addTo(map));
    }
  });

  // Walker dot and camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fix) return;
    if (!walker.current) {
      const node = el(`rg-me${ring ? " rg-me-ring" : ""}`);
      node.style.zIndex = "5";
      walker.current = new Marker({ element: node }).setLngLat([fix.lon, fix.lat]).addTo(map);
    } else {
      walker.current.setLngLat([fix.lon, fix.lat]);
    }
    if (follow) map.easeTo({ center: [fix.lon, fix.lat], duration: 400 });
  }, [fix, follow, ring]);

  useEffect(() => {
    const map = mapRef.current;
    if (recenterKey > 0 && map && fix) map.easeTo({ center: [fix.lon, fix.lat], zoom: Math.max(map.getZoom(), 17), duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = pickMode ? "crosshair" : "";
  }, [pickMode]);

  // Fit the planned route bounds when a preview opens.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current || !fitKey || !planRoute || planRoute.length === 0) return;
    const first = planRoute[0];
    const bounds = planRoute.reduce(
      (b, [lon, lat]) => b.extend([lon, lat]),
      new LngLatBounds([first[0], first[1]], [first[0], first[1]]),
    );
    map.fitBounds(bounds, { padding: 64, maxZoom: 17, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <div ref={box} className="rg-map h-full w-full" style={{ background: "#F4F4F5" }} />;
}
