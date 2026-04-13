/**
 * Audit: Performance Indicators (weight: 0.05)
 * Static mode: heuristic checks. Browser mode: Core Web Vitals (LCP, CLS, TBT).
 */

import type { AuditModule, AuditContext, AuditResult, Guard, GuardResult } from "./types.js";
import { buildAuditResult } from "../scoring/guard.js";

/**
 * Capture Core Web Vitals from a Playwright page.
 * LCP, CLS, and TBT via Performance APIs.
 */
async function measureCoreWebVitals(
  browserPages: unknown[],
): Promise<{ lcp: number | null; cls: number | null; tbt: number | null; error?: string }> {
  try {
    // Use the first page for CWV measurement
    const pwPage = browserPages[0] as import("playwright").Page;

    const metrics = await pwPage.evaluate(async () => {
      // Wait a bit for metrics to settle
      await new Promise((r) => setTimeout(r, 1000));

      let lcp: number | null = null;
      let cls: number | null = null;
      let tbt: number | null = null;

      // LCP — via PerformanceObserver with buffered flag
      try {
        lcp = await new Promise<number | null>((resolve) => {
          let lastLcp: number | null = null;
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length > 0) {
              lastLcp = entries[entries.length - 1].startTime;
            }
          });
          observer.observe({ type: "largest-contentful-paint", buffered: true });
          // Give it a moment then resolve
          setTimeout(() => {
            observer.disconnect();
            resolve(lastLcp);
          }, 200);
        });
      } catch { /* not supported */ }

      // CLS — from layout-instability entries
      try {
        const clsEntries = performance.getEntriesByType("layout-shift") as any[];
        if (clsEntries.length > 0) {
          cls = clsEntries
            .filter((e: any) => !e.hadRecentInput)
            .reduce((sum: number, e: any) => sum + e.value, 0);
        } else {
          cls = 0; // No layout shifts = perfect
        }
      } catch { /* not supported */ }

      // TBT — approximate from long tasks
      try {
        const longTasks = performance.getEntriesByType("longtask") as any[];
        tbt = longTasks.reduce((sum: number, t: any) => sum + Math.max(0, t.duration - 50), 0);
      } catch {
        tbt = 0; // No long task API = assume no blocking
      }

      return { lcp, cls, tbt };
    });

    return metrics;
  } catch (err) {
    return { lcp: null, cls: null, tbt: null, error: (err as Error).message };
  }
}

const guards: Guard[] = [
  {
    id: "css-rule-count",
    name: "CSS Rule Count",
    maxPenalty: 15,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const rules = ctx.css.metrics.totalRules;
      const max = ctx.config.thresholds.maxCssRules ?? 2000;
      const penalty = rules > max ? Math.min(15, (rules - max) / 200) : 0;
      return {
        guardId: "css-rule-count",
        passed: rules <= max,
        value: rules,
        penalty,
        detail: `${rules} CSS rules (threshold: ${max})`,
      };
    },
  },
  {
    id: "unused-css-rate",
    name: "Unused CSS Classes",
    maxPenalty: 20,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const total = ctx.css.metrics.allCssClasses.size;
      if (total === 0) return { guardId: "unused-css-rate", passed: true, value: 0, penalty: 0 };
      const unused = [...ctx.css.metrics.allCssClasses].filter((c) => !ctx.css.metrics.htmlClassesUsed.has(c));
      const rate = Math.round((unused.length / total) * 100);
      const max = ctx.config.thresholds.maxUnusedCssRate ?? 50;
      const penalty = rate > max ? Math.min(20, (rate - max) * 0.5) : 0;
      return {
        guardId: "unused-css-rate",
        passed: rate <= max,
        value: rate,
        penalty,
        detail: `${rate}% CSS classes appear unused`,
      };
    },
  },
  {
    id: "page-size",
    name: "Page Size",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const avgSize = ctx.pages.reduce((a, p) => a + p.size, 0) / Math.max(1, ctx.pages.length);
      // Citation: Google recommends < 200KB for critical rendering path
      const maxKb = ctx.config.thresholds.maxPageSizeKb ?? 200;
      const penalty = avgSize > maxKb * 1024 ? 10 : 0;
      return {
        guardId: "page-size",
        passed: avgSize <= 200 * 1024,
        value: Math.round(avgSize / 1024 * 10) / 10,
        penalty,
        detail: `Average page size: ${Math.round(avgSize / 1024 * 10) / 10}KB`,
      };
    },
  },
  {
    id: "preload-hints",
    name: "Resource Preload Hints",
    maxPenalty: 5,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const total = ctx.pages.reduce((a, p) => a + p.preloads, 0);
      return {
        guardId: "preload-hints",
        passed: total > 0,
        value: total,
        penalty: total === 0 ? 5 : 0,
        detail: `${total} preload hints found`,
      };
    },
  },
  // Browser-only CWV guards (placeholders — actual values filled in run())
  {
    id: "cwv-lcp",
    name: "Largest Contentful Paint (LCP)",
    citation: "Web Vitals; Good < 2.5s",
    maxPenalty: 15,
    requiresBrowser: true,
    evaluate(_ctx: AuditContext): GuardResult {
      return {
        guardId: "cwv-lcp",
        passed: true,
        value: "pending",
        penalty: 0,
        detail: "LCP measurement (browser mode)",
        skipped: true,
      };
    },
  },
  {
    id: "cwv-cls",
    name: "Cumulative Layout Shift (CLS)",
    citation: "Web Vitals; Good < 0.1",
    maxPenalty: 15,
    requiresBrowser: true,
    evaluate(_ctx: AuditContext): GuardResult {
      return {
        guardId: "cwv-cls",
        passed: true,
        value: "pending",
        penalty: 0,
        detail: "CLS measurement (browser mode)",
        skipped: true,
      };
    },
  },
  {
    id: "cwv-tbt",
    name: "Total Blocking Time (TBT)",
    citation: "Web Vitals; Good < 200ms",
    maxPenalty: 10,
    requiresBrowser: true,
    evaluate(_ctx: AuditContext): GuardResult {
      return {
        guardId: "cwv-tbt",
        passed: true,
        value: "pending",
        penalty: 0,
        detail: "TBT measurement (browser mode)",
        skipped: true,
      };
    },
  },
];

