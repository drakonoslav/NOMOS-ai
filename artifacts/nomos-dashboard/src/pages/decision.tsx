import { useGetNomosState } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function DecisionPage() {
  const { data: state } = useGetNomosState();
  if (!state) return null;

  const d = state.decision;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-primary bg-primary/5">
          <CardHeader className="pb-2 border-none bg-transparent"><CardTitle>SELECTED CANDIDATE</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl font-mono text-primary break-all">{d.selectedPlanId || "NONE"}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2 border-none bg-transparent"><CardTitle>RANKED CANDIDATES</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-mono text-primary">{d.rankedCandidateCount}</div>
            <div className="text-xs font-mono text-muted-foreground mt-2">Passed feasibility & robustness</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 border-none bg-transparent"><CardTitle>REJECTED CANDIDATES</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-mono text-destructive">{d.rejectedCandidateCount}</div>
            <div className="text-xs font-mono text-muted-foreground mt-2">Violated Laws I or II</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>DECISION ENGINE METRICS</CardTitle></CardHeader>
        <CardContent className="p-6 space-y-6 font-mono">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-[10px] text-muted-foreground tracking-widest mb-2 uppercase">ROBUSTNESS RADIUS (ε)</h4>
              <div className="text-2xl text-primary">{d.robustnessEpsilon.toFixed(8)}</div>
              <p className="text-xs text-muted-foreground mt-2 max-w-sm">
                Minimum margin to constraint violation under bounded disturbances. Must be {'>'} εx to satisfy Law II.
              </p>
            </div>
            
            <div>
              <h4 className="text-[10px] text-muted-foreground tracking-widest mb-2 uppercase">TOP REJECTION REASON</h4>
              <div className="bg-background border border-border p-4 min-h-[80px] text-sm text-destructive break-words">
                {d.topRejectionReason || "No rejections recorded."}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
