import { NomosQuery, SubmissionCompleteness, ParserConfidence } from "@/query/query_types";
import { cn } from "@/lib/utils";

interface ParsePreviewPanelProps {
  parsedQuery?: NomosQuery;
  parseErrors: string[];
  previewAccepted: boolean;
  onAcceptPreview: (accepted: boolean) => void;
}

const completenessColor: Record<SubmissionCompleteness, string> = {
  COMPLETE: "text-success border-success/40",
  PARTIAL: "text-warning border-warning/40",
  INSUFFICIENT: "text-destructive border-destructive/40",
};

const confidenceColor: Record<ParserConfidence, string> = {
  HIGH: "text-success",
  MEDIUM: "text-warning",
  LOW: "text-muted-foreground",
};

function PreviewList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) {
    return (
      <div>
        <p className="text-[10px] font-mono tracking-widest text-muted-foreground mb-1">{label}</p>
        <p className="text-[10px] font-mono text-muted-foreground/40 italic">None detected.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[10px] font-mono tracking-widest text-muted-foreground mb-1.5">{label}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-[11px] font-mono text-foreground/80 pl-2 border-l border-muted">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ParsePreviewPanel({
  parsedQuery,
  parseErrors,
  previewAccepted,
  onAcceptPreview,
}: ParsePreviewPanelProps) {
  if (parseErrors.length > 0) {
    return (
      <div className="border border-destructive/40 bg-destructive/5 p-4">
        <p className="text-[10px] font-mono tracking-widest text-destructive mb-2">PARSE ERROR</p>
        {parseErrors.map((e, i) => (
          <p key={i} className="text-[11px] font-mono text-destructive/80">{e}</p>
        ))}
      </div>
    );
  }

  if (!parsedQuery) {
    return (
      <div className="border border-border bg-muted/10 p-4">
        <p className="text-[10px] font-mono tracking-widest text-muted-foreground mb-2">
          PARSE PREVIEW
        </p>
        <p className="text-[11px] font-mono text-muted-foreground/50">
          No parsed query yet. Submit input and click Parse Submission.
        </p>
      </div>
    );
  }

  const q = parsedQuery;

  return (
    <div className="border border-border bg-muted/10 space-y-0">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <p className="text-[10px] font-mono tracking-widest text-muted-foreground">PARSE PREVIEW</p>
        <span
          className={cn(
            "text-[10px] font-mono tracking-widest border px-2 py-0.5",
            completenessColor[q.completeness]
          )}
        >
          {q.completeness}
        </span>
      </div>

      <div className="p-4 space-y-5">
        {/* State */}
        <div className="space-y-3">
          <p className="text-[10px] font-mono tracking-widest text-muted-foreground/60">
            — PARSED STATE —
          </p>
          {q.state.description && (
            <div>
              <p className="text-[10px] font-mono tracking-widest text-muted-foreground mb-1">
                DESCRIPTION
              </p>
              <p className="text-[11px] font-mono text-foreground/80 leading-relaxed">
                {q.state.description}
              </p>
            </div>
          )}
          <PreviewList label="FACTS" items={q.state.facts} />
          <PreviewList label="CONSTRAINTS" items={q.state.constraints} />
          <PreviewList label="UNCERTAINTIES" items={q.state.uncertainties} />
        </div>

        {/* Candidates */}
        <div>
          <p className="text-[10px] font-mono tracking-widest text-muted-foreground/60 mb-2">
            — PARSED CANDIDATES —
          </p>
          {q.candidates.length === 0 ? (
            <p className="text-[10px] font-mono text-muted-foreground/40 italic">
              No candidates detected.
            </p>
          ) : (
            <div className="space-y-1.5">
              {q.candidates.map((c) => (
                <div key={c.id} className="flex gap-3 items-start">
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-6">
                    {c.id}:
                  </span>
                  <span className="text-[11px] font-mono text-foreground/80">{c.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Objective */}
        <div>
          <p className="text-[10px] font-mono tracking-widest text-muted-foreground/60 mb-2">
            — PARSED OBJECTIVE —
          </p>
          {q.objective ? (
            <p className="text-[11px] font-mono text-foreground/80">{q.objective.description}</p>
          ) : (
            <p className="text-[10px] font-mono text-muted-foreground/40 italic">
              No objective detected.
            </p>
          )}
        </div>

        {/* Diagnostics */}
        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-[10px] font-mono tracking-widest text-muted-foreground/60 mb-2">
            — PARSER DIAGNOSTICS —
          </p>
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[10px] font-mono text-muted-foreground">CONFIDENCE: </span>
              <span className={cn("text-[10px] font-mono tracking-widest", confidenceColor[q.parserConfidence])}>
                {q.parserConfidence}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-muted-foreground">COMPLETENESS: </span>
              <span className={cn("text-[10px] font-mono tracking-widest", completenessColor[q.completeness])}>
                {q.completeness}
              </span>
            </div>
          </div>
          {q.notes.length > 0 && (
            <div className="space-y-1 mt-2">
              <p className="text-[10px] font-mono tracking-widest text-muted-foreground">FINDINGS</p>
              {q.notes.map((note, i) => (
                <p key={i} className="text-[10px] font-mono text-muted-foreground/60">
                  · {note}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Confirmation control */}
        <div className="border-t border-border pt-4">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={previewAccepted}
              onChange={(e) => onAcceptPreview(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span className="text-[11px] font-mono text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
              I confirm this structured query matches my intended submission.
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
