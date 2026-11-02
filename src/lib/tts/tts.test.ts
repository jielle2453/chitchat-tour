import { describe, expect, it } from "vitest";
import { TtsUnavailableError, buildSsml, selectProvider, synthesize } from "./index";

describe("tts provider selection", () => {
  it("picks azure only with key and region", () => {
    expect(selectProvider({ TTS_PROVIDER: "azure", AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "eastasia" })).toBe("azure");
    expect(selectProvider({ TTS_PROVIDER: "azure", AZURE_SPEECH_KEY: "k" })).toBeNull();
  });

  it("picks elevenlabs only with key and voice id", () => {
    expect(selectProvider({ TTS_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: "v" })).toBe("elevenlabs");
    expect(selectProvider({ TTS_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "k" })).toBeNull();
  });

  it("returns null for none or missing", () => {
    expect(selectProvider({ TTS_PROVIDER: "none" })).toBeNull();
    expect(selectProvider({})).toBeNull();
  });

  it("synthesize rejects when unconfigured (no network)", async () => {
    await expect(synthesize("hello", "en", {})).rejects.toBeInstanceOf(TtsUnavailableError);
  });

  it("builds escaped SSML with the right voice", () => {
    const ssml = buildSsml("A & B <c>", "ja");
    expect(ssml).toContain("ja-JP-NanamiNeural");
    expect(ssml).toContain("A &amp; B &lt;c&gt;");
    expect(buildSsml("x", "zh-TW")).toContain("zh-TW-HsiaoChenNeural");
  });
});
