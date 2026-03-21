import React from "react";
import type { CompletenessResult } from "../../conversation/completeness_engine";

interface CompletenessBarProps {
  result: CompletenessResult;
}

function getCompletenessColor(score: number): string {
  if (score < 40) return "var(--nm-invalid)";
  if (score < 80) return "var(--nm-degraded)";
  return "var(--nm-accent-strong)";
}

export function CompletenessBar({ result }: CompletenessBarProps) {
  const { score, guidance } = result;

  return (
    <div className="nm-completeness">
      <div className="nm-completeness-label">
        Query completeness: {score}%
      </div>

      <div className="nm-completeness-bar">
        <div
          className="nm-completeness-fill"
          style={{
            width:      `${score}%`,
            background: getCompletenessColor(score),
          }}
        />
      </div>

      {guidance && (
        <div className="nm-completeness-guidance">{guidance}</div>
      )}
    </div>
  );
}
