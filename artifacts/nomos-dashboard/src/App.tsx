import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { AppShell } from "@/components/layout/AppShell";
import OverviewPage from "@/pages/overview";
import ProposalsPage from "@/pages/proposals";
import VerificationPage from "@/pages/verification";
import BeliefPage from "@/pages/belief";
import DecisionPage from "@/pages/decision";
import AuditPage from "@/pages/audit";
import { QueryBuilderPage } from "@/ui/pages/query/QueryBuilderPage";
import { ScenarioProvider } from "@/context/scenario-context";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={OverviewPage} />
        <Route path="/proposals" component={ProposalsPage} />
        <Route path="/verification" component={VerificationPage} />
        <Route path="/belief" component={BeliefPage} />
        <Route path="/decision" component={DecisionPage} />
        <Route path="/audit" component={AuditPage} />
        <Route path="/query" component={QueryBuilderPage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ScenarioProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </ScenarioProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
