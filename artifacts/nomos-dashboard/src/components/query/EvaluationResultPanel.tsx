import { NomosQueryResponse, NomosActionClassification } from "@/query/query_types";
import { cn } from "@/lib/utils";
import { Check, X, AlertTriangle, Shield, Cpu } from "lucide-react";

interface EvaluationResultPanelProps {
  result: NomosQueryResponse;
}

const classificationStyle: Record<
  NomosActionClassification,
  { color: string; borderColor: string; bgColor: string; icon: React.ReactNode }
> = {
  LAWFUL: {
    color: "text-success",
    borderColor: "border-success/40",
    bgColor: "bg-success/5",
    icon: <Check className="w-3.5 h-3.5 text-success" />,
  },
  DEGRADED: {
    color: "text-warning",
    borderColor: "border-warning/40",
    bgColor: "bg-warning/5",
    icon: <AlertTriangle className="w-3.5 h-3.5 text-warning" />,
  },
  INVALID: {
    color: "text-destructive",
    borderColor: "border-destructive/40",
    bgColor: "bg-destructive/5",
    icon: <X className="w-3.5 h-3.5 text-destructive" />,
  },
};

/**
 * Render a reason line with inline highlighting for [VIOLATION] and [RISK] prefixes.
 * The prefix is coloured; the rest of the text is muted.
 */
function ReasonLine({ reason }: { reason: string }) {
  if (reason.startsWith("[VIOLATION]")) {
    const body = reason.slice("[VIOLATION]".length).trim();
    return (
      <li className="text-[10px] font-mono leading-relaxed">
        <span className="text-destructive font-bold">[VIOLATION]</span>{" "}
        <span className="text-muted-foreground">{body}</span>
      </li>
    );
  }
  if (reason.startsWith("[RISK]")) {
    const body = reason.slice("[RISK]".length).trim();
    return (
      <li className="text-[10px] font-mono leading-relaxed">
        <span className="text-warning font-bold">[RISK]</span>{" "}
        <span className="text-muted-foreground">{body}</span>
      </li>
    );
  }
  return (
    <li className="text-[10px] font-mono text-muted-foreground leading-relaxed">
      {reason}
    </li>
  );
}

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
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-mono tracking-widest text-muted-foreground">
            EVALUATION RESULT
          </p>
          {/* Evaluation method badge */}
          {result.evaluationMethod && (
            <span className="flex items-center gap-1 text-[9px] font-mono tracking-widest text-muted-foreground/50 border border-muted/30 px-1.5 py-0.5">
              {result.evaluationMethod === "rule-based" ? (
                <><Shield className="w-2.5 h-2.5" /> RULE-BASED</>
              ) : (
                <><Cpu className="w-2.5 h-2.5" /> LLM</>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {overallStyle.icon}
          <span className={cn("text-[11px] font-mono tracking-widest font-bold", overallStyle.color)}>
            {result.overallStatus}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Submission quality + lawful set */}
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
              <span className="text-[10px] font-mono text-success font-bold">
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
                className={cn("border p-3 space-y-2", style.borderColor, style.bgColor)}
              >
                {/* Candidate header row */}
                <div className="flex items-center gap-2">
                  {style.icon}
                  <span className="text-[10px] font-mono tracking-widest text-muted-foreground">
                    CANDIDATE {ev.id}
                  </span>
                  <span className={cn("text-[10px] font-mono tracking-widest ml-auto font-bold", style.color)}>
                    {ev.classification}
                  </span>
                </div>

                {/* Violated constraints block — shown prominently above reasons */}
                {ev.violatedConstraints && ev.violatedConstraints.length > 0 && (
                  <div className={cn(
                    "border-l-2 pl-2 space-y-0.5",
                    ev.classification === "INVALID"
                      ? "border-destructive/60"
                      : "border-warning/60"
                  )}>
                    <p className={cn(
                      "text-[9px] font-mono tracking-widest mb-1",
                      ev.classification === "INVALID" ? "text-destructive/70" : "text-warning/70"
                    )}>
                      {ev.classification === "INVALID" ? "VIOLATED CONSTRAINTS" : "RISK CONSTRAINTS"}
                    </p>
                    {ev.violatedConstraints.map((vc, i) => (
                      <p key={i} className={cn(
                        "text-[10px] font-mono",
                        ev.classification === "INVALID" ? "text-destructive/80" : "text-warning/80"
                      )}>
                        · {vc}
                      </p>
                    ))}
                  </div>
                )}

                {/* Reasons */}
                {ev.reasons.length > 0 && (
                  <ul className="space-y-1 pl-2 border-l border-muted">
                    {ev.reasons.map((r, i) => (
                      <ReasonLine key={i} reason={r} />
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
