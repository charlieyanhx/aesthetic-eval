/**
 * Audit: Text Wrapping & Line Breaking (weight: 0.10)
 * Static mode: CSS heuristics. Browser mode: real overflow + reflow detection.
 */

import type { AuditModule, AuditContext, AuditResult, Guard, GuardResult } from "./types.js";
import { buildAuditResult } from "../scoring/guard.js";

/**
 * Detect actual text overflow in the browser (scrollWidth > clientWidth).
 */
async function detectTextOverflow(browserPages: unknown[]): Promise<{ overflowCount: number; elements: string[] }> {
  try {
    const pwPage = browserPages[0] as import("playwright").Page;

    const result = await pwPage.evaluate(() => {
      const overflowing: string[] = [];
      const containers = document.querySelectorAll("p, div, span, li, td, th, h1, h2, h3, h4, h5, h6, blockquote");
      for (const el of containers) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.scrollWidth > htmlEl.clientWidth + 1) {
          const tag = el.tagName.toLowerCase();
          const text = (el.textContent || "").slice(0, 40);
          overflowing.push(`<${tag}>: "${text}..."`);
        }
      }
      return overflowing;
    });

    return { overflowCount: result.length, elements: result.slice(0, 10) };
  } catch {
    return { overflowCount: 0, elements: [] };
  }
}

/**
 * Check for horizontal scroll at 320px viewport (simulates 400% zoom on 1280px).
 * WCAG 1.4.10 requires content reflow at 320 CSS pixels wide.
 */
async function checkLayoutReflow(browserPages: unknown[]): Promise<{ hasHorizontalScroll: boolean; scrollWidth: number; viewportWidth: number }> {
  try {
    const pwPage = browserPages[0] as import("playwright").Page;

    // Resize viewport to 320px
    await pwPage.setViewportSize({ width: 320, height: 480 });
    // Wait for reflow
    await pwPage.waitForTimeout(500);

    const result = await pwPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    // Restore viewport
    await pwPage.setViewportSize({ width: 1280, height: 720 });

    return {
      hasHorizontalScroll: result.scrollWidth > result.clientWidth + 10,
      scrollWidth: result.scrollWidth,
      viewportWidth: result.clientWidth,
    };
  } catch {
    return { hasHorizontalScroll: false, scrollWidth: 320, viewportWidth: 320 };
  }
}

const guards: Guard[] = [
  {
    id: "overflow-wrap",
    name: "Overflow Wrap",
    maxPenalty: 15,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const tw = ctx.css.textWrapping;
      const has = tw.hasOverflowWrap || tw.hasWordWrap || tw.hasWordBreak;
      return {
        guardId: "overflow-wrap",
        passed: has,
        value: has,
        penalty: has ? 0 : 15,
        detail: has ? "Has overflow-wrap/word-wrap/word-break" : "No text overflow protection found",
      };
    },
  },
  {
    id: "text-overflow-ellipsis",
    name: "Text Overflow Ellipsis",
    maxPenalty: 5,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const has = ctx.css.textWrapping.hasTextOverflowEllipsis;
      return {
        guardId: "text-overflow-ellipsis",
        passed: has,
        value: has,
        penalty: has ? 0 : 5,
        detail: has ? "Has text-overflow: ellipsis" : "No graceful truncation for long text",
      };
    },
  },
  {
    id: "text-max-width",
    name: "Text Container Max Width",
    citation: "Bringhurst p.26 (45-75 chars); WCAG 1.4.8",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const tw = ctx.css.textWrapping;
      const has = tw.hasChMaxWidth || tw.hasReasonablePxMaxWidth;
      return {
        guardId: "text-max-width",
        passed: has,
        value: has,
        penalty: has ? 0 : 10,
        detail: has
          ? "Text containers have max-width constraints"
          : "No max-width on text containers (ideal: 45-75ch or 600-900px)",
      };
    },
  },
  {
    id: "excessive-nowrap",
    name: "Excessive white-space: nowrap",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const count = ctx.css.textWrapping.whiteSpaceNowrapCount;
      const maxNowrap = ctx.config.thresholds.maxNowrapDeclarations ?? 10;
      const penalty = count > maxNowrap ? Math.min(10, Math.round((count - maxNowrap) * 0.5)) : 0;
      return {
        guardId: "excessive-nowrap",
        passed: count <= 10,
        value: count,
        penalty,
        detail: `${count} white-space: nowrap declarations`,
      };
    },
  },
  {
    id: "excessive-br-tags",
    name: "Excessive <br> Tags",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const avg = ctx.pages.length > 0 ? ctx.css.textWrapping.totalBrTags / ctx.pages.length : 0;
      const maxBr = ctx.config.thresholds.maxAvgBrTagsPerPage ?? 5;
      const penalty = avg > maxBr ? Math.min(10, Math.round(avg - maxBr)) : 0;
      return {
        guardId: "excessive-br-tags",
        passed: avg <= 5,
        value: Math.round(avg * 10) / 10,
        penalty,
        detail: `Avg ${Math.round(avg * 10) / 10} <br> tags per page in text elements`,
      };
    },
  },
  {
    id: "long-unbroken-strings",
    name: "Long Unbroken Strings",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const count = ctx.css.textWrapping.longUnbrokenStrings;
      const penalty = count > 0 ? Math.min(10, count * 2) : 0;
      return {
        guardId: "long-unbroken-strings",
        passed: count === 0,
        value: count,
        penalty,
        detail: `${count} strings over 30 characters without break points`,
      };
    },
  },
  {
    id: "text-wrap-balance",
    name: "Modern Text Wrap",
    maxPenalty: 3,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const tw = ctx.css.textWrapping;
      const has = tw.hasTextWrapBalance || tw.hasTextWrapPretty;
      return {
        guardId: "text-wrap-balance",
        passed: has,
        value: has,
        penalty: has ? 0 : 3,
        detail: has ? "Uses text-wrap: balance/pretty" : "Consider text-wrap: balance for headings",
      };
    },
  },
  // Browser-only guards
  {
    id: "actual-text-overflow",
    name: "Actual Text Overflow Detection",
    citation: "WCAG 1.4.4 (Resize Text)",
    maxPenalty: 15,
    requiresBrowser: true,
    evaluate(_ctx: AuditContext): GuardResult {
      return {
        guardId: "actual-text-overflow",
        passed: true,
        value: "pending",
        penalty: 0,
        detail: "Text overflow detection (browser mode)",
        skipped: true,
      };
    },
  },
  {
    id: "layout-reflow-320",
    name: "Content Reflow at 320px",
    citation: "WCAG 1.4.10 (Reflow); 320 CSS px = 1280px at 400% zoom",
    maxPenalty: 15,
    requiresBrowser: true,
    evaluate(_ctx: AuditContext): GuardResult {
      return {
        guardId: "layout-reflow-320",
        passed: true,
        value: "pending",
        penalty: 0,
        detail: "Layout reflow check (browser mode)",
        skipped: true,
      };
    },
  },
];

