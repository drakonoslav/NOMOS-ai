import { useGetNomosState } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVector } from "@/lib/utils";
import { motion } from "framer-motion";
import { useScenario } from "@/context/scenario-context";

export default function BeliefPage() {
  const { scenario } = useScenario();
  const { data: state } = useGetNomosState({ scenario });
  if (!state) return null;

  const b = state.belief;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-border bg-card p-4">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">IDENTIFIABILITY</span>
          <div className="mt-2"><Badge variant={b.identifiability === "FULL" ? "success" : "warning"}>{b.identifiability}</Badge></div>
        </div>
        <div className="border border-border bg-card p-4">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">CONFIDENCE</span>
          <div className="mt-2"><Badge variant="outline">{b.confidence}</Badge></div>
        </div>
        <div className="border border-border bg-card p-4">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">STALENESS</span>
          <div className="mt-2 font-mono text-lg text-primary">{b.staleByMs} ms</div>
        </div>
        <div className="border border-border bg-card p-4">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">EPSILON (εx)</span>
          <div className="mt-2 font-mono text-lg text-primary">{b.epsilonX.toFixed(6)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>STATE ESTIMATE (xHat)</CardTitle></CardHeader>
          <CardContent className="p-6 space-y-6 font-mono text-sm">
            <div>
              <div className="text-[10px] text-muted-foreground tracking-widest mb-2">NOMINAL VECTOR</div>
              <div className="bg-background border border-border p-4 text-primary break-all">
                {formatVector(b.xHat)}
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-muted-foreground tracking-widest mb-2">LOWER BOUND</div>
                <div className="bg-background border border-border p-3 text-muted-foreground truncate">
                  {formatVector(b.lower)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground tracking-widest mb-2">UPPER BOUND</div>
                <div className="bg-background border border-border p-3 text-muted-foreground truncate">
                  {formatVector(b.upper)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>PARAMETER BELIEF (θHat)</CardTitle></CardHeader>
          <CardContent className="p-0 font-mono text-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-secondary/20">
                  <th className="p-4 text-[10px] text-muted-foreground tracking-widest font-normal">PARAMETER</th>
                  <th className="p-4 text-[10px] text-muted-foreground tracking-widest font-normal">MEAN</th>
                  <th className="p-4 text-[10px] text-muted-foreground tracking-widest font-normal">VARIANCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {Object.entries(b.thetaMean).map(([key, value]) => (
                  <tr key={key} className="hover:bg-secondary/10">
                    <td className="p-4 text-primary">{key}</td>
                    <td className="p-4 text-muted-foreground">{value.toFixed(6)}</td>
                    <td className="p-4 text-muted-foreground">
                      {b.thetaVariance && b.thetaVariance[key] !== undefined 
                        ? b.thetaVariance[key].toFixed(6) 
                        : "N/A"}
                    </td>
                  </tr>
                ))}
                {Object.keys(b.thetaMean).length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-muted-foreground text-center italic">No parameters tracked.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>EPISTEMIC PROVENANCE CHAIN</CardTitle></CardHeader>
          <CardContent className="p-6">
            <ol className="space-y-3 font-mono text-xs">
              {b.provenance.map((prov, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="text-muted-foreground/50 w-6 text-right">{(i + 1).toString().padStart(2, '0')}</span>
                  <div className="flex-1 pb-3 border-b border-border/30 text-primary">
                    {prov}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
