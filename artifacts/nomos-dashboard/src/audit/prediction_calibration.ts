/**
 * prediction_calibration.ts
 *
 * Deterministic prediction calibration for NOMOS.
 *
 * Compares prior failure predictions against what actually happened in the
 * next audit run. Measurement only — prediction rules are not modified here.
 *
 * Functions:
 *   resolvePredictionOutcome(stored, laterRecords)
 *   classifyCalibration(stored, actualNextVariable, actualRiskDirection)
 *   buildPredictionOutcomeRecords(auditRecords)
 *   buildPredictionCalibrationReport(auditRecords)
 *
 * Resolution rule:
 *   For a prediction made from records[0..i], the resolving run is records[i+1].
 *   If no later run exists, the outcome is "unresolved".
 *
 * Calibration classes:
 *   well_calibrated  — exactMatch OR directional match
 *   too_aggressive   — predicted rising/violation, outcome was lawful/decreasing
 *   too_weak         — predicted stable/decreasing, outcome was violation/rising
 *   unresolved       — no later run available
 *
 * No LLM generation is used.
 */

import type { AuditRecord } from "./audit_types";
import type {
  StoredPredictionRecord,
  PredictionOutcomeRecord,
  PredictionCalibrationReport,
} from "./calibration_types";
import { buildFailurePrediction } from "./failure_prediction";
import { extractDecisiveVariableOccurrences } from "./decisive_variable_trends";

/* =========================================================
   Internal type guard for evaluation payload
   ========================================================= */

interface EvalSnapshot {
  overallStatus?: string | null;
  decisiveVariable?: string | null;
}

function isEvalSnapshot(x: unknown): x is EvalSnapshot {
  return typeof x === "object" && x !== null;
}

/* =========================================================
   Internal helpers
   ========================================================= */

type CalibrationClass = PredictionOutcomeRecord["calibrationClass"];
type RiskDirection = "decreasing" | "stable" | "rising";

/**
 * Derives the actual risk direction for a given audit run, relative to the
 * decisive variable of the immediately preceding run.
 *
 * Rules:
 *   - If nextVar === null (LAWFUL) → "decreasing"
 *   - If nextVar === prevVar (same violation repeated) → "rising"
 *   - Any other non-null variable → "stable"
 */
function deriveActualRiskDirection(
  nextVar: string | null,
  prevVar: string | null
): RiskDirection {
  if (nextVar === null) return "decreasing";
  if (nextVar === prevVar) return "rising";
  return "stable";
}

/**
 * Extracts the decisive variable from a single AuditRecord.
 * Returns null for LAWFUL runs or records without evaluation results.
 */
function extractDecisiveVariable(record: AuditRecord): string | null {
  const raw = record.evaluationResult?.payload;
  const payload = isEvalSnapshot(raw) ? raw : null;
  if (!payload) return null;
  const dv = payload.decisiveVariable;
  if (!dv || dv === "none") return null;
  return dv;
}

/**
 * Sorts AuditRecord[] chronologically ascending (oldest first).
 * Stable sort — equal timestamps preserve original order.
 */