export const textWrappingAudit: AuditModule = {
  id: "text-wrapping",
  name: "Text Wrapping & Line Breaking",
  defaultWeight: 0.10,
  guards,

  async run(ctx: AuditContext): Promise<AuditResult> {
    const details: Record<string, unknown> = { ...ctx.css.textWrapping };
    const recommendations = [
      !ctx.css.textWrapping.hasOverflowWrap && !ctx.css.textWrapping.hasWordWrap
        ? "Add overflow-wrap: break-word to prevent text overflow." : "",
      !ctx.css.textWrapping.hasChMaxWidth && !ctx.css.textWrapping.hasReasonablePxMaxWidth
        ? "Set max-width on text containers (45-75ch or 600-900px) for optimal line length." : "",
    ];

    const result = buildAuditResult(this, ctx, details, recommendations);

    // Browser-mode checks
    if (ctx.mode === "browser" && ctx.browserPages && ctx.browserPages.length > 0) {
      // Text overflow detection
      const overflow = await detectTextOverflow(ctx.browserPages);
      const overflowPenalty = Math.min(15, overflow.overflowCount * 3);
      replaceGuardResult(result, "actual-text-overflow", {
        guardId: "actual-text-overflow",
        passed: overflow.overflowCount === 0,
        value: overflow.overflowCount,
        penalty: overflowPenalty,
        detail: overflow.overflowCount === 0
          ? "No text overflow detected"
          : `${overflow.overflowCount} elements have text overflow: ${overflow.elements.slice(0, 3).join(", ")}`,
      });
      details.textOverflowElements = overflow.elements;

      // Layout reflow at 320px
      const reflow = await checkLayoutReflow(ctx.browserPages);
      replaceGuardResult(result, "layout-reflow-320", {
        guardId: "layout-reflow-320",
        passed: !reflow.hasHorizontalScroll,
        value: reflow.scrollWidth,
        penalty: reflow.hasHorizontalScroll ? 15 : 0,
        detail: reflow.hasHorizontalScroll
          ? `Horizontal scroll at 320px viewport (scrollWidth: ${reflow.scrollWidth}px > ${reflow.viewportWidth}px)`
          : "Content reflows properly at 320px viewport",
      });
      details.reflowScrollWidth = reflow.scrollWidth;

      if (reflow.hasHorizontalScroll) {
        recommendations.push("Fix horizontal scroll at 320px width (WCAG 1.4.10 Reflow — 400% zoom).");
      }
    }

    return result;
  },
};

/** Replace a guard result placeholder and adjust the overall score. */
function replaceGuardResult(
  result: AuditResult,
  guardId: string,
  newResult: import("./types.js").GuardResult,
): void {
  const idx = result.guardResults.findIndex((r) => r.guardId === guardId);
  if (idx !== -1) {
    const oldPenalty = result.guardResults[idx].penalty;
    result.guardResults[idx] = newResult;
    result.score = Math.max(0, Math.min(100, result.score + oldPenalty - newResult.penalty));
  }
}
