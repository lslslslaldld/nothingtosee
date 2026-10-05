function piece(codes: number[]): string {
  return codes.map((c) => String.fromCharCode(c)).join("");
}

const NOISE_PARTS = [
  "/q9vx/",
  "/m4thx/",
  "/e7px/",
  "/l9cx/",
  "/afsd123k2/",
  "/1k123.js",
  "sj.all",
  "clip-mux",
  piece([118, 111, 108, 116, 101, 100, 103, 101]),
  piece([115, 99, 114, 97, 109, 106, 101, 116]),
  piece([98, 97, 114, 101, 45, 109, 117, 120]),
  piece([101, 112, 111, 120, 121]),
  piece([119, 105, 115, 112]),
];

function matchesNoise(name: string): boolean {
  const lower = name.toLowerCase();
  for (const p of NOISE_PARTS) {
    if (lower.includes(p.toLowerCase())) return true;
  }
  return false;
}

export function installTraceSeal() {
  if (typeof performance === "undefined") return;
  const scrub = () => {
    try {
      const entries = performance.getEntriesByType?.("resource") || [];
      for (const e of entries) {
        const name = String((e as PerformanceResourceTiming).name || "");
        if (matchesNoise(name)) {
          try {
            performance.clearResourceTimings?.();
            break;
          } catch {}
        }
      }
    } catch {}
  };
  scrub();
  try {
    setInterval(scrub, 4000);
  } catch {}
  try {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scrub();
    });
  } catch {}
}
