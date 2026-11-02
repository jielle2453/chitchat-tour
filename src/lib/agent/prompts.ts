import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

const FALLBACKS: Record<string, string> = {
  "guide-system.md":
    "You are Roadside Guide, a friendly local friend. Speak briefly about everyday things, only from the facts given, in the visitor's language, comparing with their hometown only when a comparison is given. Staying silent is valid. Reply with JSON only.",
  "ask-system.md":
    "You are Roadside Guide, a friendly local friend. Answer in the visitor's language in about 30 to 60 seconds spoken. Use web search; never state what you cannot source; if no reliable source, say so honestly.",
};

const cache = new Map<string, string>();

export async function loadPrompt(name: "guide-system.md" | "ask-system.md"): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  let text = FALLBACKS[name];
  try {
    text = (await readFile(path.join(process.cwd(), "prompts", name), "utf8")).trim();
  } catch {
    // keep the built-in fallback
  }
  cache.set(name, text);
  return text;
}
