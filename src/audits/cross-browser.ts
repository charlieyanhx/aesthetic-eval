/**
 * Audit: Cross-Browser & Device Compatibility (weight: 0.13)
 * Phase 3: integrates @mdn/browser-compat-data for real browser support checking.
 */

import type { AuditModule, AuditContext, AuditResult, Guard, GuardResult } from "./types.js";
import { buildAuditResult } from "../scoring/guard.js";
import { checkBrowserCompat, extractCssProperties } from "../utils/compat.js";

const guards: Guard[] = [
  {
    id: "media-queries",
    name: "Responsive Media Queries",
    maxPenalty: 20,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const r = ctx.css.responsive;
      let penalty = 0;
      if (!r.hasMediaQueries) penalty = 20;
      else if (r.breakpoints.size < 2) penalty = 10;
      else if (r.breakpoints.size < 3) penalty = 5;
      return {
        guardId: "media-queries",
        passed: r.hasMediaQueries && r.breakpoints.size >= 2,
        value: r.breakpoints.size,
        penalty,
        detail: `${r.breakpoints.size} breakpoints, ${r.mediaQueryCount} media queries`,
      };
    },
  },
  {
    id: "modern-layout",
    name: "Modern Layout (Flexbox/Grid)",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const has = ctx.css.responsive.hasFlexbox || ctx.css.responsive.hasGrid;
      return {
        guardId: "modern-layout",
        passed: has,
        value: has,
        penalty: has ? 0 : 10,
        detail: has
          ? `Uses ${[ctx.css.responsive.hasFlexbox && "flexbox", ctx.css.responsive.hasGrid && "grid"].filter(Boolean).join(" + ")}`
          : "No flexbox or grid detected",
      };
    },
  },
  {
    id: "modern-css-functions",
    name: "Modern CSS Functions",
    maxPenalty: 15,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const r = ctx.css.responsive;
      const features = [r.hasClamp, r.hasMinMax, r.hasViewportUnits, r.hasContainerQuery, r.hasLogicalProperties];
      const count = features.filter(Boolean).length;
      let penalty = 0;
      if (count === 0) penalty = 15;
      else if (!r.hasClamp && !r.hasMinMax && !r.hasViewportUnits) penalty = 10;
      return {
        guardId: "modern-css-functions",
        passed: count > 0,
        value: count,
        penalty,
        detail: `${count}/5 modern CSS features (clamp, min/max, viewport units, container queries, logical properties)`,
      };
    },
  },
  // Phase 3: Real browser compat data replaces heuristic vendor prefix checking
  {
    id: "browser-compat-data",
    name: "CSS Browser Compatibility",
    citation: "MDN Browser Compatibility Data",
    maxPenalty: 15,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const rawCss = ctx.css.rawText;
      if (!rawCss || rawCss.length < 10) {
        return { guardId: "browser-compat-data", passed: true, value: 0, penalty: 0, detail: "No CSS to check" };
      }

      const properties = extractCssProperties(rawCss);
      if (properties.size === 0) {
        return { guardId: "browser-compat-data", passed: true, value: 0, penalty: 0, detail: "No CSS properties found" };
      }

      const targetQuery = ctx.config.targetBrowsers || "> 0.5%, last 2 versions, not dead";
      const result = checkBrowserCompat(properties, targetQuery);

      let penalty = 0;
      penalty += result.unsupportedCount * 3;
      penalty += result.partialCount * 1;
      penalty = Math.min(15, penalty);

      const issueDetails = result.issues.length > 0
        ? result.issues
            .slice(0, 5)
            .map((i) => `${i.property} (${i.browser} ${i.severity})`)
            .join("; ")
        : "All properties supported";

      return {
        guardId: "browser-compat-data",
        passed: result.unsupportedCount === 0,
        value: result.issues.length,
        penalty,
        detail: `Checked ${result.checkedProperties} properties: ${result.unsupportedCount} unsupported, ${result.partialCount} partial. ${issueDetails}`,
      };
    },
  },
  {
    id: "viewport-meta-tag",
    name: "Viewport Meta Tag",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const has = ctx.css.features.hasViewportMeta;
      return {
        guardId: "viewport-meta-tag",
        passed: has,
        value: has,
        penalty: has ? 0 : 10,
        detail: has ? "Has viewport meta tag" : "Missing viewport meta tag",
      };
    },
  },
  {
    id: "responsive-images-compat",
    name: "Responsive Images",
    maxPenalty: 5,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const has = ctx.css.features.hasPictureElement || ctx.css.features.hasSrcset;
      return {
        guardId: "responsive-images-compat",
        passed: has,
        value: has,
        penalty: has ? 0 : 5,
        detail: has ? "Uses <picture> or srcset" : "No responsive images found",
      };
    },
  },
  {
    id: "print-styles",
    name: "Print Styles",
    maxPenalty: 3,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      return {
        guardId: "print-styles",
        passed: ctx.css.features.hasPrintStyles,
        value: ctx.css.features.hasPrintStyles,
        penalty: ctx.css.features.hasPrintStyles ? 0 : 3,
        detail: ctx.css.features.hasPrintStyles ? "Has print styles" : "No print styles",
      };
    },
  },
  {
    id: "dark-mode",
    name: "Dark Mode Support",
    maxPenalty: 5,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const has = ctx.css.features.hasDarkMode || ctx.css.features.hasColorScheme;
      return {
        guardId: "dark-mode",
        passed: has,
        value: has,
        penalty: has ? 0 : 5,
        detail: has ? "Has dark mode / color-scheme support" : "No dark mode support",
      };
    },
  },
];

export const crossBrowserAudit: AuditModule = {
  id: "cross-browser",
  name: "Cross-Browser & Device Compat",
  defaultWeight: 0.13,
  guards,

  async run(ctx: AuditContext): Promise<AuditResult> {
    const details: Record<string, unknown> = {
      responsive: {
        ...ctx.css.responsive,
        breakpoints: [...ctx.css.responsive.breakpoints].sort((a, b) => a - b),
      },
      targetBrowsers: ctx.config.targetBrowsers,
    };
    const recommendations = [
      !ctx.css.responsive.hasMediaQueries ? "No media queries found. Add responsive breakpoints." : "",
      !ctx.css.responsive.hasFlexbox && !ctx.css.responsive.hasGrid ? "No flexbox or grid layout detected." : "",
      !ctx.css.features.hasDarkMode && !ctx.css.features.hasColorScheme ? "Consider adding dark mode support." : "",
    ];
    return buildAuditResult(this, ctx, details, recommendations);
  },
};
