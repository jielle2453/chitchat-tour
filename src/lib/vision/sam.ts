import "server-only";
import {
  buildObjectPrompt,
  decodeMaskToSVGPath,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
} from "@meta-sam/parser";
import { MODELS, metaClient } from "@/lib/meta/client";
import { toPromptBox, transformPath, type Box } from "./boxes";

export interface SamObject {
  id: string; // the id we sent for box prompts; the model's id for text prompts
  box: Box; // half-open pixel box
  maskSvgPath?: string;
  confidence?: number;
}

async function* eventsFor(text: string): AsyncIterable<ResponsesEvent> {
  yield { type: "response.output_text.delta", item_id: "m", output_index: 0, content_index: 0, delta: text };
  yield { type: "response.output_text.done", item_id: "m", output_index: 0, content_index: 0, text };
  yield { type: "response.completed" };
}

// Parse SAM special-token output text into boxes and SVG outlines (image pixel space).
export async function parseSamOutput(text: string): Promise<SamObject[]> {
  const result = await parseImageStream(eventsFor(text)).finalResult;
  const masks = new Map(recordsOfKind(result.records, "mask").map((m) => [m.objectId, m]));
  const out: SamObject[] = [];
  for (const b of recordsOfKind(result.records, "box")) {
    const obj: SamObject = {
      id: b.objectId,
      box: [b.left, b.top, b.right, b.bottom],
      confidence: b.confidence,
    };
    const m = masks.get(b.objectId);
    if (m) {
      try {
        const raw = decodeMaskToSVGPath(m.mask);
        if (raw) {
          const { left, top, right, bottom } = m.bounds;
          obj.maskSvgPath = transformPath(
            raw,
            (right - left) / m.mask.width,
            (bottom - top) / m.mask.height,
            left,
            top,
          );
        }
      } catch {
        // keep the box only
      }
    }
    out.push(obj);
  }
  return out;
}

async function callSam(inputText: string, imageDataUrl: string): Promise<string> {
  const res = await metaClient().responses.create({
    model: MODELS.sam,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: inputText },
          { type: "input_image", image_url: imageDataUrl, detail: "auto" },
        ],
      },
    ],
    metadata: { include_confidence: "true", mask_encoding: "one_bit" },
  });
  return res.output_text ?? "";
}

// Refine up to 16 boxes in one request. Result index matches input index (ids sent are 1-based).
export async function refineBoxes(
  imageDataUrl: string,
  width: number,
  height: number,
  boxes: Box[],
): Promise<(SamObject | undefined)[]> {
  if (boxes.length === 0) return [];
  const batch = boxes.slice(0, 16);
  const inputText = buildObjectPrompt({
    size: { width, height },
    objects: batch.map((b, i) => ({ id: i + 1, prompts: [{ box: toPromptBox(b, width, height) }] })),
  });
  const parsed = await parseSamOutput(await callSam(inputText, imageDataUrl));
  return batch.map((_, i) => parsed.find((o) => o.id === String(i + 1)));
}

// One text concept per request (docs: no multi-concept syntax).
export async function segmentConcept(imageDataUrl: string, concept: string): Promise<SamObject[]> {
  return parseSamOutput(await callSam(concept, imageDataUrl));
}
