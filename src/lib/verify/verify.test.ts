import { describe, expect, it } from "vitest";
import { canonicalHost, canonicalSite, canonicalUrlKey, extractCitations, extractOutputText, isTrustedUrl, readableSourceTitle, trustedSources } from "./index";

const response = {
  output: [
    { type: "web_search_call", id: "ws_1", status: "completed" },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: "Taipei trucks play Beethoven.",
          annotations: [
            { type: "url_citation", url: "https://en.wikipedia.org/wiki/Garbage_truck", title: "Wiki", start_index: 0, end_index: 5 },
            { type: "url_citation", url: "https://en.wikipedia.org/wiki/Garbage_truck", title: "Wiki again", start_index: 6, end_index: 9 },
            { type: "url_citation", url: "https://random-blog.example.com/x", title: "Blog", start_index: 10, end_index: 12 },
            { type: "url_citation", url: "https://www.epd.gov.taipei/page", title: "Gov", start_index: 13, end_index: 15 },
            { type: "file_citation", url: "https://nytimes.com/a", title: "ignored" },
          ],
        },
      ],
    },
  ],
};

describe("verify", () => {
  it("matches hostname suffixes only", () => {
    expect(isTrustedUrl("https://en.wikipedia.org/x")).toBe(true);
    expect(isTrustedUrl("https://wikipedia.org/x")).toBe(true);
    expect(isTrustedUrl("https://data.taipei.gov.tw/x")).toBe(true);
    expect(isTrustedUrl("https://evilwikipedia.org/x")).toBe(false);
    expect(isTrustedUrl("https://wikipedia.org.evil.com/x")).toBe(false);
    expect(isTrustedUrl("not a url")).toBe(false);
    expect(isTrustedUrl("javascript:alert(1)")).toBe(false);
  });
  it("extracts url citations", () => {
    const c = extractCitations(response);
    expect(c).toHaveLength(4);
    expect(c[0]).toMatchObject({ url: "https://en.wikipedia.org/wiki/Garbage_truck", startIndex: 0, endIndex: 5 });
    expect(extractCitations(null)).toEqual([]);
  });
  it("keeps trusted, deduped sources", () => {
    const s = trustedSources(extractCitations(response));
    expect(s.map((x) => x.url)).toEqual(["https://en.wikipedia.org/wiki/Garbage_truck", "https://www.epd.gov.taipei/page"]);
    expect(s[0].verified).toBe("web_search");
  });
  it("reads output text", () => {
    expect(extractOutputText(response)).toBe("Taipei trucks play Beethoven.");
    expect(extractOutputText({ output_text: " hi " })).toBe("hi");
  });
  it("reads Meta's shape: sources on the search call, progress note before the answer", () => {
    const meta = {
      output: [
        { type: "message", phase: "commentary", content: [{ type: "output_text", text: "Searching…", annotations: [] }] },
        { type: "web_search_call", action: { sources: [{ type: "url", url: "https://english.land.gov.taipei/x" }, { type: "url", url: "https://www.youtube.com/watch?v=1" }] } },
        { type: "message", content: [{ type: "output_text", text: "The answer.", annotations: [] }] },
      ],
    };
    expect(extractOutputText(meta)).toBe("The answer.");
    expect(trustedSources(extractCitations(meta)).map((x) => x.url)).toEqual(["https://english.land.gov.taipei/x"]);
  });
  it("uses the real page titles carried by web_search_call.results", () => {
    // Live shape (2026-11-02 probe): action.sources is url-only, while
    // web_search_call.results carries { type: "text_result", title, url, snippet }.
    const live = {
      output: [
        {
          type: "web_search_call",
          action: {
            type: "search",
            query: "q",
            sources: [
              { type: "url", url: "https://www.jil.go.jp/institute/zassi/backnumber/2024/05/pdf/082-083.pdf" },
              { type: "url", url: "https://taiwaninsight.org/2025/12/05/from-musical-garbage-trucks-to-garbage-consciousness-in-taiwan/" },
            ],
          },
          results: [
            { type: "text_result", title: "From Musical Garbage Trucks to Garbage Consciousness in Taiwan", url: "https://taiwaninsight.org/2025/12/05/from-musical-garbage-trucks-to-garbage-consciousness-in-taiwan/", snippet: "" },
          ],
        },
        { type: "message", content: [{ type: "output_text", text: "The answer.", annotations: [] }] },
      ],
    };
    const s = trustedSources(extractCitations(live));
    expect(s.find((x) => x.url.includes("taiwaninsight"))?.title).toBe("From Musical Garbage Trucks to Garbage Consciousness in Taiwan");
  });
  it("canonicalises URLs so the same article matches across variants", () => {
    const a = "https://www.ltn.com.tw/news/world/breakingnews/123";
    expect(canonicalUrlKey(a)).toBe(canonicalUrlKey("http://www.ltn.com.tw/news/world/breakingnews/123?utm_source=x"));
    expect(canonicalUrlKey(a)).toBe(canonicalUrlKey("https://www.ltn.com.tw/news/world/breakingnews/123/"));
    expect(canonicalSite(a)).toBe(canonicalSite("https://news.ltn.com.tw/news/world/breakingnews/123")); // section subdomain: same outlet
    expect(canonicalUrlKey("https://zh.wikipedia.org/wiki/%E5%9E%83%E5%9C%BE%E8%BB%8A")).toBe(
      canonicalUrlKey("https://zh.wikipedia.org/wiki/垃圾車"),
    );
    expect(canonicalHost("https://en.m.wikipedia.org/wiki/X")).toBe("en.wikipedia.org");
    expect(canonicalHost("https://amp.theguardian.com/x")).toBe("theguardian.com");
    expect(canonicalHost("https://taiwaninsight.org./x")).toBe("taiwaninsight.org");
    expect(canonicalHost("not a url")).toBeNull();
    expect(canonicalHost("javascript:alert(1)")).toBeNull();
  });
  it("treats language editions and outlet subdomains as the same site", () => {
    expect(canonicalSite("https://zh.wikipedia.org/wiki/X")).toBe("wikipedia.org");
    expect(canonicalSite("https://en.wikipedia.org/wiki/X")).toBe("wikipedia.org");
    expect(canonicalSite("https://news.ltn.com.tw/x")).toBe("ltn.com.tw");
    expect(canonicalSite("https://www.ltn.com.tw/x")).toBe("ltn.com.tw");
    expect(canonicalSite("https://www.epd.gov.taipei/x")).toBe("epd.gov.taipei");
  });
  it("dedupes trusted sources that differ only by slash or scheme", () => {
    const s = trustedSources([
      { url: "https://taiwaninsight.org/x/", title: "T" },
      { url: "http://www.taiwaninsight.org/x", title: "T" },
    ]);
    expect(s).toHaveLength(1);
  });
  it("never falls back to a bare hostname when a better title exists", () => {
    const pdf = "https://www.jil.go.jp/institute/zassi/backnumber/2024/05/pdf/082-083.pdf";
    const s = trustedSources(extractCitations({ output: [{ type: "web_search_call", action: { sources: [{ type: "url", url: pdf }] } }] }));
    expect(s).toEqual([{ url: pdf, title: "Japan Institute for Labour Policy and Training", publisher: "www.jil.go.jp", verified: "web_search" }]);
    expect(readableSourceTitle("https://en.wikipedia.org/wiki/Garbage_truck", "en.wikipedia.org")).toBe("Garbage truck");
    expect(readableSourceTitle("https://www.youtube.com/watch?v=T0I8fhbM2l0")).toBe("YouTube");
    expect(readableSourceTitle(pdf, "www.jil.go.jp")).toBe("Japan Institute for Labour Policy and Training");
    expect(readableSourceTitle("https://en.wikipedia.org/wiki/Garbage_truck", "Garbage truck - Wikipedia")).toBe("Garbage truck - Wikipedia");
  });
});
