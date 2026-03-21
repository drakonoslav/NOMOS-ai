import React from "react";
import type { ValidationIssue } from "../../conversation/validation_engine";
import { compressIssues } from "../../conversation/validation_format";

interface ValidationPanelProps {
  issues: ValidationIssue[];
}

export function ValidationPanel({ issues }: ValidationPanelProps) {
  if (!issues.length) return null;

  const lines = compressIssues(issues);

  const hasErrors   = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");

  const cls = hasErrors
    ? "nm-error"
    : hasWarnings
    ? "nm-warning"
    : "";

  return (
    <div className="nm-validation">
      {lines.map((line, i) => (
        <div key={i} className={`nm-validation-item ${cls}`}>
          {line}
        </div>
      ))}
    </div>
  );
}
