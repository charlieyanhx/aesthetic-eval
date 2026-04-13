/**
 * Audit: Spacing Consistency (weight: 0.10)
 * Checks grid adherence, spacing scale, outlier detection, and design token extraction.
 */

import type { AuditModule, AuditContext, AuditResult, Guard, GuardResult } from "./types.js";
import { mode, outliersByMode } from "../utils/math.js";
import { buildAuditResult } from "../scoring/guard.js";

/**
 * Extract likely design tokens from spacing values by clustering.
 * Returns the detected spacing scale.
 */
function extractDesignTokens(values: number[]): { scale: number[]; coverage: number } {
  if (values.length === 0) return { scale: [], coverage: 0 };

  const rounded = values.map((v) => Math.round(v));
  const counts = new Map<number, number>();
  for (const v of rounded) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  // Sort by frequency, take top values as likely tokens
  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([v]) => v > 0);

  // Take values that appear more than once, up to 12 tokens
  const tokens = sorted
    .filter(([, count]) => count >= 2)
    .slice(0, 12)
    .map(([v]) => v)
    .sort((a, b) => a - b);

  // Calculate how much of the total spacing is covered by these tokens
  const tokenSet = new Set(tokens);
  const covered = rounded.filter((v) => tokenSet.has(v)).length;
  const coverage = values.length > 0 ? Math.round((covered / values.length) * 100) : 0;

  return { scale: tokens, coverage };
}

const guards: Guard[] = [
  {
    id: "spacing-grid-adherence",
    name: "Spacing Grid Adherence",
    citation: "Material Design 3 (4dp grid); Nathan Curtis (2015)",
    maxPenalty: 25,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const values = ctx.css.spacing.values;
      if (values.length === 0) {
        return { guardId: "spacing-grid-adherence", passed: true, value: 100, penalty: 0 };
      }
      const gridBase = ctx.config.thresholds.spacingGridBase ?? 4;
      const onGrid = values.filter((v) => v % gridBase === 0 || v === 0);
      const rate = Math.round((onGrid.length / values.length) * 100);
      const penalty = Math.max(0, (100 - rate) * 0.4);
      return {
        guardId: "spacing-grid-adherence",
        passed: rate >= 80,
        value: rate,
        penalty,
        detail: `${rate}% of spacing values on ${gridBase}px grid`,
      };
    },
  },
  {
    id: "spacing-unique-values",
    name: "Spacing Scale Consistency",
    citation: "Design system best practices",
    maxPenalty: 20,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const unique = [...new Set(ctx.css.spacing.values.map((v) => Math.round(v)))];
      // Citation: Design system best practices — Salesforce Lightning: 7, Shopify Polaris: 8
      const maxUnique = ctx.config.thresholds.maxUniqueSpacingValues ?? 15;
      const penalty = unique.length > maxUnique ? Math.min(20, (unique.length - maxUnique)) : 0;
      return {
        guardId: "spacing-unique-values",
        passed: unique.length <= 15,
        value: unique.length,
        penalty,
        detail: `${unique.length} unique spacing values (ideal: 8-12)`,
      };
    },
  },
  {
    id: "spacing-outliers",
    name: "Spacing Outlier Detection",
    citation: "Wallace/css-analyzer mode-based outlier technique",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const values = ctx.css.spacing.values;
      const outliers = outliersByMode(values, 3);
      const penalty = Math.min(10, outliers.length * 2);
      return {
        guardId: "spacing-outliers",
        passed: outliers.length === 0,
        value: outliers.length,
        penalty,
        detail: `${outliers.length} spacing outliers (mode: ${mode(values)}px)`,
      };
    },
  },
  // Phase 3: Design token coverage
  {
    id: "spacing-design-tokens",
    name: "Design Token Coverage",
    citation: "Nathan Curtis, Space in Design Systems (2015)",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const values = ctx.css.spacing.values;
      if (values.length === 0) {
        return { guardId: "spacing-design-tokens", passed: true, value: 100, penalty: 0 };
      }

      const { scale, coverage } = extractDesignTokens(values);
      const penalty = coverage < 50 ? 10 : coverage < 70 ? 5 : 0;

      return {
        guardId: "spacing-design-tokens",
        passed: coverage >= 70,
        value: coverage,
        penalty,
        detail: `Design token coverage: ${coverage}% (${scale.length} tokens detected: [${scale.join(", ")}]px)`,
      };
    },
  },
];

export const spacingAudit: AuditModule = {
  id: "spacing",
  name: "Spacing Consistency",
  defaultWeight: 0.10,
  guards,

  async run(ctx: AuditContext): Promise<AuditResult> {
    const values = ctx.css.spacing.values;
    const uniqueSpacing = [...new Set(values.map((v) => Math.round(v)))].sort((a, b) => a - b);
    const { scale, coverage } = extractDesignTokens(values);

    const details = {
      totalSpacingValues: values.length,
      uniqueSpacingValues: uniqueSpacing.length,
      spacingScale: uniqueSpacing.slice(0, 20),
      modeValue: mode(values),
      outlierCount: outliersByMode(values, 3).length,
      detectedDesignTokens: scale,
      designTokenCoverage: coverage,
    };

    const recommendations = [
      uniqueSpacing.length > 15 ? `${uniqueSpacing.length} unique spacing values. Use a consistent scale (e.g., 4/8/12/16/24/32/48/64).` : "",
      coverage < 70 ? `Only ${coverage}% of spacing uses consistent values. Consider adopting a design token scale.` : "",
    ];

    return buildAuditResult(this, ctx, details, recommendations);
  },
};
