import React from "react";
import { QueryMode } from "../../pages/query/QueryBuilderPage";

export interface QueryModeSwitcherProps {
  mode: QueryMode;
  onChange: (mode: QueryMode) => void;
}

export function QueryModeSwitcher({ mode, onChange }: QueryModeSwitcherProps) {
  return (
    <div className="panel query-mode-switcher">
      <div className="query-mode-switcher__label">Submission Mode</div>
      <div className="query-mode-switcher__tabs">
        <button
          type="button"
          className={`query-tab ${mode === "guided" ? "is-active" : ""}`}
          onClick={() => onChange("guided")}
        >
          Guided
        </button>
        <button
          type="button"
          className={`query-tab ${mode === "natural" ? "is-active" : ""}`}
          onClick={() => onChange("natural")}
        >
          Natural Language
        </button>
      </div>
    </div>
  );
}
