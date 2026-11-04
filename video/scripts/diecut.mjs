// Cut transparent die-cut sticker PNGs with the app's own pixel ops.
import sharp from "sharp";
import { readdirSync } from "node:fs";
import { edgeKeyOutAlpha, featherAlphaEdge, dilateAlphaMask } from "../../src/lib/client/dieCut.ts";

const SRC = "public/illustrations";
const OUT = "video/public/stickers";
const SIZE = 512, BORDER = 18, PAD = BORDER + 4;
for (const f of readdirSync(SRC).filter((f) => f.endsWith(".webp"))) {
  const { data, info } = await sharp(`${SRC}/${f}`).resize(SIZE, SIZE, { fit: "contain", background: "#ffffff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  const pic = { width: info.width, height: info.height, data: px };
  edgeKeyOutAlpha(pic);
  featherAlphaEdge(pic);
  const W = SIZE + PAD * 2;
  const alpha = new Uint8Array(W * W);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) alpha[(y + PAD) * W + x + PAD] = px[(y * SIZE + x) * 4 + 3];
  const dil = dilateAlphaMask(alpha, W, W, BORDER);
  const out = Buffer.alloc(W * W * 4);
  for (let i = 0; i < W * W; i++) if (dil[i]) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255; out[i * 4 + 3] = 255; }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const s = (y * SIZE + x) * 4, d = ((y + PAD) * W + x + PAD) * 4, a = px[s + 3] / 255;
    for (let c = 0; c < 3; c++) out[d + c] = Math.round(px[s + c] * a + out[d + c] * (1 - a));
    out[d + 3] = Math.max(out[d + 3], px[s + 3]);
  }
  await sharp(out, { raw: { width: W, height: W, channels: 4 } }).png().toFile(`${OUT}/${f.replace(".webp", ".png")}`);
}
console.log("done");
