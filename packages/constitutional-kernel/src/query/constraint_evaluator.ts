/**
 * constraint_evaluator.ts
 *
 * Rule-based semantic constraint evaluator for NOMOS.
 *
 * Constitutional role:
 * - Evaluates whether a candidate action violates or satisfies a declared constraint.
 * - Works entirely without an LLM — pure semantic vocabulary matching.
 * - Does NOT assign overall lawfulness; that belongs to the kernel.
 * - Used as the primary fallback when the LLM evaluator is unavailable.
 *
 * Design:
 * - Each constraint is classified into a ConstraintType.
 * - Each type maps to INVALID clusters and DEGRADED clusters.
 * - A "cluster" is a set of synonym terms; activation = any term is present in the candidate text.
 * - INVALID wins over DEGRADED across all per-constraint results.
 * - LAWFUL is assigned only when no cluster is activated.
 *
 * evaluateConstraint(candidate, constraint) → ConstraintEvalResult
 */

import { NomosCandidateBlock } from "./query_types.js";
import { NomosActionClassification } from "./query_response_types.js";

/* =========================================================
   Semantic clusters — vocabulary synonym groups
   ========================================================= */

const THROW_CLUSTER        = ['throw', 'toss', 'hurl', 'fling', 'pitch', 'chuck', 'cast', 'lob', 'launch', 'propel', 'catapult', 'project', 'heave'];
const DROP_CLUSTER         = ['drop', 'release', 'let go', 'lose grip', 'let fall', 'let slip', 'relinquish', 'unhand', 'shed', 'lose hold'];
const FALL_CLUSTER         = ['fall', 'tumble', 'topple', 'tip over', 'tip', 'collapse', 'overturn', 'spill', 'plummet', 'plunge', 'capsize'];
const DAMAGE_CLUSTER       = ['damage', 'break', 'destroy', 'harm', 'shatter', 'crack', 'crush', 'tear', 'rupture', 'puncture', 'dent', 'ruin', 'wreck', 'smash', 'scratch', 'bend'];
const ROUGH_HANDLING       = ['rough', 'roughly', 'jolt', 'jerk', 'shake', 'jostle', 'vibrate', 'bang', 'bump', 'knock', 'jar', 'rattle', 'slam', 'bounce', 'jostle'];
const FAST_CLUSTER         = ['fast', 'quickly', 'rapid', 'rapidly', 'swift', 'swiftly', 'rush', 'sprint', 'speed', 'accelerate', 'hurry', 'dash', 'race', 'abruptly'];
const CAREFUL_CLUSTER      = ['careful', 'carefully', 'gentle', 'gently', 'slow', 'slowly', 'cautious', 'cautiously', 'steady', 'secure', 'secured', 'cushion', 'pad', 'padded', 'cradle', 'cradled', 'brace', 'braced', 'stable', 'support', 'supported'];
const DISCARD_CLUSTER      = ['discard', 'dispose', 'remove', 'eliminate', 'abandon', 'throw away', 'get rid', 'delete', 'erase', 'purge', 'dispose of', 'trash', 'scrap'];
const INCREASE_CLUSTER     = ['increase', 'add', 'more', 'expand', 'raise', 'boost', 'enhance', 'grow', 'elevate', 'maximize', 'intensify', 'augment', 'escalate', 'amplify', 'push harder', 'add more'];
const DECREASE_CLUSTER     = ['decrease', 'reduce', 'cut', 'lower', 'diminish', 'limit', 'restrict', 'shrink', 'compress', 'minimize', 'lessen', 'curtail', 'scale back', 'drop', 'remove'];
const MAINTAIN_CLUSTER     = ['maintain', 'keep', 'preserve', 'same', 'unchanged', 'consistent', 'constant', 'continue', 'sustain', 'hold', 'stable', 'steady'];
const EXCEED_CLUSTER       = ['exceed', 'surpass', 'go beyond', 'over limit', 'past limit', 'too much', 'excessive', 'overload', 'overshoot'];

/* =========================================================
   Cluster matching
   ========================================================= */

/**
 * Returns the first matching term from a cluster found in the candidate text,
 * or null if no match.  Matches whole-word or multi-word phrases.
 */
