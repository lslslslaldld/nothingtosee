import type { ReactNode } from "react";

const MENTION_RE = /@([A-Za-z][A-Za-z0-9_]{2,31})/g;

export function MentionsText({
  text,
  onNavigate,
  style,
  className,
}: {
  text: string;
  onNavigate?: (url: string) => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  const raw = String(text || "");
  const nodes: ReactNode[] = [];
  let last = 0;
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = MENTION_RE.exec(raw))) {
    if (m.index > last) nodes.push(raw.slice(last, m.index));
    const handle = m[1];
    const key = `m-${i++}-${m.index}`;
    if (onNavigate) {
      nodes.push(
        <button
          key={key}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNavigate(`petezah://user/@${handle}`);
          }}
          style={{
            appearance: "none",
            background: "transparent",
            border: "none",
            padding: 0,
            margin: 0,
            color: "hsl(213 75% 68%)",
            font: "inherit",
            cursor: "pointer",
            fontWeight: 650,
          }}
        >
          @{handle}
        </button>,
      );
    } else {
      nodes.push(
        <span key={key} style={{ color: "hsl(213 75% 68%)", fontWeight: 650 }}>
          @{handle}
        </span>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < raw.length) nodes.push(raw.slice(last));
  return (
    <span className={className} style={{ whiteSpace: "pre-wrap", ...style }}>
      {nodes}
    </span>
  );
}
