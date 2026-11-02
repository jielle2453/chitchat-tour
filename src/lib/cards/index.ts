import "server-only";
import type { CardRequest, CardResponse, Narration } from "@/lib/types";
import { MODELS, isMockMode, metaClient } from "@/lib/meta/client";

export function buildCardPrompt(n: Narration): string {
  return (
    "A warm, hand-illustrated field guide plate showing one everyday object found on a street in Taipei, Taiwan: " +
    `${n.title}. Gouache and ink style, cream paper background, terracotta and teal accents, ` +
    "the object centred with a little street context, soft natural light. " +
    "Absolutely no text, letters, numbers, labels or captions anywhere in the image. No people or faces."
  );
}

const escapeXml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

export function mockCardSvg(title: string): string {
  const initial = escapeXml((Array.from(title.trim())[0] ?? "?").toUpperCase());
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">' +
    '<rect width="600" height="800" fill="#F6F2EA"/>' +
    '<rect x="24" y="24" width="552" height="752" rx="18" fill="none" stroke="#C8551F" stroke-width="4"/>' +
    '<circle cx="300" cy="360" r="190" fill="#2B6F75" opacity="0.15"/>' +
    '<circle cx="300" cy="360" r="140" fill="#C8551F"/>' +
    '<text x="300" y="410" font-family="Georgia, serif" font-size="150" font-weight="700" fill="#F6F2EA" text-anchor="middle">' +
    initial +
    "</text>" +
    '<path d="M110 640 Q300 580 490 640" fill="none" stroke="#2B6F75" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M150 680 Q300 635 450 680" fill="none" stroke="#2B6F75" stroke-width="3" stroke-linecap="round" opacity="0.6"/>' +
    "</svg>";
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function sniffMime(b64: string): string {
  if (b64.startsWith("UklGR")) return "image/webp"; // RIFF
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("/9j/")) return "image/jpeg";
  return "image/webp"; // docs: default output is base64 webp
}

export async function generateCard(req: CardRequest): Promise<CardResponse> {
  if (isMockMode()) return { imageDataUrl: mockCardSvg(req.narration.title) };

  const res = await metaClient().images.generate({
    model: MODELS.image,
    prompt: buildCardPrompt(req.narration),
    n: 1,
  });
  const first = res.data?.[0];
  if (first?.b64_json) return { imageDataUrl: `data:${sniffMime(first.b64_json)};base64,${first.b64_json}` };
  if (first?.url) {
    const r = await fetch(first.url);
    if (!r.ok) throw new Error(`card image download failed: ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type")?.split(";")[0] ?? "image/webp";
    return { imageDataUrl: `data:${mime};base64,${buf.toString("base64")}` };
  }
  throw new Error("Muse Image returned no image");
}
