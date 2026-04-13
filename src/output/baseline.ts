/**
 * Baseline/diff mode — save evaluation snapshots and compare subsequent runs.
 * Useful for PR reviews: see how design quality changes between commits.
 */

import fs from "node:fs";
import type { OverallResult } from "../scoring/aggregator.js";

export interface BaselineSnapshot {
  generatedAt: string;
  target: string;
  score: number;
  grade: string;
  categories: Array<{
    id: string;
    name: string;
    score: number;
    weight: number;
  }>;
}

export interface BaselineDiff {
  overall: { before: number; after: number; delta: number };
  grade: { before: string; after: string };
  categories: Array<{
    id: string;
    name: string;
    before: number;
    after: number;
    delta: number;
  }>;
  improved: string[];
  regressed: string[];
  unchanged: string[];
}

/** Save a baseline snapshot to disk. */
export function saveBaseline(result: OverallResult, target: string, filePath: string): void {
  const snapshot: BaselineSnapshot = {
    generatedAt: result.generatedAt,
    target,
    score: result.score,
    grade: result.grade,
    categories: result.categories.map((c) => ({
      id: c.id,
      name: c.name,
      score: c.score,
      weight: c.weight,
    })),
  };
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
}

/** Load a baseline snapshot from disk. */
export function loadBaseline(filePath: string): BaselineSnapshot {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as BaselineSnapshot;
}

/** Compare current results against a baseline. */
export function compareBaseline(baseline: BaselineSnapshot, current: OverallResult): BaselineDiff {
  const categories: BaselineDiff["categories"] = [];
  const improved: string[] = [];
  const regressed: string[] = [];
  const unchanged: string[] = [];

  for (const cat of current.categories) {
    const baseCat = baseline.categories.find((b) => b.id === cat.id);
    const before = baseCat?.score ?? 0;
    const after = cat.score;
    const delta = after - before;

    categories.push({
      id: cat.id,
      name: cat.name,
      before,
      after,
      delta,
    });

    if (delta > 2) improved.push(cat.name);
    else if (delta < -2) regressed.push(cat.name);
    else unchanged.push(cat.name);
  }

  return {
    overall: {
      before: baseline.score,
      after: current.score,
      delta: current.score - baseline.score,
    },
    grade: {
      before: baseline.grade,
      after: current.grade,
    },
    categories,
    improved,
    regressed,
    unchanged,
  };
}

/** Format a baseline diff as a human-readable table. */
export function formatDiff(diff: BaselineDiff): string {
  const lines: string[] = [];

  lines.push("=== Baseline Comparison ===\n");

  const arrow = diff.overall.delta > 0 ? "+" : "";
  lines.push(`Overall: ${diff.overall.before} -> ${diff.overall.after} (${arrow}${diff.overall.delta})`);
  lines.push(`Grade: ${diff.grade.before} -> ${diff.grade.after}\n`);

  lines.push("Category Changes:");
  for (const cat of diff.categories) {
    const arrow = cat.delta > 0 ? "+" : "";
    const marker = cat.delta > 2 ? " [improved]" : cat.delta < -2 ? " [REGRESSED]" : "";
    lines.push(`  ${cat.name.padEnd(35)} ${String(cat.before).padStart(3)} -> ${String(cat.after).padStart(3)} (${arrow}${cat.delta})${marker}`);
  }

  if (diff.improved.length > 0) {
    lines.push(`\nImproved: ${diff.improved.join(", ")}`);
  }
  if (diff.regressed.length > 0) {
    lines.push(`\nREGRESSED: ${diff.regressed.join(", ")}`);
  }

  return lines.join("\n");
}
