import { beforeEach, describe, expect, it, vi } from "vitest";
import { cellKey, clearOverpassCache, fetchNearbyPois, mapElementToPoi, withDistanceBearing } from "./overpass";

beforeEach(() => {
  clearOverpassCache();
  vi.unstubAllGlobals();
});

describe("mapElementToPoi", () => {
  it("maps a named temple node onto the Poi shape", () => {
    const poi = mapElementToPoi({
      type: "node",
      id: 1,
      lat: 25.03,
      lon: 121.53,
      tags: { name: "廟", "name:en": "Some Temple", amenity: "place_of_worship", religion: "buddhist" },
    });
    expect(poi).toMatchObject({ id: "node/1", kind: "place_of_worship", name: "Some Temple", lat: 25.03, lon: 121.53 });
  });
  it("maps ways via their center and keeps shop tags", () => {
    const poi = mapElementToPoi({
      type: "way",
      id: 2,
      center: { lat: 25.031, lon: 121.531 },
      tags: { name: "Bakery", shop: "bakery" },
    });
    expect(poi).toMatchObject({ id: "way/2", kind: "other", name: "Bakery" });
    expect(poi?.tags.shop).toBe("bakery");
  });
  it("maps convenience shops to the convenience kind", () => {
    const poi = mapElementToPoi({ type: "node", id: 3, lat: 25, lon: 121, tags: { name: "Seven", shop: "convenience" } });
    expect(poi?.kind).toBe("convenience");
  });
  it("drops unnamed elements and ones without coordinates", () => {
    expect(mapElementToPoi({ type: "node", id: 4, lat: 25, lon: 121, tags: { shop: "bakery" } })).toBeNull();
    expect(mapElementToPoi({ type: "way", id: 5, tags: { name: "Nowhere" } })).toBeNull();
  });
});

describe("cellKey", () => {
  it("is stable within ~150 m and changes farther away", () => {
    // Base point at a cell center so small offsets cannot straddle a boundary.
    const lat = (Math.floor(25.033 / 0.00135) + 0.5) * 0.00135;
    const lon = (Math.floor(121.53 / 0.00135) + 0.5) * 0.00135;
    const a = cellKey(lat, lon);
    expect(cellKey(lat + 0.0003, lon + 0.0003)).toBe(a); // ~45 m away
    expect(cellKey(lat + 0.007, lon)).not.toBe(a); // ~780 m away
  });
});

describe("fetchNearbyPois", () => {
  const element = { type: "node", id: 9, lat: 25.033, lon: 121.53, tags: { name: "Park", leisure: "park" } };
  it("returns mapped POIs and caches by grid cell", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [element] }) });
    vi.stubGlobal("fetch", fetch);
    const lat = (Math.floor(25.033 / 0.00135) + 0.5) * 0.00135;
    const lon = (Math.floor(121.53 / 0.00135) + 0.5) * 0.00135;
    const first = await fetchNearbyPois(lat, lon, 250);
    expect(first).toHaveLength(1);
    expect(first[0].id).toBe("node/9");
    const second = await fetchNearbyPois(lat + 0.0002, lon + 0.0002, 250); // same cell
    expect(second).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("falls back to the next instance on error", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ elements: [element] }) });
    vi.stubGlobal("fetch", fetch);
    const pois = await fetchNearbyPois(25.05, 121.56, 250);
    expect(pois).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("throws after every instance fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("all down")),
    );
    await expect(fetchNearbyPois(25.05, 121.56, 250)).rejects.toThrow();
  });
  it("tries every mirror in the fallback chain", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("all down"));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchNearbyPois(25.06, 121.57, 250)).rejects.toThrow();
    const urls = fetch.mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(5);
    expect(urls[0]).toContain("kumi.systems");
    expect(urls).toContainEqual(expect.stringContaining("private.coffee"));
    expect(urls).toContainEqual(expect.stringContaining("mail.ru"));
  });
});

describe("withDistanceBearing", () => {
  it("annotates and sorts by distance", () => {
    const out = withDistanceBearing(
      [
        { id: "node/1", kind: "other", lat: 25.034, lon: 121.53, tags: { name: "Far" } },
        { id: "node/2", kind: "other", lat: 25.0331, lon: 121.53, tags: { name: "Near" } },
      ],
      { lat: 25.033, lon: 121.53 },
    );
    expect(out[0].id).toBe("node/2");
    expect(out[0].distanceM).toBeLessThan(out[1].distanceM);
    expect(out[0].bearingDeg).toBeGreaterThanOrEqual(0);
  });
});
