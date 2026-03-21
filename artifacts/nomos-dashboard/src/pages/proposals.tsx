import * as React from "react";
import { useGetNomosState } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVector, cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function ProposalsPage() {
  const { data: state } = useGetNomosState();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  if (!state) return null;

  const proposals = state.proposals;
  const selectedProposal = proposals.find(p => p.id === selectedId) || proposals[0];

  React.useEffect(() => {
    if (!selectedId && proposals.length > 0) {
      setSelectedId(proposals[0].id);
    }
  }, [proposals, selectedId]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-border bg-card p-4">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">TOTAL PROPOSALS</span>
          <div className="text-2xl font-mono mt-1 text-primary">{state.proposalCount}</div>
        </div>
        <div className="border border-border bg-card p-4">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">REJECTED FRAGMENTS</span>
          <div className="text-2xl font-mono mt-1 text-destructive">{state.rejectedFragmentCount}</div>
        </div>
        <div className="border border-border bg-card p-4">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">LAWFUL PROPOSALS</span>
          <div className="text-2xl font-mono mt-1 text-muted-foreground">0</div>
        </div>
      </div>

      {state.proposalReasons.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader className="py-2 px-4 bg-warning/10"><CardTitle className="text-warning">PROPOSAL ENGINE NOTES</CardTitle></CardHeader>
          <CardContent className="p-4">
            <ul className="list-disc list-inside font-mono text-xs text-muted-foreground space-y-1">
              {state.proposalReasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-2">
          <h3 className="font-mono text-xs tracking-widest text-muted-foreground mb-4">CANDIDATE POOL</h3>
          {proposals.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={cn(
                "w-full text-left p-4 border transition-colors flex flex-col gap-2",
                selectedId === p.id 
                  ? "bg-secondary border-primary" 
                  : "bg-card border-border hover:border-primary/50 hover:bg-secondary/30"
              )}
            >
              <div className="flex justify-between items-start w-full">
                <span className="font-mono text-xs text-primary truncate max-w-[150px]">{p.id}</span>
                <Badge variant={p.confidence === "HIGH" ? "success" : p.confidence === "MEDIUM" ? "warning" : "outline"}>
                  {p.confidence}
                </Badge>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">{p.kind}</span>
              <Badge variant="destructive" className="mt-1 self-start opacity-80">NON-AUTHORITATIVE</Badge>
            </button>
          ))}
          {proposals.length === 0 && (
             <div className="p-8 text-center border border-dashed border-border text-muted-foreground font-mono text-xs">
               NO PROPOSALS GENERATED
             </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {selectedProposal ? (
            <Card className="h-full">
              <CardHeader className="flex flex-row justify-between items-center">
                <CardTitle>PROPOSAL DETAILS</CardTitle>
                <Badge variant="destructive">LAWFUL: FALSE</Badge>
              </CardHeader>
              <CardContent className="p-6 space-y-8 font-mono">
                
                <div>
                  <h4 className="text-[10px] text-muted-foreground tracking-widest mb-2 border-b border-border/50 pb-1">IDENTIFIER</h4>
                  <p className="text-sm text-primary">{selectedProposal.id}</p>
                </div>

                <div>
                  <h4 className="text-[10px] text-muted-foreground tracking-widest mb-2 border-b border-border/50 pb-1">KIND</h4>
                  <p className="text-sm text-primary">{selectedProposal.kind}</p>
                </div>

                <div>
                  <h4 className="text-[10px] text-muted-foreground tracking-widest mb-2 border-b border-border/50 pb-1">RATIONALE</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedProposal.rationale || "No rationale provided."}
                  </p>
                </div>

                <div>
                  <h4 className="text-[10px] text-muted-foreground tracking-widest mb-2 border-b border-border/50 pb-1">ASSUMPTIONS</h4>
                  {selectedProposal.assumptions.length > 0 ? (
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      {selectedProposal.assumptions.map((assump, i) => (
                        <li key={i}>{assump}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">None declared</span>
                  )}
                </div>

                {selectedProposal.planSketch?.controlSequence && (
                  <div>
                    <h4 className="text-[10px] text-muted-foreground tracking-widest mb-2 border-b border-border/50 pb-1">CONTROL SEQUENCE</h4>
                    <div className="bg-background border border-border p-4 overflow-x-auto">
                      <pre className="text-xs text-primary">
                        {selectedProposal.planSketch.controlSequence.map((step, i) => (
                          `t+${i}: ${formatVector(step)}\n`
                        ))}
                      </pre>
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          ) : (
            <div className="h-full border border-dashed border-border flex items-center justify-center text-muted-foreground font-mono text-xs">
              SELECT A PROPOSAL
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
