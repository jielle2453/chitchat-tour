// Verified knowledge base, bundled at build time. Usable on phone and server.
import type { KnowledgeItem } from "@/lib/types";
import taipei from "@data/knowledge/taipei.json";

const items = taipei as unknown as KnowledgeItem[];
const byId = new Map(items.map((item) => [item.id, item]));

export function getKnowledgeItems(): KnowledgeItem[] {
  return items;
}

export function getItem(id: string): KnowledgeItem | undefined {
  return byId.get(id);
}
