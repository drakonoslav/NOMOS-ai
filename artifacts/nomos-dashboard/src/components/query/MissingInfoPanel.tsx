import { NomosQuery } from "@/query/query_types";
import { AlertTriangle } from "lucide-react";

interface MissingInfoPanelProps {
  parsedQuery: NomosQuery;
}

export function MissingInfoPanel({ parsedQuery }: MissingInfoPanelProps) {
  if (parsedQuery.completeness === "COMPLETE") return null;

  const missing: string[] = [];
  if (parsedQuery.state.constraints.length === 0) {
    missing.push("No explicit constraints detected. Add hard limits the candidate actions must satisfy.");
  }
  if (parsedQuery.candidates.length === 0) {
    missing.push("No candidate actions detected. Add at least one candidate to evaluate.");
  }
  if (!parsedQuery.objective) {
    missing.push("No objective detected. Specify what outcome matters most.");
  }
  if (
    !parsedQuery.state.description &&
    parsedQuery.state.facts.length === 0
  ) {
    missing.push("No state description or facts detected. Describe the current situation.");
  }

  if (missing.length === 0) return null;

  return (
    <div className="border border-warning/30 bg-warning/5 p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-warning" />
        <p className="text-[10px] font-mono tracking-widest text-warning">MISSING INFORMATION</p>
      </div>
      <ul className="space-y-1.5">
        {missing.map((m, i) => (
          <li key={i} className="text-[10px] font-mono text-warning/80 pl-2 border-l border-warning/30">
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}
