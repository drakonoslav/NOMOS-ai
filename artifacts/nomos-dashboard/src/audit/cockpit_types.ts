/**
 * cockpit_types.ts
 *
 * Canonical types for the NOMOS ecosystem cockpit / control board.
 *
 * The EcosystemCockpitSnapshot is a read-first operational summary
 * composed deterministically from all NOMOS subsystems.
 *
 * It surfaces:
 *   A. Health     — composite score and four component scores
 *   B. Trends     — decisive-variable trends and drift state
 *   C. Prediction — current predicted failure mode and confidence
 *   D. Governance — active policy, latest recommendation, outcome class
 *   E. Policy     — active version, bounded adjustment state, calibration window
 *   F. Doctrine   — supporting vs cautioning heuristics, most relevant doctrine
 *   G. Attention  — deterministic alerts requiring operator attention
 *
 * The cockpit does not mutate any state.
 * It does not execute governance actions.
 * No LLM generation is used.
 */

/**
 * A point-in-time operational snapshot of the full NOMOS ecosystem.
 *
 * Designed to answer, at a glance:
 *   - Is the ecosystem healthy?
 *   - What is currently going wrong?
 *   - What is likely to go wrong next?
 *   - Which policy is active?
 *   - Is governance helping?
 *   - Does doctrine support the current recommendation?
 *   - Where do I need to look next?
 */
export interface EcosystemCockpitSnapshot {
  /**
   * Composite ecosystem health score and per-component breakdown.
   * Source: EcosystemHealthIndex.
   */
  health: {
    overall: number;
    band: "poor" | "fragile" | "stable" | "strong";
    stability: number;
    calibrationQuality: number;
    governanceEffectiveness: number;
    policyChurn: number;
  };

  /**
   * Decisive-variable trend state.
   * Source: DecisiveVariableTrendReport + EcosystemLoopSummary.
   */
  trends: {
    mostFrequentVariable: string | null;
    mostRecentVariable: string | null;
    currentDominantStreak: string | null;
    driftState: "stabilizing" | "stable" | "drifting" | "overcorrecting";
  };

  /**
   * Current failure prediction posture.
   * Source: FailurePrediction.
   */
  prediction: {
    predictedVariable: string | null;
    confidence: "low" | "moderate" | "high";
    riskDirection: "decreasing" | "stable" | "rising";
    topSignal: string | null;
  };

  /**
   * Active governance state.
   * Source: GovernanceAuditRecord[] + GovernanceOutcomeReviewReport.
   */
  governance: {
    activeDomainPolicy: string | null;
    latestRecommendation: string | null;
    latestOutcomeClass: string | null;
    recentGovernanceAction: string | null;
  };

  /**
   * Active policy version and bounded adjustment state.
   * Source: PredictionPolicySnapshot.
   */
  policy: {
    policyVersionId: string | null;
    confidenceBias: number;
    escalationBias: number;
    uncertaintyBias: number;
    calibrationWindow: number;
  };

  /**
   * Doctrine / playbook crosswalk summary for the current decision context.
   * Source: PlaybookDecisionCrosswalk | null.
   * Counts are 0 when no crosswalk is available.
   */
  doctrine: {
    supportingCount: number;
    cautioningCount: number;
    mostRelevantHeuristic: string | null;
  };

  /**
   * Deterministic attention alerts for the operator.
   * Each alert is a plain-language sentence requiring no interpretation.
   * Empty when the ecosystem is fully healthy and no issues are detected.
   */
  attention: {
    alerts: string[];
  };
}
