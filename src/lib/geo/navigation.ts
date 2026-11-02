// Pure navigation helpers over a computed WalkRoute.
// Shared by the phone client later, so this file must stay free of any
// server-only import (no "server-only", no node APIs, no fetch).
import type { Lang, Poi, RouteDef, RouteStep, WalkRoute } from "@/lib/types";
import { haversineM } from "./math";

export interface RouteProgress {
  distanceAlongM: number; // how far along the route the fix projects
  remainingM: number; // route length still ahead of the fix
  offRouteM: number; // perpendicular distance from the fix to the route
  nextStepIndex: number; // index into route.steps of the next maneuver
  distanceToNextStepM: number; // distance along the route to that maneuver
}

interface XY {
  x: number;
  y: number;
}

function toXY(lat: number, lon: number, refLat: number): XY {
  const kx = 111320 * Math.cos((refLat * Math.PI) / 180);
  return { x: lon * kx, y: lat * 110540 };
}

interface PreparedRoute {
  pts: XY[];
  cum: number[]; // cumulative length at each point
  total: number;
}

function prepare(coords: [number, number][]): PreparedRoute {
  const refLat = coords.length > 0 ? coords[0][1] : 0;
  const pts = coords.map(([lon, lat]) => toXY(lat, lon, refLat));
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { pts, cum, total: cum[cum.length - 1] ?? 0 };
}

// Project p onto the polyline. Returns distance along + perpendicular distance.
function project(prep: PreparedRoute, p: XY): { along: number; dist: number } {
  let bestAlong = 0;
  let bestDistSq = Number.POSITIVE_INFINITY;
  const n = prep.pts.length;
  if (n === 0) return { along: 0, dist: 0 };
  if (n === 1) {
    return { along: 0, dist: Math.hypot(p.x - prep.pts[0].x, p.y - prep.pts[0].y) };
  }
  for (let i = 1; i < n; i++) {
    const a = prep.pts[i - 1];
    const b = prep.pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    const dSq = (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestAlong = prep.cum[i - 1] + Math.sqrt(lenSq) * t;
    }
  }
  return { along: bestAlong, dist: Math.sqrt(bestDistSq) };
}

export function progressOnRoute(route: WalkRoute, fix: { lat: number; lon: number }): RouteProgress {
  const coords = route.coordinates;
  const empty: RouteProgress = {
    distanceAlongM: 0,
    remainingM: 0,
    offRouteM: 0,
    nextStepIndex: 0,
    distanceToNextStepM: 0,
  };
  if (coords.length === 0) return empty;
  const refLat = coords[0][1];
  const prep = prepare(coords);
  const proj = project(prep, toXY(fix.lat, fix.lon, refLat));
  const along = Math.min(Math.max(proj.along, 0), prep.total);
  const remaining = Math.max(0, prep.total - along);

  let nextStepIndex = 0;
  let distanceToNextStepM = remaining;
  if (route.steps.length > 0) {
    const alongs = route.steps.map((s) =>
      project(prep, toXY(s.location[1], s.location[0], refLat)).along,
    );
    let idx = alongs.findIndex((a) => a > along + 1);
    if (idx === -1) idx = route.steps.length - 1;
    nextStepIndex = idx;
    distanceToNextStepM = Math.max(0, alongs[idx] - along);
  }
  return {
    distanceAlongM: along,
    remainingM: remaining,
    offRouteM: proj.dist,
    nextStepIndex,
    distanceToNextStepM,
  };
}

export function isOffRoute(progress: RouteProgress, threshold = 35): boolean {
  return progress.offRouteM > threshold;
}

// ---------- Spoken turn instructions ----------

type CueLang = Lang;

const DIR: Record<string, Record<CueLang, string>> = {
  left: { en: "left", ja: "左", "zh-TW": "左轉", ko: "좌회전하세요" },
  right: { en: "right", ja: "右", "zh-TW": "右轉", ko: "우회전하세요" },
  "slight left": { en: "slight left", ja: "左前方", "zh-TW": "靠左", ko: "좌측으로 가세요" },
  "slight right": { en: "slight right", ja: "右前方", "zh-TW": "靠右", ko: "우측으로 가세요" },
  "sharp left": { en: "sharp left", ja: "大きく左", "zh-TW": "大左轉", ko: "크게 좌회전하세요" },
  "sharp right": { en: "sharp right", ja: "大きく右", "zh-TW": "大右轉", ko: "크게 우회전하세요" },
  straight: { en: "straight", ja: "まっすぐ", "zh-TW": "直行", ko: "직진하세요" },
  uturn: { en: "U-turn", ja: "Uターン", "zh-TW": "迴轉", ko: "유턴하세요" },
};

