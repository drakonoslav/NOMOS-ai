import { useGetNomosState } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVector, formatTimestamp, cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { useScenario } from "@/context/scenario-context";
import { useToneMessage } from "@/ui/tone/useToneMessage";
import { SCENARIO_DESCRIPTORS } from "@/demo/scenario_builder";
import type { ScenarioDescriptor } from "@/demo/scenario_types";

function scenarioStatusColor(status: string): string {
  if (status === "LAWFUL")   return "text-success";
  if (status === "DEGRADED") return "text-warning";
  return "text-destructive";
}

function scenarioBorderColor(status: string): string {
  if (status === "LAWFUL")   return "border-success/40 hover:border-success/70";
  if (status === "DEGRADED") return "border-warning/40 hover:border-warning/70";
  return "border-destructive/40 hover:border-destructive/70";
}

function scenarioActiveBg(status: string): string {
  if (status === "LAWFUL")   return "bg-success/5 border-success/70";
  if (status === "DEGRADED") return "bg-warning/5 border-warning/70";
  return "bg-destructive/5 border-destructive/70";
}

interface ScenarioCardProps {
  descriptor: ScenarioDescriptor;
  isActive: boolean;
  onSelect: () => void;
}

function ScenarioCard({ descriptor: d, isActive, onSelect }: ScenarioCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "text-left w-full border bg-card p-4 transition-colors cursor-pointer",
        isActive
          ? scenarioActiveBg(d.verificationStatus)
          : cn("border-border", scenarioBorderColor(d.verificationStatus))
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={cn(
          "font-mono text-[10px] font-bold tracking-widest uppercase",
          scenarioStatusColor(d.verificationStatus)
        )}>
          {d.label}
        </span>
        {isActive && (
          <span className="font-mono text-[9px] text-muted-foreground tracking-widest">
            ACTIVE
          </span>
        )}
      </div>

      {/* Outcome row */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Badge variant={d.verificationStatus === "LAWFUL" ? "success" : d.verificationStatus === "DEGRADED" ? "warning" : "destructive"} className="text-[9px]">
          {d.verificationStatus}
        </Badge>
        <Badge variant="outline" className="text-[9px] text-muted-foreground">
          {d.authority}
        </Badge>
        <Badge variant="outline" className="text-[9px] text-muted-foreground">
          {d.actionOutcome.replace(/_/g, " ")}
        </Badge>
      </div>

      {/* Description */}
      <p className="font-mono text-[11px] text-muted-foreground leading-relaxed mb-3">
        {d.description}
      </p>

      {/* Teaching point */}
      <div className="border-t border-border/40 pt-2">
        <p className={cn(
          "font-mono text-[10px] italic leading-relaxed",
          scenarioStatusColor(d.verificationStatus)
        )}>
          {d.teachingPoint}
        </p>
      </div>
    </button>
  );
}

