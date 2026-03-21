import { useGetNomosState } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVector, formatTimestamp, cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import { motion } from "framer-motion";

export default function OverviewPage() {
  const { data: state } = useGetNomosState();
  if (!state) return null;

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

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Hero Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardHeader className="py-3 px-4"><CardTitle>VERIFICATION STATUS</CardTitle></CardHeader>
          <CardContent className="p-4 flex items-center justify-center min-h-24">
            <span className={cn("text-2xl font-mono tracking-widest font-bold", getStatusColor(state.verificationStatus))}>
              {state.verificationStatus}
            </span>
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="py-3 px-4"><CardTitle>AUTHORITY</CardTitle></CardHeader>
          <CardContent className="p-4 flex items-center justify-center min-h-24">
            <span className={cn("text-2xl font-mono tracking-widest font-bold", getStatusColor(state.authority))}>
              {state.authority}
            </span>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="py-3 px-4"><CardTitle>SELECTED PLAN</CardTitle></CardHeader>
          <CardContent className="p-4 flex items-center justify-center min-h-24">
            <span className="text-sm font-mono text-primary text-center break-all">
              {state.decision.selectedPlanId || "NONE"}
            </span>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="py-3 px-4"><CardTitle>ACTION OUTCOME</CardTitle></CardHeader>
          <CardContent className="p-4 flex items-center justify-center min-h-24 text-center">
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
