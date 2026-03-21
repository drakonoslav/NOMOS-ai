import { SubmissionCompleteness } from "@/query/query_types";
import { cn } from "@/lib/utils";

interface QueryPageHeaderProps {
  completeness?: SubmissionCompleteness;
}

const completenessStyle: Record<SubmissionCompleteness, string> = {
  COMPLETE: "border-success/60 text-success",
  PARTIAL: "border-warning/60 text-warning",
  INSUFFICIENT: "border-destructive/60 text-destructive",
};

export function QueryPageHeader({ completeness }: QueryPageHeaderProps) {
  return (
    <div className="border-b border-border pb-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xs tracking-widest font-mono text-muted-foreground mb-1">
            NOMOS / QUERY BUILDER
          </h1>
          <p className="text-[11px] font-mono text-muted-foreground/70 leading-relaxed">
            Submit state, constraints, candidates, and objective for constitutional evaluation.
            <br />
            Parse first. Review the structured interpretation. Confirm before evaluation.
          </p>
        </div>
        {completeness && (
          <div
            className={cn(
              "shrink-0 border px-3 py-1 text-[10px] font-mono tracking-widest",
              completenessStyle[completeness]
            )}
          >
            {completeness}
          </div>
        )}
      </div>
    </div>
  );
}
