/**
 * Configuration type definitions for aesthetic-eval.
 * Every threshold is documented with its research citation.
 */

export type OutputFormat = "table" | "json" | "sarif";
export type EvalMode = "static" | "browser";
export type WcagLevel = "A" | "AA" | "AAA";

export interface CategoryWeights {
  "color-contrast": number;
  "typography": number;
  "spacing": number;
  "layout": number;
  "imagery": number;
  "accessibility": number;
  "performance": number;
  "animation": number;
  "cross-browser": number;
  "text-wrapping": number;
}

export interface ThresholdOverrides {
  // --- Color & Contrast ---
  /** Max unique colors before penalty. Citation: Material Design 3 (primary+secondary+tertiary+error+neutrals). */
  maxPaletteColors?: number;
  /** WCAG contrast ratio for normal text (< 18pt regular, < 14pt bold). Citation: WCAG 2.2 SC 1.4.3 (AA: 4.5:1). */
  contrastRatioNormal?: number;
  /** WCAG contrast ratio for large text (>= 18pt regular, >= 14pt bold). Citation: WCAG 2.2 SC 1.4.3 (AA: 3:1). */
  contrastRatioLarge?: number;
  /** Minimum color harmony score (0-100). Citation: Cohen-Or et al. 2006; Matsuda 1995. */
  minHarmonyScore?: number;

  // --- Typography ---
  /** Minimum body font size in px. Citation: WCAG 1.4.4; Material Design 3 (14-16px body). */
  minBodyFontSize?: number;
  /** Minimum body line height ratio. Citation: WCAG 1.4.12 (1.5x body); Bringhurst (1.3-1.6x). */
  minBodyLineHeight?: number;
  /** Optimal line length range in characters. Citation: Bringhurst p.26 (45-75); WCAG 1.4.8 (max 80). */
  lineLengthRange?: [number, number];
  /** Max font families. Citation: Industry consensus; Material Design uses 1-2. */
  maxFontFamilies?: number;
  /** Minimum type scale consistency score (0-100). Citation: Tim Brown, "More Meaningful Typography". */
  minTypeScaleConsistency?: number;

  // --- Spacing ---
  /** Spacing grid base unit in px. Citation: Material Design 3 (4dp); Nathan Curtis (2015) (8pt grid). */
  spacingGridBase?: number;
  /** Max unique spacing values before penalty. Citation: Design system best practices (8-12 ideal). */
  maxUniqueSpacingValues?: number;

  // --- Animation ---
  /** Animation duration range in ms. Citation: Material Design Motion (100-500ms); Nielsen 1993. */
  animationDurationRange?: [number, number];
  /** Minimum touch target size in px. Citation: WCAG 2.2 SC 2.5.8 (24px AA); Apple HIG (44pt); Material Design 3 (48dp). */
  minTouchTarget?: number;

  // --- Performance ---
  /** CSS rules count above which to penalize. */
  maxCssRules?: number;
  /** Max unused CSS class percentage (0-100). */
  maxUnusedCssRate?: number;
  /** Max page size in KB. Citation: Web performance best practices. */
  maxPageSizeKb?: number;
  /** LCP good/needs-improvement/poor thresholds in seconds. Citation: Web Vitals (Google). */
  lcpThresholds?: [number, number]; // [good, poor]
  /** CLS good/needs-improvement/poor thresholds. Citation: Web Vitals (Google). */
  clsThresholds?: [number, number]; // [good, poor]
  /** TBT good/needs-improvement/poor thresholds in ms. Citation: Web Vitals (Google). */
  tbtThresholds?: [number, number]; // [good, poor]

  // --- Text Wrapping ---
  /** Max white-space: nowrap declarations before penalty. */
  maxNowrapDeclarations?: number;
  /** Max avg <br> tags per page before penalty. */
  maxAvgBrTagsPerPage?: number;
}

export interface AestheticEvalConfig {
  /** Evaluation mode. Default: "browser" (falls back to static if Playwright unavailable). */
  mode: EvalMode;
  /** Output format. Default: "table". */
  format: OutputFormat;
  /** Category weights (must sum to 1.0). */
  weights: CategoryWeights;
  /** Threshold overrides per guard. */
  thresholds: ThresholdOverrides;
  /** WCAG conformance level. Default: "AA". */
  wcagLevel: WcagLevel;
  /** Browserslist query for cross-browser checking. */
  targetBrowsers: string;
  /** Exit with code 1 if overall score below this. Default: 0 (no gating). */
  threshold: number;
  /** Maximum number of external CSS files to fetch (URL mode). */
  maxExternalCss: number;
  /** Fetch timeout in ms. */
  fetchTimeout: number;
}
