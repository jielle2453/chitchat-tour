import type { Source } from "@/lib/types";
import whitelist from "@data/source-whitelist.json";

// Reads the Responses API output shape documented for web_search:
// output[] -> { type: "message", content: [{ type: "output_text", text, annotations: [...] }] }

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
interface OutputItem {
  type?: string;
  content?: OutputTextPart[];
}
export interface ResponsesResult {
  output?: OutputItem[];
  output_text?: string;
}

export function extractCitations(response: ResponsesResult | null | undefined): Citation[] {
  const out: Citation[] = [];
  for (const item of response?.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      for (const a of part.annotations ?? []) {
        if (a.type !== "url_citation" || !a.url) continue;
        out.push({
          url: a.url,
          title: a.title ?? a.url,
          startIndex: a.start_index,
          endIndex: a.end_index,
        });
      }
    }
  }
  return out;
}

export function extractOutputText(response: ResponsesResult | null | undefined): string {
  const parts: string[] = [];
  for (const item of response?.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") parts.push(part.text);
    }
  }
  if (parts.length) return parts.join("").trim();
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
      title: c.title,
      publisher: hostnameOf(c.url) ?? undefined,
      verified: "web_search",
    });
  }
  return sources;
}
