/**
 * evaluate_nomos.ts
 *
 * Runtime evaluation adapter.
 * Calls the NOMOS API and maps the response to a DashboardScenarioState.
 * Records a synthetic audit trace at each pipeline stage.
 */

import type { NomosQuery, NomosQueryResponse } from "@/query/query_types";
import type { DashboardScenarioState, DemoScenario } from "../demo/scenario_builder";
import type { ToneResolverInput } from "../tone/tone_types";
import type { AuditLog } from "../audit/audit_log";
import { extractRunSummaries } from "../audit/audit_timeseries";
import { predictNextFailure } from "../audit/failure_prediction";

export async function runNomosEvaluation(
  query: NomosQuery,
  audit: AuditLog
): Promise<DashboardScenarioState> {
  audit.startRun(`Live — ${new Date().toLocaleTimeString()}`);

  audit.record("query_submitted", {
    candidateCount: query.candidates.length,
    constraintCount: query.state.constraints.length,
    uncertaintyCount: query.state.uncertainties.length,
    completeness: query.completeness,
    parserConfidence: query.parserConfidence,
  });

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const apiBase = baseUrl.replace(/\/$/, "");

  const response = await fetch(`${apiBase}/api/nomos/query/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Evaluation API error ${response.status}: ${text}`);
  }

  const result: NomosQueryResponse = await response.json();

  const verificationStatus = mapStatus(result.overallStatus);
  const authority         = mapAuthority(verificationStatus);
  const actionOutcome     = mapActionOutcome(verificationStatus);
  const selectedIds       = result.lawfulSet ?? [];
  const rejectedIds       = result.candidateEvaluations
    .filter((e) => e.classification !== "LAWFUL")
    .map((e) => e.id);

  const adjustments = (result.adjustments ?? []).flatMap((a) => a.actions);
  const activeConstraint = findActiveConstraint(result);

  const toneInput: ToneResolverInput = {
    verificationStatus,
    authority,
    epsilonX: 0.06,
    identifiability: result.submissionQuality === "COMPLETE" ? "FULL" : "PARTIAL",
    modelConfidence: verificationStatus === "LAWFUL" ? 0.90 : verificationStatus === "DEGRADED" ? 0.62 : 0.72,
    robustnessEpsilon: verificationStatus === "LAWFUL" ? 0.12 : verificationStatus === "DEGRADED" ? 0.034 : 0,
    robustnessEpsilonMin: 0.03,
    feasibilityOk: verificationStatus !== "INVALID",
    robustnessOk: verificationStatus === "LAWFUL",
    observabilityOk: true,
    identifiabilityOk: result.submissionQuality !== "INSUFFICIENT",
    modelOk: verificationStatus !== "DEGRADED",
    adaptationOk: verificationStatus !== "INVALID",
    selectedCandidateIds: selectedIds,
    rejectedCandidateIds: rejectedIds,
    activeConstraint,
    decisiveVariable: findDecisiveVariable(verificationStatus),
    reasons: result.notes ?? [],
    adjustments,
  };

  const evaluationPayload = {
    verificationStatus,
    authority,
    feasibilityOk: toneInput.feasibilityOk,
    robustnessOk: toneInput.robustnessOk,
    observabilityOk: toneInput.observabilityOk,
    identifiabilityOk: toneInput.identifiabilityOk,
    modelOk: toneInput.modelOk,
    adaptationOk: toneInput.adaptationOk,
    modelConfidence: toneInput.modelConfidence,
    robustnessEpsilon: toneInput.robustnessEpsilon,
    candidateCount: query.candidates.length,
    lawfulSet: selectedIds,
    actionOutcome,
  };

  audit.record("evaluation_complete", evaluationPayload);

  audit.record("run_summary", {
    status: verificationStatus,
    decisiveVariable: toneInput.decisiveVariable,
    modelConfidence: toneInput.modelConfidence,
    robustness: toneInput.robustnessEpsilon,
    feasibility: toneInput.feasibilityOk,
  });

  const summaries   = extractRunSummaries(audit.getEntries());
  const prediction  = predictNextFailure(summaries);
  if (prediction) {
    toneInput.prediction = prediction;
  }

  return {
    scenario: mapScenarioKey(verificationStatus),
    label: `Live Evaluation (${verificationStatus})`,
    description: "NOMOS constitutional evaluation of submitted query.",
    toneInput,
    metrics: {
      selectedPlanId: selectedIds[0],
      proposalCount: query.candidates.length,
      actionOutcome,
    },
  };
}

function mapStatus(s: string): "LAWFUL" | "DEGRADED" | "INVALID" {
  if (s === "LAWFUL")   return "LAWFUL";
  if (s === "DEGRADED") return "DEGRADED";
  return "INVALID";
}

function mapAuthority(s: "LAWFUL" | "DEGRADED" | "INVALID"): "AUTHORIZED" | "CONSTRAINED" | "REFUSED" {
  if (s === "LAWFUL")   return "AUTHORIZED";
  if (s === "DEGRADED") return "CONSTRAINED";
  return "REFUSED";
}

function mapActionOutcome(s: "LAWFUL" | "DEGRADED" | "INVALID"): "APPLIED" | "DEGRADED_ACTION_APPLIED" | "REFUSED" {
  if (s === "LAWFUL")   return "APPLIED";
  if (s === "DEGRADED") return "DEGRADED_ACTION_APPLIED";
  return "REFUSED";
}

function mapScenarioKey(s: "LAWFUL" | "DEGRADED" | "INVALID"): DemoScenario {
  if (s === "LAWFUL")   return "lawful_baseline";
  if (s === "DEGRADED") return "degraded_low_margin";
  return "refused_infeasible";
}

function findActiveConstraint(result: NomosQueryResponse): string {
  const invalid = result.candidateEvaluations.find((e) => e.classification === "INVALID");
  return invalid?.reasons[0] ?? "none";
}

function findDecisiveVariable(s: "LAWFUL" | "DEGRADED" | "INVALID"): string {
  if (s === "INVALID")  return "feasibility constraint";
  if (s === "DEGRADED") return "model confidence";
  return "robustness margin";
}
