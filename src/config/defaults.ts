/**
 * Default configuration values for aesthetic-eval.
 *
 * POLICY: Every numeric threshold MUST have a citation comment.
 * If you add a threshold without a citation, you're doing it wrong.
 */

import type { AestheticEvalConfig } from "./schema.js";

export const DEFAULT_CONFIG: AestheticEvalConfig = {
  mode: "browser",
  format: "table",

  weights: {
    "color-contrast": 0.15,
    "typography": 0.12,
    "spacing": 0.10,
    "layout": 0.12,
    "imagery": 0.08,
    "accessibility": 0.10,
    "performance": 0.05,
    "animation": 0.05,
    "cross-browser": 0.13,
    "text-wrapping": 0.10,
  },

  thresholds: {
    // --- Color & Contrast ---

    /**
     * Max primary colors before palette penalty.
     * Citation: Material Design 3 — primary + secondary + tertiary + error + 2 neutrals = ~7 roles.
     *           The "60-30-10 rule" (dominant-secondary-accent) from interior/graphic design.
     *           Set to 60 to account for shades/tints in CSS.
     */
    maxPaletteColors: 60,

    /**
     * WCAG contrast ratio for normal text (< 18pt regular, < 14pt bold).
     * Citation: WCAG 2.2 Success Criterion 1.4.3, Level AA.
     *           Paciello Group research on contrast and readability (2016).
     */
    contrastRatioNormal: 4.5,

    /**
     * WCAG contrast ratio for large text (>= 18pt regular, >= 14pt bold).
     * Citation: WCAG 2.2 Success Criterion 1.4.3, Level AA.
     *           Large text defined per WCAG: 18pt (24px) or 14pt (18.66px) bold.
     */
    contrastRatioLarge: 3.0,

    /**
     * Minimum color harmony score to avoid penalty.
     * Citation: Cohen-Or et al. (2006), "Color Harmonization"; Matsuda (1995), harmonic templates.
     *           Score 60+ indicates recognizable harmony pattern.
     */
    minHarmonyScore: 60,

    // --- Typography ---

    /**
     * Minimum body font size in px.
     * Citation: WCAG 1.4.4 (text resizable to 200% without loss of function).
     *           Material Design 3 recommends 14-16px body text.
     *           16px is the browser default; 12px is the absolute floor.
     */
    minBodyFontSize: 12,

    /**
     * Minimum body line height ratio.
     * Citation: WCAG 1.4.12 Text Spacing (1.5x for body paragraphs).
     *           Bringhurst, "Elements of Typographic Style" (1.3-1.6x optimal).
     */
    minBodyLineHeight: 1.3,

    /**
     * Optimal line length in characters.
     * Citation: Bringhurst, "Elements of Typographic Style" p.26: 45-75 characters.
     *           WCAG 2.2 SC 1.4.8 recommends max 80 characters per line.
     */
    lineLengthRange: [45, 75],

    /**
     * Max font families for consistency.
     * Citation: Industry consensus; Material Design 3 uses 1-2 font families.
     *           Google Fonts recommendation: max 3 families per page.
     */
    maxFontFamilies: 4,

    /**
     * Minimum type scale consistency (0-100).
     * Citation: Tim Brown, "More Meaningful Typography" (A List Apart, 2012).
     *           Scores above 60 indicate adherence to a recognizable modular scale.
     */
    minTypeScaleConsistency: 60,

    // --- Spacing ---

    /**
     * Spacing grid base unit in px.
     * Citation: Material Design 3, 4dp incremental grid.
     *           Nathan Curtis (2015), "Space in Design Systems" — 8pt grid system.
     *           4px allows both 4px and 8px grids to pass.
     */
    spacingGridBase: 4,

    /**
     * Max unique spacing values before penalty.
     * Citation: Design system best practices — 8-12 spacing tokens ideal.
     *           Salesforce Lightning: 7 spacing tokens; Shopify Polaris: 8.
     */
    maxUniqueSpacingValues: 15,

    // --- Animation ---

    /**
     * Animation duration range in ms.
     * Citation: Material Design Motion guidelines:
     *           - Micro-interactions: 100-200ms
     *           - Simple transitions: 200-300ms
     *           - Complex transitions: 300-500ms
     *           Nielsen (1993), "Usability Engineering": 100ms feels instantaneous,
     *           1000ms is the limit before users feel the system is unresponsive.
     */
    animationDurationRange: [150, 500],

    /**
     * Minimum touch target size in px.
     * Citation: WCAG 2.2 SC 2.5.8 Target Size:
     *           - Level AA: minimum 24x24 CSS pixels
     *           - Level AAA: minimum 44x44 CSS pixels
     *           Material Design 3: 48x48dp recommended (minimum 24x24dp).
     *           Apple HIG: 44x44 points minimum.
     *           Default set to 44 (AAA / Apple HIG standard).
     */
    minTouchTarget: 44,

    // --- Performance ---

    /** CSS rules count threshold. Above this, large stylesheet penalty applies. */
    maxCssRules: 2000,

    /** Unused CSS rate threshold (%). */
    maxUnusedCssRate: 50,

    /**
     * Max page size in KB before penalty.
     * Citation: HTTP Archive median page weight analysis.
     *           Google recommends <200KB for critical rendering path.
     */
    maxPageSizeKb: 200,

    /**
     * LCP thresholds [good, poor] in seconds.
     * Citation: Web Vitals (Google, 2020). Good < 2.5s, Poor > 4.0s.
     *           Based on Chrome User Experience Report (CrUX) 75th percentile.
     */
    lcpThresholds: [2.5, 4.0],

    /**
     * CLS thresholds [good, poor].
     * Citation: Web Vitals (Google, 2020). Good < 0.1, Poor > 0.25.
     *           Layout Instability API specification.
     */
    clsThresholds: [0.1, 0.25],

    /**
     * TBT thresholds [good, poor] in ms.
     * Citation: Web Vitals (Google, 2020). Good < 200ms, Poor > 600ms.
     *           Correlates with Time to Interactive (TTI).
     */
    tbtThresholds: [200, 600],

    // --- Text Wrapping ---

    /**
     * Max white-space: nowrap declarations before penalty.
     * Citation: Heuristic — excessive nowrap prevents responsive text reflow.
     */
    maxNowrapDeclarations: 10,

    /**
     * Max average <br> tags per page in text elements.
     * Citation: HTML best practices — excessive <br> indicates layout-via-markup antipattern.
     */
    maxAvgBrTagsPerPage: 5,
  },

  wcagLevel: "AA",
  targetBrowsers: "> 0.5%, last 2 versions, not dead",
  threshold: 0,
  maxExternalCss: 10,
  fetchTimeout: 15000,
};
