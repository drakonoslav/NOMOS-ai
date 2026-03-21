/**
 * ecosystem_health_types.ts
 *
 * Canonical types for the NOMOS ecosystem health index.
 *
 * The health index is a bounded composite score (0–100) that summarises
 * the overall reasoning ecosystem across four dimensions:
 *
 *   stability              — lawful outcomes, violation trends, drift signal
 *   calibrationQuality     — prediction accuracy and unresolved burden
 *   governanceEffectiveness — whether governance actions deliver expectations
 *   policyChurn            — whether policy changes are stable and improving
 *
 * The score is fully decomposable — every component is independently derivable
 * and traceable to explicit inputs and formulas.
 *
 * This layer is advisory, descriptive, and read-only.
 * It does not suppress, replace, or act on any underlying audit detail.
 * No LLM generation is used.
 */

/**
 * The four scored dimensions of ecosystem health.
 *
 * All values are integers in [0, 100], where higher is healthier.
 *
 * policyChurn:  defined so that LOW harmful churn = HIGH score.
 *               A system with no churn scores near 80 (baseline).
 *               A system with repeated unstable churn scores near 0.
 */
export interface EcosystemHealthComponents {
  stability: number;               // 0 to 100
  calibrationQuality: number;      // 0 to 100
  governanceEffectiveness: number; // 0 to 100
  policyChurn: number;             // 0 to 100, higher = healthier
}

/**
 * The full ecosystem health index.
 *
 * overall:          weighted composite of the four components (0–100).
 * band:             qualitative tier based on overall score.
 *                     poor     0–24
 *                     fragile  25–49
 *                     stable   50–74
 *                     strong   75–100
 *
 * components:       individual component scores (all 0–100).
 *
 * explanationLines: deterministic lines describing why each component is at
 *                   its current level.
 *
 * cautionLines:     deterministic warnings for components or overall scores
 *                   that fall into poor or fragile territory.
 */
export interface EcosystemHealthIndex {
  overall: number;
  band: "poor" | "fragile" | "stable" | "strong";

  components: EcosystemHealthComponents;

  explanationLines: string[];
  cautionLines: string[];
}
