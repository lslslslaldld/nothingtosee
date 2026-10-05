type QuietReason = "timer" | "gesture" | "manual";

const QUIET_MS = 8000;
const listeners = new Set<() => void>();
let released = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function release(reason: QuietReason) {
  if (released) return;
  released = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  try {
    (window as any).__pzQuietOk = 1;
    (window as any).__pzQuietReason = reason;
  } catch {}
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {}
  }
  listeners.clear();
}

function onGesture() {
  release("gesture");
}

export function isQuietBoot(): boolean {
  return !released;
}

export function whenQuietEnds(fn: () => void): () => void {
  if (released) {
    try {
      fn();
    } catch {}
    return () => {};
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function releaseQuietBoot(reason: QuietReason = "manual") {
  release(reason);
}

export function installQuietBoot() {
  if (typeof window === "undefined") return;
  try {
    if ((window as any).__pzQuietOk) {
      released = true;
      return;
    }
  } catch {}

  for (const evt of ["pointerdown", "keydown", "touchstart", "wheel"] as const) {
    window.addEventListener(evt, onGesture, { capture: true, passive: true, once: true });
  }

  timer = setTimeout(() => release("timer"), QUIET_MS);

  try {
    (window as any).__pzQuietInstall = 1;
  } catch {}
}
