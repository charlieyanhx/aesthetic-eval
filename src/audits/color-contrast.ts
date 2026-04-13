/**
 * Audit: Color & Contrast (weight: 0.15)
 * Checks color palette size, WCAG contrast ratios, and color harmony.
 */

import type { AuditModule, AuditContext, AuditResult, Guard, GuardResult } from "./types.js";
import { parseColor, contrastRatio, clusterColors, detectColorHarmony, luminance } from "../utils/color.js";
import { clamp } from "../utils/math.js";
import { buildAuditResult } from "../scoring/guard.js";

/**
 * Run real element-level contrast checks in Playwright.
 * Walks visible text nodes, gets computed color + effective bg color.
 */
async function runBrowserContrastCheck(
  browserPages: unknown[],
): Promise<{ pairs: Array<{ ratio: number; isLargeText: boolean }>; error?: string }> {
  try {
    const allPairs: Array<{ ratio: number; isLargeText: boolean }> = [];

    for (const page of browserPages) {
      const pwPage = page as import("playwright").Page;

      const pairs = await pwPage.evaluate(() => {
        const results: Array<{ fg: string; bg: string; isLargeText: boolean }> = [];
        const textElements = document.querySelectorAll(
          "p, span, a, h1, h2, h3, h4, h5, h6, li, td, th, label, button, div, dt, dd, blockquote, figcaption",
        );

        for (const el of textElements) {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          // Only check elements with actual text content
          const text = el.textContent?.trim();
          if (!text) continue;

          const fg = style.color;
          const fontSize = parseFloat(style.fontSize);
          const fontWeight = parseInt(style.fontWeight, 10) || 400;
          const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);

          // Walk up the tree to find effective background color
          let bg = "rgb(255, 255, 255)";
          let current: Element | null = el;
          while (current) {
            const cs = window.getComputedStyle(current);
            const bgColor = cs.backgroundColor;
            if (bgColor && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
              bg = bgColor;
              break;
            }
            current = current.parentElement;
          }

          results.push({ fg, bg, isLargeText });
        }
        return results;
      });

      // Compute contrast ratios in Node.js
      for (const { fg, bg, isLargeText } of pairs) {
        const fgColor = parseColor(fg);
        const bgColor = parseColor(bg);
        if (fgColor && bgColor) {
          const ratio = contrastRatio(fgColor, bgColor);
          allPairs.push({ ratio, isLargeText });
        }
      }
    }

    return { pairs: allPairs };
  } catch (err) {
    return { pairs: [], error: (err as Error).message };
  }
}

const guards: Guard[] = [
  {
    id: "color-palette-size",
    name: "Color Palette Size",
    citation: "Material Design 3; 60-30-10 rule",
    maxPenalty: 25,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const colorCount = ctx.css.colors.all.size;
      const threshold = ctx.config.thresholds.maxPaletteColors ?? 60;
      let penalty = 0;
      if (colorCount > threshold) {
        penalty = Math.min(25, Math.round((colorCount - threshold) * 0.5));
      } else if (colorCount < 3) {
        penalty = 15;
      }
      return {
        guardId: "color-palette-size",
        passed: penalty === 0,
        value: colorCount,
        penalty,
        detail: `${colorCount} unique colors found`,
      };
    },
  },
  {
    id: "color-contrast-wcag-aa",
    name: "WCAG AA Contrast Ratio",
    citation: "WCAG 2.2 SC 1.4.3",
    maxPenalty: 25,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const parsedBg = ctx.css.colors.background.map(parseColor).filter(Boolean) as Array<{ r: number; g: number; b: number }>;
      const parsedText = ctx.css.colors.text.map(parseColor).filter(Boolean) as Array<{ r: number; g: number; b: number }>;
      const effectiveBg = parsedBg.length > 0 ? parsedBg : [{ r: 255, g: 255, b: 255 }];
      const effectiveText = parsedText.length > 0 ? parsedText : [{ r: 0, g: 0, b: 0 }];

      const ratios: number[] = [];
      for (const tc of effectiveText) {
        for (const bc of effectiveBg) {
          ratios.push(contrastRatio(tc, bc));
        }
      }

      const minRatio = ctx.config.thresholds.contrastRatioNormal ?? 4.5;
      const passAA = ratios.filter((r) => r >= minRatio).length;
      const totalPairs = ratios.length || 1;
      const passRate = Math.round((passAA / totalPairs) * 100);

      // Gentler penalty since cartesian product creates false pairs
      let penalty = 0;
      if (passRate < 100) penalty = Math.round((100 - passRate) * 0.25);

      return {
        guardId: "color-contrast-wcag-aa",
        passed: passRate >= 90,
        value: passRate,
        penalty,
        detail: `${passRate}% of text/bg pairs pass WCAG AA (${minRatio}:1)`,
      };
    },
  },
  {
    id: "color-avg-contrast",
    name: "Average Contrast Ratio",
    citation: "WCAG 2.2 SC 1.4.3",
    maxPenalty: 20,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const parsedBg = ctx.css.colors.background.map(parseColor).filter(Boolean) as Array<{ r: number; g: number; b: number }>;
      const parsedText = ctx.css.colors.text.map(parseColor).filter(Boolean) as Array<{ r: number; g: number; b: number }>;
      const effectiveBg = parsedBg.length > 0 ? parsedBg : [{ r: 255, g: 255, b: 255 }];
      const effectiveText = parsedText.length > 0 ? parsedText : [{ r: 0, g: 0, b: 0 }];

      const ratios: number[] = [];
      for (const tc of effectiveText) {
        for (const bc of effectiveBg) {
          ratios.push(contrastRatio(tc, bc));
        }
      }

      const avg = ratios.length > 0
        ? ratios.reduce((a, b) => a + b, 0) / ratios.length
        : 21;

      // Citation: WCAG 2.2 SC 1.4.3 (AA: 4.5:1), SC 1.4.6 (AAA: 7:1), minimum readable: 3:1
      const aaNormal = ctx.config.thresholds.contrastRatioNormal ?? 4.5;
      let penalty = 0;
      if (avg < 3) penalty = 20;           // Below minimum readable contrast
      else if (avg < aaNormal) penalty = 10; // Below WCAG AA
      else if (avg < 7) penalty = 3;        // Below WCAG AAA

      return {
        guardId: "color-avg-contrast",
        passed: avg >= 4.5,
        value: Math.round(avg * 100) / 100,
        penalty,
        detail: `Average contrast ratio: ${(Math.round(avg * 100) / 100)}:1`,
      };
    },
  },
  {
    id: "color-harmony",
    name: "Color Harmony",
    citation: "Cohen-Or et al. 2006; Matsuda 1995",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const parsed = [...ctx.css.colors.all]
        .map(parseColor)
        .filter(Boolean) as Array<{ r: number; g: number; b: number }>;

      if (parsed.length < 3) {
        return {
          guardId: "color-harmony",
          passed: true,
          value: "insufficient colors",
          penalty: 0,
          detail: "Too few colors to evaluate harmony",
        };
      }

      // Cluster to effective palette, then check harmony
      const clusters = clusterColors(parsed, 30);
      const centroids = clusters.slice(0, 8).map((c) => c.centroid);
      const harmony = detectColorHarmony(centroids);

      // Citation: Cohen-Or et al. 2006 — score 60+ indicates recognizable harmony
      const minHarmony = ctx.config.thresholds.minHarmonyScore ?? 60;
      const penalty = harmony.score >= minHarmony ? 0 : Math.round((minHarmony - harmony.score) * 0.15);

      return {
        guardId: "color-harmony",
        passed: harmony.score >= 50,
        value: harmony.type,
        penalty,
        detail: `Color harmony: ${harmony.type} (score: ${harmony.score}/100)`,
      };
    },
  },
  {
    id: "color-contrast-browser",
    name: "Element-Level Contrast (Browser)",
    citation: "WCAG 2.2 SC 1.4.3 (AA), SC 1.4.6 (AAA)",
    maxPenalty: 25,
    requiresBrowser: true,
    evaluate(_ctx: AuditContext): GuardResult {
      // Placeholder — actual check runs async in the run() method
      return {
        guardId: "color-contrast-browser",
        passed: true,
        value: "pending",
        penalty: 0,
        detail: "Element-level contrast check (browser mode)",
        skipped: true,
      };
    },
  },
];

