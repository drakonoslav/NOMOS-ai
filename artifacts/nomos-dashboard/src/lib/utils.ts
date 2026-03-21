import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVector(vec: number[] | null | undefined): string {
  if (!vec) return "NULL";
  return `[${vec.map(v => v.toFixed(4)).join(", ")}]`;
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}
