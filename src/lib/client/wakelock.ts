"use client";
// Screen Wake Lock: request on start, re-request when the tab becomes visible again.

let sentinel: WakeLockSentinel | null = null;
let wanted = false;
let listening = false;

export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

async function request() {
  if (!wanted || !wakeLockSupported()) return;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    sentinel.addEventListener("release", () => {
      sentinel = null;
    });
  } catch {
    // denied (low battery, hidden page): nothing else to do
  }
}

function onVisibility() {
  if (document.visibilityState === "visible" && wanted && !sentinel) void request();
}

// Returns false when the browser has no Wake Lock, so the UI can ask the user to keep the screen on.
export function startWakeLock(): boolean {
  wanted = true;
  if (!listening) {
    listening = true;
    document.addEventListener("visibilitychange", onVisibility);
  }
  if (!wakeLockSupported()) return false;
  void request();
  return true;
}

export function stopWakeLock() {
  wanted = false;
  void sentinel?.release().catch(() => undefined);
  sentinel = null;
}
