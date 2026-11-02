"use client";
// On-device face blur (MediaPipe Face Detector) and canvas pixelation. Photos never leave the phone unblurred.
import type { FaceDetector } from "@mediapipe/tasks-vision";
import { expandBox, fitWithin, pixelBlockSize, type Box } from "./image";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
export const MAX_SIDE = 1280;
export const FACE_CONFIDENCE = 0.3;
export const BLUR_EXPAND = 0.3;

let detectorPromise: Promise<FaceDetector> | null = null;

function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const make = (delegate: "GPU" | "CPU") =>
        FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "IMAGE",
          minDetectionConfidence: FACE_CONFIDENCE,
        });
      try {
        return await make("GPU");
      } catch {
        return await make("CPU");
      }
    })();
    detectorPromise.catch(() => {
      detectorPromise = null; // allow a retry
    });
  }
  return detectorPromise;
}

// Load a picked file onto a canvas, upright (EXIF) and no larger than MAX_SIDE.
export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource;
  let w: number;
  let h: number;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bmp;
    w = bmp.width;
    h = bmp.height;
  } catch {
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = url;
    });
    URL.revokeObjectURL(url);
    source = img;
    w = img.naturalWidth;
    h = img.naturalHeight;
  }
  const size = fitWithin(w, h, MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")!.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

export async function detectFaces(canvas: HTMLCanvasElement): Promise<Box[]> {
  const detector = await getDetector();
  const result = detector.detect(canvas);
  return result.detections.flatMap((d) => {
    const b = d.boundingBox;
    if (!b) return [];
    return [[b.originX, b.originY, b.originX + b.width, b.originY + b.height] as Box];
  });
}

export function pixelateBoxes(canvas: HTMLCanvasElement, boxes: Box[], expand = BLUR_EXPAND) {
  const ctx = canvas.getContext("2d")!;
  for (const raw of boxes) {
    const box = expandBox(raw, expand, canvas.width, canvas.height);
    const w = box[2] - box[0];
    const h = box[3] - box[1];
    if (w < 2 || h < 2) continue;
    const block = pixelBlockSize(box);
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.ceil(w / block));
    small.height = Math.max(1, Math.ceil(h / block));
    small.getContext("2d")!.drawImage(canvas, box[0], box[1], w, h, 0, 0, small.width, small.height);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, small.width, small.height, box[0], box[1], w, h);
    ctx.restore();
  }
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL("image/jpeg", quality);
}
