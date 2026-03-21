import { cn } from "@/lib/utils";

export type QueryMode = "guided" | "natural";

interface QueryModeSwitcherProps {
  mode: QueryMode;
  onChange: (mode: QueryMode) => void;
}

export function QueryModeSwitcher({ mode, onChange }: QueryModeSwitcherProps) {
  return (
    <div className="flex gap-0 border border-border w-fit mb-6">
      {(["guided", "natural"] as QueryMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "px-4 py-1.5 text-[10px] font-mono tracking-widest transition-colors",
            mode === m
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          )}
        >
          {m === "guided" ? "GUIDED FORM" : "NATURAL LANGUAGE"}
        </button>
      ))}
    </div>
  );
}
