"use client";
// Push-to-talk capture: PCM from the mic -> 16 kHz mono 16-bit WAV.
import { encodeWav, mergeChunks, resampleLinear } from "./wav";

export interface Recording {
  stop(): Promise<{ blob: Blob; durationMs: number }>;
  cancel(): void;
}

const WORKLET_SRC = `
class RgCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("rg-capture", RgCapture);
`;

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext();
  await ctx.resume().catch(() => undefined);
  const source = ctx.createMediaStreamSource(stream);
  const chunks: Float32Array[] = [];
  const nodes: AudioNode[] = [source];

  let useWorklet = false;
  if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
    try {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, "rg-capture");
      node.port.onmessage = (e: MessageEvent<Float32Array>) => chunks.push(e.data);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);
      nodes.push(node, mute);
      useWorklet = true;
    } catch {
      useWorklet = false;
    }
  }
  if (!useWorklet) {
    // ScriptProcessor fallback for older Safari
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);
    nodes.push(proc, mute);
  }

  const startedAt = performance.now();
  const teardown = () => {
    nodes.forEach((n) => n.disconnect());
    stream.getTracks().forEach((tr) => tr.stop());
    void ctx.close().catch(() => undefined);
  };

  return {
    async stop() {
      const rate = ctx.sampleRate;
      teardown();
      const merged = mergeChunks(chunks);
      const pcm16k = resampleLinear(merged, rate, 16000);
      return {
        blob: new Blob([encodeWav(pcm16k, 16000)], { type: "audio/wav" }),
        durationMs: performance.now() - startedAt,
      };
    },
    cancel: teardown,
  };
}