export const colorContrastAudit: AuditModule = {
  id: "color-contrast",
  name: "Color & Contrast",
  defaultWeight: 0.15,
  guards,

  async run(ctx: AuditContext): Promise<AuditResult> {
    const colorCount = ctx.css.colors.all.size;
    const clusters = clusterColors(
      [...ctx.css.colors.all].map(parseColor).filter(Boolean) as Array<{ r: number; g: number; b: number }>,
      30,
    );

    const details: Record<string, unknown> = {
      uniqueColors: colorCount,
      effectivePaletteSize: clusters.length,
      topClusterColors: clusters.slice(0, 8).map((c) => c.centroid),
    };

    const recommendations = [
      colorCount > 20 ? `Reduce the color palette: ${colorCount} unique colors found (ideal: 5-8 for brand consistency).` : "",
    ];

    const result = buildAuditResult(this, ctx, details, recommendations);

    // In browser mode, run real element-level contrast and replace placeholder
    if (ctx.mode === "browser" && ctx.browserPages && ctx.browserPages.length > 0) {
      const { pairs, error } = await runBrowserContrastCheck(ctx.browserPages);

      if (!error && pairs.length > 0) {
        const aaThreshold = ctx.config.thresholds.contrastRatioNormal ?? 4.5;
        const aaLargeThreshold = ctx.config.thresholds.contrastRatioLarge ?? 3.0;

        let failCount = 0;
        for (const { ratio, isLargeText } of pairs) {
          const threshold = isLargeText ? aaLargeThreshold : aaThreshold;
          if (ratio < threshold) failCount++;
        }

        const passRate = Math.round(((pairs.length - failCount) / pairs.length) * 100);
        let penalty = 0;
        if (passRate < 100) penalty = Math.round((100 - passRate) * 0.25);

        const guardResult: import("./types.js").GuardResult = {
          guardId: "color-contrast-browser",
          passed: passRate >= 90,
          value: passRate,
          penalty,
          detail: `Browser contrast: ${passRate}% of ${pairs.length} text elements pass WCAG AA (${failCount} failures)`,
        };

        const idx = result.guardResults.findIndex((r) => r.guardId === "color-contrast-browser");
        if (idx !== -1) {
          const oldPenalty = result.guardResults[idx].penalty;
          result.guardResults[idx] = guardResult;
          result.score = Math.max(0, Math.min(100, result.score + oldPenalty - guardResult.penalty));
        }

        details.browserContrastPairs = pairs.length;
        details.browserContrastFailures = failCount;
        details.browserContrastPassRate = passRate;
      }
    }

    return result;
  },
};
