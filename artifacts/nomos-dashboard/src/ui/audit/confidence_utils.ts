/**
 * confidence_utils.ts
 *
 * Maps symbolic prediction confidence levels to a numeric value
 * suitable for bar charts and trend visualizations.
 */

export function confidenceToNumber(c?: "low" | "moderate" | "high"): number | null {
  if (!c) return null;
  if (c === "low")      return 0.3;
  if (c === "moderate") return 0.6;
  if (c === "high")     return 0.9;
  return null;
}

export function formatConfidenceTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
