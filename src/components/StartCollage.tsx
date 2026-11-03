"use client";
// The start button as a sticker collage: pieces slap on one by one (map,
// signs, footprints, a walker…), then START is spelled in cut-out letters,
// each a different real material. Once assembled it keeps a small idle
// motion so it invites a tap.
// Stickers ship pre-cut (transparent WebP with white border and shadow) in
// /start/cut/, exported from the browser die-cut, so nothing flashes white.
function CutImg({ src, size }: { src: string; size: number }) {
  const name = src.slice(src.lastIndexOf("/") + 1);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/start/cut/${name}`} alt="" draggable={false} width={size} height={size} className="block object-contain" style={{ width: size, height: size }} />
  );
}

type Piece = {
  src: string;
  size: number;
  left: number;
  top: number;
  rot: number;
  flip?: boolean;
  idle?: string;
  idleDelay?: number;
};

// Back to front; each slaps on in this order.
// A triangle: the walker at the apex, signs widening below, START as the base.
const SCENE: Piece[] = [
  { src: "/start/map-scrap.webp", size: 220, left: 54, top: 56, rot: -8 },
  { src: "/start/ticket.webp", size: 170, left: 132, top: 128, rot: 6 },
  { src: "/start/camera-front.webp", size: 104, left: 196, top: 40, rot: 6 },
  { src: "/start/ped-signal.webp", size: 124, left: 4, top: 76, rot: -9 },
  { src: "/start/ped-sign.webp", size: 78, left: 82, top: 82, rot: -10 },
  { src: "/start/arrow-sign.webp", size: 108, left: 214, top: 96, rot: -6 },
  { src: "/start/walker.webp", size: 150, left: 96, top: 0, rot: 0, idle: "rg-bob" },
];

// Three small footprints curving up from the last letter, left and right feet staggered.
const STEPS: Piece[] = [
  { src: "", size: 24, left: 309, top: 211, rot: 61, flip: true, idle: "rg-print", idleDelay: 0.0 },
  { src: "", size: 24, left: 337, top: 189, rot: 20, idle: "rg-print", idleDelay: 0.3 },
  { src: "", size: 24, left: 333, top: 144, rot: -7, flip: true, idle: "rg-print", idleDelay: 0.6 },
];

// Cut-paper stars: a camera flash and a few sparkles to fill the left.
type Spark = { left: number; top: number; size: number; points: number; rot: number };
const SPARKS: Spark[] = [
  { left: 250, top: 64, size: 46, points: 6, rot: 8 },
  { left: 40, top: 150, size: 24, points: 4, rot: -10 },
  { left: 88, top: 238, size: 20, points: 4, rot: 12 },
];

function starPath(points: number, outer: number, inner: number, seed: number): string {
  const d: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    // slight wobble so it reads as hand-cut paper
    const wob = 1 + 0.07 * Math.sin(seed * 7.3 + i * 2.1);
    const r = (i % 2 === 0 ? outer : inner) * wob;
    const a = (Math.PI * i) / points - Math.PI / 2;
    d.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${d.join("L")}Z`;
}

function PaperStar({ s, delay }: { s: Spark; delay: number }) {
  const inner = s.points === 4 ? 0.38 : 0.55;
  return (
    <span
      aria-hidden
      className="rg-slap absolute"
      style={{ left: s.left, top: s.top, ["--rot" as string]: `${s.rot}deg`, animationDelay: `${delay}s` }}
    >
      <span className="rg-twinkle block" style={{ animationDelay: `${IDLE_AT + delay * 0.3}s` }}>
        <svg width={s.size} height={s.size} viewBox="0 0 100 100" style={{ overflow: "visible", filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.2))" }}>
          <path d={starPath(s.points, 48, 48 * inner, 1)} fill="#FCEBB0" stroke="#fff" strokeWidth={8} strokeLinejoin="round" paintOrder="stroke" />
          <path d={starPath(s.points, 36, 36 * inner, 2)} fill="#F7C948" />
          <path d={starPath(s.points, 20, 20 * inner, 3)} fill="#F2A93B" />
        </svg>
      </span>
    </span>
  );
}

// A winding cut-paper road from under the S to behind the A, drawn on.
const ROAD = "M 16 256 C 34 232, 68 232, 94 248 S 146 272, 174 236";