export const performanceAudit: AuditModule = {
  id: "performance",
  name: "Performance Indicators",
  defaultWeight: 0.05,
  guards,

  async run(ctx: AuditContext): Promise<AuditResult> {
    const details: Record<string, unknown> = {
      totalCssRules: ctx.css.metrics.totalRules,
      totalCssClasses: ctx.css.metrics.allCssClasses.size,
    };
    const recommendations = [
      ctx.css.metrics.totalRules > 2000 ? `${ctx.css.metrics.totalRules} CSS rules. Consider removing unused styles.` : "",
    ];

    const result = buildAuditResult(this, ctx, details, recommendations);

    // In browser mode, measure CWV and replace placeholders
    if (ctx.mode === "browser" && ctx.browserPages && ctx.browserPages.length > 0) {
      const cwv = await measureCoreWebVitals(ctx.browserPages);

      // LCP — Citation: Web Vitals (Google, 2020). Good < 2.5s, Poor > 4.0s.
      if (cwv.lcp !== null) {
        const lcpSec = cwv.lcp / 1000;
        const [lcpGood, lcpPoor] = ctx.config.thresholds.lcpThresholds ?? [2.5, 4.0];
        let penalty = 0;
        if (lcpSec > lcpPoor) penalty = 15;
        else if (lcpSec > lcpGood) penalty = 8;
        else if (lcpSec > lcpGood * 0.6) penalty = 3; // Midpoint between instant and good

        replaceGuardResult(result, "cwv-lcp", {
          guardId: "cwv-lcp",
          passed: lcpSec <= lcpGood,
          value: Math.round(lcpSec * 100) / 100,
          penalty,
          detail: `LCP: ${(Math.round(lcpSec * 100) / 100).toFixed(2)}s (good < ${lcpGood}s)`,
        });
        details.lcp = lcpSec;
      }

      // CLS — Citation: Web Vitals (Google, 2020). Good < 0.1, Poor > 0.25.
      if (cwv.cls !== null) {
        const [clsGood, clsPoor] = ctx.config.thresholds.clsThresholds ?? [0.1, 0.25];
        let penalty = 0;
        if (cwv.cls > clsPoor) penalty = 15;
        else if (cwv.cls > clsGood) penalty = 8;
        else if (cwv.cls > clsGood * 0.5) penalty = 3;

        replaceGuardResult(result, "cwv-cls", {
          guardId: "cwv-cls",
          passed: cwv.cls <= clsGood,
          value: Math.round(cwv.cls * 1000) / 1000,
          penalty,
          detail: `CLS: ${(Math.round(cwv.cls * 1000) / 1000).toFixed(3)} (good < ${clsGood})`,
        });
        details.cls = cwv.cls;
      }

      // TBT — Citation: Web Vitals (Google, 2020). Good < 200ms, Poor > 600ms.
      if (cwv.tbt !== null) {
        const [tbtGood, tbtPoor] = ctx.config.thresholds.tbtThresholds ?? [200, 600];
        let penalty = 0;
        if (cwv.tbt > tbtPoor) penalty = 10;
        else if (cwv.tbt > tbtGood) penalty = 5;
        else if (cwv.tbt > tbtGood * 0.5) penalty = 2;

        replaceGuardResult(result, "cwv-tbt", {
          guardId: "cwv-tbt",
          passed: cwv.tbt <= tbtGood,
          value: Math.round(cwv.tbt),
          penalty,
          detail: `TBT: ${Math.round(cwv.tbt)}ms (good < ${tbtGood}ms)`,
        });
        details.tbt = cwv.tbt;
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
