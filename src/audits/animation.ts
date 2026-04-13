/**
 * Audit: Animation & Interaction (weight: 0.05)
 */

import type { AuditModule, AuditContext, AuditResult, Guard, GuardResult } from "./types.js";
import { buildAuditResult } from "../scoring/guard.js";

const guards: Guard[] = [
  {
    id: "has-transitions-or-animations",
    name: "Transitions/Animations Present",
    maxPenalty: 15,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const has = ctx.css.metrics.hasTransitions || ctx.css.metrics.hasAnimations;
      return {
        guardId: "has-transitions-or-animations",
        passed: has,
        value: has,
        penalty: has ? 0 : 15,
        detail: has ? "Has CSS transitions/animations" : "No transitions or animations found",
      };
    },
  },
  {
    id: "hover-states",
    name: "Hover States",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      return {
        guardId: "hover-states",
        passed: ctx.css.metrics.hasHoverStates,
        value: ctx.css.metrics.hasHoverStates,
        penalty: ctx.css.metrics.hasHoverStates ? 0 : 10,
        detail: ctx.css.metrics.hasHoverStates ? "Has :hover states" : "No :hover states found",
      };
    },
  },
  {
    id: "prefers-reduced-motion",
    name: "Prefers Reduced Motion",
    citation: "WCAG 2.3.3; Material Design Motion",
    maxPenalty: 20,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const hasMotion = ctx.css.metrics.hasTransitions || ctx.css.metrics.hasAnimations;
      const hasMedia = ctx.css.metrics.hasReducedMotion;
      const penalty = hasMotion && !hasMedia ? 20 : 0;
      return {
        guardId: "prefers-reduced-motion",
        passed: !hasMotion || hasMedia,
        value: hasMedia,
        penalty,
        detail: hasMedia ? "Respects prefers-reduced-motion" : "Missing prefers-reduced-motion media query",
      };
    },
  },
  {
    id: "animation-duration-range",
    name: "Animation Duration Range",
    citation: "Material Design Motion (100-500ms); Nielsen 1993",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const durations = ctx.css.metrics.animationDurations;
      if (durations.length === 0) {
        return { guardId: "animation-duration-range", passed: true, value: "none", penalty: 0 };
      }
      const [min, max] = ctx.config.thresholds.animationDurationRange ?? [150, 500];
      const ideal = durations.filter((d) => d >= min && d <= max);
      const rate = Math.round((ideal.length / durations.length) * 100);
      const penalty = rate < 50 ? 10 : 0;
      return {
        guardId: "animation-duration-range",
        passed: rate >= 50,
        value: rate,
        penalty,
        detail: `${rate}% of animations in ideal range (${min}-${max}ms)`,
      };
    },
  },
];

export const animationAudit: AuditModule = {
  id: "animation",
  name: "Animation & Interaction",
  defaultWeight: 0.05,
  guards,

  async run(ctx: AuditContext): Promise<AuditResult> {
    const details = {
      hasTransitions: ctx.css.metrics.hasTransitions,
      hasAnimations: ctx.css.metrics.hasAnimations,
      hasHoverStates: ctx.css.metrics.hasHoverStates,
      prefersReducedMotion: ctx.css.metrics.hasReducedMotion,
    };
    const recommendations = [
      !ctx.css.metrics.hasReducedMotion && (ctx.css.metrics.hasTransitions || ctx.css.metrics.hasAnimations)
        ? "Add @media (prefers-reduced-motion) to respect user preferences." : "",
      !ctx.css.metrics.hasHoverStates ? "Add hover states for better interactive feedback." : "",
    ];
    return buildAuditResult(this, ctx, details, recommendations);
  },
};
