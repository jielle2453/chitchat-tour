import { beforeEach, describe, expect, it, vi } from "vitest";
import { fix, items } from "./fixtures";
import type { GuideRequest } from "@/lib/types";

vi.mock("@/lib/kb", () => ({
  getKnowledgeItems: () => items,
  getItem: (id: string) => items.find((i) => i.id === id),
}));
const responsesText = vi.fn();
vi.mock("./llm", () => ({ responsesText: (...a: unknown[]) => responsesText(...a), chatText: vi.fn() }));

import { runGuide } from "./guide";
import { runAsk, runExplain } from "./ask";
import { allowRequest, resetGuard } from "./guard";

const base = (over: Partial<GuideRequest> = {}) => baseReq(over);
const baseReq = (over: Partial<GuideRequest> = {}): GuideRequest => ({
  profile: { hometown: "JP", lang: "ja" },
  fix,
  candidates: [{ itemId: "garbage-truck", score: 0.9, reasons: ["evening", "differs from Tokyo"], distanceM: 20, bearingDeg: 90 }],
  state: { toldItemIds: [], lastSpokenAt: null, history: [] },
  areaName: "Yongkang Street",
  ...over,
});

beforeEach(() => {
  delete process.env.META_API_KEY;
  responsesText.mockReset();
});

describe("runGuide (mock)", () => {
  it("speaks the top candidate with KB sources, falling back to English when ja is missing", async () => {
    const r = await runGuide(base());
    expect(r.narration?.itemId).toBe("garbage-truck");
    expect(r.narration?.sources[0].url).toContain("taiwaninsight");
    expect(r.narration?.lang).toBe("en");
    expect(r.narration?.text).toContain("Tokyo");
    expect(r.trace.some((t) => /using English/.test(t.message))).toBe(true);
    expect(r.trace.map((t) => t.kind)).toEqual(expect.arrayContaining(["position", "candidate", "decision"]));
  });
  it("uses the requested language when complete", async () => {
    const r = await runGuide(base({ profile: { hometown: "US", lang: "zh-TW" } }));
    expect(r.narration?.lang).toBe("zh-TW");
    expect(r.narration?.text).toContain("音樂");
  });
  it("never invents a comparison when none exists", async () => {
    const r = await runGuide(base({ profile: { hometown: "US", lang: "en" } }));
    expect(r.narration?.text).not.toContain("Compared with home");
  });
  it("flags disputed items", async () => {
    const r = await runGuide(base({ profile: { hometown: "US", lang: "en" }, candidates: [{ itemId: "disputed-thing", score: 0.5, reasons: [] }] }));
    expect(r.narration?.text).toContain("several stories");
    expect(r.narration?.confidence).toBe("low");
  });
  it("stays silent with no candidates or only told ones", async () => {
    expect((await runGuide(base({ candidates: [] }))).narration).toBeNull();
    const r = await runGuide(base({ state: { toldItemIds: ["garbage-truck"], lastSpokenAt: null, history: [] } }));
    expect(r.narration).toBeNull();
    expect(r.trace.at(-1)?.kind).toBe("skip");
  });
});

