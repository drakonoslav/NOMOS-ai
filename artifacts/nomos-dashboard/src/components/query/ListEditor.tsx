import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListEditorProps {
  label: string;
  description?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  accentClass?: string;
}

export function ListEditor({
  label,
  description,
  values,
  onChange,
  placeholder = "Add entry...",
  accentClass = "border-muted",
}: ListEditorProps) {
  function update(idx: number, val: string) {
    const next = [...values];
    next[idx] = val;
    onChange(next);
  }

  function remove(idx: number) {
    onChange(values.filter((_, i) => i !== idx));
  }

  function add() {
    onChange([...values, ""]);
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[10px] font-mono tracking-widest text-muted-foreground">{label}</p>
        {description && (
          <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{description}</p>
        )}
      </div>
      <div className="space-y-1.5">
        {values.map((val, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={val}
              onChange={(e) => update(idx, e.target.value)}
              placeholder={placeholder}
              className={cn(
                "flex-1 bg-muted/40 border px-3 py-1.5 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors",
                accentClass
              )}
            />
            <button
              onClick={() => remove(idx)}
              className="text-muted-foreground/50 hover:text-destructive transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={add}
          className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-1"
        >
          <Plus className="w-3 h-3" />
          ADD ENTRY
        </button>
      </div>
    </div>
  );
}
