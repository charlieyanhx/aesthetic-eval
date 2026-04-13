/**
 * SARIF (Static Analysis Results Interchange Format) output.
 * Conforms to SARIF v2.1.0 schema.
 * GitHub Actions natively consumes SARIF for code scanning alerts.
 *
 * Citation: OASIS SARIF TC, "SARIF Version 2.1.0" (2020).
 */

import type { OverallResult } from "../scoring/aggregator.js";
import type { AuditResult, GuardResult } from "../audits/types.js";

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
  invocations: Array<{
    executionSuccessful: boolean;
    endTimeUtc: string;
  }>;
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  helpUri?: string;
  defaultConfiguration: {
    level: "error" | "warning" | "note";
  };
  properties?: {
    tags: string[];
    citation?: string;
  };
}

interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: { text: string };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation: { uri: string };
    };
  }>;
  properties?: {
    penalty: number;
    value: unknown;
    category: string;
  };
}

export interface SarifReport {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

/**
 * Map guard penalty to SARIF level.
 * - error: penalty > 10 (significant issue)
 * - warning: penalty > 0 (minor issue)
 * - note: penalty === 0 but not passed (informational)
 */
function penaltyToLevel(penalty: number, passed: boolean): "error" | "warning" | "note" {
  if (penalty > 10) return "error";
  if (penalty > 0) return "warning";
  if (!passed) return "note";
  return "note";
}

/**
 * Build SARIF rules from all audit guard definitions.
 */
function buildRules(categories: AuditResult[]): SarifRule[] {
  const rules: SarifRule[] = [];

  for (const cat of categories) {
    for (const guard of cat.guardResults) {
      const defaultLevel = penaltyToLevel(guard.penalty, guard.passed);
      const rule: SarifRule = {
        id: guard.guardId,
        name: guard.guardId
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        shortDescription: {
          text: guard.detail || guard.guardId,
        },
        defaultConfiguration: {
          level: defaultLevel,
        },
        properties: {
          tags: [cat.id, cat.name],
        },
      };
      rules.push(rule);
    }
  }

  return rules;
}

/**
 * Build SARIF results from guard results.
 * Only includes non-passing or penalized guards.
 */
function buildResults(categories: AuditResult[], target: string): SarifResult[] {
  const results: SarifResult[] = [];

  for (const cat of categories) {
    for (const guard of cat.guardResults) {
      // Skip passed guards with no penalty and skip skipped guards
      if (guard.passed && guard.penalty === 0) continue;
      if (guard.skipped) continue;

      const result: SarifResult = {
        ruleId: guard.guardId,
        level: penaltyToLevel(guard.penalty, guard.passed),
        message: {
          text: guard.detail || `Guard ${guard.guardId} did not pass`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: target },
            },
          },
        ],
        properties: {
          penalty: guard.penalty,
          value: guard.value,
          category: cat.name,
        },
      };
      results.push(result);
    }
  }

  return results;
}

/**
 * Format evaluation results as SARIF v2.1.0.
 */
export function formatSarif(result: OverallResult, target: string, version = "2.0.0"): SarifReport {
  return {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "aesthetic-eval",
            version,
            informationUri: "https://github.com/charlieyanhx/aesthetic-eval",
            rules: buildRules(result.categories),
          },
        },
        results: buildResults(result.categories, target),
        invocations: [
          {
            executionSuccessful: true,
            endTimeUtc: result.generatedAt,
          },
        ],
      },
    ],
  };
}
