/**
 * Score aggregation: weighted average across all audit categories.
 */

import type { AuditResult } from "../audits/types.js";

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface OverallResult {
  /** Overall score 0-100. */
  score: number;
  /** Letter grade. */
  grade: Grade;
  /** Per-category results. */
  categories: AuditResult[];
  /** Timestamp. */
  generatedAt: string;
}

/** Compute the weighted overall score from category results. */
export function aggregate(results: AuditResult[]): OverallResult {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const r of results) {
    weightedSum += r.score * r.weight;
    totalWeight += r.weight;
  }

  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return {
    score,
    grade: scoreToGrade(score),
    categories: results,
    generatedAt: new Date().toISOString(),
  };
}

export function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
