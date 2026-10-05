import { useEffect, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import {
  getFontMaps,
  loadFontMaps,
  obfuscateDisplayText,
  shouldObfuscateDisplay,
} from "@/lib/fontObfuscation";

export default function ObfuscatedText({
  children,
  className,
  style,
  as: Tag = "span",
  force = false,
}: {
  children: string;
  className?: string;
  style?: CSSProperties;
  as?: ElementType;
  force?: boolean;
}) {
  const needs = force || shouldObfuscateDisplay(children);
  const [text, setText] = useState(children);
  const [sealed, setSealed] = useState(!needs);

  useEffect(() => {
    if (!needs) {
      setText(children);
      setSealed(true);
      return;
    }
    let alive = true;
    setSealed(false);
    loadFontMaps().then(() => {
      if (!alive) return;
      const { maps } = getFontMaps();
      if (maps) setText(obfuscateDisplayText(children, maps));
      else setText(children);
      setSealed(true);
    });
    return () => {
      alive = false;
    };
  }, [children, needs, force]);

  return (
    <Tag
      className={needs ? `t-ui${className ? ` ${className}` : ""}` : className}
      style={{
        ...style,
        ...(needs && !sealed ? { color: "transparent", textShadow: "none" } : null),
      }}
      data-no-obfuscate={needs ? "true" : undefined}
    >
      {text as ReactNode}
    </Tag>
  );
}
