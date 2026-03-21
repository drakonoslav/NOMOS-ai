import { useGetNomosState } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, X, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";

export default function VerificationPage() {
  const { data: state } = useGetNomosState();
  if (!state) return null;

  const v = state.verification;
  const isLawful = v.status === "LAWFUL";

  const checks = [
    { label: "FEASIBILITY", ok: v.feasibilityOk, law: "LAW I" },
    { label: "ROBUSTNESS", ok: v.robustnessOk, law: "LAW II" },
    { label: "OBSERVABILITY", ok: v.observabilityOk, law: "LAW III" },
    { label: "IDENTIFIABILITY", ok: v.identifiabilityOk, law: "LAW III" },
    { label: "MODEL VALIDITY", ok: v.modelOk, law: "LAW IV" },
    { label: "ADAPTATION", ok: v.adaptationOk, law: "LAW IV" },
  ];

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
        
        {/* Left Column: Status Hero */}
        <div className="md:col-span-1 space-y-6">
          <Card className={cn(
            "border-2",
            isLawful ? "border-success/50 bg-success/5" : "border-warning/50 bg-warning/5"
          )}>
            <CardHeader className="border-none pb-0">
              <CardTitle className="text-center">FINAL STATUS</CardTitle>
            </CardHeader>
            <CardContent className="p-8 flex flex-col items-center justify-center">
              {isLawful ? (
                <ShieldAlert className="w-16 h-16 text-success mb-4" />
              ) : (
                <ShieldAlert className="w-16 h-16 text-warning mb-4" />
              )}
              <span className={cn(
                "text-3xl font-bold tracking-widest font-mono",
                isLawful ? "text-success" : "text-warning"
              )}>
                {v.status}
              </span>
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
