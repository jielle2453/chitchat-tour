// Spoken acknowledgement played while /api/ask checks sources. Pure picker so it stays testable.
import type { Lang } from "@/lib/types";
import { t, type I18nKey } from "./i18n";

// Grace period before the cue starts: answers that land sooner skip the cue entirely.
export const ASK_ACK_DELAY_MS = 400;
// Once the answer is in, never hold it back longer than this for a cue that is still playing.
export const ASK_ACK_FINISH_TIMEOUT_MS = 3000;

const ACK_KEYS: I18nKey[] = ["askAck1", "askAck2", "askAck3"];

// The UI dictionary covers en/ja/zh-TW; the spoken cue also needs Korean, which `Lang` allows.
const KO_ACKS = ["좋은 질문이에요. 출처를 확인할게요.", "좋은 질문이네요. 믿을 수 있는 출처를 살펴볼게요.", "잠시만요. 출처를 확인하고 답할게요."] as const;

export function pickAskAck(lang: Lang, seed: number): string {
  const count = ACK_KEYS.length;
  const idx = ((Math.trunc(seed) % count) + count) % count;
  if (lang === "ko") return KO_ACKS[idx];
  return t(lang, ACK_KEYS[idx]);
}
