import { isGHref, isGvHref } from "@/lib/uiMarks";

type MetricParams = Record<string, string | number | boolean | undefined | null>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __pzMetricsOk?: number;
  }
}

const GA_ID = "G-SHE360M0YP";
const GTM_ID = "GTM-WPH7NCG4";

const SECTION_PATH: Record<string, string> = {
  home: "/campus/home",
  library: "/modules/library",
  lab: "/modules/lab",
  research: "/workspace/research",
  tutor: "/modules/tutor",
  toolkit: "/modules/toolkit",
  media: "/modules/media",
  film: "/modules/film-studies",
  chat: "/campus/forum",
  vm: "/labs/sandbox",
  trending: "/campus/bulletin",
  profile: "/campus/profile",
  settings: "/campus/preferences",
  other: "/campus/workspace",
};

let booted = false;
let lastPath = "";

function pushDataLayer(payload: Record<string, unknown>) {
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  } catch {}
}

function callGtag(...args: unknown[]) {
  try {
    if (typeof window.gtag === "function") {
      window.gtag(...args);
      return;
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(args);
  } catch {}
}

function injectScript(src: string, attrs?: Record<string, string>) {
  if (document.querySelector(`script[data-pz-metrics="${src}"]`)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  s.dataset.pzMetrics = src;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  }
  document.head.appendChild(s);
}

export function installLessonMetrics() {
  if (typeof window === "undefined" || booted) return;
  booted = true;
  try {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") {
      window.gtag = function gtag(...args: unknown[]) {
        window.dataLayer!.push(args);
      };
    }
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, {
      send_page_view: true,
      transport_type: "beacon",
      page_title: document.title || "Campus",
      page_location: location.href,
      page_path: location.pathname || "/",
    });
    pushDataLayer({
      "gtm.start": Date.now(),
      event: "gtm.js",
    });
  } catch {}

  injectScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
  injectScript(`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`);

  try {
    window.__pzMetricsOk = 1;
  } catch {}
}

export function trackEvent(name: string, params: MetricParams = {}) {
  const clean: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    clean[k] = v;
  }
  callGtag("event", name, clean);
  pushDataLayer({ event: name, ...clean });
}

export function trackSection(section: keyof typeof SECTION_PATH | string, extra: MetricParams = {}) {
  const path = SECTION_PATH[section] || SECTION_PATH.other;
  const { force, ...rest } = extra;
  if (path === lastPath && !force) return;
  lastPath = path;
  const title = String(rest.page_title || document.title || "Campus");
  callGtag("event", "page_view", {
    page_path: path,
    page_title: title,
    page_location: `${location.origin}${path}`,
    section,
    ...rest,
  });
  callGtag("config", GA_ID, {
    page_path: path,
    page_title: title,
  });
  pushDataLayer({
    event: "lesson_view",
    page_path: path,
    section,
    ...rest,
  });
}

export function trackLibraryOpen(extra: MetricParams = {}) {
  trackSection("library", { page_title: "Module Library", ...extra });
  trackEvent("shelf_open", { shelf: "library", ...extra });
}

export function trackModuleOpen(module: {
  id?: string;
  label?: string;
  topic?: string;
  via?: string;
}) {
  trackEvent("module_open", {
    module_id: module.id || "unknown",
    module_label: (module.label || "untitled").slice(0, 80),
    module_topic: (module.topic || "general").slice(0, 40),
    delivery: module.via || "standard",
  });
  trackSection("lab", {
    page_title: `Lab · ${(module.label || "Module").slice(0, 48)}`,
    module_id: module.id || "unknown",
  });
}

export function trackModuleEngage(moduleId: string, seconds: number) {
  if (!moduleId || seconds < 5) return;
  trackEvent("module_engage", {
    module_id: moduleId,
    engagement_seconds: Math.min(Math.round(seconds), 7200),
  });
}

export function trackCatalogFilter(topic: string) {
  trackEvent("catalog_filter", { topic: (topic || "all").slice(0, 40) });
}

export function trackCatalogSearch(q: string) {
  const term = String(q || "").trim().slice(0, 60);
  if (!term) return;
  trackEvent("catalog_search", { search_term: term });
}

export function pathForTabUrl(url: string): keyof typeof SECTION_PATH {
  const u = String(url || "");
  if (!u || u === "petezah://newtab" || u === "about:blank" || u === "https://") return "home";
  if (isGvHref(u) || u.startsWith("petezah://gv")) return "lab";
  if (isGHref(u) || u === "petezah://g" || u.startsWith("petezah://g?")) return "library";
  if (u.includes("://ai")) return "tutor";
  if (u.includes("://apps") || u.includes("://appviewer")) return "toolkit";
  if (u.includes("://music") || u.includes("://mu")) return "media";
  if (u.includes("://movies") || u.includes("://mo")) return "film";
  if (u.includes("://chat")) return "chat";
  if (u.includes("://vm") || u.includes("://firefox")) return "vm";
  if (u.includes("://trending")) return "trending";
  if (u.includes("://user/") || u.includes("://profile")) return "profile";
  if (u.includes("://settings")) return "settings";
  if (/^https?:\/\//i.test(u)) return "research";
  return "other";
}
