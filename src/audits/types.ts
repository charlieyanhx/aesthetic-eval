/**
 * Core audit system interfaces.
 * Every scoring category implements AuditModule.
 * Scoring uses the Guard pattern (inspired by Wallace/css-analyzer).
 */

import type { AestheticEvalConfig } from "../config/schema.js";
import type { ParsedPage, ParsedCSS } from "../parser/types.js";

// ---------------------------------------------------------------------------
// Guard — a single, named check with a capped penalty
// ---------------------------------------------------------------------------

export interface GuardResult {
  guardId: string;
  passed: boolean;
  /** The measured value (for reporting). */
  value: number | string | boolean;
  /** Actual points deducted (0 to guard.maxPenalty). */
  penalty: number;
  /** Human-readable explanation. */
  detail?: string;
  /** Was this guard skipped (e.g., requires browser in static mode)? */
  skipped?: boolean;
}

export interface Guard {
  /** Unique identifier, e.g. "color-contrast-wcag-aa". */
  id: string;
  /** Human-readable name, e.g. "WCAG AA Contrast Ratio". */
  name: string;
  /** Research citation, e.g. "WCAG 2.2 SC 1.4.3". */
  citation?: string;
  /** Maximum points this guard can deduct. Prevents runaway penalties. */
  maxPenalty: number;
  /** If true, this guard is skipped in static mode. */
  requiresBrowser: boolean;
  /** Evaluate the guard against the audit context. */
  evaluate(ctx: AuditContext): GuardResult;
}

// ---------------------------------------------------------------------------
// Audit Module — a scoring category (e.g., "Color & Contrast")
// ---------------------------------------------------------------------------

export interface AuditResult {
  /** Category ID, e.g. "color-contrast". */
  id: string;
  /** Human-readable category name, e.g. "Color & Contrast". */
  name: string;
  /** Final score 0-100. */
  score: number;
  /** Weight applied to this category. */
  weight: number;
  /** Individual guard results. */
  guardResults: GuardResult[];
  /** Category-specific detailed data for JSON output. */
  details: Record<string, unknown>;
  /** Actionable recommendations for scores below threshold. */
  recommendations: string[];
}

export interface AuditModule {
  /** Category ID matching config weights key. */
  id: string;
  /** Display name for the category. */
  name: string;
  /** Default weight (0-1). Can be overridden by config. */
  defaultWeight: number;
  /** All guards in this category. */
  guards: Guard[];
  /** Run all guards and compute the category score. */
  run(ctx: AuditContext): Promise<AuditResult>;
}

// ---------------------------------------------------------------------------
// Audit Context — passed to every audit's run() method
// ---------------------------------------------------------------------------

export interface AuditContext {
  config: AestheticEvalConfig;
  /** Parsed HTML pages. */
  pages: ParsedPage[];
  /** Aggregated CSS data. */
  css: ParsedCSS;
  /** Current mode. */
  mode: "static" | "browser";
  /** Playwright page handles — one per URL (only in browser mode). */
  browserPages?: unknown[]; // Playwright Page[] — typed loosely to avoid hard dep
}
