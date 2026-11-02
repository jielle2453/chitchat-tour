// Browser die-cut stickers: illustration tiles ship with an off-white
// background that multiply can't hide over glass, so we cut real transparent
// stickers on a canvas — key out the edge-connected background (interior
// whites like a white bowl stay), feather 1px, dilate into a white border,
// add a soft shadow, and draw the art on top. Results are cached in memory
// and in sessionStorage. The pixel ops are pure (no canvas) and unit-tested.

export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) * (r1 - r2) + (g1 - g2) * (g1 - g2) + (b1 - b2) * (b1 - b2));
}

// Background colour = average of the opaque corners.
export function averageCornerColor(img: PixelImage): [number, number, number] {
  const { width: w, height: h, data } = img;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [x, y] of [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ]) {
    const i = (y * w + x) * 4;
    if (data[i + 3] > 128) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  if (n === 0) return [255, 255, 255];
  return [r / n, g / n, b / n];
}

// Flood-fill from the 4 edges through near-background (or already
// transparent) pixels, zeroing alpha. Interior whites enclosed by art stay.
export function edgeKeyOutAlpha(img: PixelImage, tolerance = 18): void {
  const { width: w, height: h, data } = img;
  const [br, bg, bb] = averageCornerColor(img);
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 128 || colorDist(data[i], data[i + 1], data[i + 2], br, bg, bb) <= tolerance) {
      data[i + 3] = 0;
      visited[y * w + x] = 1;
      stack.push(y * w + x);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    const next: Array<[number, number]> = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of next) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || visited[ny * w + nx]) continue;
      visited[ny * w + nx] = 1;
      const i = (ny * w + nx) * 4;
      if (data[i + 3] < 128 || colorDist(data[i], data[i + 1], data[i + 2], br, bg, bb) <= tolerance) {
        data[i + 3] = 0;
        stack.push(ny * w + nx);
      }
    }
  }
}

// 1px feather: transparent pixels touching opaque art take the neighbour's
// colour at partial alpha so the cut edge isn't crunchy.
export function featherAlphaEdge(img: PixelImage): void {
  const { width: w, height: h, data } = img;
  const copy = Uint8ClampedArray.from(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (copy[i + 3] >= 128) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      const neighbours: Array<[number, number]> = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbours) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = (ny * w + nx) * 4;
        if (copy[j + 3] >= 128) {
          r += copy[j];
          g += copy[j + 1];
          b += copy[j + 2];
          n++;
        }
      }
      if (n > 0) {
        data[i] = r / n;
        data[i + 1] = g / n;
        data[i + 2] = b / n;
        data[i + 3] = 110;
      }
    }
  }
}

// Binary dilation of the alpha>128 mask by a Euclidean disk of `radius` px.
export function dilateAlphaMask(alpha: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const out = new Uint8Array(w * h);
  if (radius <= 0) {
    for (let i = 0; i < alpha.length; i++) out[i] = alpha[i] > 128 ? 1 : 0;
    return out;
  }
  const r2 = radius * radius;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] <= 128) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

export interface DieCutOptions {
  size?: number; // art box, px
  border?: number; // white die-cut border, px
}

const memCache = new Map<string, Promise<string>>();

function storeKey(url: string, size: number, border: number): string {
  return `rg-diecut:v1:${size}:${border}:${url}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`die-cut: cannot load ${url}`));
    img.src = url;
  });
}

// Cut a real transparent die-cut PNG data URL from an illustration tile.
// Rejects when canvas is unavailable or the image can't be loaded — callers
// keep the original img as fallback.
export function dieCutSticker(url: string, opts: DieCutOptions = {}): Promise<string> {
  const size = opts.size ?? 256;
  const border = opts.border ?? 10;
  const key = storeKey(url, size, border);
  const hit = memCache.get(key);
  if (hit) return hit;
  const job = (async (): Promise<string> => {
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) return cached;
    } catch {
      // private mode: memory cache only
    }
    if (typeof document === "undefined") throw new Error("die-cut: no document");
    const img = await loadImage(url);
    const art = document.createElement("canvas");
    art.width = size;
    art.height = size;
    const actx = art.getContext("2d", { willReadFrequently: true });
    if (!actx) throw new Error("die-cut: no 2d context");
    const s = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const dw = Math.max(1, Math.round(img.naturalWidth * s));
    const dh = Math.max(1, Math.round(img.naturalHeight * s));
    actx.drawImage(img, Math.round((size - dw) / 2), Math.round((size - dh) / 2), dw, dh);
    const px = actx.getImageData(0, 0, size, size);
    const picture: PixelImage = { width: size, height: size, data: px.data };
    edgeKeyOutAlpha(picture);
    featherAlphaEdge(picture);
    actx.putImageData(px, 0, 0);

    const alpha = new Uint8Array(size * size);
    for (let i = 0; i < alpha.length; i++) alpha[i] = px.data[i * 4 + 3];
    const dilated = dilateAlphaMask(alpha, size, size, border);
    const white = new ImageData(size, size);
    for (let i = 0; i < dilated.length; i++) {
      if (dilated[i]) {
        white.data[i * 4] = 255;
        white.data[i * 4 + 1] = 255;
        white.data[i * 4 + 2] = 255;
        white.data[i * 4 + 3] = 255;
      }
    }
    const whiteCanvas = document.createElement("canvas");
    whiteCanvas.width = size;
    whiteCanvas.height = size;
    whiteCanvas.getContext("2d")?.putImageData(white, 0, 0);

    const pad = border + 12; // room for the soft shadow
    const out = document.createElement("canvas");
    out.width = size + pad * 2;
    out.height = size + pad * 2;
    const octx = out.getContext("2d");
    if (!octx) throw new Error("die-cut: no 2d context");
    octx.shadowColor = "rgba(0,0,0,0.22)";
    octx.shadowBlur = 8;
    octx.shadowOffsetY = 3;
    octx.drawImage(whiteCanvas, pad, pad);
    octx.shadowColor = "transparent";
    octx.shadowBlur = 0;
    octx.shadowOffsetY = 0;
    octx.drawImage(whiteCanvas, pad, pad);
    octx.drawImage(art, pad, pad);

    const dataUrl = out.toDataURL("image/png");
    try {
      sessionStorage.setItem(key, dataUrl);
    } catch {
      // quota: memory cache still serves this session
    }
    return dataUrl;
  })();
  // Don't cache rejections: a later retry (e.g. after the file exists) works.
  job.catch(() => memCache.delete(key));
  memCache.set(key, job);
  return job;
}
