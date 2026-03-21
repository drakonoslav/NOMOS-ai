/**
 * audit_log.ts
 *
 * Constitutional role:
 * Implements traceability and accountability.
 *
 * Every material action decision should be logged with:
 *   - measurement snapshot
 *   - belief snapshot
 *   - model signature / confidence
 *   - feasibility report
 *   - robustness report
 *   - verification report
 *   - action outcome
 *
 * Source alignment:
 *   - explicit implementation-note discipline
 *   - failure mode traceability
 *   - lawful systems must not rely on narrative memory alone
 */

import { BeliefState, MeasurementSnapshot } from "./belief_state.js";
import { FeasibilityReport } from "./feasibility_engine.js";
import { RobustnessReport } from "./robustness_analyzer.js";
import { VerificationReport } from "./verification_kernel.js";
import { ModelConfidence, ModelSignature } from "./model_registry.js";

export type AuditActionOutcome =
  | "APPLIED"
  | "DEGRADED_ACTION_APPLIED"
  | "REFUSED"
  | "RECOMPUTE_REQUIRED";

export interface AuditRecord {
  id: string;
  timestamp: number;
  measurement?: MeasurementSnapshot;
  belief: BeliefState;
  modelSignature: ModelSignature;
  modelConfidence?: ModelConfidence | null;
  feasibility?: FeasibilityReport;
  robustness?: RobustnessReport;
  verification: VerificationReport;
  selectedPlanId?: string;
  controlAction?: number[];
  outcome: AuditActionOutcome;
  notes?: string[];
}

export class AuditLog {
  private records: AuditRecord[] = [];

  public write(record: AuditRecord): void {
    this.records.push({
      ...record,
      belief: {
        ...record.belief,
        xHat: [...record.belief.xHat],
        thetaHat: {
          mean: { ...record.belief.thetaHat.mean },
          variance: record.belief.thetaHat.variance
            ? { ...record.belief.thetaHat.variance }
            : undefined,
          identifiable: { ...record.belief.thetaHat.identifiable },
        },
        uncertainty: {
          epsilonX: record.belief.uncertainty.epsilonX,
          covariance: record.belief.uncertainty.covariance
            ? record.belief.uncertainty.covariance.map((row) => [...row])
            : undefined,
          lower: record.belief.uncertainty.lower
            ? [...record.belief.uncertainty.lower]
            : undefined,
          upper: record.belief.uncertainty.upper
            ? [...record.belief.uncertainty.upper]
            : undefined,
        },
        provenance: [...record.belief.provenance],
      },
      measurement: record.measurement
        ? {
            ...record.measurement,
            z: [...record.measurement.z],
          }
        : undefined,
      modelSignature: { ...record.modelSignature, parameterNames: [...record.modelSignature.parameterNames] },
      modelConfidence: record.modelConfidence
        ? { ...record.modelConfidence, reasons: [...record.modelConfidence.reasons] }
        : record.modelConfidence,
      feasibility: record.feasibility
        ? JSON.parse(JSON.stringify(record.feasibility))
        : undefined,
      robustness: record.robustness
        ? JSON.parse(JSON.stringify(record.robustness))
        : undefined,
      verification: {
        ...record.verification,
        reasons: [...record.verification.reasons],
      },
      controlAction: record.controlAction ? [...record.controlAction] : undefined,
      notes: record.notes ? [...record.notes] : undefined,
    });
  }

  public list(): AuditRecord[] {
    return this.records.map((r) => JSON.parse(JSON.stringify(r)));
  }

  public latest(): AuditRecord | null {
    if (this.records.length === 0) return null;
    return JSON.parse(JSON.stringify(this.records[this.records.length - 1]));
  }

  public filterByOutcome(outcome: AuditActionOutcome): AuditRecord[] {
    return this.records
      .filter((r) => r.outcome === outcome)
      .map((r) => JSON.parse(JSON.stringify(r)));
  }

  public summarize(): {
    total: number;
    applied: number;
    degraded: number;
    refused: number;
    recomputeRequired: number;
  } {
    return {
      total: this.records.length,
      applied: this.records.filter((r) => r.outcome === "APPLIED").length,
      degraded: this.records.filter((r) => r.outcome === "DEGRADED_ACTION_APPLIED").length,
      refused: this.records.filter((r) => r.outcome === "REFUSED").length,
      recomputeRequired: this.records.filter((r) => r.outcome === "RECOMPUTE_REQUIRED").length,
    };
  }
}
