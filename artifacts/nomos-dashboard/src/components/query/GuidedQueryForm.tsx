import { GuidedQueryDraft, GuidedCandidateDraft } from "@/query/query_types";
import { ListEditor } from "./ListEditor";
import { Loader2, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuidedQueryFormProps {
  value: GuidedQueryDraft;
  onChange: (next: GuidedQueryDraft) => void;
  onParse: () => void;
  onReset: () => void;
  isParsing: boolean;
  canParse: boolean;
}

function SectionHeader({ label, description }: { label: string; description?: string }) {
  return (
    <div className="border-b border-border pb-2 mb-3">
      <p className="text-[10px] font-mono tracking-widest text-muted-foreground">{label}</p>
      {description && (
        <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{description}</p>
      )}
    </div>
  );
}

function nextCandidateId(candidates: GuidedCandidateDraft[]): string {
  return String.fromCharCode(65 + candidates.length);
}

export function GuidedQueryForm({
  value,
  onChange,
  onParse,
  onReset,
  isParsing,
  canParse,
}: GuidedQueryFormProps) {
  function set<K extends keyof GuidedQueryDraft>(key: K, val: GuidedQueryDraft[K]) {
    onChange({ ...value, [key]: val });
  }

  function updateCandidate(idx: number, next: GuidedCandidateDraft) {
    const updated = [...value.candidates];
    updated[idx] = next;
    set("candidates", updated);
  }

  function removeCandidate(idx: number) {
    const filtered = value.candidates.filter((_, i) => i !== idx);
    const reindexed = filtered.map((c, i) => ({
      ...c,
      id: String.fromCharCode(65 + i),
    }));
    set("candidates", reindexed);
  }

  function addCandidate() {
    set("candidates", [
      ...value.candidates,
      { id: nextCandidateId(value.candidates), description: "", notes: "" },
    ]);
  }

  return (
    <div className="space-y-8">
      {/* State Section */}
      <div>
        <SectionHeader
          label="STATE"
          description="Describe the current situation and any known facts, constraints, or unknowns."
        />
        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-mono tracking-widest text-muted-foreground mb-1.5">
              SITUATION
            </p>
            <textarea
              value={value.situation}
              onChange={(e) => set("situation", e.target.value)}
              placeholder="Describe the current situation in plain terms."
              rows={3}
              className="w-full bg-muted/40 border border-muted px-3 py-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none"
            />
          </div>
          <ListEditor
            label="FACTS"
            description='Known, non-negotiable facts. E.g. "Current position is stable." "Fuel is low."'
            values={value.facts}
            onChange={(v) => set("facts", v)}
            placeholder="Fact..."
          />
          <ListEditor
            label="CONSTRAINTS"
            description='Hard limits. E.g. "Must avoid income gap > 2 months." "Fuel must remain non-negative."'
            values={value.constraints}
            onChange={(v) => set("constraints", v)}
            placeholder="Constraint..."
            accentClass="border-warning/30"
          />
          <ListEditor
            label="UNCERTAINTIES"
            description='Unknown or unclear factors. E.g. "Culture at new job unclear." "Market conditions uncertain."'
            values={value.uncertainties}
            onChange={(v) => set("uncertainties", v)}
            placeholder="Uncertainty..."
            accentClass="border-muted-foreground/30"
          />
        </div>
      </div>

      {/* Candidates Section */}
      <div>
        <SectionHeader
          label="CANDIDATES"
          description="List the candidate actions to evaluate."
        />
        <div className="space-y-3">
          {value.candidates.map((c, idx) => (
            <div key={idx} className="border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-widest text-muted-foreground">
                  CANDIDATE {c.id}
                </span>
                <button
                  onClick={() => removeCandidate(idx)}
                  className="text-muted-foreground/50 hover:text-destructive transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={c.description}
                onChange={(e) =>
                  updateCandidate(idx, { ...c, description: e.target.value })
                }
                placeholder="Describe this candidate action..."
                className="w-full bg-muted/40 border border-muted px-3 py-1.5 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          ))}
          <button
            onClick={addCandidate}
            className="flex items-center gap-2 border border-dashed border-muted px-4 py-2 text-[10px] font-mono tracking-widest text-muted-foreground/60 hover:text-muted-foreground hover:border-muted-foreground/40 transition-colors w-full"
          >
            <Plus className="w-3.5 h-3.5" />
            ADD CANDIDATE
          </button>
        </div>
      </div>

      {/* Objective Section */}
      <div>
        <SectionHeader label="OBJECTIVE" description="What outcome matters most?" />
        <textarea
          value={value.objective}
          onChange={(e) => set("objective", e.target.value)}
          placeholder="What outcome matters most?"
          rows={2}
          className="w-full bg-muted/40 border border-muted px-3 py-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none"
        />
      </div>

      {/* Form Actions */}
      <div className="flex items-center gap-3 pt-2">
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