export default function OverviewPage() {
  const { scenario, setScenario } = useScenario();
  const { data: state } = useGetNomosState({ scenario });
  if (!state) return null;

  const tone = useToneMessage(state);

  const checks = [
    { label: "FEASIBILITY", ok: state.verification.feasibilityOk },
    { label: "ROBUSTNESS", ok: state.verification.robustnessOk },
    { label: "OBSERVABILITY", ok: state.verification.observabilityOk },
    { label: "IDENTIFIABILITY", ok: state.verification.identifiabilityOk },
    { label: "MODEL VALIDITY", ok: state.verification.modelOk },
    { label: "ADAPTATION", ok: state.verification.adaptationOk },
  ];

  const getStatusColor = (status: string) => {
    if (["LAWFUL", "AUTHORIZED", "APPLIED"].includes(status)) return "text-success";
    if (["DEGRADED", "CONSTRAINED", "DEGRADED_ACTION_APPLIED"].includes(status)) return "text-warning";
    return "text-destructive";
  };

  const toneStatusColor = getStatusColor(state.verificationStatus);
  const toneAuthColor = getStatusColor(state.authority);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Scenario Selector */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[9px] font-mono tracking-widest text-muted-foreground uppercase">
            Runtime Scenario
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/40">
            — select to switch the full constitutional chain
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SCENARIO_DESCRIPTORS.map((d) => (
            <ScenarioCard
              key={d.id}
              descriptor={d}
              isActive={scenario === d.id}
              onSelect={() => setScenario(d.id)}
            />
          ))}
        </div>
      </div>

      {/* Tone-Aware Status + Authority Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* StatusCard — tone-aware */}
        <Card className={cn(
          "bg-card border-l-4",
          state.verificationStatus === "LAWFUL" ? "border-l-success/60" :
          state.verificationStatus === "DEGRADED" ? "border-l-warning/60" :
          "border-l-destructive/60"
        )}>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-[10px] tracking-widest text-muted-foreground">VERIFICATION STATUS</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <div className={cn("text-3xl font-mono tracking-widest font-bold", toneStatusColor)}>
              {tone.verification.title}
            </div>
            <p className="text-xs font-mono text-muted-foreground leading-relaxed">
              {tone.verification.summary}
            </p>
            {tone.verification.details && tone.verification.details.length > 0 && (
              <ul className="mt-2 space-y-1">
                {tone.verification.details.map((d) => (
                  <li key={d} className="text-[11px] font-mono text-muted-foreground/70 flex gap-2">
                    <span className="text-primary/40">›</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="pt-1">
              <span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest">
                TONE: {tone.toneLevel}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* AuthorityCard — tone-aware */}
        <Card className={cn(
          "bg-card border-l-4",
          state.authority === "AUTHORIZED" ? "border-l-success/60" :
          state.authority === "CONSTRAINED" ? "border-l-warning/60" :
          "border-l-destructive/60"
        )}>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-[10px] tracking-widest text-muted-foreground">AUTHORITY</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <div className={cn("text-3xl font-mono tracking-widest font-bold", toneAuthColor)}>
              {tone.authority.label}
            </div>
            <p className="text-xs font-mono text-muted-foreground leading-relaxed">
              {tone.authority.summary}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Plan + Outcome Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-card">
          <CardHeader className="py-3 px-4"><CardTitle>SELECTED PLAN</CardTitle></CardHeader>
          <CardContent className="p-4 flex items-center justify-center min-h-16">
            <span className="text-sm font-mono text-primary text-center break-all">
              {state.decision.selectedPlanId || "NONE"}
            </span>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="py-3 px-4"><CardTitle>ACTION OUTCOME</CardTitle></CardHeader>
          <CardContent className="p-4 flex items-center justify-center min-h-16 text-center">
            <span className={cn("text-lg font-mono tracking-widest font-bold", getStatusColor(state.actionOutcome))}>
              {state.actionOutcome.replace(/_/g, " ")}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-border bg-card/50 p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">MODEL CONFIDENCE</span>
          <span className="text-xl font-mono text-primary mt-2">{state.modelConfidenceScore.toFixed(4)}</span>
        </div>
        <div className="border border-border bg-card/50 p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">BELIEF UNCERTAINTY (εx)</span>
          <span className="text-xl font-mono text-primary mt-2">{state.belief.epsilonX.toFixed(6)}</span>
        </div>
        <div className="border border-border bg-card/50 p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">ROBUSTNESS RADIUS (ε)</span>
          <span className="text-xl font-mono text-primary mt-2">{state.decision.robustnessEpsilon.toFixed(6)}</span>
        </div>
        <div className="border border-border bg-card/50 p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">PROPOSALS GENERATED</span>
          <span className="text-xl font-mono text-primary mt-2">{state.proposalCount}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Verification Matrix */}
        <Card>
          <CardHeader><CardTitle>CONSTITUTIONAL VERIFICATION MATRIX</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50 font-mono text-sm">
              {checks.map((check, i) => (
                <div key={i} className="flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors">
                  <span className="tracking-widest text-muted-foreground">{check.label}</span>
                  {check.ok ? (
                    <Badge variant="success" className="w-20 justify-center"><Check size={12} className="mr-1"/> PASS</Badge>
                  ) : (
                    <Badge variant="destructive" className="w-20 justify-center"><X size={12} className="mr-1"/> FAIL</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Belief Snapshot */}
        <Card>
          <CardHeader><CardTitle>CURRENT BELIEF SNAPSHOT</CardTitle></CardHeader>
          <CardContent className="p-6 space-y-6">
            <div>
              <span className="block text-[10px] font-mono text-muted-foreground uppercase mb-1">STATE VECTOR (xHat)</span>
              <div className="bg-secondary/50 border border-border p-3 font-mono text-sm text-primary tracking-wider break-all">
                {formatVector(state.belief.xHat)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-[10px] font-mono text-muted-foreground uppercase mb-1">IDENTIFIABILITY</span>
                <Badge variant={state.belief.identifiability === "FULL" ? "success" : "warning"}>
                  {state.belief.identifiability}
                </Badge>
              </div>
              <div>
                <span className="block text-[10px] font-mono text-muted-foreground uppercase mb-1">STALENESS</span>
                <span className="font-mono text-sm text-primary">{state.belief.staleByMs} ms</span>
              </div>
            </div>

            <div>
              <span className="block text-[10px] font-mono text-muted-foreground uppercase mb-1">LAST PROVENANCE</span>
              <span className="font-mono text-xs text-muted-foreground">
                {state.belief.provenance[state.belief.provenance.length - 1]}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Latest Audit */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader><CardTitle>LATEST AUDIT RECORD</CardTitle></CardHeader>
        <CardContent className="p-6 font-mono text-sm grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase mb-1">TIMESTAMP</span>
            <span className="text-primary">{formatTimestamp(state.audit.timestamp)}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase mb-1">RECORD ID</span>
            <span className="text-primary break-all">{state.audit.recordId}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase mb-1">APPLIED CONTROL</span>
            <span className="text-primary">{formatVector(state.audit.appliedControl)}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
