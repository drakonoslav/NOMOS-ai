export type IntentType =
  | "NUTRITION_AUDIT"
  | "NUTRITION_MEAL_AUDIT"
  | "NUTRITION_TEMPORAL_FUELING"
  | "NUTRITION_LABEL_AUDIT"
  | "NUTRITION_LABEL_TRUTH"
  | "TRAINING_AUDIT"
  | "SCHEDULE_AUDIT"
  | "GENERIC_CONSTRAINT_TASK"
  | "UNKNOWN";

export interface TemplateCandidate {
  id: string;
  text: string;
}

export interface DomainTemplate {
  intent: IntentType;
  title: string;
  description: string;

  state: string[];
  constraints: string[];
  uncertainties: string[];
  candidates: TemplateCandidate[];
  objective: string[];

  requiredFields: string[];
  optionalFields: string[];

  missingFieldHints: Record<string, string>;
}

// ─── Shared template bodies ────────────────────────────────────────────────────
//
// NUTRITION_MEAL_AUDIT and NUTRITION_AUDIT share the same semantic template.
// NUTRITION_LABEL_TRUTH and NUTRITION_LABEL_AUDIT share the same semantic template.
// Defined once, referenced twice — avoids copy-paste drift.

const _NUTRITION_MEAL_AUDIT_BODY = {
  title: "Nutrition Meal Audit",
  description:
    "Use for meal-plan audits, macro verification, food-label grounding, and structure-preserving correction.",
  state: [
    "User is requesting a nutrition system audit or correction.",
    "Meal structure may already exist but must be declared explicitly.",
    "Food-label images or food macro sources may be required as source truth.",
    "The task is not freeform nutrition advice; it is verification and correction against declared targets.",
  ],
  constraints: [
    "Preserve meal order unless explicitly allowed otherwise.",
    "Preserve meal count unless explicitly allowed otherwise.",
    "Preserve protein placement by meal unless explicitly allowed otherwise.",
    "Use attached food labels as source truth where provided.",
    "Do not infer food behavior that is not supported by declared labels or source data.",
    "If correction is requested, prefer the smallest structure-preserving change.",
  ],
  uncertainties: [
    "Meal plan may not yet be attached.",
    "Food-label truth may not yet be attached.",
    "Estimated foods may be present without explicit source labels.",
    "Fiber handling versus net-carb handling may not yet be specified.",
  ],
  candidates: [
    { id: "A", text: "Audit only. Determine whether the nutrition system is faithful to the declared food data." },
    { id: "B", text: "Audit plus minimal correction. Preserve meal structure and protein placement while correcting drift." },
    { id: "C", text: "Audit plus derive reusable system rule. Identify recurring drift and express it as a correction rule." },
  ],
  objective: [
    "Determine whether the nutrition system is accurate against the declared source truth.",
    "Identify macro drift, structural drift, or unsupported reasoning.",
    "If correction is requested, produce the smallest structure-preserving adjustment pattern.",
  ],
  requiredFields: ["meal_system_or_phase_plan", "target_macros_or_goal", "food_source_truth_or_labels"],
  optionalFields: ["estimated_food_rules", "fiber_handling_rule", "correction_mode", "locked_food_placements"],
  missingFieldHints: {
    meal_system_or_phase_plan:       "Add the current meal system or phase plan in declared form.",
    target_macros_or_goal:           "Add target calories and/or macro targets for the system being audited.",
    food_source_truth_or_labels:     "Attach food labels or declare the source-truth macro data for the foods in the system.",
    estimated_food_rules:            "State which foods are estimated rather than label-grounded, such as banana or eggs.",
    fiber_handling_rule:             "State whether total carbs or net carbs should govern evaluation.",
    correction_mode:                 "State whether the task is audit only, audit plus correction, or audit plus reusable rule derivation.",
    locked_food_placements:          "State which foods or meal placements must remain fixed.",
  },
};