function normModifier(modifier?: string): string {
  const m = (modifier ?? "").trim().toLowerCase().replace(/-/g, " ");
  if (m === "u turn" || m === "uturn") return "uturn";
  return m;
}

function dirWord(lang: CueLang, modifier?: string): string {
  return DIR[normModifier(modifier)]?.[lang] ?? "";
}

function sideWord(lang: CueLang, modifier?: string): string {
  const m = normModifier(modifier);
  if (m === "left" || m === "slight left" || m === "sharp left") {
    return lang === "en" ? "left" : lang === "ja" ? "左" : lang === "zh-TW" ? "左" : "왼";
  }
  if (m === "right" || m === "slight right" || m === "sharp right") {
    return lang === "en" ? "right" : lang === "ja" ? "右" : lang === "zh-TW" ? "右" : "오른";
  }
  return "";
}

// Short spoken instruction for one maneuver. Returns "" for steps that should
// not be spoken (e.g. "continue straight").
export function navCue(step: RouteStep, lang: Lang): string {
  const type = step.type.trim().toLowerCase();
  const name = step.name.trim();
  const dir = dirWord(lang, step.modifier);
  const onto =
    lang === "en"
      ? name
        ? ` onto ${name}`
        : ""
      : lang === "ja"
        ? name
          ? `、${name}へ`
          : ""
        : lang === "zh-TW"
          ? name
            ? `，進${name}`
            : ""
          : name
            ? `, ${name} 쪽으로`
            : "";

  switch (type) {
    case "depart":
      if (!name) {
        return lang === "en"
          ? "Start walking."
          : lang === "ja"
            ? "出発です。"
            : lang === "zh-TW"
              ? "開始步行。"
              : "걷기 시작하세요.";
      }
      return lang === "en"
        ? `Head out onto ${name}.`
        : lang === "ja"
          ? `${name}へ出発です。`
          : lang === "zh-TW"
            ? `沿${name}出發。`
            : `${name} 쪽으로 출발하세요.`;
    case "arrive": {
      const side = sideWord(lang, step.modifier);
      if (!side) {
        return lang === "en"
          ? "You have arrived."
          : lang === "ja"
            ? "到着です。"
            : lang === "zh-TW"
              ? "到了。"
              : "도착했습니다.";
      }
      return lang === "en"
        ? `You have arrived — the destination is on your ${side}.`
        : lang === "ja"
          ? `到着です、目的地は${side}側です。`
          : lang === "zh-TW"
            ? `到了，目的地就在${side}邊。`
            : `도착했습니다. 목적지는 ${side}쪽에 있습니다.`;
    }
    case "continue":
    case "notification": {
      const m = normModifier(step.modifier);
      if (m === "" || m === "straight" || type === "notification") return "";
      return turnCue(lang, step.modifier, name, onto);
    }
    case "new name":
      if (!name) return "";
      return lang === "en"
        ? `Continue onto ${name}.`
        : lang === "ja"
          ? `${name}へそのまま進みます。`
          : lang === "zh-TW"
            ? `直走進入${name}。`
            : `${name} 쪽으로 계속 가세요.`;
    case "end of road":
      if (lang === "en") {
        return dir ? `At the end of the road, turn ${dir}${onto}.` : `At the end of the road${onto}.`;
      }
      if (lang === "ja") return dir ? `突き当たりを${dir}です${onto}。` : `突き当たりです${onto}。`;
      if (lang === "zh-TW") return dir ? `到底後${dir}${onto}。` : `走到底${onto}。`;
      return dir ? `길 끝에서 ${dir}${onto}.` : `길 끝까지 가세요${onto}.`;
    case "fork":
      if (lang === "en") {
        return dir ? `Keep ${dir} at the fork${onto}.` : `At the fork, continue${onto}.`;
      }
      if (lang === "ja") return dir ? `分岐を${dir}です${onto}。` : `分岐をそのままです${onto}。`;
      if (lang === "zh-TW") return dir ? `叉路${dir}${onto}。` : `叉路直行${onto}。`;
      return dir ? `갈림길에서 ${dir}${onto}.` : `갈림길에서 직진하세요${onto}.`;
    case "roundabout":
    case "rotary":
    case "exit roundabout":
    case "exit rotary":
    case "roundabout turn":
      if (!name) {
        return lang === "en"
          ? "Enter the roundabout."
          : lang === "ja"
            ? "ロータリーに入ります。"
            : lang === "zh-TW"
              ? "進入圓環。"
              : "로터리에 진입하세요.";
      }
      return lang === "en"
        ? `At the roundabout, take the exit onto ${name}.`
        : lang === "ja"
          ? `ロータリーから${name}へ。`
          : lang === "zh-TW"
            ? `從圓環進${name}。`
            : `로터리에서 ${name} 쪽으로 나가세요.`;
    case "merge":
    case "on ramp":
    case "off ramp":
      if (!name) {
        return lang === "en"
          ? "Take the ramp."
          : lang === "ja"
            ? "側道に入ります。"
            : lang === "zh-TW"
              ? "走匝道。"
              : "램프로 진입하세요.";
      }
      return lang === "en"
        ? `Take the ramp onto ${name}.`
        : lang === "ja"
          ? `${name}へ入ります。`
          : lang === "zh-TW"
            ? `走匝道進${name}。`
            : `램프를 타고 ${name} 쪽으로 가세요.`;
    case "turn":
      return turnCue(lang, step.modifier, name, onto);
    default:
      if (!name) return "";
      return lang === "en"
        ? `Continue onto ${name}.`
        : lang === "ja"
          ? `${name}へそのまま進みます。`
          : lang === "zh-TW"
            ? `直走進入${name}。`
            : `${name} 쪽으로 계속 가세요.`;
  }
}

