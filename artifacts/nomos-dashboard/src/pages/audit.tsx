import { useGetNomosState } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVector, formatTimestamp, cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Database } from "lucide-react";
import { useScenario } from "@/context/scenario-context";
import { DecisiveTrendPanel } from "@/ui/components/nomos/DecisiveTrendPanel";
import { FailurePredictionPanel } from "@/ui/components/nomos/FailurePredictionPanel";

export default function AuditPage() {
  const { scenario } = useScenario();
  const { data: state } = useGetNomosState({ scenario });
  if (!state) return null;

  const a = state.audit;

  const getOutcomeColor = (status: string) => {
    if (status === "APPLIED") return "text-success border-success/50 bg-success/5";
    if (status === "DEGRADED_ACTION_APPLIED") return "text-warning border-warning/50 bg-warning/5";
    return "text-destructive border-destructive/50 bg-destructive/5";
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      <div className="flex items-center gap-3 mb-8">
        <Database className="w-8 h-8 text-muted-foreground" />
        <h1 className="text-2xl font-mono tracking-widest text-primary uppercase">Audit Record</h1>
      </div>

      <Card className={cn("border-2", getOutcomeColor(a.outcome))}>
        <CardHeader className="border-b border-inherit">
          <CardTitle className="text-inherit flex items-center justify-between">
            <span>TRANSACTION OVERVIEW</span>
            <Badge variant="outline" className="text-inherit border-inherit bg-transparent">{a.outcome}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-2 gap-6 font-mono text-sm">
          <div>
            <span className="text-[10px] text-muted-foreground tracking-widest block mb-1">RECORD ID</span>
            <span className="text-primary break-all">{a.recordId}</span>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground tracking-widest block mb-1">TIMESTAMP</span>
            <span className="text-primary">{formatTimestamp(a.timestamp)}</span>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground tracking-widest block mb-1">FINAL VERIFICATION</span>
            <span className="text-primary">{a.verificationStatus}</span>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground tracking-widest block mb-1">APPLIED CONTROL COMMAND</span>
            <div className="bg-background border border-border p-2 mt-1 truncate">
              {formatVector(a.appliedControl)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>AUDIT NOTES</CardTitle></CardHeader>
        <CardContent className="p-6">
          {a.notes.length > 0 ? (
            <ul className="space-y-4 font-mono text-xs">
              {a.notes.map((note, i) => (
                <li key={i} className="flex gap-4 p-3 bg-secondary/20 border border-border/50">
                  <span className="text-muted-foreground">[{String(i+1).padStart(2, '0')}]</span>
                  <span className="text-primary leading-relaxed">{note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center p-8 border border-dashed border-border text-muted-foreground font-mono text-xs">
              NO NOTES RECORDED FOR THIS TRANSACTION
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DecisiveTrendPanel />
        <FailurePredictionPanel />
      </div>

      <div className="text-center mt-12 font-mono text-[10px] text-muted-foreground tracking-widest">
        TAMPER-EVIDENT LOGGING ACTIVE. ALL STATE CHANGES RECORDED.
      </div>
    </motion.div>
  );
}
