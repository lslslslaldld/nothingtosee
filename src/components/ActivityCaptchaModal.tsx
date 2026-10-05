import { useEffect, useRef, useState } from "react";
import { getSiteOrigin, svgDirUrl } from "@/lib/siteOrigin";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "cap-widget": any;
    }
  }
  interface Window {
    __pzNeedCaptcha?: () => void;
  }
}

function asset(path: string) {
  return new URL(path, svgDirUrl()).href;
}

function isCaptchaPayload(status: number, data: any) {
  if (status !== 403) return false;
  if (data?.code === "CAPTCHA_REQUIRED") return true;
  return String(data?.error || "").toLowerCase().includes("verification required");
}

export default function ActivityCaptchaModal() {
  const origin = getSiteOrigin();
  const [open, setOpen] = useState(false);
  const [capReady, setCapReady] = useState(false);
  const [solved, setSolved] = useState(false);
  const [status, setStatus] = useState("");
  const capRef = useRef<HTMLElement | null>(null);
  const loading = useRef(false);

  useEffect(() => {
    const openModal = () => {
      setOpen(true);
      setSolved(false);
      setStatus("Unusual activity detected. Please verify to continue.");
    };
    window.__pzNeedCaptcha = openModal;

    const origFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await origFetch(input, init);
      try {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url || url.includes("/cap/") || url.includes("/api/legal/")) return res;
        if (res.status !== 403) return res;
        const clone = res.clone();
        const ct = clone.headers.get("content-type") || "";
        if (!ct.includes("application/json")) return res;
        const data = await clone.json().catch(() => null);
        if (isCaptchaPayload(res.status, data)) openModal();
      } catch {}
      return res;
    };

    return () => {
      window.fetch = origFetch;
      delete window.__pzNeedCaptcha;
    };
  }, []);

  useEffect(() => {
    if (!open || capReady || loading.current) return;
    loading.current = true;
    let gone = false;
    (async () => {
      (window as any).CAP_CUSTOM_WASM_URL = asset("vendor/cap/cap_wasm_bg.wasm");
      (window as any).CAP_PAKO_URL = asset("vendor/cap/pako_inflate.min.js");
      try {
        if (!customElements.get("cap-widget")) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = asset("vendor/cap/cap.min.js");
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("captcha"));
            document.head.appendChild(s);
          });
        }
        if (customElements.whenDefined) await customElements.whenDefined("cap-widget");
      } catch {}
      if (!gone) setCapReady(true);
      loading.current = false;
    })();
    return () => {
      gone = true;
    };
  }, [open, capReady]);

  useEffect(() => {
    const el = capRef.current;
    if (!el || !open) return;
    const onSolve = () => {
      setSolved(true);
      setStatus("Verified. You can continue.");
      setTimeout(() => setOpen(false), 450);
    };
    const onErr = (e: Event) => {
      setSolved(false);
      setStatus((e as CustomEvent)?.detail?.message || "Verification failed. Please try again.");
    };
    el.addEventListener("solve", onSolve);
    el.addEventListener("error", onErr);
    return () => {
      el.removeEventListener("solve", onSolve);
      el.removeEventListener("error", onErr);
    };
  }, [open, capReady]);

  if (!open) return null;

  return (
    <div className="pz-activity-cap" role="dialog" aria-modal="true" aria-labelledby="pz-activity-cap-title">
      <style>{`
        .pz-activity-cap {
          position: fixed;
          inset: 0;
          z-index: 100050;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 18px;
          background: hsla(220, 40%, 4%, 0.72);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          font-family: "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif;
          color: hsl(0 0% 98%);
        }
        .pz-activity-cap .card {
          width: 100%;
          max-width: 400px;
          border-radius: 18px;
          border: 1px solid hsl(213 40% 32% / 0.55);
          background: linear-gradient(165deg, hsl(216 28% 12% / 0.97), hsl(220 32% 8% / 0.99));
          box-shadow: 0 28px 80px rgba(0,0,0,0.55);
          padding: 24px 22px 20px;
        }
        .pz-activity-cap h2 {
          margin: 0 0 8px;
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .pz-activity-cap .sub {
          margin: 0 0 16px;
          font-size: 0.88rem;
          line-height: 1.5;
          color: hsl(216 15% 72%);
        }
        .pz-activity-cap .cap-wrap {
          display: flex;
          justify-content: center;
          margin: 8px 0 12px;
          min-height: 56px;
        }
        .pz-activity-cap .status {
          margin: 0;
          font-size: 12px;
          color: ${solved ? "hsl(150 45% 62%)" : "hsl(216 15% 68%)"};
          text-align: center;
        }
      `}</style>
      <div className="card">
        <h2 id="pz-activity-cap-title">Quick check</h2>
        <p className="sub">We noticed unusual browser activity. Complete the check below to keep going.</p>
        <div className="cap-wrap">
          {capReady ? (
            <cap-widget
              ref={capRef as any}
              id="pz-activity-cap-widget"
              data-cap-api-endpoint={`${origin}/cap/`}
              data-cap-i18n-initial-state="I'm not a robot"
              data-cap-i18n-verifying-label="Verifying…"
              data-cap-i18n-solved-label="Verified"
              data-cap-i18n-error-label="Try again"
            />
          ) : (
            <p className="status">Loading verification…</p>
          )}
        </div>
        {status ? <p className="status">{status}</p> : null}
      </div>
    </div>
  );
}
