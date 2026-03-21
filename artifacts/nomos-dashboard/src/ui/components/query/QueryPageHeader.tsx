import React from "react";
import { SubmissionCompleteness } from "../../../query/query_types";

export interface QueryPageHeaderProps {
  title: string;
  subtitle: string;
  completeness?: SubmissionCompleteness;
}

function completenessLabel(
  completeness?: SubmissionCompleteness
): { text: string; className: string } {
  switch (completeness) {
    case "COMPLETE":
      return { text: "COMPLETE", className: "status-complete" };
    case "PARTIAL":
      return { text: "PARTIAL", className: "status-partial" };
    case "INSUFFICIENT":
      return { text: "INSUFFICIENT", className: "status-insufficient" };
    default:
      return { text: "UNPARSED", className: "status-unparsed" };
  }
}

export function QueryPageHeader({
  title,
  subtitle,
  completeness,
}: QueryPageHeaderProps) {
  const badge = completenessLabel(completeness);

  return (
    <div className="panel query-page-header">
      <div className="query-page-header__main">
        <div className="query-page-header__eyebrow">NOMOS QUERY</div>
        <h1 className="query-page-header__title">{title}</h1>
        <p className="query-page-header__subtitle">{subtitle}</p>
      </div>

      <div className="query-page-header__status">
        <div className="query-page-header__status-label">Submission Quality</div>
        <div className={`status-badge ${badge.className}`}>{badge.text}</div>
      </div>
    </div>
  );
}