const _NUTRITION_LABEL_TRUTH_BODY = {
  title: "Nutrition Label Truth",
  description:
    "Use for food-label verification, macro comparison between declared and label-grounded data, source-truth correction, and serving-size interpretation.",
  state: [
    "A nutrition label audit or food comparison query is present.",
    "Label-derived macro data is the governing source of truth.",
    "The task is verification, comparison, or correction against declared label data.",
  ],
  constraints: [
    "Use attached food labels or declared label data as source truth.",
    "Do not infer macro values not supported by label data.",
    "If correction is requested, prefer the smallest label-faithful change.",
  ],
  uncertainties: [
    "Label images or label text may not yet be attached.",
    "Unit conversion (per serving vs per 100g) may require explicit declaration.",
    "Serving size interpretation may be ambiguous.",
  ],
  candidates: [
    { id: "A", text: "Audit only. Determine whether the declared food data matches the label." },
    { id: "B", text: "Audit plus correction. Produce the label-faithful correction." },
  ],
  objective: [
    "Verify food macro data against declared source-truth labels.",
    "Identify discrepancies and, if requested, produce the smallest label-faithful correction.",
  ],
  requiredFields: ["food_source_truth_or_labels"],
  optionalFields: ["estimated_food_rules", "fiber_handling_rule"],
  missingFieldHints: {
    food_source_truth_or_labels: "Attach food labels or declare the source-truth macro data for the foods being audited.",
    estimated_food_rules:        "State which foods are estimated rather than label-grounded.",
    fiber_handling_rule:         "State whether total carbs or net carbs should govern evaluation.",
  },
};

// ─── Template registry ─────────────────────────────────────────────────────────

export const DOMAIN_TEMPLATES: Record<
  Exclude<IntentType, "UNKNOWN">,
  DomainTemplate
