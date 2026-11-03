import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Narration } from "@/lib/types";

const responsesText = vi.fn();
vi.mock("./llm", () => ({ responsesText: (...a: unknown[]) => responsesText(...a), chatText: vi.fn() }));

import { matchKbQuestion, runAsk } from "./ask";
import { rankSources } from "./ask";

beforeEach(() => {
  delete process.env.META_API_KEY;
  responsesText.mockReset();
});

const prof = (lang: "en" | "ja" | "zh-TW", hometown = "JP") => ({ hometown, lang });

describe("runAsk answers from the KB without a key (real knowledge base)", () => {
  it("matches the en garbage-truck question", async () => {
    const r = await runAsk({ profile: prof("en", "US"), question: "Why do garbage trucks in Taipei play music?", recent: [] });
    expect(r.narration.itemId).toBe("garbage-truck-why-music");
    expect(r.narration.sources.length).toBeGreaterThan(0);
    expect(r.narration.lang).toBe("en");
  });
  it("matches the zh-TW garbage-truck question", async () => {
    const r = await runAsk({ profile: prof("zh-TW"), question: "為什麼台灣的垃圾車會放音樂？", recent: [] });
    expect(r.narration.itemId).toBe("garbage-truck-why-music");
    expect(r.narration.sources.length).toBeGreaterThan(0);
    expect(r.narration.lang).toBe("zh-TW");
  });
  it("matches the ja garbage-truck question", async () => {
    const r = await runAsk({ profile: prof("ja"), question: "台北のごみ収集車はなぜ音楽を流すのですか", recent: [] });
    expect(r.narration.itemId).toBe("garbage-truck-why-music");
    expect(r.narration.sources.length).toBeGreaterThan(0);
    expect(r.narration.lang).toBe("ja");
  });
  it("matches a convenience-store question", async () => {
    const r = await runAsk({ profile: prof("en", "US"), question: "Why are there so many convenience stores in Taiwan?", recent: [] });
    expect(r.narration.itemId).toBe("convenience-store-density");
    expect(r.narration.sources.length).toBeGreaterThan(0);
  });
  it("matches a YouBike question", async () => {
    const r = await runAsk({ profile: prof("en", "US"), question: "When did YouBike launch in Taipei?", recent: [] });
    expect(r.narration.itemId).toBe("youbike-origin");
    expect(r.narration.sources.length).toBeGreaterThan(0);
  });
  it("prefers the most specific facet when the question names it", async () => {
    const r = await runAsk({ profile: prof("en", "US"), question: "What is the garbage truck song called, Maiden's Prayer?", recent: [] });
    expect(r.narration.itemId).toBe("garbage-truck-maidens-prayer");
  });
  it("answers a bare why-follow-up from the recent narration", async () => {
    const recent: Narration[] = [
      { id: "n1", itemId: "garbage-truck-why-music", title: "Garbage trucks", text: "The music tells residents the truck is here.", lang: "en", sources: [], confidence: "medium" },
    ];
    const r = await runAsk({ profile: prof("en", "US"), question: "why?", recent });
    expect(r.narration.itemId).toBe("garbage-truck-why-music");
  });
  it("is honestly unsure about non-KB topics without a key", async () => {
    const r = await runAsk({ profile: prof("en", "US"), question: "What is the population of Peru?", recent: [] });
    expect(r.narration.itemId).toBeNull();
    expect(r.narration.sources).toEqual([]);
    expect(responsesText).not.toHaveBeenCalled();
  });
});

describe("runAsk with a key consults the KB before searching the web", () => {
  beforeEach(() => {
    process.env.META_API_KEY = "test";
  });
  it("answers the zh-TW garbage-truck question from the KB without web search", async () => {
    const r = await runAsk({ profile: prof("zh-TW"), question: "為什麼台灣的垃圾車會放音樂？", recent: [] });
    expect(r.narration.itemId).toBe("garbage-truck-why-music");
    expect(r.narration.sources.length).toBeGreaterThan(0);
    expect(responsesText).not.toHaveBeenCalled();
  });
  it("still searches the web for non-KB questions", async () => {
    responsesText.mockResolvedValueOnce({ text: JSON.stringify({ itemId: null }) });
    const text = JSON.stringify({ found: false, title: "Peru", answer: "I could not find a source.", used_urls: [] });
    responsesText.mockResolvedValueOnce({
      text,
      raw: { output: [{ type: "message", content: [{ type: "output_text", text, annotations: [] }] }] },
    });
    const r = await runAsk({ profile: prof("en", "US"), question: "What is the population of Peru?", recent: [] });
    expect(responsesText).toHaveBeenCalledTimes(2);
    expect(r.narration.itemId).toBeNull();
    expect(r.narration.sources).toEqual([]);
  });
});

