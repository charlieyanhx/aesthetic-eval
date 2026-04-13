/**
 * JSON output formatter.
 */

import type { OverallResult } from "../scoring/aggregator.js";

export interface JsonReport {
  generatedAt: string;
  overall: number;
  grade: string;
  categories: Record<string, {
    score: number;
    weight: number;
    details: Record<string, unknown>;
    recommendations: string[];
    guards: Array<{
      id: string;
      passed: boolean;
      value: unknown;
      penalty: number;
      detail?: string;
      skipped?: boolean;
    }>;
  }>;
}

export function formatJson(result: OverallResult): JsonReport {
  const categories: JsonReport["categories"] = {};

  for (const cat of result.categories) {
    categories[cat.name] = {
      score: cat.score,
      weight: cat.weight,
      details: cat.details,
      recommendations: cat.recommendations,
      guards: cat.guardResults.map((g) => ({
        id: g.guardId,
        passed: g.passed,
        value: g.value,
        penalty: g.penalty,
        detail: g.detail,
        skipped: g.skipped,
      })),
    };
  }

  return {
    generatedAt: result.generatedAt,
    overall: result.score,
    grade: result.grade,
    categories,
  };
}
