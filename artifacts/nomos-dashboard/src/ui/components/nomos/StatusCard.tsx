import React from "react";
import { resolveToneMessage } from "../../tone/tone_resolver";
import type { ToneResolverInput } from "../../tone/tone_types";
import type { VerificationStatus } from "../../tone/tone_types";
import { SemanticTooltip } from "./SemanticTooltip";

export interface StatusCardProps {
  input: ToneResolverInput;
  title?: string;
}

export function StatusCard({ input, title = "System Status" }: StatusCardProps) {
  const message = resolveToneMessage(input);

  return (
    <div className="panel status-card">
      <div className="panel-header">{title}</div>

      <div className="status-card__top">
        <div className={`status-card__badge status-card__badge--${message.status.toLowerCase()}`}>
          {message.title}
        </div>
        <div className={`status-card__authority status-card__authority--${message.authority.toLowerCase()}`}>
          {message.authority}
        </div>
      </div>

      <div className="status-card__summary">{message.summary}</div>

      {message.body.length > 0 && (
        <div className="status-card__body">
          {message.body.map((line, idx) => {
            const isDecisiveLine = line.toLowerCase().includes("decisive");
            return (
              <p
                key={`${idx}-${line}`}
                className={`nm-line${isDecisiveLine ? " nm-decisive-line" : ""}`}
              >
                {renderLine(line, message.decisiveVariable, message.status, input)}
              </p>
            );
          })}
        </div>
      )}

      <div className="status-card__meta">
        <span className="status-card__tone-label">Tone</span>
        <span className="status-card__tone-value">{message.tone}</span>
      </div>
    </div>
  );
}

/* =========================================================
   Multi-pass semantic highlighting
   ========================================================= */

type Segment = React.ReactNode;

function renderLine(
  line: string,
  decisive: string | undefined,
  status: VerificationStatus,
  context: ToneResolverInput
): React.ReactNode {
  let segments: Segment[] = [line];

  if (decisive) {
    segments = splitAndWrap(segments, decisive, "nm-decisive", context);
  }

  if (status === "INVALID") {
    segments = splitAndWrapMulti(segments, [
      { key: "feasibility",  cls: "nm-violation" },
      { key: "violation",    cls: "nm-violation" },
      { key: "constraint",   cls: "nm-violation" },
    ], context);
  }

  if (status === "DEGRADED") {
    segments = splitAndWrapMulti(segments, [
      { key: "reduced",      cls: "nm-degraded-highlight" },
      { key: "insufficient", cls: "nm-degraded-highlight" },
      { key: "degraded",     cls: "nm-degraded-highlight" },
      { key: "margin",       cls: "nm-degraded-highlight" },
    ], context);
  }

  return segments;
}

function splitAndWrap(
  nodes: Segment[],
  keyword: string,
  cls: string,
  context: ToneResolverInput
): Segment[] {
  const regex = new RegExp(`(${keyword})`, "i");

  return nodes.flatMap((node, i) => {
    if (typeof node !== "string") return [node];

    const parts = node.split(regex);
    return parts.map((part, j) => {
      if (part.toLowerCase() === keyword.toLowerCase()) {
        return (
          <SemanticTooltip key={`${i}-${j}`} term={keyword} context={context}>
            <span className={cls}>{part}</span>
          </SemanticTooltip>
        );
      }
      return <span key={`${i}-${j}`}>{part}</span>;
    });
  });
}

function splitAndWrapMulti(
  nodes: Segment[],
  rules: { key: string; cls: string }[],
  context: ToneResolverInput
): Segment[] {
  let result = nodes;
  for (const rule of rules) {
    result = splitAndWrap(result, rule.key, rule.cls, context);
  }
  return result;
}
