"use client";
import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/client/api";
import { canvasToJpeg, detectFaces, fileToCanvas, pixelateBoxes } from "@/lib/client/faceBlur";
import { t } from "@/lib/client/i18n";
import { makeSticker } from "@/lib/client/sticker";
import type { GuideSession } from "@/lib/client/useGuideSession";
import type { DetectedObject, GeoFix, Lang, PhotoRequest, PhotoResponse, UserProfile } from "@/lib/types";

interface Result {
  dataUrl: string;
  width: number;
  height: number;
  objects: DetectedObject[];
  faces: number;
}

// Full-screen photo inside the app frame: faces are blurred on the phone, objects are tappable outlines.
export default function PhotoView({
  file,
  profile,
  lang,
  session,
  fix,
  onClose,
}: {
  file: File;
  profile: UserProfile;
  lang: Lang;
  session: GuideSession;
  fix: GeoFix | null;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const startedRef = useRef<File | null>(null);
  const [stage, setStage] = useState<"blurring" | "analyzing" | "ready">("blurring");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    // once per file (the ref also keeps Strict Mode from uploading twice)
    if (startedRef.current === file) return;
    startedRef.current = file;
    void (async () => {
      try {
        const canvas = await fileToCanvas(file);
        let faceBoxes;
        try {
          faceBoxes = await detectFaces(canvas);
        } catch {
          // never upload an unblurred photo
          setError(t(lang, "faceBlurFailed"));
          return;
        }
        pixelateBoxes(canvas, faceBoxes);
        setStage("analyzing");
        const req: PhotoRequest = { profile, imageDataUrl: canvasToJpeg(canvas), width: canvas.width, height: canvas.height, fix: fix ?? undefined };
        const res = await postJson<PhotoResponse>("/api/photo", req);
        pixelateBoxes(canvas, res.personBoxes ?? []);
        canvasRef.current = canvas;
        setResult({ dataUrl: canvasToJpeg(canvas), width: canvas.width, height: canvas.height, objects: res.objects, faces: faceBoxes.length });
      } catch (err) {
        setError(`${t(lang, "error")} ${err instanceof Error ? err.message : ""}`);
      } finally {
        setStage("ready");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  async function onPick(obj: DetectedObject) {
    if (session.explaining) return;
    setSelected(obj.id);
    const sticker = canvasRef.current ? (makeSticker(canvasRef.current, obj) ?? undefined) : undefined;
    const ok = await session.explain(obj, sticker);
    if (!ok) setError(t(lang, "error"));
  }

  return (
    <div className="rg-fade-in absolute inset-0 z-30 flex flex-col bg-black">
      <div className="flex items-center justify-between px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))] text-white">
        <button type="button" onClick={onClose} aria-label={t(lang, "close")} className="grid h-10 w-10 place-items-center rounded-full bg-white/15">
          <X size={18} aria-hidden />
        </button>
        {result ? <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px]">{t(lang, "facesBlurred", { n: result.faces })}</span> : null}
      </div>

      <div className="relative min-h-0 flex-1">
        {result ? (
          <svg viewBox={`0 0 ${result.width} ${result.height}`} className="h-full w-full" role="img" aria-label="">
            <image href={result.dataUrl} width={result.width} height={result.height} />
            {result.objects.map((o) => {
              const active = selected === o.id;
              // Monochrome: a white outline over a dark halo so it reads on any photo.
              const halo = {
                fill: "none" as const,
                stroke: "rgba(0,0,0,0.55)",
                strokeWidth: active ? 9 : 8,
                vectorEffect: "non-scaling-stroke" as const,
                strokeLinejoin: "round" as const,
              };
              const common = {
                fill: active ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.10)",
                stroke: "#fff",
                strokeWidth: active ? 4 : 3,
                vectorEffect: "non-scaling-stroke" as const,
                strokeLinejoin: "round" as const,
              };
              const boxRx = Math.min(o.box[2] - o.box[0], o.box[3] - o.box[1]) * 0.12;
              return (
                <g
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  aria-label={o.label}
                  style={{ cursor: "pointer", pointerEvents: "all" }}
                  onClick={() => void onPick(o)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") void onPick(o);
                  }}
                >
                  {o.maskSvgPath ? (
                    <>
                      <path d={o.maskSvgPath} {...halo} />
                      <path d={o.maskSvgPath} {...common} />
                    </>
                  ) : (
                    <>
                      <rect x={o.box[0]} y={o.box[1]} width={o.box[2] - o.box[0]} height={o.box[3] - o.box[1]} rx={boxRx} {...halo} />
                      <rect x={o.box[0]} y={o.box[1]} width={o.box[2] - o.box[0]} height={o.box[3] - o.box[1]} rx={boxRx} {...common} />
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        ) : stage !== "ready" ? (
          <div role="status" className="flex h-full flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="animate-spin" size={28} aria-hidden />
            <p>{stage === "blurring" ? t(lang, "photoBlurring") : t(lang, "photoAnalyzing")}</p>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 text-white">
        {error ? (
          <p role="alert" className="rounded-2xl bg-white/15 p-3 text-[13px]">
            {error}
          </p>
        ) : null}
        {result ? (
          result.objects.length ? (
            <>
              <p className="text-center text-[13px] opacity-80">{session.explaining ? t(lang, "explaining") : t(lang, "tapObject")}</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {result.objects.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => void onPick(o)}
                    aria-pressed={selected === o.id}
                    className={`min-h-10 rounded-full px-3.5 text-[13px] font-medium ${selected === o.id ? "bg-white text-black" : "bg-white/15 text-white"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-[13px] opacity-80">{t(lang, "noObjects")}</p>
          )
        ) : null}
      </div>
    </div>
  );
}