function turnCue(lang: Lang, modifier: string | undefined, name: string, onto: string): string {
  const m = normModifier(modifier);
  const dir = dirWord(lang, modifier);
  if (m === "uturn") {
    return lang === "en"
      ? name
        ? `Make a U-turn onto ${name}.`
        : "Make a U-turn."
      : lang === "ja"
        ? `この先をUターンです${onto}。`
        : lang === "zh-TW"
          ? `前面迴轉${onto}。`
          : `앞에서 유턴하세요${onto}.`;
  }
  if (lang === "en") {
    if (!dir) return name ? `Turn ahead onto ${name}.` : "Turn ahead.";
    return name ? `Turn ${dir} ahead onto ${name}.` : `Turn ${dir} ahead.`;
  }
  if (lang === "ja") {
    if (!dir) return name ? `この先です${onto}。` : "この先です。";
    return `この先を${dir}です${onto}。`;
  }
  if (lang === "zh-TW") {
    if (!dir) return name ? `前面轉彎${onto}。` : "前面轉彎。";
    return `前面${dir}${onto}。`;
  }
  if (!dir) return name ? `앞에서 도세요${onto}.` : "앞에서 도세요.";
  return `앞에서 ${dir}${onto}.`;
}

// ---------- Demo-mode bridge ----------

// Wrap a computed route so the existing simulated-walk source can walk it.
export function routeToRouteDef(route: WalkRoute, name: string): RouteDef {
  return { id: "destination", name: { en: name }, coordinates: route.coordinates };
}

export interface PoiOnRoute extends Poi {
  distanceAlongM: number; // where the POI projects onto the route
  distanceM: number; // perpendicular distance from the POI to the route
}

export function poisAlongRoute(route: WalkRoute, pois: Poi[], corridorM = 40): PoiOnRoute[] {
  if (route.coordinates.length < 2) return [];
  const refLat = route.coordinates[0][1];
  const prep = prepare(route.coordinates);
  const out: PoiOnRoute[] = [];
  for (const poi of pois) {
    const proj = project(prep, toXY(poi.lat, poi.lon, refLat));
    if (proj.dist <= corridorM) {
      out.push({ ...poi, distanceAlongM: proj.along, distanceM: proj.dist });
    }
  }
  out.sort((a, b) => a.distanceAlongM - b.distanceAlongM);
  return out;
}

export function routeLengthM(route: WalkRoute): number {
  if (route.coordinates.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < route.coordinates.length; i++) {
    total += haversineM(
      { lat: route.coordinates[i - 1][1], lon: route.coordinates[i - 1][0] },
      { lat: route.coordinates[i][1], lon: route.coordinates[i][0] },
    );
  }
  return total;
}
