import { NomosQueryResponse, NomosActionClassification } from "@/query/query_types";
import { cn } from "@/lib/utils";
import { Check, X, AlertTriangle } from "lucide-react";

interface EvaluationResultPanelProps {
  result: NomosQueryResponse;
}

const classificationStyle: Record<
  NomosActionClassification,
  { color: string; borderColor: string; icon: React.ReactNode }
> = {
  LAWFUL: {
    color: "text-success",
    borderColor: "border-success/40",
    icon: <Check className="w-3.5 h-3.5 text-success" />,
  },
  DEGRADED: {
    color: "text-warning",
    borderColor: "border-warning/40",
    icon: <AlertTriangle className="w-3.5 h-3.5 text-warning" />,
  },
  INVALID: {
    color: "text-destructive",
    borderColor: "border-destructive/40",
    icon: <X className="w-3.5 h-3.5 text-destructive" />,
  },
};

export function EvaluationResultPanel({ result }: EvaluationResultPanelProps) {
  const overallStyle = classificationStyle[result.overallStatus];

  return (
    <div className="border border-border space-y-0">
      {/* Header */}
      <div
        className={cn(
          "border-b border-border px-4 py-3 flex items-center justify-between",
          result.overallStatus === "LAWFUL"
            ? "bg-success/5"
            : result.overallStatus === "DEGRADED"
            ? "bg-warning/5"
            : "bg-destructive/5"
        )}
      >
        <p className="text-[10px] font-mono tracking-widest text-muted-foreground">
          EVALUATION RESULT
        </p>
        <div className="flex items-center gap-2">
          {overallStyle.icon}
          <span className={cn("text-[11px] font-mono tracking-widest font-bold", overallStyle.color)}>
            {result.overallStatus}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Overall + lawful set */}
        <div>
          <p className="text-[10px] font-mono tracking-widest text-muted-foreground mb-2">
            SUBMISSION QUALITY
          </p>
          <span className="text-[10px] font-mono tracking-widest text-muted-foreground/80">
            {result.submissionQuality}
          </span>
          {result.lawfulSet.length > 0 && (
            <div className="mt-2">
              <span className="text-[10px] font-mono text-muted-foreground">LAWFUL SET: </span>
              <span className="text-[10px] font-mono text-success">
                {result.lawfulSet.join(", ")}
              </span>
            </div>
          )}
        </div>

        {/* Candidate evaluations */}
        <div className="space-y-3">
          <p className="text-[10px] font-mono tracking-widest text-muted-foreground">
            CANDIDATE EVALUATIONS
          </p>
          {result.candidateEvaluations.map((ev) => {
            const style = classificationStyle[ev.classification];
            return (
              <div
                key={ev.id}
                className={cn("border p-3 space-y-2", style.borderColor)}
              >
                <div className="flex items-center gap-2">
                  {style.icon}
                  <span className="text-[10px] font-mono tracking-widest text-muted-foreground">
                    CANDIDATE {ev.id}
                  </span>
                  <span className={cn("text-[10px] font-mono tracking-widest ml-auto", style.color)}>
                    {ev.classification}
                  </span>
                </div>
                {ev.reasons.length > 0 && (
                  <ul className="space-y-1 pl-2 border-l border-muted">
                    {ev.reasons.map((r, i) => (
                      <li key={i} className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Adjustments */}
        {result.adjustments && result.adjustments.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono tracking-widest text-muted-foreground">
              ADJUSTMENTS TO ACHIEVE LAWFULNESS
            </p>
            {result.adjustments.map((adj) => (
              <div key={adj.candidateId} className="border border-muted/40 p-3 space-y-1.5">
                <p className="text-[10px] font-mono text-muted-foreground">
                  Candidate {adj.candidateId}:
                </p>
                {adj.actions.map((a, i) => (
                  <p key={i} className="text-[10px] font-mono text-foreground/70 pl-2 border-l border-muted">
                    {a}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        {result.notes.length > 0 && (
          <div className="border-t border-border pt-3 space-y-1">
            <p className="text-[10px] font-mono tracking-widest text-muted-foreground">NOTES</p>
            {result.notes.map((note, i) => (
              <p key={i} className="text-[10px] font-mono text-muted-foreground/60">
                · {note}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
