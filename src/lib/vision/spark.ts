import "server-only";
import { z } from "zod";
import { MODELS, metaClient } from "@/lib/meta/client";
import { scaleBox1000, type Box } from "./boxes";

export interface SparkObject {
  label: string;
  box: Box; // image pixels
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["objects"],
  properties: {
    objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "box"],
        properties: {
          label: { type: "string" },
          box: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
} as const;

const parsedSchema = z.object({ objects: z.array(z.object({ label: z.string(), box: z.array(z.number()) })) });

const PROMPT =
  "You help a visitor understand everyday things on a street in Taipei. List up to 6 ordinary street objects " +
  "worth explaining to a foreign visitor (for example utility poles, shop signs, scooters, manhole covers, " +
  "vending machines, garbage points, convenience stores). Do NOT include people, faces, or famous landmarks. " +
  "Give each a short English noun phrase as label, and a bounding box [x1, y1, x2, y2] (left, top, right, bottom) " +
  "with integer coordinates normalised to 0-1000 relative to the image width and height.";

export function parseSparkText(text: string, width: number, height: number): SparkObject[] {
  const data = parsedSchema.parse(JSON.parse(text));
  const out: SparkObject[] = [];
  for (const o of data.objects.slice(0, 6)) {
    const box = scaleBox1000(o.box, width, height);
    const label = o.label.trim();
    if (box && label) out.push({ label, box });
  }
  return out;
}

export async function spotObjects(imageDataUrl: string, width: number, height: number): Promise<SparkObject[]> {
  const res = await metaClient().responses.create({
    model: MODELS.text,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT },
          { type: "input_image", image_url: imageDataUrl, detail: "auto" },
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "street_objects", strict: true, schema } },
  });
  return parseSparkText(res.output_text ?? "{}", width, height);
}
