/**
 * ecosystem_loop_types.ts
 *
 * Canonical types for the NOMOS ecosystem loop summary.
 *
 * This is a top-level reflective layer that summarises the full governance
 * ecosystem across time — how prediction patterns, governance choices,
 * outcomes, and doctrines interact at system scale.
 *
 * This layer is descriptive and read-only.
 * It does not generate policy actions, auto-promote, or self-modify anything.
 * No LLM generation is used.
 */

/**
 * A recurring pattern linking a prediction or risk context to the governance
 * decision it most often led to.
 *
 * label:   short human-readable label (e.g. "Risk acknowledged → rollback").
 * count:   number of decision records matching this pattern.
 * summary: deterministic one-line description of the pattern.
 */
export interface PredictionToDecisionPattern {
  label: string;
  count: number;
  summary: string;
}

/**
 * A recurring pattern linking a governance choice (promote/rollback/hold) to
 * its most common outcome class (met_expectations, partially_met, did_not_meet).
 *
 * label:   short label (e.g. "Promote → met expectations").
 * count:   number of matched outcome links.
 * summary: deterministic one-line description.
 */
export interface GovernanceChoiceOutcomePattern {
  label: string;
  count: number;
  summary: string;
}

/**
 * A governance doctrine that has emerged repeatedly in the playbook.
 *
 * heuristicId:  matches GovernanceHeuristic.id.
 * title:        heuristic title.
 * supportCount: number of governance actions that support this doctrine.
 * confidence:   confidence level of the heuristic.
 * summary:      short human-readable description.
 */
export interface DoctrineEmergencePattern {
  heuristicId: string;
  title: string;
  supportCount: number;
  confidence: "low" | "moderate" | "high";
  summary: string;
}

/**
 * The system-level change characterization.
 *
 * stabilizing:     governance outcomes are improving over the review window.
 * drifting:        governance outcomes are worsening or unresolved outcomes are rising.
 * overcorrecting:  many governance actions taken without clear improvement signal.
 *
 * These flags are not mutually exclusive — a system can be drifting and
 * overcorrecting simultaneously.  Only one may be true in practice.
 *
 * summaryLines:    deterministic human-readable lines describing the current
 *                  trajectory.
 */
export interface EcosystemChangeSummary {
  stabilizing: boolean;
  drifting: boolean;
  overcorrecting: boolean;
  summaryLines: string[];
}

/**
 * The full ecosystem loop summary.
 *
 * totalAuditRuns:           evaluation runs processed across the system.
 * totalPredictions:         prediction events linked to governance decisions.
 * totalGovernanceActions:   governance actions recorded in the audit trail.
 * totalOutcomeReviews:      governance actions with a completed outcome review.
 *
 * predictionToDecisionPatterns:   recurring risk/prediction → decision links.
 * governanceChoiceOutcomePatterns: recurring choice → outcome class links.
 * doctrineEmergencePatterns:       heuristics that have emerged with meaningful support.
 * ecosystemChangeSummary:          stabilizing / drifting / overcorrecting verdict.
 * summaryLines:                    top-level human-readable ecosystem narrative.
 */
export interface EcosystemLoopSummary {
  totalAuditRuns: number;
  totalPredictions: number;
  totalGovernanceActions: number;
  totalOutcomeReviews: number;

  predictionToDecisionPatterns: PredictionToDecisionPattern[];
  governanceChoiceOutcomePatterns: GovernanceChoiceOutcomePattern[];
  doctrineEmergencePatterns: DoctrineEmergencePattern[];

  ecosystemChangeSummary: EcosystemChangeSummary;

  summaryLines: string[];
}
