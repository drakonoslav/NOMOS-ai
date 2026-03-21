import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface NaturalLanguageFormProps {
  value: string;
  onChange: (v: string) => void;
  onParse: () => void;
  onReset: () => void;
  isParsing: boolean;
  canParse: boolean;
}

const PLACEHOLDER = `STATE:
- Current job is stable with regular income.
- Received offer for a new position paying 25% more.

CONSTRAINTS:
- Must avoid income gap longer than 6 weeks.
- Cannot accept a role requiring relocation.

UNCERTAINTIES:
- Culture at new organization is unclear.
- Stability of new employer unknown.

CANDIDATES:
A: Stay in current role.
B: Accept the new offer.
C: Negotiate a counter-offer with current employer.

OBJECTIVE:
Maximize long-term career stability while maintaining minimum income continuity.`;

const PROMPT_HINTS = [
  {
    label: "Candidate Evaluation",
    desc: "Given a state and constraints, which candidate actions are lawful?",
  },
  {
    label: "Boundary Question",
    desc: "What makes Candidate B violate a constraint?",
  },
  {
    label: "Transition Question",
    desc: "What would need to change for Candidate C to become fully lawful?",
  },
  {
    label: "Margin Question",
    desc: "Which constraint is closest to failure under Candidate A?",
  },
];

export function NaturalLanguageForm({
  value,
  onChange,
  onParse,
  onReset,
  isParsing,
  canParse,
}: NaturalLanguageFormProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-mono tracking-widest text-muted-foreground mb-1.5">
          NATURAL LANGUAGE INPUT
        </p>
        <p className="text-[10px] font-mono text-muted-foreground/60 mb-3">
          Paste your query in plain language. Use the template format below for best results.
          The parser will extract state, constraints, candidates, and objective.
        </p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={16}
          className="w-full bg-muted/40 border border-muted px-3 py-2.5 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/50 transition-colors resize-none leading-relaxed"
        />
      </div>

      {/* Prompt hints */}
      <div className="border border-border bg-muted/10 p-4">
        <p className="text-[10px] font-mono tracking-widest text-muted-foreground mb-3">
          QUERY TEMPLATES
        </p>
        <div className="space-y-2">
          {PROMPT_HINTS.map((hint) => (
            <div key={hint.label} className="flex gap-2">
              <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 w-36">
                {hint.label}:
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/50 leading-relaxed">
                {hint.desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onParse}
          disabled={!canParse || isParsing}
          className={cn(
            "flex items-center gap-2 px-5 py-2 text-[11px] font-mono tracking-widest transition-colors",
            canParse && !isParsing
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {isParsing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          PARSE SUBMISSION
        </button>
        <button
          onClick={onReset}
          className="px-4 py-2 text-[11px] font-mono tracking-widest text-muted-foreground hover:text-foreground border border-border hover:border-muted-foreground/40 transition-colors"
        >
          RESET
        </button>
      </div>
    </div>
  );
}
