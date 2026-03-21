/**
 * validation_format.ts
 *
 * Compression and formatting for validation issues.
 * Groups by domain, collapses to one line per domain.
 * Optionally appends example from the first matching issue.
 */

import type { ValidationIssue } from "./validation_engine";

/* =========================================================
   compressIssues — the primary output formatter
   Multiple issues → 1 line per domain (e.g. "Constraints invalid: missing threshold; ambiguous.")
   ========================================================= */

export function compressIssues(issues: ValidationIssue[]): string[] {
  if (!issues.length) return [];

  const groups = groupIssues(issues);
  const lines:  string[] = [];

  for (const [field, list] of Object.entries(groups)) {
    const labels  = Array.from(new Set(list.map(compactLabel)));
    const example = list.find((i) => i.example)?.example;

    const prefix =
      field === "constraint"
        ? "Constraints invalid"
        : field === "intent"
        ? "Intent invalid"
        : "Assumptions invalid";

    let line = `${prefix}: ${labels.join("; ")}.`;

    if (example) {
      line = `${stripPeriod(line)}; e.g., ${example}.`;
    }

    lines.push(line);
  }

  return lines;
}

/* =========================================================
   Internal helpers
   ========================================================= */

function groupIssues(issues: ValidationIssue[]): Record<string, ValidationIssue[]> {
  const groups: Record<string, ValidationIssue[]> = {};

  for (const issue of issues) {
    const key = issue.field;
    if (!groups[key]) groups[key] = [];
    groups[key].push(issue);
  }

  return groups;
}

function compactLabel(i: ValidationIssue): string {
  const m = i.message.toLowerCase();

  if (m.includes("threshold"))   return "missing threshold";
  if (m.includes("unit"))        return "missing unit";
  if (m.includes("ambiguous"))   return "ambiguous";
  if (m.includes("intent"))      return "undefined intent";
  if (m.includes("constraints")) return "missing constraints";
  if (m.includes("assumptions")) return "missing assumptions";

  return "invalid";
}

function stripPeriod(s: string): string {
  return s.replace(/\.$/, "");
}
