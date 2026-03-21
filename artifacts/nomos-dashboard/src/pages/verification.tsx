import { useGetNomosState } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, X, ShieldAlert, ShieldOff } from "lucide-react";
import { motion } from "framer-motion";
import { useScenario } from "@/context/scenario-context";
import { useToneMessage } from "@/ui/tone/useToneMessage";

export default function VerificationPage() {
  const { scenario } = useScenario();
  const { data: state } = useGetNomosState({ scenario });
  if (!state) return null;

  const v = state.verification;
  const tone = useToneMessage(state);

  const statusColorClass =
    v.status === "LAWFUL" ? "text-success" :
    v.status === "DEGRADED" ? "text-warning" :
    "text-destructive";

  const borderColorClass =
    v.status === "LAWFUL" ? "border-success/50 bg-success/5" :
    v.status === "DEGRADED" ? "border-warning/50 bg-warning/5" :
    "border-destructive/50 bg-destructive/5";

  const checks = [
    { label: "FEASIBILITY", ok: v.feasibilityOk, law: "LAW I" },
    { label: "ROBUSTNESS", ok: v.robustnessOk, law: "LAW II" },
    { label: "OBSERVABILITY", ok: v.observabilityOk, law: "LAW III" },
    { label: "IDENTIFIABILITY", ok: v.identifiabilityOk, law: "LAW III" },
    { label: "MODEL VALIDITY", ok: v.modelOk, law: "LAW IV" },
    { label: "ADAPTATION", ok: v.adaptationOk, law: "LAW IV" },
  ];

  const StatusIcon = v.status === "LAWFUL" ? ShieldAlert : ShieldOff;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Supremacy Rule Banner */}
      <div className="bg-secondary/30 border border-border p-4 flex items-center justify-center font-mono text-xs tracking-widest text-muted-foreground">
        <span>SUPREMACY RULE: </span>
        <span className="text-primary ml-2">FEASIBILITY {'>'} ROBUSTNESS {'>'} OBSERVABILITY {'>'} ADAPTATION</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* Left Column: Status Hero + Tone Summary */}
        <div className="md:col-span-1 space-y-4">
          <Card className={cn("border-2", borderColorClass)}>
            <CardHeader className="border-none pb-0">
              <CardTitle className="text-center">FINAL STATUS</CardTitle>
            </CardHeader>
            <CardContent className="p-6 flex flex-col items-center justify-center gap-4">
              <StatusIcon className={cn("w-14 h-14", statusColorClass)} />
              <span className={cn("text-3xl font-bold tracking-widest font-mono", statusColorClass)}>
                {v.status}
              </span>
            </CardContent>
          </Card>

          {/* Tone-Aware Summary Panel */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="py-3 px-4 border-b border-border/30">
              <CardTitle className="text-[10px] tracking-widest text-muted-foreground/60">
                EPISTEMIC SUMMARY — TONE: {tone.toneLevel}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                {tone.verification.summary}
              </p>
              {tone.verification.body && tone.verification.body.length > 0 && (
                <ul className="space-y-1 border-t border-border/30 pt-3">
                  {tone.verification.body.map((d) => (
                    <li key={d} className="text-[11px] font-mono text-muted-foreground/60 flex gap-2">
                      <span className="text-primary/40 shrink-0">›</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-border/30 pt-3">
                <span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest">
                  AUTHORITY: {tone.authority.label}
                </span>
                <p className="text-[11px] font-mono text-muted-foreground/50 mt-1">
                  {tone.authority.summary}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>VERIFICATION LOG</CardTitle></CardHeader>
            <CardContent className="p-4 bg-background">
              {v.reasons.length > 0 ? (
                <ul className="space-y-2 font-mono text-xs">
                  {v.reasons.map((r, i) => (
                    <li key={i} className="flex gap-2 text-muted-foreground">
                      <span className="text-primary">{'>'}</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="font-mono text-xs text-muted-foreground">No fault conditions registered.</span>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Detailed Matrix */}
        <div className="md:col-span-2">
          <Card className="h-full">
            <CardHeader><CardTitle>CONSTITUTIONAL LAWS EVALUATION</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {checks.map((check, i) => (
                  <div key={i} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-secondary/10 transition-colors">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-muted-foreground">{check.law}</Badge>
                        <span className="font-mono text-sm tracking-widest text-primary font-bold">{check.label}</span>
                      </div>
                    </div>

                    <div className={cn(
                      "flex items-center gap-2 font-mono text-sm font-bold tracking-widest px-4 py-2 border",
                      check.ok
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-destructive/10 text-destructive border-destructive/20"
                    )}>
                      {check.ok ? <Check size={16} /> : <X size={16} />}
                      {check.ok ? "SATISFIED" : "VIOLATED"}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
