/**
 * Audit: Typography (weight: 0.12)
 * Checks font families, sizes, line heights, type scale, responsive sizing,
 * line length (browser), vertical rhythm, and font loading strategy.
 */

import type { AuditModule, AuditContext, AuditResult, Guard, GuardResult } from "./types.js";
import { detectTypeScale } from "../utils/math.js";
import { buildAuditResult } from "../scoring/guard.js";

/**
 * Measure actual line length (characters per line) in the browser.
 * Citation: Bringhurst p.26 (45-75 chars); WCAG 1.4.8.
 */
async function measureLineLength(browserPages: unknown[]): Promise<{ avgCharsPerLine: number; paragraphCount: number }> {
  try {
    const pwPage = browserPages[0] as import("playwright").Page;
    const result = await pwPage.evaluate(() => {
      const paragraphs = document.querySelectorAll("p, li, blockquote");
      const measurements: number[] = [];
      for (const el of paragraphs) {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const text = el.textContent?.trim();
        if (!text || text.length < 20) continue;

        const containerWidth = (el as HTMLElement).clientWidth;
        const fontSize = parseFloat(style.fontSize);
        if (fontSize <= 0) continue;

        // Approximate characters per line using average character width
        // Average character is ~0.5em wide for most fonts
        const avgCharWidth = fontSize * 0.5;
        const charsPerLine = Math.round(containerWidth / avgCharWidth);
        if (charsPerLine > 0) measurements.push(charsPerLine);
      }
      const avg = measurements.length > 0
        ? measurements.reduce((a, b) => a + b, 0) / measurements.length
        : 0;
      return { avgCharsPerLine: Math.round(avg), paragraphCount: measurements.length };
    });
    return result;
  } catch {
    return { avgCharsPerLine: 0, paragraphCount: 0 };
  }
}

