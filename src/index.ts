/**
 * aesthetic-eval — Programmatic API
 *
 * Usage:
 *   import { evaluate } from 'aesthetic-eval';
 *   const result = await evaluate('https://example.com', { mode: 'static' });
 *   console.log(result.score, result.grade);
 */

import type { AestheticEvalConfig } from "./config/schema.js";
import type { OverallResult } from "./scoring/aggregator.js";
import type { AuditContext } from "./audits/types.js";
import { loadConfig } from "./config/loader.js";
import { createParser } from "./parser/factory.js";
import { ALL_AUDITS } from "./audits/registry.js";
import { aggregate } from "./scoring/aggregator.js";

export type { AestheticEvalConfig } from "./config/schema.js";
export type { OverallResult } from "./scoring/aggregator.js";
export type { AuditResult, GuardResult } from "./audits/types.js";

export interface EvaluateOptions extends Partial<AestheticEvalConfig> {
  configPath?: string;
}

/**
 * Evaluate a website or local directory for aesthetic quality.
 *
 * @param target — URL (https://...) or local directory path
 * @param options — configuration overrides
 * @returns OverallResult with score, grade, and per-category details
 */
export async function evaluate(
  target: string,
  options?: EvaluateOptions,
): Promise<OverallResult> {
  const config = loadConfig(options?.configPath, options);

  // Create parser (browser with static fallback)
  const { parser, effectiveMode, browserParser } = await createParser(target, {
    mode: config.mode,
    maxExternalCss: config.maxExternalCss,
    fetchTimeout: config.fetchTimeout,
  });

  try {
    // Parse target
    const { pages, css } = await parser.parse(target);

    if (pages.length === 0) {
      throw new Error(`No pages found for target: ${target}`);
    }

    // Build audit context
    const ctx: AuditContext = {
      config,
      pages,
      css,
      mode: effectiveMode,
      browserPages: browserParser?.browserPages,
    };

    // Run all audits
    const results = await Promise.all(
      ALL_AUDITS.map((audit) => audit.run(ctx)),
    );

    // Aggregate
    return aggregate(results);
  } finally {
    // Always close the browser when done
    if (browserParser) {
      await browserParser.close();
    }
  }
}