function sortChronologically(records: AuditRecord[]): AuditRecord[] {
  return [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * Builds a StoredPredictionRecord from the prediction computed at run[i]
 * (using records[0..i] as context).
 */
function buildStoredPrediction(
  record: AuditRecord,
  contextRecords: AuditRecord[]
): StoredPredictionRecord {
  const prediction = buildFailurePrediction(contextRecords);
  return {
    sourceVersionId: record.versionId,
    sourceTimestamp: record.timestamp,
    predictedVariable: prediction.predictedVariable,
    confidence: prediction.confidence,
    riskDirection: prediction.riskDirection,
    explanationLines: prediction.explanationLines,
  };
}

/* =========================================================
   classifyCalibration
   ========================================================= */

/**
 * Classifies a prediction outcome given the actual resolving run's data.
 *
 * Priority order:
 *   1. actualRiskDirection === null → "unresolved"
 *   2. exactMatch (predictedVariable === actualNextVariable) → "well_calibrated"
 *   3. directionMatch (riskDirection matches) → "well_calibrated"
 *   4. predicted "rising" / non-null variable, actual "decreasing" / null → "too_aggressive"
 *   5. predicted "decreasing"/"stable" / null variable, actual "rising" / non-null → "too_weak"
 *   6. Otherwise → "well_calibrated" (mixed/inconclusive)
 *
 * Returns calibrationClass, exactMatch, and directionMatch.
 */
export function classifyCalibration(
  stored: StoredPredictionRecord,
  actualNextVariable: string | null,
  actualRiskDirection: RiskDirection | null
): {
  calibrationClass: CalibrationClass;
  exactMatch: boolean;
  directionMatch: boolean;
} {
  if (actualRiskDirection === null) {
    return { calibrationClass: "unresolved", exactMatch: false, directionMatch: false };
  }

  const exactMatch = stored.predictedVariable === actualNextVariable;
  const directionMatch = stored.riskDirection === actualRiskDirection;

  if (exactMatch) {
    return { calibrationClass: "well_calibrated", exactMatch, directionMatch };
  }

  if (directionMatch) {
    return { calibrationClass: "well_calibrated", exactMatch, directionMatch };
  }

  // too_aggressive: predicted a problem, but outcome was benign
  const predictedProblem =
    stored.riskDirection === "rising" || stored.predictedVariable !== null;
  const actualBenign =
    actualRiskDirection === "decreasing" || actualNextVariable === null;
  if (predictedProblem && actualBenign) {
    return { calibrationClass: "too_aggressive", exactMatch, directionMatch };
  }

  // too_weak: predicted safety, but outcome was a violation
  const predictedSafe =
    stored.riskDirection === "decreasing" ||
    stored.riskDirection === "stable" ||
    stored.predictedVariable === null;
  const actualWorsen =
    actualRiskDirection === "rising" || actualNextVariable !== null;
  if (predictedSafe && actualWorsen) {
    return { calibrationClass: "too_weak", exactMatch, directionMatch };
  }

  return { calibrationClass: "well_calibrated", exactMatch, directionMatch };
}

/* =========================================================
   resolvePredictionOutcome
   ========================================================= */

/**
 * Resolves a stored prediction against the next available audit runs.
 *
 * Uses laterRecords[0] as the resolving run (immediately next run).
 * If laterRecords is empty, returns an "unresolved" outcome.
 *
 * @param stored       — the prediction snapshot generated at time of source run
 * @param prevVar      — decisive variable of the source run itself (for deriving
 *                       actual risk direction of the next run)
 * @param laterRecords — all runs that came after the source run (chronological)
 */
export function resolvePredictionOutcome(
  stored: StoredPredictionRecord,
  prevVar: string | null,
  laterRecords: AuditRecord[]
): PredictionOutcomeRecord {
  if (laterRecords.length === 0) {
    return {
      sourceVersionId: stored.sourceVersionId,
      resolvedVersionId: null,
      predictedVariable: stored.predictedVariable,
      actualNextVariable: null,
      predictedRiskDirection: stored.riskDirection,
      actualRiskDirection: null,
      exactMatch: false,
      directionMatch: false,
      confidence: stored.confidence,
      calibrationClass: "unresolved",
      summary: "No later run available. Prediction is pending resolution.",
    };
  }

  const nextRecord = laterRecords[0]!;
  const actualNextVariable = extractDecisiveVariable(nextRecord);
  const actualRiskDirection = deriveActualRiskDirection(actualNextVariable, prevVar);

  const { calibrationClass, exactMatch, directionMatch } = classifyCalibration(
    stored,
    actualNextVariable,
    actualRiskDirection
  );

  const summary = buildOutcomeSummary(
    stored,
    actualNextVariable,
    actualRiskDirection,
    calibrationClass,
    exactMatch,
    directionMatch
  );

  return {
    sourceVersionId: stored.sourceVersionId,
    resolvedVersionId: nextRecord.versionId,
    predictedVariable: stored.predictedVariable,
    actualNextVariable,
    predictedRiskDirection: stored.riskDirection,
    actualRiskDirection,
    exactMatch,
    directionMatch,
    confidence: stored.confidence,
    calibrationClass,
    summary,
  };
}

/* =========================================================
   buildPredictionOutcomeRecords
   ========================================================= */

/**
 * Generates PredictionOutcomeRecord for every audit run in the history.
 *
 * For each run at index i:
 *   - Computes the stored prediction from records[0..i]
 *   - Resolves against records[i+1] (or marks unresolved if i is last)
 *
 * Returns outcomes in chronological order (oldest prediction first).
 */
export function buildPredictionOutcomeRecords(
  records: AuditRecord[]
): PredictionOutcomeRecord[] {
  if (records.length === 0) return [];

  const sorted = sortChronologically(records);

  return sorted.map((record, i) => {
    const contextRecords = sorted.slice(0, i + 1);
    const stored = buildStoredPrediction(record, contextRecords);
    const prevVar = extractDecisiveVariable(record);
    const laterRecords = sorted.slice(i + 1);
    return resolvePredictionOutcome(stored, prevVar, laterRecords);
  });
}

/* =========================================================
   buildPredictionCalibrationReport
   ========================================================= */

/**
 * Builds a full PredictionCalibrationReport across all audit runs.
 *
 * Outcomes are returned newest-first in the report for display purposes.
 */
export function buildPredictionCalibrationReport(
  records: AuditRecord[]
): PredictionCalibrationReport {
  const outcomes = buildPredictionOutcomeRecords(records);

  const totalPredictions = outcomes.length;
  const resolved = outcomes.filter((o) => o.calibrationClass !== "unresolved");
  const unresolved = outcomes.filter((o) => o.calibrationClass === "unresolved");

  const resolvedPredictions = resolved.length;
  const unresolvedPredictions = unresolved.length;

  const exactMatchRate =
    resolvedPredictions > 0
      ? resolved.filter((o) => o.exactMatch).length / resolvedPredictions
      : null;

  const directionMatchRate =
    resolvedPredictions > 0
      ? resolved.filter((o) => o.directionMatch).length / resolvedPredictions
      : null;

  const calibrationCounts: PredictionCalibrationReport["calibrationCounts"] = {
    well_calibrated: 0,
    too_aggressive: 0,
    too_weak: 0,
    unresolved: 0,
  };
  for (const o of outcomes) {
    calibrationCounts[o.calibrationClass]++;
  }

  const summaryLines = buildCalibrationSummaryLines(
    resolvedPredictions,
    unresolvedPredictions,
    exactMatchRate,
    directionMatchRate,
    calibrationCounts,
    resolved
  );

  // newest-first for display
  const outcomesNewestFirst = [...outcomes].reverse();

  return {
    totalPredictions,
    resolvedPredictions,
    unresolvedPredictions,
    exactMatchRate,
    directionMatchRate,
    calibrationCounts,
    outcomes: outcomesNewestFirst,
    summaryLines,
  };
}

/* =========================================================
   Summary builders (internal)
   ========================================================= */

function buildOutcomeSummary(
  stored: StoredPredictionRecord,
  actualNextVariable: string | null,
  actualRiskDirection: RiskDirection,
  calibrationClass: CalibrationClass,
  exactMatch: boolean,
  directionMatch: boolean
): string {
  const predicted = stored.predictedVariable ?? "no violation";
  const actual = actualNextVariable ?? "no violation";

  if (exactMatch && directionMatch) {
    return `Predicted ${predicted}; actual was ${actual}. Exact match — well calibrated.`;
  }
  if (exactMatch) {
    return `Predicted ${predicted}; actual was ${actual}. Variable matched; direction diverged — well calibrated.`;
  }
  if (directionMatch) {
    return `Predicted ${predicted}; actual was ${actual}. Direction matched (${actualRiskDirection}) but variable differed.`;
  }

  switch (calibrationClass) {
    case "too_aggressive":
      return `Predicted ${predicted} with ${stored.riskDirection} risk; actual was ${actual} (${actualRiskDirection}). Prediction overstated risk.`;
    case "too_weak":
      return `Predicted ${predicted} with ${stored.riskDirection} risk; actual was ${actual} (${actualRiskDirection}). Prediction understated risk.`;
    default:
      return `Predicted ${predicted}; actual was ${actual}. Mixed result.`;
  }
}

function buildCalibrationSummaryLines(
  resolved: number,
  unresolved: number,
  exactMatchRate: number | null,
  directionMatchRate: number | null,
  counts: PredictionCalibrationReport["calibrationCounts"],
  resolvedOutcomes: PredictionOutcomeRecord[]
): string[] {
  const lines: string[] = [];

  if (resolved === 0 && unresolved === 0) {
    lines.push("No predictions have been generated yet.");
    return lines;
  }

  if (resolved === 0) {
    lines.push(
      `${unresolved} prediction${unresolved !== 1 ? "s are" : " is"} pending resolution. No later runs are available yet.`
    );
    return lines;
  }

  // Exact match rate
  if (exactMatchRate !== null) {
    const pct = Math.round(exactMatchRate * 100);
    lines.push(
      `Prediction exact-match rate is ${pct}% across ${resolved} resolved run${resolved !== 1 ? "s" : ""}.`
    );
  }

  // Direction match rate
  if (directionMatchRate !== null) {
    const pct = Math.round(directionMatchRate * 100);
    if (exactMatchRate !== null && directionMatchRate > exactMatchRate) {
      lines.push(
        `Direction match rate is ${pct}% — predictions are directionally accurate but often miss the exact decisive variable.`
      );
    } else {
      lines.push(`Direction match rate is ${pct}%.`);
    }
  }

  // Calibration bias
  if (counts.too_aggressive > counts.too_weak && counts.too_aggressive >= 2) {
    lines.push(
      "Recent predictions are too aggressive; risk escalation is being overstated."
    );
  } else if (counts.too_weak > counts.too_aggressive && counts.too_weak >= 2) {
    lines.push(
      "Recent predictions are too weak; risk is being consistently understated."
    );
  } else if (counts.well_calibrated >= resolved * 0.7) {
    lines.push("Predictions are moderately well calibrated overall.");
  }

  // High-confidence but wrong
  const highConfWrong = resolvedOutcomes.filter(
    (o) => o.confidence === "high" && o.calibrationClass !== "well_calibrated"
  );
  if (highConfWrong.length >= 2) {
    lines.push(
      `${highConfWrong.length} high-confidence prediction${highConfWrong.length !== 1 ? "s were" : " was"} incorrect — confidence rules may need tightening.`
    );
  }

  // Unresolved
  if (unresolved > 0) {
    lines.push(
      `${unresolved} prediction${unresolved !== 1 ? "s are" : " is"} unresolved pending future runs.`
    );
  }

  return lines;
}