describe("runGuide (real path, mocked model)", () => {
  const gps = { ...fix, simulated: false };
  const base = (over: Partial<GuideRequest> = {}) => baseReq({ fix: gps, ...over });
  beforeEach(() => {
    process.env.META_API_KEY = "test";
  });
  it("speaks the KB text without a model call on a simulated walk", async () => {
    const r = await runGuide(baseReq({ fix: { ...fix, simulated: true } }));
    expect(r.narration?.itemId).toBe("garbage-truck");
    expect(responsesText).not.toHaveBeenCalled();
  });
  it("uses the model text but KB sources", async () => {
    responsesText.mockResolvedValue({
      text: JSON.stringify({ decision: "speak", itemId: "garbage-truck", title: "Garbage truck", text: "Notice the music?", reason: "Differs from Tokyo." }),
    });
    const r = await runGuide(base());
    expect(r.narration?.text).toBe("Notice the music?");
    expect(r.narration?.sources[0].url).toContain("taiwaninsight");
    expect(responsesText.mock.calls[0][0].text.format.strict).toBe(true);
  });
  it("respects a silent decision", async () => {
    responsesText.mockResolvedValue({ text: JSON.stringify({ decision: "silent", itemId: "garbage-truck", title: "", text: "", reason: "Just told something." }) });
    expect((await runGuide(base())).narration).toBeNull();
  });
  it("falls back to the top candidate on bad JSON", async () => {
    responsesText.mockResolvedValue({ text: "not json" });
    const r = await runGuide(base());
    expect(r.narration?.itemId).toBe("garbage-truck");
    expect(r.trace.some((t) => t.kind === "error")).toBe(true);
  });
  it("parses fenced JSON without retrying", async () => {
    const full = JSON.stringify({ decision: "speak", itemId: "garbage-truck", title: "Garbage truck", text: "Notice the music?", reason: "Differs from Tokyo." });
    responsesText.mockResolvedValue({ text: "```json\n" + full + "\n```" });
    const r = await runGuide(base());
    expect(r.narration?.text).toBe("Notice the music?");
    expect(responsesText).toHaveBeenCalledTimes(1);
  });
  it("repairs a truncated tail without retrying", async () => {
    const full = JSON.stringify({ decision: "speak", itemId: "garbage-truck", title: "Garbage truck", text: "Notice the music?", reason: "Differs from Tokyo." });
    responsesText.mockResolvedValue({ text: full.slice(0, -2) });
    const r = await runGuide(base());
    expect(r.narration?.text).toBe("Notice the music?");
    expect(responsesText).toHaveBeenCalledTimes(1);
  });
});

describe("runAsk / runExplain", () => {
  const profile = { hometown: "JP", lang: "en" as const };
  it("mock ask answers from the KB when it matches", async () => {
    const r = await runAsk({ profile, question: "Why do the garbage trucks play music here?", recent: [] });
    expect(r.narration.itemId).toBe("garbage-truck");
    expect(r.narration.sources.length).toBeGreaterThan(0);
  });
  it("mock ask is honestly unsure otherwise", async () => {
    const r = await runAsk({ profile, question: "What is the population of Peru?", recent: [] });
    expect(r.narration.confidence).toBe("low");
    expect(r.narration.sources).toEqual([]);
    expect(r.narration.text).toMatch(/reliable source/);
  });
  it("explain uses the KB item when given", async () => {
    const r = await runExplain({ profile, label: "garbage truck", itemId: "garbage-truck" });
    expect(r.narration.itemId).toBe("garbage-truck");
  });
  it("real ask keeps only trusted pages the model relied on, else says no source", async () => {
    process.env.META_API_KEY = "test";
    const reply = (urls: string[], used: string[], found = true) => {
      const text = JSON.stringify({ found, title: "Hook turn", answer: found ? "Answer." : "I could not find a source.", used_urls: used });
      return {
        text,
        raw: { output: [{ type: "web_search_call", action: { sources: urls.map((url) => ({ type: "url", url })) } }, { type: "message", content: [{ type: "output_text", text, annotations: [] }] }] },
      };
    };
    const noTopic = () => ({ text: JSON.stringify({ itemId: null }) });
    responsesText.mockResolvedValueOnce(noTopic());
    responsesText.mockResolvedValueOnce(reply(["https://blog.example.com/a", "https://en.wikipedia.org/wiki/A", "https://www.gov.taipei/x"], ["https://en.m.wikipedia.org/wiki/A"]));
    const ok = await runAsk({ profile, question: "What is a scooter hook turn?", recent: [] });
    expect(ok.narration.sources.map((s) => s.url)).toEqual(["https://en.wikipedia.org/wiki/A"]);
    expect(ok.narration.sources[0].title).toBe("Wikipedia");
    expect(ok.narration.sources[0].title).not.toContain("wikipedia.org");
    expect(ok.narration.sources[0].publisher).toBe("en.wikipedia.org");
    expect(ok.narration.title).toBe("Hook turn");
    expect(ok.narration.confidence).toBe("medium");
    const webCall = responsesText.mock.calls
      .map((c) => c[0] as { tools?: unknown; max_tool_calls?: number })
      .find((p) => p.tools !== undefined);
    expect(webCall?.max_tool_calls).toBeGreaterThan(0);

    responsesText.mockResolvedValueOnce(noTopic());
    responsesText.mockResolvedValueOnce(reply(["https://blog.example.com/a"], ["https://blog.example.com/a"]));
    const bad = await runAsk({ profile, question: "What is a scooter hook turn?", recent: [] });
    expect(bad.narration.confidence).toBe("low");
    expect(bad.narration.sources).toEqual([]);

    responsesText.mockResolvedValueOnce(noTopic());
    responsesText.mockResolvedValueOnce(reply(["https://en.wikipedia.org/wiki/A"], [], false));
    const none = await runAsk({ profile, question: "Who named this lane?", recent: [] });
    expect(none.narration.sources).toEqual([]);
    expect(none.narration.text).toBe("I could not find a source.");
  });
  it("real ask surfaces the page title from web_search_call.results", async () => {
    process.env.META_API_KEY = "test";
    const text = JSON.stringify({ found: true, title: "Hook turn", answer: "Answer.", used_urls: ["https://en.m.wikipedia.org/wiki/Hook_turn"] });
    responsesText.mockResolvedValueOnce({ text: JSON.stringify({ itemId: null }) });
    responsesText.mockResolvedValueOnce({
      text,
      raw: {
        output: [
          { type: "web_search_call", action: { sources: [{ type: "url", url: "https://en.wikipedia.org/wiki/Hook_turn" }] }, results: [{ type: "text_result", title: "Hook turn (Taiwan)", url: "https://en.wikipedia.org/wiki/Hook_turn", snippet: "" }] },
          { type: "message", content: [{ type: "output_text", text, annotations: [] }] },
        ],
      },
    });
    const r = await runAsk({ profile, question: "What is a scooter hook turn?", recent: [] });
    expect(r.narration.sources).toEqual([{ url: "https://en.wikipedia.org/wiki/Hook_turn", title: "Hook turn (Taiwan)", publisher: "en.wikipedia.org", verified: "web_search" }]);
  });
});

