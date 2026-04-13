/**
 * Configuration loader — reads aesthetic-eval.config.json from cwd,
 * merges with defaults, validates.
 */

import fs from "node:fs";
import path from "node:path";
import type { AestheticEvalConfig } from "./schema.js";
import { DEFAULT_CONFIG } from "./defaults.js";

/**
 * Deep merge two objects (source into target).
 * Only merges plain objects, replaces arrays and primitives.
 */
function deepMerge(target: Record<string, any>, source: Record<string, any>): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (
      srcVal !== undefined &&
      typeof srcVal === "object" &&
      srcVal !== null &&
      !Array.isArray(srcVal) &&
      typeof tgtVal === "object" &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }
  return result;
}

/** Validate that weights sum to ~1.0 */
function validateWeights(config: AestheticEvalConfig): void {
  const sum = Object.values(config.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > 0.01) {
    console.warn(
      `Warning: Category weights sum to ${sum.toFixed(3)} (expected 1.0). Scores may be skewed.`,
    );
  }
}

/**
 * Load configuration.
 * Priority: CLI overrides > config file > defaults.
 */
export function loadConfig(
  configPath?: string,
  cliOverrides?: Partial<AestheticEvalConfig>,
): AestheticEvalConfig {
  let fileConfig: Partial<AestheticEvalConfig> = {};

  // Try to load config file
  const searchPath = configPath || path.join(process.cwd(), "aesthetic-eval.config.json");
  if (fs.existsSync(searchPath)) {
    try {
      const raw = fs.readFileSync(searchPath, "utf-8");
      fileConfig = JSON.parse(raw);
      if (!configPath) {
        console.log(`Loaded config from ${searchPath}`);
      }
    } catch (e) {
      console.warn(`Warning: Could not parse config file ${searchPath}: ${(e as Error).message}`);
    }
  }

  // Merge: defaults <- file config <- CLI overrides
  let config = deepMerge(DEFAULT_CONFIG as any, fileConfig as any) as AestheticEvalConfig;
  if (cliOverrides) {
    config = deepMerge(config as any, cliOverrides as any) as AestheticEvalConfig;
  }

  validateWeights(config);
  return config;
}