> = {
  // NUTRITION_AUDIT and NUTRITION_MEAL_AUDIT share the same template body.
  // NUTRITION_AUDIT is the legacy key; NUTRITION_MEAL_AUDIT is the canonical classifier output.
  NUTRITION_AUDIT: {
    intent: "NUTRITION_AUDIT",
    ..._NUTRITION_MEAL_AUDIT_BODY,
  },

  NUTRITION_MEAL_AUDIT: {
    intent: "NUTRITION_MEAL_AUDIT",
    ..._NUTRITION_MEAL_AUDIT_BODY,
    title: "Nutrition Meal Audit",
  },

  NUTRITION_TEMPORAL_FUELING: {
    intent: "NUTRITION_TEMPORAL_FUELING",
    title: "Nutrition Temporal Fueling",
    description:
      "Use for pre- or post-workout fueling decisions, carb-timing admissibility, protein-window constraints, and candidate ranking by strongest margin.",

    state: [
      "A nutrition timing decision query is present.",
      "Candidate fueling actions are declared.",
      "Temporal nutrient constraints are declared.",
      "The task is to determine admissibility and strongest margin across candidates.",
    ],

    constraints: [
      "Constraints must be explicit temporal threshold rules (e.g., at least Xg of nutrient Y within Z minutes).",
      "Do not evaluate implied timing rules — only declared thresholds are binding.",
      "Do not infer food classification (fast vs slow GI) from food name alone without declaration.",
    ],

    uncertainties: [
      "Fast vs slow carbohydrate classification should be explicitly declared for each candidate food.",
      "\"Strongest margin\" is interpreted as the greatest admissible distance from constraint failure.",
    ],

    candidates: [
      {
        id: "A",
        text: "Fast-digesting carbohydrate source consumed within the declared timing window.",
      },
      {
        id: "B",
        text: "Slow-digesting carbohydrate source consumed within the declared timing window.",
      },
    ],

    objective: [
      "Determine which candidates are admissible under the declared temporal nutrient constraints.",
      "Among admissible candidates, identify the candidate with the strongest margin.",
    ],

    requiredFields: ["hard_constraints", "candidates"],

    optionalFields: ["objective"],

    missingFieldHints: {
      hard_constraints:
        "Declare explicit temporal threshold constraints, e.g., 'at least 60g fast-digesting carbs within 90 minutes before lifting'.",
      candidates:
        "Declare at least two candidate fueling actions with explicit food, amount, and timing.",
      objective:
        "State whether the task is admissibility determination, margin ranking, or both.",
    },
  },

  NUTRITION_LABEL_AUDIT: {
    intent: "NUTRITION_LABEL_AUDIT",
    title: "Nutrition Label Audit",
    description:
      "Use for food-label verification, macro comparison between declared and label-grounded data, source-truth correction, and serving-size interpretation.",

    state: [
      "A nutrition label audit or food comparison query is present.",
      "Label-derived macro data is the governing source of truth.",
      "The task is verification, comparison, or correction against declared label data.",
    ],

    constraints: [
      "Use attached food labels or declared label data as source truth.",
      "Do not infer macro values not supported by label data.",
      "If correction is requested, prefer the smallest label-faithful change.",
    ],

    uncertainties: [
      "Label images or label text may not yet be attached.",
      "Unit conversion (per serving vs per 100g) may require explicit declaration.",
      "Serving size interpretation may be ambiguous.",
    ],

    candidates: [
      {
        id: "A",
        text: "Audit only. Determine whether the declared food data matches the label.",
      },
      {
        id: "B",
        text: "Audit plus correction. Produce the label-faithful correction.",
      },
    ],

    objective: [
      "Verify food macro data against declared source-truth labels.",
      "Identify discrepancies and, if requested, produce the smallest label-faithful correction.",
    ],

    requiredFields: ["food_source_truth_or_labels"],

    optionalFields: ["estimated_food_rules", "fiber_handling_rule"],

    missingFieldHints: {
      food_source_truth_or_labels:
        "Attach food labels or declare the source-truth macro data for the foods being audited.",
      estimated_food_rules:
        "State which foods are estimated rather than label-grounded.",
      fiber_handling_rule:
        "State whether total carbs or net carbs should govern evaluation.",
    },
  },

  // NUTRITION_LABEL_TRUTH — canonical classifier output key.
  // Semantically identical to NUTRITION_LABEL_AUDIT (legacy key).
  NUTRITION_LABEL_TRUTH: {
    intent: "NUTRITION_LABEL_TRUTH",
    ..._NUTRITION_LABEL_TRUTH_BODY,
  },

  TRAINING_AUDIT: {
    intent: "TRAINING_AUDIT",
    title: "Training Audit",
    description:
      "Use for workout-program audits, training-structure verification, recovery-bound correction, and progression logic.",

    state: [
      "User is requesting an audit or correction of a training system.",
      "Program structure may already exist but must be declared explicitly.",
      "Training days, exercise selection, volume, frequency, and progression logic may be relevant.",
      "Recovery context such as sleep, soreness, HRV, or fatigue may affect admissibility.",
    ],

    constraints: [
      "Preserve declared training structure unless explicitly allowed otherwise.",
      "Do not remove training days unless explicitly allowed.",
      "Do not change exercise placement unless explicitly allowed.",
      "Respect declared recovery limits and progression constraints.",
      "Do not infer readiness or overload from missing data.",
      "If correction is requested, prefer the smallest structure-preserving change.",
    ],

    uncertainties: [
      "Program structure may not yet be attached.",
      "Recovery data may be incomplete or missing.",
      "Progression rules may not yet be declared.",
      "Exercise intent may be ambiguous if splits or goals are not declared.",
    ],

    candidates: [
      {
        id: "A",
        text: "Audit only. Determine whether the program is coherent and faithful to the declared constraints.",
      },
      {
        id: "B",
        text: "Audit plus minimal correction. Preserve training structure while correcting overload, recovery mismatch, or progression drift.",
      },
      {
        id: "C",
        text: "Audit plus derive reusable rule. Identify recurring structural weaknesses and express them as a repeatable training rule.",
      },
    ],

    objective: [
      "Determine whether the training system is structurally coherent and compatible with the declared constraints.",
      "Identify progression drift, recovery mismatch, or structural contradictions.",
      "If correction is requested, produce the smallest change that restores admissibility.",
    ],

    requiredFields: ["training_program", "primary_goal", "hard_constraints"],

    optionalFields: [
      "recovery_data",
      "progression_logic",
      "locked_exercises_or_days",
      "fatigue_thresholds",
    ],

    missingFieldHints: {
      training_program:
        "Add the current training program in declared form, including days, exercises, and structure.",
      primary_goal:
        "State the primary training goal, such as hypertrophy, strength, maintenance, or deload.",
      hard_constraints:
        "State hard limits such as maximum fatigue, fixed training days, preserved exercise slots, or recovery minimums.",
      recovery_data:
        "Add sleep, soreness, HRV, fatigue, or other recovery signals if they should govern evaluation.",
      progression_logic:
        "State the current progression rule, such as linear load increase, rep progression, or autoregulation.",
      locked_exercises_or_days:
        "State which exercises, days, or placements must remain fixed.",
      fatigue_thresholds:
        "State any maximum tolerated soreness, fatigue, or workload limits.",
    },
  },

  SCHEDULE_AUDIT: {
    intent: "SCHEDULE_AUDIT",
    title: "Schedule Audit",
    description:
      "Use for daily schedule audits, time-block correction, feasibility checking, and deviation control.",

    state: [
      "User is requesting an audit or correction of a schedule system.",
      "Planned blocks may include sleep, work, meals, commute, training, chores, or other fixed commitments.",
      "The system may include planned versus actual timing and deviation handling.",
      "Feasibility depends on declared time blocks and hard limits.",
    ],

    constraints: [
      "Preserve declared anchor blocks unless explicitly allowed otherwise.",
      "Do not fabricate time that has not been declared.",
      "Respect sleep minimums, work-hour requirements, and fixed appointments where provided.",
      "Do not infer feasibility from missing durations.",
      "If correction is requested, prefer the smallest structure-preserving adjustment.",
    ],

    uncertainties: [
      "Planned schedule may not yet be attached.",
      "Actual durations may be missing.",
      "Commute or task variability may be unresolved.",
      "Sleep minimums or deadline constraints may not yet be declared.",
    ],

    candidates: [
      {
        id: "A",
        text: "Audit only. Determine whether the declared schedule is feasible and internally coherent.",
      },
      {
        id: "B",
        text: "Audit plus minimal correction. Preserve anchor blocks while correcting timing drift or infeasibility.",
      },
      {
        id: "C",
        text: "Audit plus derive reusable rule. Identify recurring deviation sources and express them as a scheduling rule.",
      },
    ],

    objective: [
      "Determine whether the schedule system is feasible under the declared time constraints.",
      "Identify conflicts, impossible packing, or unstable buffers.",
      "If correction is requested, produce the smallest structure-preserving timing adjustment pattern.",
    ],

    requiredFields: [
      "planned_schedule",
      "anchor_constraints",
      "objective_or_success_condition",
    ],

    optionalFields: [
      "actual_schedule",
      "minimum_sleep_rule",
      "buffer_rules",
      "fixed_deadlines",
    ],

    missingFieldHints: {
      planned_schedule:
        "Add the current planned schedule with declared time blocks.",
      anchor_constraints:
        "State which blocks are fixed, such as wake time, work hours, training blocks, meals, or bedtime.",
      objective_or_success_condition:
        "State what the schedule is trying to optimize, such as minimizing deviation, preserving sleep, or maintaining training adherence.",
      actual_schedule:
        "Add the actual schedule if deviation or adherence is being audited.",
      minimum_sleep_rule:
        "State the minimum required sleep duration if sleep must constrain the schedule.",
      buffer_rules:
        "State whether transition buffers or commute buffers are required.",
      fixed_deadlines:
        "Add any hard deadlines, appointments, or must-start-by times.",
    },
  },

  GENERIC_CONSTRAINT_TASK: {
    intent: "GENERIC_CONSTRAINT_TASK",
    title: "Generic Constraint Task",
    description:
      "Use when the request is structured but does not yet clearly belong to nutrition, training, or scheduling.",

    state: [
      "User is requesting evaluation of a declared system or decision problem.",
      "The current domain is not yet specific enough for a specialized template.",
    ],

    constraints: [
      "Do not evaluate implied intent directly.",
      "Use only declared structure.",
      "Do not smooth over missing required fields.",
    ],

    uncertainties: [
      "Domain may be under-specified.",
      "Constraints may not yet be explicit.",
      "Candidates may not yet be declared.",
    ],

    candidates: [
      {
        id: "A",
        text: "Audit only. Determine whether the declared structure is sufficient for evaluation.",
      },
      {
        id: "B",
        text: "Audit plus minimal clarification request. Identify the missing declared fields required for evaluation.",
      },
    ],

    objective: [
      "Determine whether the submission is sufficiently declared to support valid evaluation.",
      "Identify the smallest missing pieces needed to make the task evaluable.",
    ],

    requiredFields: ["state_description", "hard_constraints", "objective"],

    optionalFields: ["uncertainties", "candidates", "source_truth"],

    missingFieldHints: {
      state_description: "Describe the current system or decision problem clearly.",
      hard_constraints: "State the hard limits or non-negotiable boundaries.",
      objective: "State what outcome matters most.",
      uncertainties: "List unknowns or unresolved variables if they matter.",
      candidates:
        "Provide at least two candidate actions or options if evaluation requires comparison.",
      source_truth:
        "Add the governing data, labels, measurements, or declared evidence if evaluation depends on them.",
    },
  },
};

export function getDomainTemplate(intent: IntentType): DomainTemplate | null {
  if (intent === "UNKNOWN") return null;
  return DOMAIN_TEMPLATES[intent];
}
