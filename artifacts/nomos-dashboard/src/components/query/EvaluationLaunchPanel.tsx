import { NomosQuery } from "@/query/query_types";
import { Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface EvaluationLaunchPanelProps {
  parsedQuery?: NomosQuery;
  previewAccepted: boolean;
  isEvaluating: boolean;
  onEvaluate: () => void;
}

function getStatusMessage(
  parsedQuery: NomosQuery | undefined,
  previewAccepted: boolean
): { text: string; ready: boolean } {
  if (!parsedQuery) {
    return { text: "Parse a submission before evaluation.", ready: false };
  }
  if (parsedQuery.completeness === "INSUFFICIENT") {
    return {
      text: "Submission is insufficient for evaluation. Add constraints, candidates, or objective.",
      ready: false,
    };
  }
  if (!previewAccepted) {
    return {
      text: "Confirm the parsed query before evaluation.",
      ready: false,
    };
  }
  return { text: "Ready for NOMOS evaluation.", ready: true };
}

export function EvaluationLaunchPanel({
  parsedQuery,
  previewAccepted,
  isEvaluating,
  onEvaluate,
}: EvaluationLaunchPanelProps) {
  const { text, ready } = getStatusMessage(parsedQuery, previewAccepted);

  const canEvaluate = ready && !isEvaluating;

  return (
    <div
      className={cn(
        "border p-4 space-y-3",
        ready ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10"
      )}
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "w-1.5 h-1.5 rounded-full mt-1 shrink-0",
            ready ? "bg-success" : "bg-muted-foreground/40"
          )}
        />
        <p className={cn("text-[11px] font-mono", ready ? "text-foreground" : "text-muted-foreground")}>
          {text}
        </p>
      </div>
      <button
        onClick={onEvaluate}
        disabled={!canEvaluate}
        className={cn(
          "w-full flex items-center justify-center gap-2 px-4 py-2.5 text-[11px] font-mono tracking-widest transition-colors",
          canEvaluate
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        )}
      >
        {isEvaluating ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            EVALUATING CANDIDATES...
          </>
        ) : (
          <>
            EVALUATE CANDIDATES
            <ChevronRight className="w-3.5 h-3.5" />
          </>
        )}
      </button>
    </div>
  );
}