const guards: Guard[] = [
  {
    id: "font-family-count",
    name: "Font Family Count",
    citation: "Industry consensus; Material Design uses 1-2",
    maxPenalty: 15,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const count = ctx.css.fonts.families.size;
      const max = ctx.config.thresholds.maxFontFamilies ?? 4;
      let penalty = 0;
      if (count === 0) penalty = 10;
      else if (count === 1) penalty = 5;
      else if (count > max) penalty = (count - max) * 5;
      return {
        guardId: "font-family-count",
        passed: count >= 2 && count <= max,
        value: count,
        penalty,
        detail: `${count} font families (ideal: 2-3)`,
      };
    },
  },
  {
    id: "min-font-size",
    name: "Minimum Font Size",
    citation: "WCAG 1.4.4; Material Design 3 (14-16px body)",
    maxPenalty: 15,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const sizes = ctx.css.fonts.sizes;
      const minFont = sizes.length > 0 ? Math.min(...sizes) : 16;
      const threshold = ctx.config.thresholds.minBodyFontSize ?? 12;
      let penalty = 0;
      if (minFont < threshold) penalty = 15;
      else if (minFont < 14) penalty = 5;
      return {
        guardId: "min-font-size",
        passed: minFont >= 14,
        value: minFont,
        penalty,
        detail: `Smallest font size: ${minFont}px`,
      };
    },
  },
  {
    id: "line-height-quality",
    name: "Line Height Quality",
    citation: "WCAG 1.4.12 (1.5x body); Bringhurst (1.3-1.6x)",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const lhs = ctx.css.fonts.lineHeights;
      if (lhs.length === 0) {
        return { guardId: "line-height-quality", passed: true, value: "no data", penalty: 0 };
      }
      const bodyLineHeights = lhs.filter((lh) => lh >= 1.2 && lh <= 3.0);
      const good = bodyLineHeights.filter((lh) => lh >= 1.3 && lh <= 2.0);
      const goodRate = bodyLineHeights.length > 0 ? good.length / bodyLineHeights.length : 1;
      const penalty = goodRate < 0.3 ? 10 : 0;
      return {
        guardId: "line-height-quality",
        passed: goodRate >= 0.3,
        value: Math.round(goodRate * 100),
        penalty,
        detail: `${Math.round(goodRate * 100)}% of body line-heights in ideal range (1.3-2.0)`,
      };
    },
  },
  {
    id: "responsive-font-sizing",
    name: "Responsive Font Sizing",
    citation: "Material Design 3; WCAG 1.4.4",
    maxPenalty: 5,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const has = ctx.css.fonts.hasResponsiveFontSizing;
      return {
        guardId: "responsive-font-sizing",
        passed: has,
        value: has,
        penalty: has ? 0 : 5,
        detail: has ? "Uses clamp()/vw units for responsive fonts" : "No responsive font sizing detected",
      };
    },
  },
  {
    id: "type-scale-consistency",
    name: "Type Scale Consistency",
    citation: "Tim Brown, 'More Meaningful Typography' (A List Apart, 2012)",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const result = detectTypeScale(ctx.css.fonts.sizes);
      if (result.consistency === 0) {
        return {
          guardId: "type-scale-consistency",
          passed: true,
          value: "insufficient data",
          penalty: 0,
          detail: "Not enough font sizes to detect a type scale",
        };
      }
      // Citation: Tim Brown, "More Meaningful Typography" — 60%+ indicates recognizable scale
      const minConsistency = ctx.config.thresholds.minTypeScaleConsistency ?? 60;
      const penalty = result.consistency >= minConsistency ? 0 : Math.round((minConsistency - result.consistency) * 0.15);
      return {
        guardId: "type-scale-consistency",
        passed: result.consistency >= 50,
        value: result.scaleName,
        penalty,
        detail: `Type scale: ${result.scaleName} (ratio: ${result.ratio}, consistency: ${result.consistency}%)`,
      };
    },
  },
  // Phase 3: Vertical rhythm check
  {
    id: "vertical-rhythm",
    name: "Vertical Rhythm Consistency",
    citation: "Bringhurst, The Elements of Typographic Style",
    maxPenalty: 8,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const lhs = ctx.css.fonts.lineHeights;
      const sizes = ctx.css.fonts.sizes;
      if (lhs.length < 2 || sizes.length < 2) {
        return { guardId: "vertical-rhythm", passed: true, value: "insufficient data", penalty: 0 };
      }

      // Compute baseline increments (lineHeight * fontSize)
      // In static mode we approximate using available data
      const increments: number[] = [];
      for (const lh of lhs) {
        for (const fs of sizes) {
          increments.push(Math.round(lh * fs));
        }
      }

      if (increments.length < 2) {
        return { guardId: "vertical-rhythm", passed: true, value: "insufficient data", penalty: 0 };
      }

      // Check if increments share a common base unit (GCD-like approach)
      const sorted = [...new Set(increments)].sort((a, b) => a - b);
      const smallest = sorted[0];
      if (smallest <= 0) {
        return { guardId: "vertical-rhythm", passed: true, value: 0, penalty: 0 };
      }

      const onGrid = sorted.filter((v) => v % smallest === 0 || Math.abs(v % smallest) < 2);
      const rhythmRate = Math.round((onGrid.length / sorted.length) * 100);

      const penalty = rhythmRate < 50 ? 8 : rhythmRate < 70 ? 4 : 0;
      return {
        guardId: "vertical-rhythm",
        passed: rhythmRate >= 50,
        value: rhythmRate,
        penalty,
        detail: `Vertical rhythm: ${rhythmRate}% of baseline increments align (base: ${smallest}px)`,
      };
    },
  },
  // Phase 3: Font loading strategy
  {
    id: "font-display",
    name: "Font Loading Strategy",
    citation: "Google Web Fundamentals: font-display",
    maxPenalty: 5,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const rawCss = ctx.css.rawText;
      const hasFontFace = rawCss.includes("@font-face");
      if (!hasFontFace) {
        return { guardId: "font-display", passed: true, value: "no @font-face", penalty: 0 };
      }

      const hasFontDisplay = /font-display\s*:\s*(swap|optional|fallback)/.test(rawCss);
      return {
        guardId: "font-display",
        passed: hasFontDisplay,
        value: hasFontDisplay,
        penalty: hasFontDisplay ? 0 : 5,
        detail: hasFontDisplay
          ? "Uses font-display: swap/optional/fallback"
          : "Missing font-display in @font-face (risk of FOIT)",
      };
    },
  },
  // Phase 3: Line length (browser-only)
  {
    id: "line-length-browser",
    name: "Line Length (Characters per Line)",
    citation: "Bringhurst p.26 (45-75 chars); WCAG 1.4.8",
    maxPenalty: 10,
    requiresBrowser: true,
    evaluate(_ctx: AuditContext): GuardResult {
      return {
        guardId: "line-length-browser",
        passed: true,
        value: "pending",
        penalty: 0,
        detail: "Line length measurement (browser mode)",
        skipped: true,
      };
    },
  },
];

