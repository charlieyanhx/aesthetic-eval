/**
 * Audit: Accessibility (weight: 0.10)
 * Static mode: heuristic checks. Browser mode: delegates to axe-core.
 */

import type { AuditModule, AuditContext, AuditResult, Guard, GuardResult } from "./types.js";
import { buildAuditResult } from "../scoring/guard.js";

/** Impact → penalty mapping for axe-core violations */
const AXE_IMPACT_PENALTY: Record<string, number> = {
  critical: 15,
  serious: 10,
  moderate: 5,
  minor: 2,
};

const guards: Guard[] = [
  {
    id: "html-lang",
    name: "HTML lang Attribute",
    citation: "WCAG 3.1.1",
    maxPenalty: 15,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const missing = ctx.pages.filter((p) => !p.hasLang).length;
      return {
        guardId: "html-lang",
        passed: missing === 0,
        value: missing,
        penalty: missing > 0 ? 15 : 0,
        detail: `${missing} pages missing lang attribute`,
      };
    },
  },
  {
    id: "skip-link",
    name: "Skip Navigation Link",
    citation: "WCAG 2.4.1",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const missing = ctx.pages.filter((p) => !p.hasSkipLink).length;
      return {
        guardId: "skip-link",
        passed: missing === 0,
        value: missing,
        penalty: missing > 0 ? 10 : 0,
        detail: missing > 0 ? `${missing} pages missing skip-to-content link` : "Skip link present",
      };
    },
  },
  {
    id: "zoom-not-disabled",
    name: "Zoom Not Disabled",
    citation: "WCAG 1.4.4",
    maxPenalty: 15,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const disabled = ctx.pages.filter((p) => p.disablesZoom).length;
      return {
        guardId: "zoom-not-disabled",
        passed: disabled === 0,
        value: disabled,
        penalty: disabled > 0 ? 15 : 0,
        detail: disabled > 0 ? "Viewport meta disables zoom" : "Zoom is enabled",
      };
    },
  },
  {
    id: "focus-visible-styles",
    name: "Focus Visible Styles",
    citation: "WCAG 2.4.7",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const has = ctx.css.metrics.hasFocusVisible;
      return {
        guardId: "focus-visible-styles",
        passed: has,
        value: has,
        penalty: has ? 0 : 10,
        detail: has ? "Has :focus-visible styles" : "No :focus-visible styles found",
      };
    },
  },
  {
    id: "aria-landmarks",
    name: "ARIA Landmarks",
    citation: "WCAG 1.3.1",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const noLandmarks = ctx.pages.filter((p) => p.ariaLandmarks === 0 && p.mains === 0 && p.navs === 0).length;
      return {
        guardId: "aria-landmarks",
        passed: noLandmarks === 0,
        value: noLandmarks,
        penalty: noLandmarks > 0 ? 10 : 0,
        detail: `${noLandmarks} pages without ARIA landmarks or semantic elements`,
      };
    },
  },
  {
    id: "axe-core-audit",
    name: "axe-core Accessibility Audit",
    citation: "WCAG 2.2; axe-core rule set",
    maxPenalty: 40,
    requiresBrowser: true,
    evaluate(ctx: AuditContext): GuardResult {
      // This guard is async — it's handled specially in the run() method.
      // The synchronous evaluate() returns a placeholder; the actual result
      // is computed in runAxeCoreGuard() and spliced in.
      return {
        guardId: "axe-core-audit",
        passed: true,
        value: "pending",
        penalty: 0,
        detail: "axe-core integration (browser mode)",
        skipped: true,
      };
    },
  },
];

/**
 * Run axe-core inside a Playwright page and return a GuardResult.
 */
async function runAxeCoreGuard(browserPages: unknown[]): Promise<GuardResult> {
  try {
    // Dynamic import — axe-core is a regular dependency
    // axe-core exports `source` (the full JS string) on the default export
    const axeCoreMod = await import("axe-core");
    const axeDefault = axeCoreMod.default as any;
    const axeSource: string = axeDefault.source;

    let totalPenalty = 0;
    const allViolations: Array<{ id: string; impact: string; description: string; nodes: number }> = [];

    for (const page of browserPages) {
      // Cast to Playwright Page
      const pwPage = page as import("playwright").Page;

      // Inject axe-core and run it
      const results = await pwPage.evaluate(async (src: string) => {
        // Inject axe-core source
        eval(src);
        // Run axe with WCAG AA configuration
        const axe = (window as any).axe;
        const result = await axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
          },
        });
        return {
          violations: result.violations.map((v: any) => ({
            id: v.id,
            impact: v.impact || "minor",
            description: v.description,
            nodes: v.nodes.length,
          })),
          passes: result.passes.length,
          incomplete: result.incomplete.length,
        };
      }, axeSource);

      for (const v of results.violations) {
        const impactPenalty = AXE_IMPACT_PENALTY[v.impact] ?? 2;
        totalPenalty += impactPenalty;
        allViolations.push(v);
      }
    }

    // Cap at maxPenalty (40)
    totalPenalty = Math.min(40, totalPenalty);

    const violationSummary = allViolations.length > 0
      ? allViolations
          .sort((a, b) => (AXE_IMPACT_PENALTY[b.impact] ?? 0) - (AXE_IMPACT_PENALTY[a.impact] ?? 0))
          .slice(0, 5)
          .map((v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes} elements)`)
          .join("; ")
      : "No violations";

    return {
      guardId: "axe-core-audit",
      passed: allViolations.length === 0,
      value: allViolations.length,
      penalty: totalPenalty,
      detail: `axe-core: ${allViolations.length} violations found. ${violationSummary}`,
    };
  } catch (err) {
    return {
      guardId: "axe-core-audit",
      passed: true,
      value: "error",
      penalty: 0,
      detail: `axe-core error: ${(err as Error).message}`,
      skipped: true,
    };
  }
}

export const accessibilityAudit: AuditModule = {
  id: "accessibility",
  name: "Accessibility",
  defaultWeight: 0.10,
  guards,

  async run(ctx: AuditContext): Promise<AuditResult> {
    const details: Record<string, unknown> = {
      hasFocusVisibleStyles: ctx.css.metrics.hasFocusVisible,
    };
    const recommendations = [
      !ctx.css.metrics.hasFocusVisible ? "Add :focus-visible styles for keyboard navigation." : "",
      ctx.pages.some((p) => p.disablesZoom) ? "Remove maximum-scale=1 or user-scalable=no." : "",
      ctx.pages.some((p) => !p.hasSkipLink) ? "Add a skip-to-content link for keyboard users." : "",
    ];

    // Build the standard result first
    const result = buildAuditResult(this, ctx, details, recommendations);

    // If in browser mode with pages available, run axe-core and replace the placeholder
    if (ctx.mode === "browser" && ctx.browserPages && ctx.browserPages.length > 0) {
      const axeResult = await runAxeCoreGuard(ctx.browserPages);

      // Replace the placeholder axe-core guard result
      const axeIndex = result.guardResults.findIndex((r) => r.guardId === "axe-core-audit");
      if (axeIndex !== -1) {
        const oldPenalty = result.guardResults[axeIndex].penalty;
        result.guardResults[axeIndex] = axeResult;
        // Adjust the score
        result.score = Math.max(0, Math.min(100, result.score + oldPenalty - axeResult.penalty));
      }

      details.axeViolations = axeResult.value;
      if (axeResult.penalty > 0) {
        recommendations.push(
          `axe-core found ${axeResult.value} accessibility violations. Run axe browser extension for details.`,
        );
      }
    }

    return result;
  },
};
