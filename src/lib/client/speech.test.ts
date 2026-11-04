import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPrerecorded, registerPrerecorded, speak } from "./speech";

// The clip fetch and /api/tts both fail here, so speak() never reaches audio
// playback (and the speechSynthesis fallback no-ops without a window). The
// fetch calls alone prove which source was chosen for each text.
describe("prerecorded narration clips", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearPrerecorded();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearPrerecorded();
  });

  it("fetches the registered clip, matching text with surrounding whitespace trimmed", async () => {
    registerPrerecorded("  hello walk  ", "/demo/tokyo-walk/0.mp3");
    await speak("hello walk", "en");
    // The stubbed clip fetch fails (ok:false), so speak() then falls through
    // to /api/tts as designed; the clip URL must be tried first.
    expect(fetchMock.mock.calls[0][0]).toBe("/demo/tokyo-walk/0.mp3");
  });

  it("falls back to /api/tts for unregistered text", async () => {
    await speak("something live", "en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tts");
  });

  it("falls through to /api/tts when the clip fetch fails", async () => {
    registerPrerecorded("story", "/demo/tokyo-walk/1.mp3");
    await speak("story", "en");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/demo/tokyo-walk/1.mp3", "/api/tts"]);
  });

  it("forgets clips after clearPrerecorded", async () => {
    registerPrerecorded("story", "/demo/tokyo-walk/2.mp3");
    clearPrerecorded();
    await speak("story", "en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tts");
  });
});