function activates(text: string, cluster: string[]): string | null {
  const lower = text.toLowerCase();
  for (const term of cluster) {
    if (term.includes(' ')) {
      if (lower.includes(term)) return term;
    } else {
      if (new RegExp(`\\b${escapeRegex(term)}\\b`).test(lower)) return term;
    }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* =========================================================
   Constraint classification
   ========================================================= */

type ConstraintType =
  | 'MUST_NOT_DROP'
  | 'MUST_NOT_THROW'
  | 'MUST_REMAIN_STABLE'
  | 'MUST_PRESERVE'
  | 'MUST_NOT_DAMAGE'
  | 'NUMERIC_MAX'
  | 'NUMERIC_MIN'
  | 'MUST_NOT_GENERIC'
  | 'MUST_AFFIRMATIVE'
  | 'UNKNOWN';

interface ClassifiedConstraint {
  type: ConstraintType;
  raw: string;
  forbiddenConcept?: string;
  requiredConcept?: string;
  numericBound?: number;
  numericUnit?: string;
}

const NEGATION_PREFIX = /must\s+not|cannot|can't|do\s+not|don't|never|prohibit|forbid/i;

function classifyConstraint(constraint: string): ClassifiedConstraint {
  const raw = constraint.trim();
  const lower = raw.toLowerCase();

  if (/must\s+not\s+(be\s+)?(drop|let\s+fall|lose\s+control)|object\s+must\s+not\s+be\s+dropped|do\s+not\s+(drop|let\s+fall)/.test(lower)) {
    return { type: 'MUST_NOT_DROP', raw };
  }
  if (/must\s+not\s+(throw|toss|hurl|fling|pitch|cast)|cannot\s+(throw|toss|hurl)|do\s+not\s+(throw|toss)/.test(lower)) {
    return { type: 'MUST_NOT_THROW', raw };
  }
  if (/must\s+(remain|stay|be)\s+stable|must\s+not\s+destabilize|stability\s+required|remain\s+stable/.test(lower)) {
    return { type: 'MUST_REMAIN_STABLE', raw };
  }
  if (/must\s+(preserve|protect|keep\s+intact|maintain\s+integrity)|do\s+not\s+alter|do\s+not\s+modify|leave\s+intact|preserve/.test(lower)) {
    return { type: 'MUST_PRESERVE', raw };
  }
  if (/must\s+not\s+(damage|break|harm|destroy|scratch|crack)|cannot\s+(damage|harm|break)|do\s+not\s+(damage|break|harm)/.test(lower)) {
    return { type: 'MUST_NOT_DAMAGE', raw };
  }

  // Numeric bounds
  const maxMatch = raw.match(/(?:no\s+more\s+than|at\s+most|must\s+not\s+exceed|<=|maximum|max)\s*([\d.]+)\s*(\w+)?/i);
  if (maxMatch) {
    return { type: 'NUMERIC_MAX', raw, numericBound: parseFloat(maxMatch[1]), numericUnit: maxMatch[2] };
  }
  const minMatch = raw.match(/(?:at\s+least|no\s+less\s+than|>=|minimum|min|must\s+be\s+at\s+least)\s*([\d.]+)\s*(\w+)?/i);
  if (minMatch) {
    return { type: 'NUMERIC_MIN', raw, numericBound: parseFloat(minMatch[1]), numericUnit: minMatch[2] };
  }

  // Generic negation — extract the forbidden concept
  if (NEGATION_PREFIX.test(lower)) {
    const conceptMatch = raw.match(/(?:must\s+not|cannot|can't|do\s+not|don't|never)\s+([a-z][a-z\s']*?)(?:\s+the|\s+any|\s+a\b|\s+an\b|$|\.|,)/i);
    return { type: 'MUST_NOT_GENERIC', raw, forbiddenConcept: conceptMatch?.[1]?.trim() };
  }

  // Generic affirmative — extract required concept
  if (/\b(?:must|should|required|need\s+to|has\s+to)\b/i.test(lower)) {
    const conceptMatch = raw.match(/(?:must|should|required\s+to|need\s+to)\s+([a-z][a-z\s']*?)(?:\s+the|\s+any|$|\.|,)/i);
    return { type: 'MUST_AFFIRMATIVE', raw, requiredConcept: conceptMatch?.[1]?.trim() };
  }

  return { type: 'UNKNOWN', raw };
}

/* =========================================================
   Per-constraint evaluation
   ========================================================= */

export interface ConstraintEvalResult {
  status: NomosActionClassification;
  reason: string;
  violatedConstraint: string;
  matchedTerm?: string;
}

function buildReason(
  status: NomosActionClassification,
  candidateDesc: string,
  constraint: string,
  matchedTerm: string | null,
  explanation: string
): string {
  const prefix = status === 'INVALID' ? '[VIOLATION]' : '[RISK]';
  const termNote = matchedTerm ? ` (matched: "${matchedTerm}")` : '';
  return `${prefix} Constraint: "${constraint}" — ${explanation}${termNote}.`;
}

export function evaluateConstraint(
  candidate: NomosCandidateBlock,
  constraint: string
): ConstraintEvalResult {
  const cc = classifyConstraint(constraint);
  const desc = candidate.description;
  const lower = desc.toLowerCase();

  let status: NomosActionClassification = 'LAWFUL';
  let matchedTerm: string | null = null;
  let explanation = 'No constraint activation detected.';

  switch (cc.type) {

    case 'MUST_NOT_DROP': {
      const throwTerm = activates(desc, THROW_CLUSTER);
      const dropTerm  = activates(desc, DROP_CLUSTER);
      const fallTerm  = activates(desc, FALL_CLUSTER);
      const roughTerm = activates(desc, ROUGH_HANDLING);
      const fastTerm  = activates(desc, FAST_CLUSTER);

      if (throwTerm || dropTerm) {
        status = 'INVALID';
        matchedTerm = (throwTerm ?? dropTerm)!;
        explanation = `Candidate action involves ${throwTerm ? 'throwing/tossing' : 'releasing/dropping'}, which is semantically equivalent to dropping and loses controlled contact with the object`;
      } else if (fallTerm) {
        status = 'INVALID';
        matchedTerm = fallTerm;
        explanation = `Candidate implies the object may fall (${fallTerm}), which violates the no-drop constraint`;
      } else if (roughTerm || fastTerm) {
        status = 'DEGRADED';
        matchedTerm = (roughTerm ?? fastTerm)!;
        explanation = `${roughTerm ? 'Rough handling' : 'Fast movement'} increases risk of losing control of the object`;
      }
      break;
    }

    case 'MUST_NOT_THROW': {
      const throwTerm = activates(desc, THROW_CLUSTER);
      const roughTerm = activates(desc, ROUGH_HANDLING);

      if (throwTerm) {
        status = 'INVALID';
        matchedTerm = throwTerm;
        explanation = `Candidate action "${throwTerm}" is explicitly in the throw/toss semantic cluster, directly violating this constraint`;
      } else if (roughTerm) {
        status = 'DEGRADED';
        matchedTerm = roughTerm;
        explanation = `Rough handling (${roughTerm}) increases the risk of uncontrolled release similar to throwing`;
      }
      break;
    }

    case 'MUST_REMAIN_STABLE': {
      const fallTerm  = activates(desc, FALL_CLUSTER);
      const roughTerm = activates(desc, ROUGH_HANDLING);
      const fastTerm  = activates(desc, FAST_CLUSTER);

      if (fallTerm) {
        status = 'INVALID';
        matchedTerm = fallTerm;
        explanation = `Candidate implies destabilization (${fallTerm}), directly violating the stability constraint`;
      } else if (roughTerm) {
        status = 'INVALID';
        matchedTerm = roughTerm;
        explanation = `Rough handling (${roughTerm}) is incompatible with the stability requirement`;
      } else if (fastTerm) {
        status = 'DEGRADED';
        matchedTerm = fastTerm;
        explanation = `Fast movement (${fastTerm}) reduces stability margin and increases destabilization risk`;
      }
      break;
    }

    case 'MUST_PRESERVE': {
      const damageTerm  = activates(desc, DAMAGE_CLUSTER);
      const discardTerm = activates(desc, DISCARD_CLUSTER);
      const throwTerm   = activates(desc, THROW_CLUSTER);
      const roughTerm   = activates(desc, ROUGH_HANDLING);
      const fastTerm    = activates(desc, FAST_CLUSTER);

      if (damageTerm || discardTerm || throwTerm) {
        status = 'INVALID';
        matchedTerm = (damageTerm ?? discardTerm ?? throwTerm)!;
        explanation = `Candidate action involves ${damageTerm ? 'damage' : discardTerm ? 'discarding' : 'throwing'} which is incompatible with the preservation constraint`;
      } else if (roughTerm || fastTerm) {
        status = 'DEGRADED';
        matchedTerm = (roughTerm ?? fastTerm)!;
        explanation = `${roughTerm ? 'Rough handling' : 'Fast action'} introduces preservation risk`;
      }
      break;
    }

    case 'MUST_NOT_DAMAGE': {
      const damageTerm = activates(desc, DAMAGE_CLUSTER);
      const roughTerm  = activates(desc, ROUGH_HANDLING);
      const throwTerm  = activates(desc, THROW_CLUSTER);

      if (damageTerm || throwTerm) {
        status = 'INVALID';
        matchedTerm = (damageTerm ?? throwTerm)!;
        explanation = `Candidate action explicitly involves ${damageTerm ? 'damage/destruction' : 'throwing'}, violating the no-damage constraint`;
      } else if (roughTerm) {
        status = 'DEGRADED';
        matchedTerm = roughTerm;
        explanation = `Rough handling (${roughTerm}) risks unintended damage`;
      }
      break;
    }

    case 'NUMERIC_MAX': {
      const exceedTerm   = activates(desc, EXCEED_CLUSTER);
      const increaseTerm = activates(desc, INCREASE_CLUSTER);

      if (exceedTerm) {
        status = 'INVALID';
        matchedTerm = exceedTerm;
        explanation = `Candidate implies exceeding the maximum limit (${cc.numericBound}${cc.numericUnit ? ' ' + cc.numericUnit : ''}) in this constraint`;
      } else if (increaseTerm) {
        status = 'DEGRADED';
        matchedTerm = increaseTerm;
        explanation = `Candidate increases the constrained quantity; if current value is near the maximum of ${cc.numericBound}${cc.numericUnit ? ' ' + cc.numericUnit : ''}, this risks exceeding it`;
      }
      break;
    }

    case 'NUMERIC_MIN': {
      const decreaseTerm = activates(desc, DECREASE_CLUSTER);

      if (decreaseTerm) {
        status = 'DEGRADED';
        matchedTerm = decreaseTerm;
        explanation = `Candidate reduces the constrained quantity; if current value is near the minimum of ${cc.numericBound}${cc.numericUnit ? ' ' + cc.numericUnit : ''}, this risks violating the constraint`;
      }
      break;
    }

    case 'MUST_NOT_GENERIC': {
      const concept = cc.forbiddenConcept ?? '';
      if (!concept) break;

      // Try to match the forbidden concept against all clusters generically
      const allForbiddenClusters = [
        { name: 'throwing', cluster: THROW_CLUSTER },
        { name: 'dropping', cluster: DROP_CLUSTER },
        { name: 'falling',  cluster: FALL_CLUSTER },
        { name: 'damage',   cluster: DAMAGE_CLUSTER },
        { name: 'discarding', cluster: DISCARD_CLUSTER },
        { name: 'rough handling', cluster: ROUGH_HANDLING },
        { name: 'fast movement', cluster: FAST_CLUSTER },
        { name: 'increasing', cluster: INCREASE_CLUSTER },
        { name: 'decreasing', cluster: DECREASE_CLUSTER },
        { name: 'exceeding limits', cluster: EXCEED_CLUSTER },
      ];

      // Direct concept match in candidate
      if (lower.includes(concept.toLowerCase())) {
        status = 'INVALID';
        matchedTerm = concept;
        explanation = `Candidate explicitly contains the forbidden concept "${concept}" from this constraint`;
      } else {
        // Look for semantic cluster activation by finding the concept's cluster neighborhood
        for (const { name, cluster } of allForbiddenClusters) {
          if (cluster.some(t => concept.toLowerCase().includes(t) || t.includes(concept.toLowerCase()))) {
            const hit = activates(desc, cluster);
            if (hit) {
              status = 'INVALID';
              matchedTerm = hit;
              explanation = `Candidate action "${hit}" is semantically equivalent to the forbidden "${concept}" in this constraint`;
              break;
            }
          }
        }
      }

      // If still LAWFUL after generic check, test rough/fast as DEGRADED
      if (status === 'LAWFUL') {
        const roughTerm = activates(desc, ROUGH_HANDLING);
        const fastTerm  = activates(desc, FAST_CLUSTER);
        if (roughTerm || fastTerm) {
          status = 'DEGRADED';
          matchedTerm = (roughTerm ?? fastTerm)!;
          explanation = `Candidate involves ${roughTerm ? 'rough handling' : 'fast action'} which may risk violating this constraint`;
        }
      }
      break;
    }

    case 'MUST_AFFIRMATIVE': {
      const concept = cc.requiredConcept ?? '';
      if (!concept) break;

      // Check if candidate contains anything in the MAINTAIN/CAREFUL/CAREFUL cluster
      // that corresponds to the required concept
      // For affirmative constraints, absence is DEGRADED (not INVALID)
      const maintainTerm = activates(desc, MAINTAIN_CLUSTER);
      const carefulTerm  = activates(desc, CAREFUL_CLUSTER);
      const decreaseTerm = activates(desc, DECREASE_CLUSTER);

      if (decreaseTerm && /stable|maintain|preserve|continue|remain/i.test(concept)) {
        status = 'DEGRADED';
        matchedTerm = decreaseTerm;
        explanation = `Constraint requires "${concept}" but candidate involves reduction (${decreaseTerm}), reducing margin`;
      } else if (!maintainTerm && !carefulTerm) {
        // Candidate doesn't show evidence of meeting the required condition
        status = 'DEGRADED';
        explanation = `Constraint requires "${concept}" — candidate does not demonstrate compliance with this requirement`;
      }
      break;
    }

    case 'UNKNOWN':
    default: {
      // For unknown constraints, do a lightweight pass: flag throwing/damage as DEGRADED
      const throwTerm  = activates(desc, THROW_CLUSTER);
      const damageTerm = activates(desc, DAMAGE_CLUSTER);
      if (throwTerm || damageTerm) {
        status = 'DEGRADED';
        matchedTerm = (throwTerm ?? damageTerm)!;
        explanation = `Candidate involves potentially risky action (${matchedTerm}) — review against this constraint manually`;
      }
      break;
    }
  }

  const reason = status === 'LAWFUL'
    ? `Candidate satisfies constraint: "${constraint}"`
    : buildReason(status, desc, constraint, matchedTerm, explanation);

  return { status, reason, violatedConstraint: constraint, matchedTerm: matchedTerm ?? undefined };
}

/* =========================================================
   Aggregate: evaluate one candidate against ALL constraints
   ========================================================= */

export interface CandidateConstraintSummary {
  status: NomosActionClassification;
  reasons: string[];
  violatedConstraints: string[];
}

/**
 * Evaluates a single candidate against all declared constraints.
 * Worst status across all constraints wins (INVALID > DEGRADED > LAWFUL).
 * Only non-LAWFUL reasons are included in the output.
 */
export function evaluateCandidateAgainstConstraints(
  candidate: NomosCandidateBlock,
  constraints: string[]
): CandidateConstraintSummary {
  if (constraints.length === 0) {
    return { status: 'LAWFUL', reasons: ['No constraints declared — candidate is presumptively lawful.'], violatedConstraints: [] };
  }

  const results = constraints.map((c) => evaluateConstraint(candidate, c));

  let worst: NomosActionClassification = 'LAWFUL';
  const reasons: string[] = [];
  const violated: string[] = [];

  for (const r of results) {
    if (r.status === 'INVALID') worst = 'INVALID';
    else if (r.status === 'DEGRADED' && worst !== 'INVALID') worst = 'DEGRADED';

    if (r.status !== 'LAWFUL') {
      reasons.push(r.reason);
      violated.push(r.violatedConstraint);
    }
  }

  if (worst === 'LAWFUL') {
    reasons.push('Candidate satisfies all declared constraints.');
  }

  return { status: worst, reasons, violatedConstraints: violated };
}