function Road({ delay }: { delay: number }) {
  const draw = { animationDelay: `${delay}s` };
  return (
    <svg aria-hidden className="absolute left-0 top-0" width={330} height={330} style={{ overflow: "visible", filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.18))" }}>
      <path className="rg-draw" style={draw} d={ROAD} pathLength={1} fill="none" stroke="#fff" strokeWidth={24} strokeLinecap="round" />
      <path className="rg-draw" style={draw} d={ROAD} pathLength={1} fill="none" stroke="#3B3B3D" strokeWidth={16} strokeLinecap="round" />
      <path className="rg-fade-late" style={{ animationDelay: `${delay + 0.5}s` }} d={ROAD} fill="none" stroke="#F4F1E8" strokeWidth={2} strokeDasharray="5 6" />
    </svg>
  );
}

// A postage stamp: cream paper with big perforation scallops around the
// engraved artwork, and an inked postmark over its lower-left corner.
const STAMP_W = 62;
const STAMP_H = 80;
const HOLE_R = 3.8;
const HOLE_GAP = 10;
const STAMP_SCALE = 0.72;

function Stamp() {
  const holes: [number, number][] = [];
  const nx = Math.round(STAMP_W / HOLE_GAP);
  const ny = Math.round(STAMP_H / HOLE_GAP);
  for (let i = 0; i <= nx; i++) holes.push([(i * STAMP_W) / nx, 0], [(i * STAMP_W) / nx, STAMP_H]);
  for (let j = 0; j <= ny; j++) holes.push([0, (j * STAMP_H) / ny], [STAMP_W, (j * STAMP_H) / ny]);
  return (
    <svg
      width={(STAMP_W + 56) * STAMP_SCALE}
      height={(STAMP_H + 20) * STAMP_SCALE}
      viewBox={`-50 -10 ${STAMP_W + 56} ${STAMP_H + 20}`}
      style={{ overflow: "visible", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.25))" }}
    >
      <defs>
        <mask id="rg-perf">
          <rect x={0} y={0} width={STAMP_W} height={STAMP_H} fill="#fff" />
          {holes.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={HOLE_R} fill="#000" />
          ))}
        </mask>
        <path id="rg-pm-ring" d="M 8 12 m -11 0 a 11 11 0 1 1 22 0 a 11 11 0 1 1 -22 0" />
      </defs>
      <rect x={0} y={0} width={STAMP_W} height={STAMP_H} fill="#FBF5E6" mask="url(#rg-perf)" />
      <image href="/start/stamp-c-art.webp" x={7} y={7} width={STAMP_W - 14} height={STAMP_H - 14} preserveAspectRatio="xMidYMid slice" />
      <g fill="none" stroke="#2A2A2E" strokeOpacity={0.72} strokeWidth={1.3}>
        <circle cx={8} cy={12} r={14.5} />
        <circle cx={8} cy={12} r={7.5} />
        <path d="M -9 5 q -4 -3 -8 0 t -8 0 t -8 0 t -8 0" />
        <path d="M -10 12 q -4 -3 -8 0 t -8 0 t -8 0 t -8 0" />
        <path d="M -9 19 q -4 -3 -8 0 t -8 0 t -8 0 t -8 0" />
      </g>
      <text fontSize={4} fontWeight={700} letterSpacing={0.5} fill="#2A2A2E" fillOpacity={0.72}>
        <textPath href="#rg-pm-ring">CHITCHAT · TOUR ·</textPath>
      </text>
      <text x={8} y={14.4} textAnchor="middle" fontSize={6} fill="#2A2A2E" fillOpacity={0.72}>
        ★
      </text>
    </svg>
  );
}

// A printed sneaker sole: forefoot and heel as two ink shapes with tread gaps.
function ShoePrint({ size }: { size: number }) {
  return (
    <svg width={size * 0.55} height={size} viewBox="0 0 22 40" style={{ overflow: "visible", filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))" }}>
      <g stroke="#fff" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke" fill="#2A2A2E">
        <path d="M11.5 1 C17.5 1 20.5 6 20 12 C19.6 17 18 21.5 17.5 24 L5 24 C4 20.5 2 16.5 2 11.5 C2 5 6 1 11.5 1 Z" />
        <path d="M5.5 28 L17 28 C17.5 33 16 38.5 11 38.5 C6.5 38.5 5 34 5.5 28 Z" />
      </g>
      <g stroke="#F4F4F5" strokeWidth={1.1} strokeLinecap="round" opacity={0.55}>
        <path d="M5 8 L17.5 8" />
        <path d="M4.2 12.5 L18.6 12.5" />
        <path d="M4.8 17 L18 17" />
        <path d="M7.5 32.5 L15 32.5" />
      </g>
    </svg>
  );
}

