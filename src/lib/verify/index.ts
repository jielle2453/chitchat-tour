import type { Source } from "@/lib/types";
import whitelist from "@data/source-whitelist.json";

// Reads the Responses API output shapes seen for web_search:
// - output[] -> { type: "message", content: [{ type: "output_text", text, annotations: [...] }] }
// - output[] -> { type: "web_search_call", action: { sources: [{ type: "url", url }] },
//                 results: [{ type: "text_result", title, url, snippet }] }
// Live probe (2026-11-02): annotations come back empty and action.sources is
// url-only, so the real page title only arrives on web_search_call.results.

export interface Citation {
  url: string;
  title: string;
  startIndex?: number;
  endIndex?: number;
}

const DOMAINS: string[] = (whitelist as { domains: string[] }).domains.map((d) => d.toLowerCase());

export function hostnameOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

export function isTrustedUrl(url: string, domains: string[] = DOMAINS): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return domains.some((d) => host === d || host.endsWith("." + d));
}

// ---- Human-readable source titles ----

// Display names for publishers we cite often; matched by hostname suffix.
const PUBLISHER_NAMES: [string, string][] = [
  ["wikipedia.org", "Wikipedia"],
  ["bbc.com", "BBC"],
  ["bbc.co.uk", "BBC"],
  ["nytimes.com", "The New York Times"],
  ["reuters.com", "Reuters"],
  ["apnews.com", "AP News"],
  ["theguardian.com", "The Guardian"],
  ["nhk.or.jp", "NHK"],
  ["nikkei.com", "Nikkei"],
  ["asahi.com", "The Asahi Shimbun"],
  ["jil.go.jp", "Japan Institute for Labour Policy and Training"],
  ["jnto.go.jp", "Japan National Tourism Organization"],
  ["gov.taipei", "Taipei City Government"],
  ["cna.com.tw", "Central News Agency"],
  ["focustaiwan.tw", "Focus Taiwan"],
  ["taipeitimes.com", "Taipei Times"],
  ["udn.com", "United Daily News"],
  ["ltn.com.tw", "Liberty Times"],
  ["pts.org.tw", "Public Television Service"],
  ["metro.taipei", "Taipei Metro"],
  ["taipower.com.tw", "Taipower"],
  ["taiwaninsight.org", "Taiwan Insight"],
  ["smithsonianmag.com", "Smithsonian Magazine"],
  ["untourism.int", "UN Tourism"],
  ["youtube.com", "YouTube"],
  ["github.com", "GitHub"],
];

function publisherName(host: string): string | null {
  for (const [domain, name] of PUBLISHER_NAMES) {
    if (host === domain || host.endsWith("." + domain)) return name;
  }
  return null;
}

const TWO_LEVEL_SUFFIXES = new Set([
  "co.jp", "go.jp", "ac.jp", "or.jp", "ne.jp",
  "gov.tw", "edu.tw", "com.tw", "org.tw", "net.tw",
  "co.uk", "ac.uk", "gov.uk", "org.uk", "com.au", "gov.au", "co.nz",
]);

// Last-resort label from the hostname itself, e.g. "jil.go.jp" -> "JIL".
function hostnameLabel(host: string): string | null {
  const parts = host.split(".").filter(Boolean);
  while (parts.length > 1 && ["www", "m", "mobile"].includes(parts[0])) parts.shift();
  if (!parts.length) return null;
  const core = parts.length >= 3 && TWO_LEVEL_SUFFIXES.has(parts.slice(-2).join(".")) ? parts[parts.length - 3] : (parts[parts.length - 2] ?? parts[0]);
  if (!core) return null;
  return core.length <= 4 ? core.toUpperCase() : core.charAt(0).toUpperCase() + core.slice(1);
}

const GENERIC_SEGMENTS = new Set([
  "pdf", "html", "htm", "shtml", "php", "aspx", "asp", "jsp",
  "index", "default", "page", "pages", "view", "article", "articles",
  "news", "watch", "video", "videos", "blob", "head",
]);

function cleanSegment(segment: string): string {
  let s = segment;
  try {
    s = decodeURIComponent(s);
  } catch {
    // Keep the raw segment when it is not valid percent-encoding.
  }
  s = s.replace(/\.(pdf|html?|shtml|php|aspx?|jsp)$/i, "");
  s = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const words = s.split(" ").filter(Boolean);
  while (words.length && /^\d+$/.test(words[words.length - 1])) words.pop();
  return words.join(" ");
}

