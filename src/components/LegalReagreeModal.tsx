import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield } from "lucide-react";

export default function LegalReagreeModal() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const r = await fetch("/api/legal/status", { credentials: "include" });
        const d = await r.json();
        if (gone) return;
        setVersion(d.version || null);
        if (!d.accepted) setOpen(true);
      } catch {}
    })();
    return () => {
      gone = true;
    };
  }, []);

  async function accept() {
    if (busy) return;
    if (!agreed) {
      setError("Please check the box to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/legal/accept", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ accepted: true, version }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d?.code === "CAPTCHA_REQUIRED" || /verif/i.test(String(d?.error || ""))) {
          try {
            window.__pzNeedCaptcha?.();
          } catch {}
        }
        setError(d.error || "Could not save. Try again.");
        setBusy(false);
        return;
      }
      setOpen(false);
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100000] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pz-legal-reagree-title"
        >
          <div
            className="absolute inset-0"
            style={{ background: "hsla(220, 40%, 4%, 0.72)", backdropFilter: "blur(10px)" }}
          />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative z-10 w-full max-w-sm flex flex-col items-center text-center"
            style={{ pointerEvents: "auto" }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: "hsl(216 30% 10%)",
                border: "1px solid hsl(213 40% 32%)",
              }}
            >
              <Shield size={22} style={{ color: "hsl(213 80% 78%)" }} />
            </div>

            <p
              className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2"
              style={{ color: "hsl(213 75% 68%)" }}
            >
              Policy update
            </p>
            <h2
              id="pz-legal-reagree-title"
              className="text-2xl font-extrabold tracking-tight mb-2"
              style={{ color: "hsl(0 0% 100%)" }}
            >
              Our policies changed
            </h2>
            <p
              className="text-sm leading-relaxed mb-5 max-w-[32ch]"
              style={{ color: "hsl(216 15% 72%)" }}
            >
              Please review and agree to continue.
              {version ? (
                <span className="block mt-2 text-[11px]" style={{ color: "hsl(216 15% 52%)" }}>
                  Document version {version}
                </span>
              ) : null}
            </p>

            <label
              className="flex items-start gap-2.5 text-left w-full max-w-[280px] mb-3 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked);
                  if (e.target.checked) setError("");
                }}
              />
              <span
                aria-hidden="true"
                className="mt-0.5 shrink-0 flex items-center justify-center transition-colors"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  border: agreed
                    ? "2px solid hsl(213 75% 68%)"
                    : "2px solid hsl(213 55% 55%)",
                  background: agreed ? "hsl(213 55% 36%)" : "hsla(216, 30%, 10%, 0.9)",
                  boxShadow: "0 0 0 1px hsla(213, 40%, 20%, 0.7)",
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    opacity: agreed ? 1 : 0,
                    transform: agreed ? "scale(1)" : "scale(0.7)",
                    transition: "opacity 0.12s, transform 0.12s",
                  }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span className="text-[12px] leading-snug" style={{ color: "hsl(216 15% 68%)" }}>
                I agree to the updated{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:underline"
                  style={{ color: "hsl(213 75% 68%)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms
                </a>
                ,{" "}
                <a
                  href="/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:underline"
                  style={{ color: "hsl(213 75% 68%)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Privacy Policy
                </a>
                , and{" "}
                <a
                  href="/dmca"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:underline"
                  style={{ color: "hsl(213 75% 68%)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  DMCA Policy
                </a>
                .
              </span>
            </label>

            {error ? (
              <p className="text-xs mb-3 w-full max-w-[280px] text-left" style={{ color: "#f0a0a8" }}>
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-2.5 w-full max-w-[280px]">
              <button
                type="button"
                disabled={busy}
                onClick={() => void accept()}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-[filter,opacity]"
                style={{
                  background: "hsl(213 55% 36%)",
                  border: "1px solid hsl(213 50% 48%)",
                  opacity: busy ? 0.55 : 1,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!busy) e.currentTarget.style.filter = "brightness(1.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = "none";
                }}
              >
                {busy ? "Saving…" : "Agree and continue"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
