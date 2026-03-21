import React from "react";
import { NomosQuery } from "../../../query/query_types";

export interface MissingInfoPanelProps {
  parsedQuery?: NomosQuery;
}

export function MissingInfoPanel({ parsedQuery }: MissingInfoPanelProps) {
  if (!parsedQuery) return null;
  if (parsedQuery.completeness === "COMPLETE") return null;

  const missing: string[] = [];

  if (parsedQuery.candidates.length === 0) {
    missing.push(
      "No candidate actions detected. Add at least one candidate to evaluate."
    );
  }
  if (parsedQuery.state.constraints.length === 0) {
    missing.push(
      "No explicit constraints detected. Add hard limits the candidates must satisfy."
    );
  }
  if (!parsedQuery.objective) {
    missing.push(
      "No objective detected. Specify what outcome matters most."
    );
  }
  if (
    !parsedQuery.state.description &&
    parsedQuery.state.facts.length === 0
  ) {
    missing.push(
      "No state or facts detected. Describe the current situation."
    );
  }

  if (missing.length === 0) return null;

  return (
    <div className="panel missing-info-panel">
      <div className="panel-header">Missing Information</div>
      {missing.map((item, i) => (
        <div key={i} className="missing-item">
          {item}
        </div>
      ))}
    </div>
  );
}