const LETTERS = ["letter-s", "letter-t1", "letter-a", "letter-r", "letter-t2"];
const LETTER_ROT = [-10, 6, -4, 9, -7];
const LETTER_Y = [0, -8, 5, -4, 7];
const LETTER_SIZE = 84;

const STEP = 0.09;
const LETTERS_AT = SCENE.length * STEP + 0.1;
const IDLE_AT = LETTERS_AT + LETTERS.length * 0.08 + STEPS.length * 0.08 + 0.8;

function Sticker({ p, delay }: { p: Piece; delay: number }) {
  return (
    <span
      aria-hidden
      className="rg-slap absolute"
      style={{ left: p.left, top: p.top, ["--rot" as string]: `${p.rot}deg`, animationDelay: `${delay}s` }}
    >
      <span
        className={`block ${p.idle ?? ""}`}
        style={{ animationDelay: `${IDLE_AT + (p.idleDelay ?? 0)}s`, transform: p.flip ? "scaleX(-1)" : undefined }}
      >
        <CutImg src={p.src} size={p.size} />
      </span>
    </span>
  );
}

export default function StartCollage({ label, onStart }: { label: string; onStart: () => void }) {
  const stepsAt = LETTERS_AT + LETTERS.length * 0.08 + 0.1;
  const tapeAt = stepsAt + STEPS.length * 0.08 + 0.1;
  return (
    <button
      type="button"
      onClick={onStart}
      aria-label={label}
      className="pointer-events-auto relative block h-[330px] w-[330px] select-none outline-none transition-transform active:scale-[0.97]"
    >
      <span aria-hidden className="absolute inset-[24px] rounded-full bg-white/80 blur-2xl" />
      {SCENE.map((p, i) => (
        <Sticker key={p.src} p={p} delay={i * STEP} />
      ))}

      <span aria-hidden className="rg-slap absolute" style={{ left: -38, top: 166, ["--rot" as string]: "-8deg", animationDelay: `${LETTERS_AT - 0.2}s` }}>
        <Stamp />
      </span>
      <Road delay={LETTERS_AT - 0.1} />
      <span aria-hidden className="absolute inset-x-0 flex justify-center" style={{ top: 168 }}>
        {LETTERS.map((name, i) => (
          <span
            key={name}
            className="rg-slap -mx-[13px]"
            style={{ ["--rot" as string]: `${LETTER_ROT[i]}deg`, animationDelay: `${LETTERS_AT + i * 0.08}s`, marginTop: LETTER_Y[i] }}
          >
            <span className="rg-wiggle block" style={{ animationDelay: `${IDLE_AT + 1.5 + i * 0.12}s` }}>
              <CutImg src={`/start/${name}.webp`} size={LETTER_SIZE} />
            </span>
          </span>
        ))}
      </span>

      {STEPS.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className="rg-slap absolute"
          style={{ left: p.left, top: p.top, ["--rot" as string]: `${p.rot}deg`, animationDelay: `${stepsAt + i * 0.08}s` }}
        >
          <span className={`block ${p.idle ?? ""}`} style={{ animationDelay: `${IDLE_AT + (p.idleDelay ?? 0)}s`, transform: p.flip ? "scaleX(-1)" : undefined }}>
            <ShoePrint size={p.size} />
          </span>
        </span>
      ))}
      {SPARKS.map((sp, i) => (
        <PaperStar key={i} s={sp} delay={tapeAt + i * 0.12} />
      ))}
      <span
        className="rg-slap absolute inset-x-0 mx-auto w-max"
        style={{ top: 286, ["--rot" as string]: "0deg", animationDelay: `${tapeAt}s` }}
      >
        <span className="flex h-11 items-center rounded-full bg-ink px-5 text-[15px] font-medium text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)]">
          {label}
        </span>
      </span>
    </button>
  );
}
