/**
 * audit_diff.ts
 *
 * Diff engine for NOMOS audit runs.
 * Compares two runs stage-by-stage and identifies the decisive variable.
 */

import type { AuditEntry } from "./audit_log";

export interface StageDiff {
  stage: string;
  changed: boolean;
  before?: unknown;
  after?: unknown;
}

export interface DecisiveDiff {
  variable: string;
  before: unknown;
  after: unknown;
  reason: string;
}

export interface DiffResult {
  stageDiffs: StageDiff[];
  decisive?: DecisiveDiff;
}

export function diffRuns(runA: AuditEntry[], runB: AuditEntry[]): StageDiff[] {
  const mapA = indexByStage(runA);
  const mapB = indexByStage(runB);
  const stages = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);

  const diffs: StageDiff[] = [];
  for (const stage of stages) {
    const a = mapA[stage];
    const b = mapB[stage];
    const changed = JSON.stringify(a) !== JSON.stringify(b);
    diffs.push({ stage, changed, before: a, after: b });
  }

  return diffs;
}

export function diffRunsWithDecision(runA: AuditEntry[], runB: AuditEntry[]): DiffResult {
  const stageDiffs = diffRuns(runA, runB);

  const beforeVerification = findStage(runA, "evaluation_complete");
  const afterVerification  = findStage(runB, "evaluation_complete");

  const decisive = findDecisiveChange(beforeVerification, afterVerification);

  return { stageDiffs, decisive };
}

function findDecisiveChange(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): DecisiveDiff | undefined {
  if (!a || !b) return undefined;

  const getField = (obj: Record<string, unknown>, ...keys: string[]): unknown => {
    let cur: unknown = obj;
    for (const k of keys) {
      if (typeof cur !== "object" || cur === null) return undefined;
      cur = (cur as Record<string, unknown>)[k];
    }
    return cur;
  };

  const aFeas = getField(a, "feasibilityOk");
  const bFeas = getField(b, "feasibilityOk");
  if (aFeas !== bFeas) {
    return {
      variable: "feasibility",
      before: aFeas,
      after: bFeas,
      reason: "Feasibility transition determines legality boundary.",
    };
  }

  const aRobOk = getField(a, "robustnessOk");
  const bRobOk = getField(b, "robustnessOk");
  if (aRobOk !== bRobOk) {
    return {
      variable: "robustness margin",
      before: getField(a, "robustnessEpsilon"),
      after: getField(b, "robustnessEpsilon"),
      reason: "Robustness crossing threshold reduces allowable operation.",
    };
  }

  const aModel = getField(a, "modelConfidence") as number | undefined;
  const bModel = getField(b, "modelConfidence") as number | undefined;
  if (aModel !== undefined && bModel !== undefined && Math.abs(aModel - bModel) > 0.1) {
    return {
      variable: "model confidence",
      before: aModel,
      after: bModel,
      reason: "Model reliability shift alters admissibility.",
    };
  }

  const aIdOk = getField(a, "identifiabilityOk");
  const bIdOk = getField(b, "identifiabilityOk");
  if (aIdOk !== bIdOk) {
    return {
      variable: "identifiability",
      before: aIdOk,
      after: bIdOk,
      reason: "Loss of identifiability breaks system grounding.",
    };
  }

  const aObsOk = getField(a, "observabilityOk");
  const bObsOk = getField(b, "observabilityOk");
  if (aObsOk !== bObsOk) {
    return {
      variable: "observability",
      before: aObsOk,
      after: bObsOk,
      reason: "Insufficient observability limits control validity.",
    };
  }

  const aAdapt = getField(a, "adaptationOk");
  const bAdapt = getField(b, "adaptationOk");
  if (aAdapt !== bAdapt) {
    return {
      variable: "adaptation integrity",
      before: aAdapt,
      after: bAdapt,
      reason: "Adaptation breakdown prevents recovery.",
    };
  }

  return undefined;
}

function findStage(entries: AuditEntry[], stage: string): Record<string, unknown> | undefined {
  const found = entries.find((e) => e.stage === stage);
  return found?.payload as Record<string, unknown> | undefined;
}

function indexByStage(entries: AuditEntry[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const e of entries) {
    map[e.stage] = e.payload;
  }
  return map;
}
