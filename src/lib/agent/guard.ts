import "server-only";

// Per-instance (per serverless container) daily counter: a cheap cost guard, not a global limit.
let day = "";
let count = 0;

export function dailyLimit(): number {
  const n = Number(process.env.DAILY_REQUEST_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 2000;
}

export function allowRequest(now = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    count = 0;
  }
  if (count >= dailyLimit()) return false;
  count += 1;
  return true;
}

export function resetGuard(): void {
  day = "";
  count = 0;
}

export const REQUEST_TIMEOUT_MS = 40_000;
export const MAX_TOOL_CALLS = 2;

export function timeoutSignal(ms = REQUEST_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}
