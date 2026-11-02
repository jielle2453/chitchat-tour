import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJsonObject, parseModelJson } from "./common";

const Schema = z.object({ decision: z.string(), text: z.string() });
const FULL = JSON.stringify({ decision: "speak", text: "Notice the music?" });

describe("extractJsonObject", () => {
  it("parses plain JSON", () => {
    expect(extractJsonObject(FULL)).toBe(FULL);
  });
  it("strips code fences", () => {
    expect(extractJsonObject(`\`\`\`json\n${FULL}\n\`\`\``)).toBe(FULL);
  });
  it("extracts JSON wrapped in prose", () => {
    const out = `Here is my choice:\n${FULL}\nHope that helps.`;
    expect(extractJsonObject(out)).toBe(FULL);
  });
  it("ignores braces inside strings", () => {
    const raw = JSON.stringify({ decision: "speak", text: "a { curly } tale" });
    expect(extractJsonObject(`Note:\n${raw}\ndone`)).toBe(raw);
  });
  it("repairs a truncated trailing string", () => {
    const cut = FULL.slice(0, -4); // inside the final string, closing quote/brace missing
    expect(() => JSON.parse(cut)).toThrow();
    expect(JSON.parse(extractJsonObject(cut))).toEqual({ decision: "speak", text: "Notice the musi" });
  });
  it("repairs a missing closing brace", () => {
    expect(JSON.parse(extractJsonObject('{"decision":"speak","text":"hi"'))).toEqual({ decision: "speak", text: "hi" });
  });
  it("throws when there is no object or the cut is not safely repairable", () => {
    expect(() => extractJsonObject("not json at all")).toThrow();
    expect(() => extractJsonObject('{"decision":"speak","items":["a","b')).toThrow(); // unclosed array
    expect(() => extractJsonObject('{"decision":')).toThrow(); // cut outside a string
  });
});

describe("parseModelJson", () => {
  it("validates fenced output against the schema", () => {
    expect(parseModelJson(`\`\`\`json\n${FULL}\n\`\`\``, Schema)).toEqual(JSON.parse(FULL));
  });
  it("rejects schema violations even when the JSON parses", () => {
    expect(() => parseModelJson(JSON.stringify({ decision: "speak" }), Schema)).toThrow();
  });
});
