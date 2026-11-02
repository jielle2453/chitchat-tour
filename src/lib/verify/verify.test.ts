import { describe, expect, it } from "vitest";
import { extractCitations, extractOutputText, isTrustedUrl, trustedSources } from "./index";

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
});
