import { describe, expect, it } from "vitest";
import type { TraceStep } from "@/lib/types";
import { localizeTrace, prepareTrace, relAge } from "./traceText";

const step = (kind: TraceStep["kind"], message: string, at = 1000): TraceStep => ({ kind, message, at });

describe("localizeTrace", () => {
  it("maps researching-ahead, hiding kind and coordinates", () => {
    const r = localizeTrace("user", "Researching ahead: Jinhua Building (bus_stop) at 25.02988, 121.52888.", "zh-TW");
    expect(r).toMatchObject({ group: "research", text: "正在查Jinhua Building", live: true });
    expect(r!.text).not.toContain("25.02");
    expect(localizeTrace("user", "Researching ahead: Jinhua Building (bus_stop) at 25.02988, 121.52888.", "en")).toMatchObject({
      text: "Researching Jinhua Building",
    });
    expect(localizeTrace("user", "Researching ahead: Jinhua Building (bus_stop) at 25.02988, 121.52888.", "ja")).toMatchObject({
      text: "Jinhua Buildingを調査中",
    });
  });

  it("maps not-in-KB to web research and verify counts to a sources visual", () => {
    expect(localizeTrace("decision", 'Not in the knowledge base: researching "Jinhua Building" on the web.', "zh-TW")).toMatchObject({
      group: "research",
      text: "知識庫沒有，正在上網查Jinhua Building",
    });
    const v = localizeTrace("verify", "20 page(s) read; 2 from trusted domains; the model relied on 3.", "zh-TW");
    expect(v).toMatchObject({ group: "check", text: "讀了20頁 · 留下2個可信來源", visual: { kind: "sources", total: 20, kept: 2 } });
    expect(localizeTrace("verify", "20 page(s) read; 2 from trusted domains; the model relied on 3.", "en")!.text).toBe(
      "Read 20 pages · kept 2 trusted",
    );
  });

  it("maps ready / arriving / speaking lines", () => {
    expect(localizeTrace("decision", "Ready for when you get there: 錦安市場.", "zh-TW")).toMatchObject({
      group: "speak",
      text: "到了就跟你說 · 錦安市場",
    });
    expect(localizeTrace("decision", 'Ready: "Night Market" — for when the walker gets there.', "en")).toMatchObject({
      group: "speak",
      text: "Ready for when you arrive · Night Market",
    });
    expect(localizeTrace("decision", "Telling you about Night Market as you arrive.", "ja")).toMatchObject({ group: "speak" });
    expect(localizeTrace("decision", 'Speaking "Garbage Truck": top-ranked candidate (mock mode).', "zh-TW")).toMatchObject({
      group: "speak",
      text: "正在說 · Garbage Truck",
    });
  });

  it("maps quiet lines: no source, already told, already covered, nothing new", () => {
    expect(localizeTrace("decision", "No reliable source for this place; staying quiet.", "zh-TW")).toMatchObject({
      text: "找不到可靠出處，先安靜",
    });
    expect(localizeTrace("verify", "No citation from a trusted domain; will not state unsourced facts.", "en")).toMatchObject({
      text: "No reliable source — staying quiet",
    });
    expect(localizeTrace("skip", '"Garbage Truck" was already told; ignored.', "ja")).toMatchObject({
      text: "話し済み · Garbage Truck",
    });
    expect(localizeTrace("skip", '"X" is already covered by the knowledge base ("kb-1"); the KB handles it.', "zh-TW")).toMatchObject({
      text: "知識庫已經有了 · X",
    });
    expect(localizeTrace("skip", "Nothing new worth telling here. Staying quiet.", "en")).toMatchObject({
      text: "Nothing new — staying quiet",
    });
    expect(localizeTrace("skip", "Nothing nearby is worth telling this walker right now", "en")).toMatchObject({
      text: "Nothing new — staying quiet",
    });
    expect(localizeTrace("decision", "Chose to stay quiet: the street is empty.", "en")).toMatchObject({
      text: "Staying quiet · the street is empty.",
    });
  });

  it("maps KB source counts and mock KB match", () => {
    expect(localizeTrace("verify", "Using 2 pre-verified source(s) from the knowledge base.", "zh-TW")).toMatchObject({
      text: "知識庫 · 2個已查證出處",
    });
    expect(localizeTrace("verify", "Answered from the verified knowledge base with 3 source(s); no web search needed.", "en")).toMatchObject({
      text: "Knowledge base · 3 verified sources",
    });
    expect(localizeTrace("decision", 'Mock mode: matched knowledge item "Garbage Truck".', "en")).toMatchObject({
      text: "Found in the knowledge base · Garbage Truck",
    });
  });

  it("maps position lines to looking-around without coordinates", () => {
    const p = localizeTrace("position", "At 25.03312, 121.52991 in Yongkang Street (simulated walk).", "zh-TW");
    expect(p).toMatchObject({ group: "look", text: "Yongkang Street附近" });
    expect(localizeTrace("position", "Yongkang Street: 4 places within 150 m", "en")).toMatchObject({
      text: "Yongkang Street · 4 places nearby",
    });
    expect(localizeTrace("position", "Looking ahead: 2 places within 250 m to research.", "ja")).toMatchObject({ group: "look" });
  });

  it("maps scored candidates with localized reasons and a score visual", () => {
    const c = localizeTrace("candidate", "Garbage Truck scored 0.72: you photographed garbage truck 3 min ago; quiet for a while, area fact.", "zh-TW");
    expect(c).toMatchObject({ group: "consider", text: "考慮中 · Garbage Truck", visual: { kind: "score", score: 0.72 } });
    expect(c!.detail).toEqual(["3分鐘前拍了garbage truck", "安靜了一陣子，說個地方小知識"]);
    const p = localizeTrace("candidate", "MRT Sign (score 0.55): Xinyi Rd 20 m ahead", "en");
    expect(p!.detail).toEqual(["Xinyi Rd · 20 m ahead"]);
  });

  it("maps questions, taps, budget, failures and fallback picks to quiet notes", () => {
    expect(localizeTrace("user", "Question (zh-TW): 為什麼會這樣", "zh-TW")).toMatchObject({ group: "ask", text: "你問了 · 為什麼會這樣" });
    expect(localizeTrace("user", 'Tapped object: "pole" (matched kb-1).', "en")).toMatchObject({ group: "ask", text: "You tapped · pole" });
    expect(
      localizeTrace("skip", "Live research budget used up for this walk (12); the knowledge base carries on.", "en")!.text,
    ).toContain("budget");
    expect(localizeTrace("error", "Research on X failed (timeout).", "en")).toMatchObject({ text: "Couldn't research X" });
    expect(localizeTrace("error", "Web search call failed (timeout).", "en")).toMatchObject({ text: "Web search failed — staying quiet" });
    expect(localizeTrace("error", 'Retry failed (bad json); falling back to the top candidate.', "en")).toMatchObject({
      text: "Fell back to the top pick",
    });
    expect(localizeTrace("decision", "Mock mode: no model call; choosing the top-ranked candidate.", "en")).toMatchObject({
      text: "Choosing the best match",
    });
    expect(localizeTrace("decision", "No Japanese text for this item; using English instead.", "ja")).toMatchObject({
      text: "日本語版がないので英語で",
    });
    expect(localizeTrace("decision", "Asking the Meta model to choose and narrate.", "en")).toMatchObject({
      text: "Asking the model to choose",
    });
  });

  it("hides session metadata, shaping and JSON retry noise", () => {
    for (const msg of [
      "Visitor from JP, language zh-TW. Told so far: 3.",
      "Hometown JP, language zh-TW",
      "Shaped the narration to spoken length in English.",
      "Shaping step failed; using the unshaped text.",
      "Model output could not be used (Unterminated string in JSON); retrying once.",
      "Mock mode: no model call; using a canned narration for this kind of place.",
    ]) {
      expect(localizeTrace("user", msg, "en"), msg).toBeNull();
      expect(localizeTrace("decision", msg, "en"), msg).toBeNull();
    }
  });

  it("falls back to raw text with coordinates stripped", () => {
    const r = localizeTrace("verify", "Something mysterious happened at 25.03312, 121.52991 today.", "en");
    expect(r!.text).not.toContain("25.03");
    expect(r!.text).toContain("mysterious");
  });
});

describe("relAge", () => {
  it("says just now, minutes and hours per language", () => {
    expect(relAge(1000, 20000, "en")).toBe("just now");
    expect(relAge(0, 120_000, "zh-TW")).toBe("2分鐘前");
    expect(relAge(0, 120_000, "ja")).toBe("2分前");
    expect(relAge(0, 3_700_000, "en")).toBe("1 hr ago");
  });
});

describe("prepareTrace", () => {
  it("drops hidden lines, collapses repeats with ×N, newest first", () => {
    const steps = [
      step("user", "Visitor from JP, language en. Told so far: 0.", 1000),
      step("position", "At 25.0, 121.5 in Yongkang Street.", 2000),
      step("position", "At 25.0, 121.5 in Yongkang Street.", 3000),
      step("decision", "Nothing new worth telling here. Staying quiet.", 4000),
    ];
    const out = prepareTrace(steps, "en", 5000);
    expect(out.map((d) => d.text)).toEqual(["Nothing new — staying quiet", "Around Yongkang Street"]);
    expect(out[1].count).toBe(2);
    expect(out[1].at).toBe(3000);
  });
});
