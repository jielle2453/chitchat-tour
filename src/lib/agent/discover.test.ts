import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeItem, Poi } from "@/lib/types";

const shopItem = {
  id: "convenience-store-density",
  category: "shop",
  layer: "point",
  trigger: { osm: ["shop=convenience"] },
  title: { en: "Stores everywhere" },
  fact: { en: "There is a store on every corner." },
  sources: [{ url: "https://en.wikipedia.org/wiki/Convenience_store", title: "Convenience store" }],
  confidence: "high",
  disputed: false,
  caveats: null,
  hometown: {},
} as unknown as KnowledgeItem;

vi.mock("@/lib/kb", () => ({
  getKnowledgeItems: () => [shopItem],
  getItem: (id: string) => (id === shopItem.id ? shopItem : undefined),
}));

const responsesText = vi.fn();
vi.mock("./llm", () => ({ responsesText: (...a: unknown[]) => responsesText(...a), chatText: vi.fn() }));

import { kbCoveringItem, runDiscover } from "./discover";

const profile = { hometown: "JP", lang: "en" as const };
const fix = { lat: 25.033, lon: 121.53, accuracy: 10, heading: 90, speed: 1.2, timestamp: 1 };

const store: Poi = { id: "node/1", kind: "convenience", name: "Seven", lat: 25.0331, lon: 121.53, tags: { shop: "convenience" } };
const temple: Poi = {
  id: "node/2",
  kind: "place_of_worship",
  name: "Some Temple",
  lat: 25.0332,
  lon: 121.5301,
  tags: { amenity: "place_of_worship", religion: "buddhist", name: "Some Temple" },
};
const bakery: Poi = { id: "node/3", kind: "other", name: "Bakery", lat: 25.0333, lon: 121.5302, tags: { shop: "bakery", name: "Bakery" } };

beforeEach(() => {
  delete process.env.META_API_KEY;
  responsesText.mockReset();
});

describe("kbCoveringItem", () => {
  it("matches a KB point item by OSM tags", () => {
    expect(kbCoveringItem(store)?.id).toBe("convenience-store-density");
  });
  it("leaves temples and bakeries to live research", () => {
    expect(kbCoveringItem(temple)).toBeNull();
    expect(kbCoveringItem(bakery)).toBeNull();
  });
});

describe("runDiscover (KB first)", () => {
  it("returns null when the KB already covers the POI", async () => {
    const r = await runDiscover({ profile, poi: store, fix });
    expect(r.narration).toBeNull();
    expect(r.trace.some((t) => /knowledge base/.test(t.message))).toBe(true);
    expect(responsesText).not.toHaveBeenCalled();
  });
});

describe("runDiscover (mock)", () => {
  it("returns a canned narration for a temple", async () => {
    const r = await runDiscover({ profile, poi: temple, fix });
    expect(r.narration?.itemId).toBe("live:node/2");
    expect(r.narration?.title).toBeTruthy();
    expect(r.narration?.text.length).toBeGreaterThan(20);
  });
  it("stays quiet for kinds with no canned narration", async () => {
    const r = await runDiscover({ profile, poi: bakery, fix });
    expect(r.narration).toBeNull();
  });
});

describe("runDiscover (real path, mocked model)", () => {
  beforeEach(() => {
    process.env.META_API_KEY = "test";
  });
  const reply = (urls: string[], used: string[], found = true, answer = "Answer.") => {
    const text = JSON.stringify({ found, title: "Temple", answer, used_urls: used });
    return {
      text,
      raw: { output: [{ type: "web_search_call", action: { sources: urls.map((url) => ({ type: "url", url })) } }, { type: "message", content: [{ type: "output_text", text, annotations: [] }] }] },
    };
  };
  it("keeps only trusted pages the model relied on", async () => {
    responsesText.mockResolvedValueOnce(
      reply(["https://blog.example.com/a", "https://en.wikipedia.org/wiki/Temple"], ["https://en.m.wikipedia.org/wiki/Temple"]),
    );
    const r = await runDiscover({ profile, poi: temple, fix });
    expect(r.narration?.itemId).toBe("live:node/2");
    expect(r.narration?.sources.map((s) => s.url)).toEqual(["https://en.wikipedia.org/wiki/Temple"]);
    expect(r.narration?.confidence).toBe("medium");
    expect(responsesText.mock.calls[0][0].max_tool_calls).toBeGreaterThan(0);
  });
  it("stays quiet when nothing trusted supports an answer", async () => {
    responsesText.mockResolvedValueOnce(reply(["https://blog.example.com/a"], ["https://blog.example.com/a"]));
    const r = await runDiscover({ profile, poi: temple, fix });
    expect(r.narration).toBeNull();
    expect(r.trace.some((t) => /quiet/i.test(t.message))).toBe(true);
  });
  it("stays quiet when the model found nothing", async () => {
    responsesText.mockResolvedValueOnce(reply(["https://en.wikipedia.org/wiki/Temple"], [], false, "I could not find a source."));
    const r = await runDiscover({ profile, poi: bakery, fix });
    expect(r.narration).toBeNull();
  });
  it("sends the POI and hometown to the model with web_search", async () => {
    responsesText.mockResolvedValueOnce(reply(["https://en.wikipedia.org/wiki/Temple"], ["https://en.wikipedia.org/wiki/Temple"]));
    await runDiscover({ profile, poi: temple, fix });
    const params = responsesText.mock.calls[0][0];
    expect(params.tools).toEqual([{ type: "web_search", search_context_size: "low", user_location: expect.objectContaining({ country: "TW" }) }]);
    expect(params.include).toContain("web_search_call.results");
    expect(params.input).toContain("Some Temple");
    expect(params.input).toContain("JP");
  });
});
