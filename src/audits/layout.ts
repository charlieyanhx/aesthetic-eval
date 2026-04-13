/**
 * Audit: Layout & Structure (weight: 0.12)
 */

import type { AuditModule, AuditContext, AuditResult, Guard, GuardResult } from "./types.js";
import { clamp, mean } from "../utils/math.js";
import { buildAuditResult } from "../scoring/guard.js";

const guards: Guard[] = [
  {
    id: "heading-hierarchy",
    name: "Heading Hierarchy",
    citation: "WCAG 1.3.1; HTML5 spec",
    maxPenalty: 20,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      let totalSkips = 0;
      let multipleH1 = 0;
      let missingH1 = 0;
      for (const p of ctx.pages) {
        totalSkips += p.headingSkips;
        if (p.headings.h1 > 1) multipleH1++;
        if (p.headings.h1 === 0 && (p.headings.h2 > 0 || p.headings.h3 > 0)) missingH1++;
      }
      const penalty = Math.min(20, totalSkips * 5 + multipleH1 * 5 + missingH1 * 5);
      return {
        guardId: "heading-hierarchy",
        passed: totalSkips === 0 && multipleH1 === 0 && missingH1 === 0,
        value: totalSkips,
        penalty,
        detail: `${totalSkips} heading skips, ${multipleH1} pages with multiple h1, ${missingH1} pages missing h1`,
      };
    },
  },
  {
    id: "semantic-html",
    name: "Semantic HTML Elements",
    citation: "HTML5 spec; WCAG 1.3.1",
    maxPenalty: 15,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      let penalty = 0;
      const missingMain = ctx.pages.filter((p) => p.mains === 0).length;
      const missingNav = ctx.pages.filter((p) => p.headers === 0 && p.navs === 0).length;
      const missingFooter = ctx.pages.filter((p) => p.footers === 0).length;
      penalty += missingMain * 5;
      penalty += missingNav * 2;
      penalty += missingFooter * 2;
      return {
        guardId: "semantic-html",
        passed: missingMain === 0,
        value: missingMain,
        penalty: Math.min(15, penalty),
        detail: `${missingMain} pages missing <main>, ${missingNav} missing nav/header, ${missingFooter} missing footer`,
      };
    },
  },
  {
    id: "viewport-meta",
    name: "Viewport Meta Tag",
    citation: "Mobile best practices",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const missing = ctx.pages.filter((p) => !p.hasViewport).length;
      return {
        guardId: "viewport-meta",
        passed: missing === 0,
        value: missing,
        penalty: missing > 0 ? 10 : 0,
        detail: missing > 0 ? `${missing} pages missing viewport meta` : "All pages have viewport meta",
      };
    },
  },
  {
    id: "max-width-constraints",
    name: "Content Max-Width Constraints",
    citation: "Design best practices",
    maxPenalty: 5,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const has = ctx.css.metrics.hasMaxWidth;
      return {
        guardId: "max-width-constraints",
        passed: has,
        value: has,
        penalty: has ? 0 : 5,
        detail: has ? "Has max-width constraints" : "No max-width constraints found",
      };
    },
  },
];

export const layoutAudit: AuditModule = {
  id: "layout",
  name: "Layout & Structure",
  defaultWeight: 0.12,
  guards,

  async run(ctx: AuditContext): Promise<AuditResult> {
    const details = {
      pagesAnalyzed: ctx.pages.length,
      hasMaxWidthConstraints: ctx.css.metrics.hasMaxWidth,
    };
    const missingMain = ctx.pages.filter((p) => p.mains === 0).length;
    const recommendations = [
      missingMain > 0 ? `${missingMain} pages missing a <main> element.` : "",
      !ctx.css.metrics.hasMaxWidth ? "No max-width constraints. Content may stretch too wide on large screens." : "",
    ];
    return buildAuditResult(this, ctx, details, recommendations);
  },
};
