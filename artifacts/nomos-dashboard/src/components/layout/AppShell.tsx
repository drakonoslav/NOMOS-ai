import * as React from "react";
import { Link, useLocation } from "wouter";
import { useGetNomosState } from "@workspace/api-client-react";
import { Shield, Activity, ListTree, Scale, Eye, Database, AlertTriangle, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { name: "OVERVIEW", href: "/", icon: Activity },
  { name: "VERIFICATION", href: "/verification", icon: Shield },
  { name: "PROPOSALS", href: "/proposals", icon: ListTree },
  { name: "DECISION", href: "/decision", icon: Scale },
  { name: "BELIEF", href: "/belief", icon: Eye },
  { name: "AUDIT", href: "/audit", icon: Database },
];

function getStatusVariant(status: string) {
  switch (status) {
    case "LAWFUL":
    case "AUTHORIZED":
    case "APPLIED":
      return "success";
    case "DEGRADED":
    case "CONSTRAINED":
    case "DEGRADED_ACTION_APPLIED":
      return "warning";
    case "INVALID":
    case "REFUSED":
      return "destructive";
    default:
      return "outline";
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const { data: state, isLoading, isError } = useGetNomosState({
    query: {
      refetchInterval: 10000, // 10 seconds auto-refresh
      retry: 2,
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-primary flex flex-col items-center justify-center font-mono">
        <Shield className="w-16 h-16 mb-8 text-muted-foreground animate-pulse" />
        <div className="flex flex-col items-center space-y-2 text-sm tracking-widest text-muted-foreground">
          <p>ESTABLISHING CONSTITUTIONAL CHAIN...</p>
          <p className="animate-pulse text-primary">AWAITING KERNEL RESPONSE_</p>
        </div>
      </div>
    );
  }

  if (isError || !state) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center font-mono p-4 text-center">
        <AlertTriangle className="w-20 h-20 mb-8 text-destructive" />
        <h1 className="text-2xl font-bold text-destructive mb-4 tracking-widest">FATAL: KERNEL OFFLINE</h1>
        <p className="text-muted-foreground max-w-md">
          The constitutional verification chain is broken or unreachable. No lawful action may proceed.
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-8 px-6 py-2 border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors tracking-widest uppercase text-xs"
        >
          REINITIALIZE KERNEL
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Mobile Nav Toggle */}
      <button 
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-card border border-border text-foreground"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-68 bg-card border-r border-border flex flex-col transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex-shrink-0",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold tracking-widest text-primary">NOMOS</h1>
          </div>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            Only the lawful may act.
          </p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-xs font-mono tracking-widest transition-colors",
                  isActive 
                    ? "bg-secondary text-primary border-l-2 border-primary" 
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-primary border-l-2 border-transparent"
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50 bg-background/50">
          <div className="flex flex-col gap-2 font-mono text-[10px] text-muted-foreground">
            <div className="flex justify-between">
              <span>MODEL:</span>
              <span className="text-primary">{state.model.activeModelId}</span>
            </div>
            <div className="flex justify-between">
              <span>VERSION:</span>
              <span>{state.model.version}</span>
            </div>
            <div className="flex justify-between">
              <span>MISSION:</span>
              <span className="truncate ml-2">{state.missionId}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Topbar */}
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex flex-col justify-center px-4 md:px-8 z-30 sticky top-0">
          <div className="flex items-center justify-between ml-12 md:ml-0">
            <h2 className="text-sm font-mono tracking-widest text-muted-foreground uppercase hidden sm:block">
              {NAV_ITEMS.find(n => n.href === location)?.name || "DASHBOARD"}
            </h2>
            
            <div className="flex items-center gap-2 md:gap-4 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-2 bg-background border border-border px-3 py-1">
                <span className="text-[10px] font-mono text-muted-foreground">STATUS</span>
                <Badge variant={getStatusVariant(state.verificationStatus)}>{state.verificationStatus}</Badge>
              </div>
              
              <div className="flex items-center gap-2 bg-background border border-border px-3 py-1">
                <span className="text-[10px] font-mono text-muted-foreground">AUTH</span>
                <Badge variant={getStatusVariant(state.authority)}>{state.authority}</Badge>
              </div>

              <div className="flex items-center gap-2 bg-background border border-border px-3 py-1 hidden lg:flex">
                <span className="text-[10px] font-mono text-muted-foreground">CONFIDENCE</span>
                <span className="text-xs font-mono text-primary">{state.modelConfidenceScore.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8 bg-background">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