describe("new voice (mock)", () => {
  const BANNED = [
    "Have you noticed this?",
    "気づきましたか",
    "你有注意到嗎",
    "你有看到",
    "interestingly",
    "fun fact",
    "很有趣的是",
    "有趣的是",
    "面白いことに",
    "Elsewhere it's often different",
  ];
  it("mock narrations never use announcer openers", async () => {
    for (const profile of [{ hometown: "JP", lang: "ja" as const }, { hometown: "US", lang: "en" as const }, { hometown: "US", lang: "zh-TW" as const }]) {
      const r = await runGuide(base({ profile }));
      const text = r.narration?.text ?? "";
      for (const b of BANNED) expect(text).not.toContain(b);
    }
  });
  it("mock narrations stay within the short spoken budget", async () => {
    const en = await runGuide(base({ profile: { hometown: "US", lang: "en" } }));
    expect(en.narration!.text.split(/\s+/).length).toBeLessThanOrEqual(90);
    const zh = await runGuide(base({ profile: { hometown: "US", lang: "zh-TW" } }));
    expect(zh.narration!.text.length).toBeLessThanOrEqual(200);
  });
  it("openers vary by item but are stable per item", async () => {
    const { openerFor } = await import("./common");
    const openers = new Set(["a", "b", "c", "d", "e", "f", "g"].map((id) => openerFor("en", `item-${id}`)));
    expect(openers.size).toBeGreaterThan(1);
    expect(openerFor("en", "garbage-truck")).toBe(openerFor("en", "garbage-truck"));
  });
  it("the guide prompt demands the short witty voice", async () => {
    const { loadPrompt } = await import("./prompts");
    const system = await loadPrompt("guide-system.md");
    expect(system).toContain("45 to 70 words");
    expect(system).toContain("70 to 120 characters");
    expect(system).toContain("很有趣的是");
    const ask = await loadPrompt("ask-system.md");
    expect(ask).toContain("45 to 70 words");
  });
});

describe("guard", () => {
  it("limits requests per day", () => {
    resetGuard();
    process.env.DAILY_REQUEST_LIMIT = "2";
    expect([allowRequest(), allowRequest(), allowRequest()]).toEqual([true, true, false]);
    delete process.env.DAILY_REQUEST_LIMIT;
    resetGuard();
  });
});
