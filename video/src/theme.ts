import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });

export const FONT = `${fontFamily}, "Segoe UI", system-ui, sans-serif`;

export const C = {
  // The app's own palette: ink, warm off-whites, warm greys. Colour comes from the stickers.
  bg: "#E9E6E1",
  paper: "#F4F4F2",
  khaki: "#F2F0ED",
  ink: "#111111",
  night: "#111111",
  night2: "#1D1C1B",
  sub: "#6B6B6B",
  subDark: "#9B9893",
  faint: "#9A948C",
  line: "#D6D1CA",
  white: "#FFFFFF",
};

export const FPS = 30;
export const BPM = 100;
export const BEAT = (60 / BPM) * FPS; // 18 frames
export const BAR = BEAT * 4; // 72 frames
export const s = (sec: number) => Math.round(sec * FPS);
