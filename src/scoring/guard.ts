/**
 * Guard-based scoring engine.
 * Inspired by Wallace/css-analyzer's guard pattern:
 * each check has a max penalty cap, preventing runaway deductions.
 */

import { clamp } from "../utils/math.js";
import type { AuditContext, AuditModule, AuditResult, Guard, GuardResult } from "../audits/types.js";

/**
 * Run all guards in an audit module and compute the final score.
 * Score starts at 100 and guards deduct points (capped at maxPenalty each).
 */
export function runGuards(
  audit: AuditModule,
  ctx: AuditContext,
): { score: number; guardResults: GuardResult[] } {
  const guardResults: GuardResult[] = [];
  let totalPenalty = 0;

  for (const guard of audit.guards) {
    // Skip browser-only guards in static mode
    if (guard.requiresBrowser && ctx.mode === "static") {
      guardResults.push({
        guardId: guard.id,
        passed: true,
        value: "skipped",
        penalty: 0,
        detail: `Skipped: requires browser mode`,
        skipped: true,
      });
      continue;
    }

    try {
      const result = guard.evaluate(ctx);
      // Enforce maxPenalty cap
      result.penalty = clamp(result.penalty, 0, guard.maxPenalty);
      totalPenalty += result.penalty;
      guardResults.push(result);
    } catch (err) {
      // Guard errors are non-fatal — log and skip
      guardResults.push({
        guardId: guard.id,
        passed: true,
        value: "error",
        penalty: 0,
        detail: `Guard error: ${(err as Error).message}`,
        skipped: true,
      });
    }
  }

  const score = clamp(Math.round(100 - totalPenalty));
  return { score, guardResults };
}

/**
 * Build a complete AuditResult from a guard run.
 */
export function buildAuditResult(
  audit: AuditModule,
  ctx: AuditContext,
  details: Record<string, unknown>,
  recommendations: string[],
): AuditResult {
  const weight = ctx.config.weights[audit.id as keyof typeof ctx.config.weights] ?? audit.defaultWeight;
  const { score, guardResults } = runGuards(audit, ctx);

  return {
    id: audit.id,
    name: audit.name,
    score,
    weight,
    guardResults,
    details,
    recommendations: score < 80 ? recommendations.filter(Boolean) : [],
  };
}
