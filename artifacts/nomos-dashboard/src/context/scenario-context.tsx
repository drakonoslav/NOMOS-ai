/**
 * scenario-context.tsx
 *
 * Global scenario state for NOMOS Dashboard.
 *
 * Supports two runtime modes:
 *   DEMO — deterministic static scenarios (no API required)
 *   LIVE — user-submitted query → evaluated via NOMOS API
 *
 * Provides:
 *   - scenario / setScenario       — selected demo scenario (DEMO mode)
 *   - mode / setMode               — runtime mode switch
 *   - state                        — current DashboardScenarioState (DEMO or LIVE)
 *   - evaluateLiveQuery()          — submits query, calls API, records audit
 *   - auditEntries / auditRuns     — client-side audit trace
 *   - getRunEntries / clearAudit   — audit utilities
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  buildScenarioState,
  type DemoScenario,
  type DashboardScenarioState,
} from "@/ui/demo/scenario_builder";
import type { NomosQuery } from "@/query/query_types";
import { runNomosEvaluation } from "@/ui/runtime/evaluate_nomos";
import { AuditLog, type AuditEntry, type AuditRun } from "@/ui/audit/audit_log";

export type { DemoScenario };

export type RuntimeMode = "DEMO" | "LIVE";

interface ScenarioContextValue {
  mode: RuntimeMode;
  setMode: (m: RuntimeMode) => void;

  scenario: DemoScenario;
  setScenario: (s: DemoScenario) => void;

  state: DashboardScenarioState;

  liveQuery: NomosQuery | undefined;
  setLiveQuery: (q: NomosQuery | undefined) => void;

  evaluateLiveQuery: (q: NomosQuery) => Promise<void>;
  isEvaluating: boolean;
  evaluationError: string | null;

  auditEntries: AuditEntry[];
  auditRuns: AuditRun[];
  getRunEntries: (runId: string) => AuditEntry[];
  clearAudit: () => void;
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null);

const audit = new AuditLog();
audit.load();

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<RuntimeMode>("DEMO");
  const [scenario, setScenario] = useState<DemoScenario>("lawful_baseline");
  const [liveQuery, setLiveQuery] = useState<NomosQuery | undefined>();
  const [liveState, setLiveState] = useState<DashboardScenarioState | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(audit.getEntries());
  const [auditRuns, setAuditRuns] = useState<AuditRun[]>(audit.getRuns());

  const demoState = useMemo(() => buildScenarioState(scenario), [scenario]);
  const state = mode === "LIVE" && liveState ? liveState : demoState;

  const refreshAudit = useCallback(() => {
    setAuditEntries([...audit.getEntries()]);
    setAuditRuns([...audit.getRuns()]);
  }, []);

  const evaluateLiveQuery = useCallback(async (q: NomosQuery) => {
    setIsEvaluating(true);
    setEvaluationError(null);
    try {
      const result = await runNomosEvaluation(q, audit);
      setLiveQuery(q);
      setLiveState(result);
      setMode("LIVE");
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsEvaluating(false);
      refreshAudit();
    }
  }, [refreshAudit]);

  const clearAudit = useCallback(() => {
    audit.clear();
    refreshAudit();
  }, [refreshAudit]);

  const getRunEntries = useCallback((runId: string) => {
    return audit.getEntriesByRun(runId);
  }, []);

  const value = useMemo<ScenarioContextValue>(() => ({
    mode,
    setMode,
    scenario,
    setScenario,
    state,
    liveQuery,
    setLiveQuery,
    evaluateLiveQuery,
    isEvaluating,
    evaluationError,
    auditEntries,
    auditRuns,
    getRunEntries,
    clearAudit,
  }), [
    mode,
    scenario,
    state,
    liveQuery,
    evaluateLiveQuery,
    isEvaluating,
    evaluationError,
    auditEntries,
    auditRuns,
    getRunEntries,
    clearAudit,
  ]);

  return (
    <ScenarioContext.Provider value={value}>
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario(): ScenarioContextValue {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error("useScenario must be used inside ScenarioProvider");
  return ctx;
}