export const typographyAudit: AuditModule = {
  id: "typography",
  name: "Typography",
  defaultWeight: 0.12,
  guards,

  async run(ctx: AuditContext): Promise<AuditResult> {
    const typeScale = detectTypeScale(ctx.css.fonts.sizes);
    const details: Record<string, unknown> = {
      uniqueFontFamilies: [...ctx.css.fonts.families],
      fontFamilyCount: ctx.css.fonts.families.size,
      fontSizeRange: ctx.css.fonts.sizes.length > 0
        ? { min: Math.min(...ctx.css.fonts.sizes), max: Math.max(...ctx.css.fonts.sizes) }
        : null,
      lineHeightRange: ctx.css.fonts.lineHeights.length > 0
        ? { min: Math.round(Math.min(...ctx.css.fonts.lineHeights) * 100) / 100, max: Math.round(Math.max(...ctx.css.fonts.lineHeights) * 100) / 100 }
        : null,
      letterSpacingValues: [...new Set(ctx.css.fonts.letterSpacings)].slice(0, 10),
      hasResponsiveFontSizing: ctx.css.fonts.hasResponsiveFontSizing,
      typeScale,
    };

    const recommendations = [
      ctx.css.fonts.families.size > 4 ? `Too many font families (${ctx.css.fonts.families.size}). Aim for 2-3.` : "",
      !ctx.css.fonts.hasResponsiveFontSizing ? "Consider using clamp() or vw units for responsive font sizing." : "",
      typeScale.consistency > 0 && typeScale.consistency < 50
        ? `Font sizes don't follow a consistent scale. Consider using ${typeScale.scaleName} (ratio: ${typeScale.ratio}).`
        : "",
    ];

    const result = buildAuditResult(this, ctx, details, recommendations);

    // Browser-mode: measure actual line length
    if (ctx.mode === "browser" && ctx.browserPages && ctx.browserPages.length > 0) {
      const lineLen = await measureLineLength(ctx.browserPages);
      if (lineLen.paragraphCount > 0) {
        const avg = lineLen.avgCharsPerLine;
        // Citation: Bringhurst p.26 (45-75 chars); WCAG 1.4.8 (max 80)
        const [idealMin, idealMax] = ctx.config.thresholds.lineLengthRange ?? [45, 75];
        let penalty = 0;
        if (avg < idealMin - 15 || avg > idealMax + 25) penalty = 10;
        else if (avg < idealMin || avg > idealMax) penalty = 5;

        const idx = result.guardResults.findIndex((r) => r.guardId === "line-length-browser");
        if (idx !== -1) {
          const oldPenalty = result.guardResults[idx].penalty;
          result.guardResults[idx] = {
            guardId: "line-length-browser",
            passed: avg >= 45 && avg <= 75,
            value: avg,
            penalty,
            detail: `Avg line length: ~${avg} chars/line (ideal: 45-75, measured ${lineLen.paragraphCount} paragraphs)`,
          };
          result.score = Math.max(0, Math.min(100, result.score + oldPenalty - penalty));
        }
        details.avgCharsPerLine = avg;
        details.paragraphsMeasured = lineLen.paragraphCount;
      }
    }

    return result;
  },
};
