import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/discover (smoke, mock mode)", () => {
  it("wires schema, guard and runDiscover together", async () => {
    delete process.env.META_API_KEY;
    const body = {
      profile: { hometown: "US", lang: "en" },
      poi: { id: "node/3", kind: "other", name: "Bakery", lat: 25.033, lon: 121.53, tags: { shop: "bakery", name: "Bakery" } },
      fix: { lat: 25.033, lon: 121.53, accuracy: 10, heading: 90, speed: 1, timestamp: 1 },
    };
    const res = await POST(new Request("http://x/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { narration: unknown; trace: unknown[] };
    expect(json.narration).toBeNull(); // mock mode has no canned bakery narration
    expect(json.trace.length).toBeGreaterThan(0);
  });
  it("rejects invalid bodies", async () => {
    const res = await POST(new Request("http://x/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
    expect(res.status).toBe(400);
  });
});