// A readable title from the URL path, e.g. /wiki/Garbage_truck -> "Garbage truck".
function titleFromPath(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  let singleWord: string | null = null;
  const segments = pathname.split("/").map(cleanSegment).filter(Boolean);
  for (const segment of segments.reverse()) {
    if (!/\p{L}/u.test(segment)) continue;
    if (GENERIC_SEGMENTS.has(segment.toLowerCase())) continue;
    const words = segment.split(" ");
    if (words.length >= 2) return segment.charAt(0).toUpperCase() + segment.slice(1);
    if (!singleWord && words[0].length >= 4) singleWord = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  }
  return singleWord;
}

// A title counts only when it is real text, not the URL or a bare hostname.
function usableTitle(raw: string | undefined, url: string): string | null {
  const t = raw?.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t === url) return null;
  const host = hostnameOf(url);
  if (host && (t.toLowerCase() === host || t.toLowerCase() === host.replace(/^www\./, "") || t.toLowerCase().replace(/^www\./, "") === host.replace(/^www\./, ""))) return null;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t)) return null; // bare hostname such as taiwaninsight.org
  return t;
}

// The title to show on a source card: the API's page title when we have one,
// otherwise a label derived from the path, the publisher, or the hostname.
// Never returns a bare hostname when a better label exists.
export function readableSourceTitle(url: string, rawTitle?: string): string {
  const real = usableTitle(rawTitle, url);
  if (real) return real;
  const fromPath = titleFromPath(url);
  if (fromPath && fromPath.includes(" ")) return fromPath;
  const host = hostnameOf(url);
  if (host) {
    const publisher = publisherName(host);
    if (publisher) return publisher;
  }
  if (fromPath) return fromPath;
  if (host) return hostnameLabel(host) ?? host;
  return rawTitle?.trim() || url;
}

interface OutputTextPart {
  type?: string;
  text?: string;
  annotations?: {
    type?: string;
    url?: string;
    title?: string;
    start_index?: number;
    end_index?: number;
  }[];
}
interface SearchSource {
  type?: string;
  url?: string;
  title?: string;
}
interface OutputItem {
  type?: string;
  phase?: string; // "commentary" marks the model's progress note before a tool call
  content?: OutputTextPart[];
  action?: { sources?: SearchSource[]; results?: SearchSource[] };
  results?: SearchSource[];
}
export interface ResponsesResult {
  output?: OutputItem[];
  output_text?: string;
}

const urlKey = (url: string): string => url.trim().replace(/\/+$/, "");

export function extractCitations(response: ResponsesResult | null | undefined): Citation[] {
  // Titles and URLs the search calls saw, from every shape that carries them.
  const hints = new Map<string, string>();
  const searched: string[] = [];
  const seenSearched = new Set<string>();
  for (const item of response?.output ?? []) {
    if (item.type !== "web_search_call") continue;
    for (const s of [...(item.action?.sources ?? []), ...(item.action?.results ?? []), ...(item.results ?? [])]) {
      if (!s.url) continue;
      const title = usableTitle(s.title, s.url);
      if (title && !hints.has(urlKey(s.url))) hints.set(urlKey(s.url), title);
      if (!seenSearched.has(urlKey(s.url))) {
        seenSearched.add(urlKey(s.url));
        searched.push(s.url);
      }
    }
  }

  const cited: Citation[] = [];
  for (const item of response?.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      for (const a of part.annotations ?? []) {
        if (a.type !== "url_citation" || !a.url) continue;
        cited.push({
          url: a.url,
          title: readableSourceTitle(a.url, usableTitle(a.title, a.url) ?? hints.get(urlKey(a.url))),
          startIndex: a.start_index,
          endIndex: a.end_index,
        });
      }
    }
  }
  if (cited.length) return cited;
  // Meta's web_search returns no url_citation annotations; the pages it read come back
  // on web_search_call when the request includes their sources/results.
  return searched.map((url) => ({ url, title: readableSourceTitle(url, hints.get(urlKey(url))) }));
}

export function extractOutputText(response: ResponsesResult | null | undefined): string {
  // Only the final answer: skip "commentary" progress notes the model writes before searching.
  const messages = (response?.output ?? []).filter((item) => item.type === "message" && item.phase !== "commentary");
  const last = messages.at(-1);
  const parts: string[] = [];
  for (const part of last?.content ?? []) {
    if (part.type === "output_text" && typeof part.text === "string") parts.push(part.text);
  }
  if (parts.length) return parts.join("").trim();
  if (response?.output?.length) return "";
  return (response?.output_text ?? "").trim();
}

export function trustedSources(citations: Citation[]): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const c of citations) {
    if (!isTrustedUrl(c.url) || seen.has(c.url)) continue;
    seen.add(c.url);
    sources.push({
      url: c.url,
      title: readableSourceTitle(c.url, c.title),
      publisher: hostnameOf(c.url) ?? undefined,
      verified: "web_search",
    });
  }
  return sources;
}
