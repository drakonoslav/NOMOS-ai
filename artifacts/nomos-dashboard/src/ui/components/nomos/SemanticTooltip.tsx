import React, { useState } from "react";
import { SEMANTIC_MAP } from "../../semantic/semantic_map";
import type { ToneResolverInput } from "../../tone/tone_types";

interface SemanticTooltipProps {
  term: string;
  context?: ToneResolverInput;
  children: React.ReactNode;
}

export function SemanticTooltip({ term, context, children }: SemanticTooltipProps) {
  const [hover, setHover] = useState(false);

  const entry = SEMANTIC_MAP[term.toLowerCase()];
  if (!entry) return <>{children}</>;

  const dynamicLine = context && entry.dynamic ? entry.dynamic(context) : "";

  return (
    <span
      className="nm-tooltip-wrapper"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}

      {hover && (
        <div className="nm-tooltip">
          <div className="nm-tooltip-title">{entry.label}</div>
          <div className="nm-tooltip-desc">{entry.description}</div>
          {dynamicLine && (
            <div className="nm-tooltip-dynamic">{dynamicLine}</div>
          )}
        </div>
      )}
    </span>
  );
}
