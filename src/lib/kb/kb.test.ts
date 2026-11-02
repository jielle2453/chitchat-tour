import { describe, expect, it } from "vitest";
import { getItem, getKnowledgeItems } from "./index";

describe("knowledge base parent pointers", () => {
  it("every parent points to an existing non-facet item", () => {
    for (const item of getKnowledgeItems()) {
      if (!item.parent) continue;
      const parent = getItem(item.parent);
      expect(parent, `${item.id} has a missing parent ${item.parent}`).toBeDefined();
      expect(parent!.parent, `${item.id} has a facet as parent`).toBeUndefined();
    }
  });

  it("facet items have no further parent (single-level facets)", () => {
    const facets = getKnowledgeItems().filter((i) => i.parent);
    expect(facets.length).toBeGreaterThan(0);
    for (const facet of facets) {
      const parent = getItem(facet.parent!);
      expect(parent!.parent).toBeUndefined();
    }
  });

  it("item ids are unique", () => {
    const ids = getKnowledgeItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
