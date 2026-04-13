/**
 * Parser output types — shared between static and browser parsers.
 * Both parsers return the same interfaces so audits are mode-agnostic.
 */

import type { CheerioAPI } from "cheerio";

// ---------------------------------------------------------------------------
// Per-page parsed data
// ---------------------------------------------------------------------------

export interface ImageData {
  src: string;
  alt: string | undefined;
  hasAlt: boolean;
  width: string | undefined;
  height: string | undefined;
  loading: string | undefined;
}

export interface PageHeadings {
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  h5: number;
  h6: number;
}

export interface ParsedPage {
  /** Relative file path or URL. */
  file: string;
  /** Cheerio instance for querying. */
  $: CheerioAPI;
  /** Raw HTML. */
  html: string;
  /** Size in bytes. */
  size: number;
  /** Semantic element counts. */
  sections: number;
  navs: number;
  headers: number;
  footers: number;
  mains: number;
  /** Heading counts by level. */
  headings: PageHeadings;
  /** Heading levels in document order. */
  headingOrder: number[];
  /** Number of heading hierarchy skips. */
  headingSkips: number;
  /** Image data. */
  images: ImageData[];
  /** Accessibility signals. */
  hasLang: boolean;
  ariaLandmarks: number;
  hasSkipLink: boolean;
  disablesZoom: boolean;
  hasViewport: boolean;
  /** Resource counts. */
  scripts: number;
  stylesheets: number;
  preloads: number;
  prefetches: number;
  fontPreloads: number;
}

// ---------------------------------------------------------------------------
// Aggregated CSS data
// ---------------------------------------------------------------------------

export interface ParsedCSS {
  /** Raw concatenated CSS text. */
  rawText: string;
  /** css-tree ASTs. */
  asts: unknown[]; // CssNode[] from css-tree
  /** Extracted metrics. */
  colors: {
    all: Set<string>;
    background: string[];
    text: string[];
  };
  fonts: {
    families: Set<string>;
    sizes: number[];
    lineHeights: number[];
    letterSpacings: string[];
    hasResponsiveFontSizing: boolean;
  };
  spacing: {
    values: number[];
  };
  metrics: {
    totalRules: number;
    hasReducedMotion: boolean;
    hasFocusVisible: boolean;
    hasTransitions: boolean;
    hasAnimations: boolean;
    hasHoverStates: boolean;
    hasMaxWidth: boolean;
    animationDurations: number[];
    touchTargetSizes: number[];
    allCssClasses: Set<string>;
    htmlClassesUsed: Set<string>;
  };
  responsive: {
    hasMediaQueries: boolean;
    mediaQueryCount: number;
    breakpoints: Set<number>;
    hasFlexbox: boolean;
    hasGrid: boolean;
    hasContainerQuery: boolean;
    hasClamp: boolean;
    hasMinMax: boolean;
    hasViewportUnits: boolean;
    hasLogicalProperties: boolean;
  };
  vendorPrefixes: {
    webkit: number;
    moz: number;
    ms: number;
    o: number;
    prefixedProperties: Set<string>;
    missingPrefixes: string[];
  };
  features: {
    hasFeatureQueries: boolean;
    featureQueryCount: number;
    hasTouchMediaQuery: boolean;
    hasPointerMediaQuery: boolean;
    hasOrientationQuery: boolean;
    hasCharsetMeta: boolean;
    hasViewportMeta: boolean;
    hasPictureElement: boolean;
    hasSrcset: boolean;
    usesModernInputTypes: boolean;
    hasPrintStyles: boolean;
    hasDarkMode: boolean;
    hasColorScheme: boolean;
  };
  textWrapping: {
    hasOverflowWrap: boolean;
    hasWordWrap: boolean;
    hasWordBreak: boolean;
    hasHyphens: boolean;
    hasTextWrapBalance: boolean;
    hasTextWrapPretty: boolean;
    whiteSpaceNowrapCount: number;
    hasTextOverflowEllipsis: boolean;
    hasChMaxWidth: boolean;
    hasReasonablePxMaxWidth: boolean;
    hasOrphans: boolean;
    hasWidows: boolean;
    totalBrTags: number;
    totalWbrTags: number;
    totalShyEntities: number;
    longUnbrokenStrings: number;
  };
}

// ---------------------------------------------------------------------------
// Parser interface
// ---------------------------------------------------------------------------

export interface ParseResult {
  pages: ParsedPage[];
  css: ParsedCSS;
}

export interface Parser {
  /** Parse a local directory or URL(s). */
  parse(target: string | string[]): Promise<ParseResult>;
}
