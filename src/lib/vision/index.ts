import "server-only";
import type { DetectedObject, KnowledgeItem, PhotoRequest, PhotoResponse, TraceStep } from "@/lib/types";
import { isMockMode } from "@/lib/meta/client";
import type { Box } from "./boxes";
import { refineBoxes, segmentConcept } from "./sam";
import { spotObjects, type SparkObject } from "./spark";

const step = (kind: TraceStep["kind"], message: string, data?: unknown): TraceStep => ({
  kind,
  message,
  at: Date.now(),
  data,
});

export function matchItem(label: string, items: KnowledgeItem[]): string | undefined {
  const l = label.trim().toLowerCase();
  if (!l) return undefined;
  for (const item of items) {
    for (const c of item.trigger.photo_concepts ?? []) {
      const cc = c.trim().toLowerCase();
      if (cc && (cc === l || l.includes(cc) || cc.includes(l))) return item.id;
    }
  }
  return undefined;
}

// Normalised (0-1) boxes, scaled to the requested image size.
const MOCK: { label: string; box: [number, number, number, number] }[] = [
  { label: "utility pole with transformer", box: [0.06, 0.05, 0.2, 0.78] },
  { label: "convenience store sign", box: [0.3, 0.12, 0.62, 0.3] },
  { label: "scooter", box: [0.55, 0.55, 0.85, 0.92] },
  { label: "manhole cover", box: [0.2, 0.82, 0.42, 0.96] },
];

export function mockObjects(width: number, height: number): SparkObject[] {
  return MOCK.map((m) => ({
    label: m.label,
    box: [
      Math.round(m.box[0] * width),
      Math.round(m.box[1] * height),
      Math.round(m.box[2] * width),
      Math.round(m.box[3] * height),
    ] as Box,
  }));
}

async function loadItems(): Promise<KnowledgeItem[]> {
  try {
    return (await import("@/lib/kb")).getKnowledgeItems();
  } catch {
    return [];
  }
}

export async function analyzePhoto(req: PhotoRequest, items?: KnowledgeItem[]): Promise<PhotoResponse> {
  const trace: TraceStep[] = [];
  const kb = items ?? (await loadItems());
  const { imageDataUrl, width, height } = req;

  if (isMockMode()) {
    const spotted = mockObjects(width, height);
    trace.push(step("decision", "Mock mode: skipped Muse Spark and SAM, returning canned objects"));
    const objects: DetectedObject[] = spotted.map((o, i) => ({
      id: `obj-${i + 1}`,
      label: o.label,
      itemId: matchItem(o.label, kb),
      box: o.box,
      score: 0.9,
    }));
    return { objects, personBoxes: [], trace };
  }

  // Step A (objects) and the person request are independent: run together.
  const [spark, people] = await Promise.all([
    spotObjects(imageDataUrl, width, height),
    segmentConcept(imageDataUrl, "person").catch((e: unknown) => {
      trace.push(step("error", `SAM person request failed: ${String(e)}`));
      return null;
    }),
  ]);
  trace.push(step("candidate", `Muse Spark proposed ${spark.length} objects`, spark.map((s) => s.label)));

  const personBoxes = (people ?? []).map((p) => p.box);
  trace.push(step("decision", `SAM text prompt "person": ${personBoxes.length} found`));

  let refined: Awaited<ReturnType<typeof refineBoxes>> = [];
  try {
    refined = await refineBoxes(imageDataUrl, width, height, spark.map((s) => s.box));
    trace.push(step("decision", `SAM box prompts refined ${refined.filter(Boolean).length}/${spark.length} objects`));
  } catch (e) {
    trace.push(step("error", `SAM box refinement failed, using Spark boxes: ${String(e)}`));
  }

  const objects: DetectedObject[] = spark.map((s, i) => {
    const r = refined[i];
    return {
      id: `obj-${i + 1}`,
      label: s.label,
      itemId: matchItem(s.label, kb),
      box: r?.box ?? s.box,
      maskSvgPath: r?.maskSvgPath,
      score: r?.confidence,
    };
  });
  return { objects, personBoxes, trace };
}
