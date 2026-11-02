// Shared contracts between the phone UI, the API routes and the server modules.
// Owned by the lead: change only with agreement, since every module codes against it.

export type CountryCode = string; // ISO 3166-1 alpha-2, e.g. "JP", "US"
export type Lang = "en" | "ja" | "zh-TW" | "ko";

export interface UserProfile {
  hometown: CountryCode;
  lang: Lang;
}

// ---------- Location ----------

export interface GeoFix {
  lat: number;
  lon: number;
  accuracy: number; // metres
  heading: number | null; // degrees from north, null when standing still
  speed: number | null; // m/s
  timestamp: number; // ms epoch
  simulated?: boolean;
}

export interface LocationSource {
  start(onFix: (fix: GeoFix) => void, onError?: (err: Error) => void): void;
  stop(): void;
}

export interface RouteDef {
  id: string;
  name: LocalizedText;
  coordinates: [number, number][]; // [lon, lat], walking order
}

export type PoiKind =
  | "convenience"
  | "traffic_signals"
  | "bus_stop"
  | "place_of_worship"
  | "bicycle_rental"
  | "marketplace"
  | "subway_entrance"
  | "other";

export interface Poi {
  id: string; // OSM id, e.g. "node/123"
  kind: PoiKind;
  name?: string;
  brand?: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface NearbyPoi extends Poi {
  distanceM: number;
  bearingDeg: number; // from the walker to the POI
}

// ---------- Knowledge base (data/knowledge/*.json) ----------

export interface LocalizedText {
  en: string;
  "zh-TW"?: string;
  ja?: string;
  ko?: string;
}

export type Confidence = "high" | "medium" | "low";

export interface Source {
  url: string;
  title: string;
  publisher?: string;
  verified?: "full-text" | "snippet" | "web_search";
}

export type HometownStatus = "same" | "different" | "absent" | "unknown";

export interface HometownComparison {
  status: HometownStatus;
  comparison: LocalizedText | null;
  sources: Source[];
  confidence?: Confidence;
}

export interface KnowledgeItem {
  id: string;
  category: "street" | "transport" | "shop" | "architecture" | "daily-life";
  // point: a matching OSM POI is nearby. area/national: fits the neighbourhood/city, used to fill quiet stretches.
  // sighting: only after the walker has shown (photo) or asked about the thing, e.g. a passing garbage truck.
  layer: "point" | "area" | "national" | "sighting";
  trigger: { osm: string[]; context?: string; photo_concepts?: string[] };
  title: LocalizedText;
  fact: LocalizedText;
  sources: Source[];
  confidence: Confidence;
  disputed: boolean;
  caveats: string | null;
  hometown: Record<CountryCode, HometownComparison>;
  // Set on a facet of a bigger topic: never triggered on its own, only used for "tell me more" and questions.
  parent?: string;
}

// ---------- Walk state (kept on the phone, sent with each request) ----------

export interface WalkState {
  toldItemIds: string[];
  lastSpokenAt: number | null; // ms epoch
  history: { itemId: string; at: number }[];
  sightings?: Sighting[]; // recent things the walker photographed or asked about
}

export interface Sighting {
  concept: string; // matched against KnowledgeItem.trigger.photo_concepts, e.g. "garbage truck"
  at: number; // ms epoch
  source: "photo" | "ask";
}

export interface Candidate {
  itemId: string;
  poiId?: string;
  distanceM?: number;
  bearingDeg?: number;
  score: number; // 0..1, higher = more worth telling this user
  reasons: string[]; // human-readable, shown in the agent trace
}

// ---------- Agent output ----------

export type TraceKind = "position" | "user" | "candidate" | "skip" | "verify" | "decision" | "error";

export interface TraceStep {
  kind: TraceKind;
  message: string;
  at: number;
  data?: unknown;
}

export interface Narration {
  id: string;
  itemId: string | null;
  title: string;
  text: string; // what is spoken, in profile.lang
  lang: Lang;
  sources: Source[]; // shown on screen, never read aloud
  confidence: Confidence;
  category?: KnowledgeItem["category"] | "other";
  // Two short lines for the "here | in many places" chips. Never names the user's hometown.
  contrast?: { here: string; elsewhere: string } | null;
}

// ---------- Personal notebook (kept on the phone only) ----------

export type DiscoveryOrigin = "guide" | "ask" | "photo";

export interface Discovery {
  id: string;
  narration: Narration;
  origin: DiscoveryOrigin;
  at: number; // ms epoch
  lat: number | null;
  lon: number | null;
  walkId: string | null;
  stickerDataUrl?: string; // cut-out photo or generated sticker, added later
}

export interface WalkRecord {
  id: string;
  startedAt: number;
  endedAt: number | null;
  areaName: string | null;
  distanceM: number;
  path: [number, number][]; // [lat, lon], thinned
  discoveryIds: string[];
  simulated: boolean;
  mode?: WalkMode; // absent on older records = wander
  destination?: { name: string; lat: number; lon: number } | null;
}

// ---------- API contracts ----------

// POST /api/guide: the agent decides whether and what to say next.
export interface GuideRequest {
  profile: UserProfile;
  fix: GeoFix;
  candidates: Candidate[]; // pre-ranked on the phone by the trigger engine
  state: WalkState;
  areaName?: string | null;
}
export interface GuideResponse {
  narration: Narration | null; // null = the agent chose to stay quiet
  trace: TraceStep[];
}

// POST /api/ask: a spoken follow-up question.
export interface AskRequest {
  profile: UserProfile;
  question: string;
  fix?: GeoFix;
  recent: Narration[];
}
export interface AskResponse {
  narration: Narration;
  trace: TraceStep[];
}

// POST /api/photo: find things worth explaining in a (face-blurred) photo.
export interface DetectedObject {
  id: string;
  label: string; // short noun phrase, e.g. "utility pole"
  itemId?: string; // matching knowledge item, if any
  box: [number, number, number, number]; // x1, y1, x2, y2 in image pixels
  maskSvgPath?: string; // outline in image pixel space
  score?: number;
}
export interface PhotoRequest {
  profile: UserProfile;
  imageDataUrl: string; // JPEG, longest side <= 1280 px, faces already blurred on the phone
  width: number;
  height: number;
  fix?: GeoFix;
}
export interface PhotoResponse {
  objects: DetectedObject[];
  personBoxes: [number, number, number, number][]; // people SAM found; the phone blurs these too
  trace: TraceStep[];
}

// POST /api/explain: narrate one tapped object.
export interface ExplainRequest {
  profile: UserProfile;
  label: string;
  itemId?: string;
  fix?: GeoFix;
}
// response: AskResponse

// POST /api/card: field-guide card for something already narrated.
export interface CardRequest {
  profile: UserProfile;
  narration: Narration;
}
export interface CardResponse {
  imageDataUrl: string;
}

// POST /api/transcribe: multipart form, field "audio" = 16 kHz mono 16-bit WAV.
export interface TranscribeResponse {
  text: string;
}

// POST /api/tts: { text, lang } -> audio/mpeg, or 501 when no provider is set
// (the phone then falls back to speechSynthesis).
export interface TtsRequest {
  text: string;
  lang: Lang;
}

// ---------- Destination walks ----------

// GET /api/geocode?q=<text>&lat=&lon=&lang= -> GeocodeResponse (Taipei-biased place search).
export interface GeocodeResult {
  id: string; // e.g. "osm:way/1376486000"
  name: string;
  label: string; // short address/district line
  lat: number;
  lon: number;
  kind?: string; // OSM category/type, e.g. "marketplace"
}
export interface GeocodeResponse {
  results: GeocodeResult[];
}

// GET /api/route?from=<lat,lon>&to=<lat,lon>&lang= -> RouteResponse (walking route).
export interface RouteStep {
  type: string; // OSRM maneuver type: depart, turn, continue, end of road, arrive, ...
  modifier?: string; // left, right, slight left, straight, uturn, ...
  location: [number, number]; // [lon, lat] of the maneuver
  name: string; // street name after the maneuver ("" when unnamed)
  distanceM: number; // length of this step
}
export interface WalkRoute {
  coordinates: [number, number][]; // [lon, lat], same convention as RouteDef
  distanceM: number;
  durationS: number;
  steps: RouteStep[];
}
export interface RouteResponse {
  route: WalkRoute;
}

export type WalkMode = "wander" | "destination";