describe("deterministic matcher is conservative: right or none, never wrong", () => {
  // Right-or-none: the deterministic matcher may decline (null) and let the
  // real-mode model fallback decide, but it must never elect a wrong item.
  const rightOrNone: [string, string[]][] = [
    ["Why are there so many 7-Elevens?", ["convenience-store-density"]],
    ["Why can't I eat on the MRT?", ["mrt-no-eating"]],
    ["捷運為什麼不能吃東西", ["mrt-no-eating"]],
    ["台灣的垃圾要怎麼丟？", ["taipei-pay-as-you-throw", "garbage-truck-why-music"]],
    ["台北的天氣怎麼樣", []],
  ];
  for (const [q, ok] of rightOrNone) {
    it(`right-or-none: ${q}`, () => {
      const hit = matchKbQuestion(q);
      expect(ok.includes(hit?.id ?? "") || hit === null).toBe(true);
    });
  }

  const exact: [string, string][] = [
    ["為什麼超商可以繳稅？", "convenience-store-tax-payment"],
    ["コンビニで税金を払えるの？", "convenience-store-tax-payment"],
    ["Why are there no trash cans on the street?", "few-public-trash-cans"],
    ["What is that iron cage on the windows?", "iron-window-bars"],
    ["屋頂上的水塔是做什麼的", "rooftop-water-tank"],
    ["Why do scooters wait in a box at the intersection?", "two-stage-left-turn-origin"],
    ["機車為什麼要兩段式左轉", "two-stage-left-turn-origin"],
    ["What's that burning barrel with paper?", "joss-paper-burners"],
    ["What happened at Dongmen Market?", "dongmen-market-1928"],
    ["Why do garbage trucks in Taipei play music?", "garbage-truck-why-music"],
    ["為什麼台灣的垃圾車會放音樂？", "garbage-truck-why-music"],
  ];
  for (const [q, id] of exact) {
    it(`exact: ${q}`, () => {
      expect(matchKbQuestion(q)?.id).toBe(id);
    });
  }

  const none = [
    "Where is the nearest toilet?",
    "What time does the museum close?",
    "這附近有好吃的牛肉麵",
    "How much is a taxi to the airport?",
    "Who is the mayor of Taipei?",
    "東京の地下鉄は何時まで？",
    "Is it safe to drink tap water?",
    "Why do people wear masks?",
    "What is the population of Taiwan?",
    "永康街有什麼歷史",
  ];
  for (const q of none) {
    it(`none: ${q}`, () => {
      expect(matchKbQuestion(q)).toBeNull();
    });
  }
});

describe("model topic fallback (real mode, mocked model)", () => {
  beforeEach(() => {
    process.env.META_API_KEY = "test";
  });
  const kbReply = (itemId: string | null) => ({ text: JSON.stringify({ itemId }) });
  const webNoSource = () => {
    const text = JSON.stringify({ found: false, title: "Tap water", answer: "I could not find a source.", used_urls: [] });
    return {
      text,
      raw: { output: [{ type: "message", content: [{ type: "output_text", text, annotations: [] }] }] },
    };
  };
  // Deterministically uncertain: the keyword matcher returns null for these.
  const uncertain = "Why can't I eat on the MRT?";

  it("answers from the model-chosen item with no web search", async () => {
    responsesText.mockResolvedValueOnce(kbReply("mrt-no-eating"));
    const r = await runAsk({ profile: prof("en", "US"), question: uncertain, recent: [] });
    expect(r.narration.itemId).toBe("mrt-no-eating");
    expect(r.narration.sources.length).toBeGreaterThan(0);
    expect(responsesText).toHaveBeenCalledTimes(1);
    expect(responsesText.mock.calls[0][0]).not.toHaveProperty("tools");
    expect(r.trace.some((t) => /Model matched knowledge item "mrt-no-eating"/.test(t.message))).toBe(true);
  });
  it("falls through to the web when the model returns null", async () => {
    responsesText.mockResolvedValueOnce(kbReply(null));
    responsesText.mockResolvedValueOnce(webNoSource());
    const r = await runAsk({ profile: prof("en", "US"), question: "Is it safe to drink tap water?", recent: [] });
    expect(responsesText).toHaveBeenCalledTimes(2);
    expect(r.narration.itemId).toBeNull();
    expect(r.narration.sources).toEqual([]);
  });
  it("falls through to the web on an unknown item id", async () => {
    responsesText.mockResolvedValueOnce(kbReply("no-such-item"));
    responsesText.mockResolvedValueOnce(webNoSource());
    const r = await runAsk({ profile: prof("en", "US"), question: uncertain, recent: [] });
    expect(responsesText).toHaveBeenCalledTimes(2);
    expect(r.narration.itemId).toBeNull();
    expect(r.trace.some((t) => t.kind === "error")).toBe(true);
  });
  it("falls through to the web when the topic call throws", async () => {
    responsesText.mockRejectedValueOnce(new Error("boom"));
    responsesText.mockResolvedValueOnce(webNoSource());
    const r = await runAsk({ profile: prof("en", "US"), question: uncertain, recent: [] });
    expect(responsesText).toHaveBeenCalledTimes(2);
    expect(r.narration.itemId).toBeNull();
    expect(r.trace.some((t) => t.kind === "error")).toBe(true);
  });
});

describe("rankSources keeps a trusted page the model relied on (Cause 2)", () => {
  const src = (url: string) => ({ url, title: "T", publisher: "P", verified: "web_search" as const });
  it("matches across mobile/section subdomains of the same outlet", () => {
    const trusted = [src("https://www.ltn.com.tw/news/world/breakingnews/123")];
    const used = ["https://news.ltn.com.tw/news/world/breakingnews/123"];
    expect(rankSources(trusted, used).map((s) => s.url)).toEqual([trusted[0].url]);
  });
  it("matches across Wikipedia language editions", () => {
    const trusted = [src("https://zh.wikipedia.org/wiki/%E5%9E%83%E5%9C%BE%E8%BB%8A")];
    const used = ["https://en.wikipedia.org/wiki/Garbage_truck"];
    expect(rankSources(trusted, used).map((s) => s.url)).toEqual([trusted[0].url]);
  });
  it("matches across amp hosts and http/https", () => {
    const trusted = [src("https://www.theguardian.com/world/article")];
    const used = ["http://amp.theguardian.com/world/article?output=1"];
    expect(rankSources(trusted, used).map((s) => s.url)).toEqual([trusted[0].url]);
  });
  it("still rejects when the model relied on a different outlet", () => {
    const trusted = [src("https://www.pts.org.tw/article/775582")];
    expect(rankSources(trusted, ["https://random-blog.example.com/x"])).toEqual([]);
  });
});
