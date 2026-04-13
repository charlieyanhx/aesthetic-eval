/**
 * Browser parser — uses Playwright for real rendering.
 * Extracts computed styles, real colors, element dimensions,
 * and provides page handles for axe-core / CWV measurement.
 */

import type { Parser, ParseResult, ParsedPage, ParsedCSS, ImageData, PageHeadings } from "./types.js";
import { load as cheerioLoad } from "cheerio";

/** Playwright types — imported dynamically to keep it optional */
type PlaywrightPage = import("playwright").Page;
type PlaywrightBrowser = import("playwright").Browser;

export interface BrowserParseContext {
  /** Playwright page handles, one per URL — passed to audits for axe-core etc. */
  pages: PlaywrightPage[];
}

/**
 * Data extracted from the page via page.evaluate().
 * Must be serializable (no DOM references).
 */
interface ExtractedPageData {
  html: string;
  lang: string;
  hasSkipLink: boolean;
  disablesZoom: boolean;
  hasViewport: boolean;
  headings: PageHeadings;
  headingOrder: number[];
  headingSkips: number;
  sections: number;
  navs: number;
  headers: number;
  footers: number;
  mains: number;
  ariaLandmarks: number;
  images: ImageData[];
  scripts: number;
  stylesheets: number;
  preloads: number;
  prefetches: number;
  fontPreloads: number;
}

interface ExtractedCssData {
  allColors: string[];
  backgroundColors: string[];
  textColors: string[];
  fontFamilies: string[];
  fontSizes: number[];
  lineHeights: number[];
  spacingValues: number[];
  hasReducedMotion: boolean;
  hasFocusVisible: boolean;
  hasTransitions: boolean;
  hasAnimations: boolean;
  hasHoverStates: boolean;
  hasMaxWidth: boolean;
  animationDurations: number[];
  touchTargetSizes: Array<{ width: number; height: number }>;
  hasMediaQueries: boolean;
  mediaQueryCount: number;
  hasFlexbox: boolean;
  hasGrid: boolean;
  hasContainerQuery: boolean;
  hasClamp: boolean;
  hasViewportUnits: boolean;
  hasPrintStyles: boolean;
  hasDarkMode: boolean;
  hasOverflowWrap: boolean;
  hasWordBreak: boolean;
  hasTextOverflowEllipsis: boolean;
  hasChMaxWidth: boolean;
  hasReasonablePxMaxWidth: boolean;
  whiteSpaceNowrapCount: number;
  totalBrTags: number;
  longUnbrokenStrings: number;
  totalRules: number;
  rawCssText: string;
  hasResponsiveFontSizing: boolean;
}

export class BrowserParser implements Parser {
  private fetchTimeout: number;
  private _browser: PlaywrightBrowser | null = null;
  private _browserPages: PlaywrightPage[] = [];

  constructor(fetchTimeout?: number) {
    this.fetchTimeout = fetchTimeout ?? 30000;
  }

  /** Expose Playwright page handles so audits can use them (axe-core, CWV). */
  get browserPages(): PlaywrightPage[] {
    return this._browserPages;
  }

  async parse(target: string | string[]): Promise<ParseResult> {
    const urls = Array.isArray(target) ? target : [target];
    const { chromium } = await import("playwright");

    this._browser = await chromium.launch({ headless: true });

    try {
      const pages: ParsedPage[] = [];
      const allCssData: ExtractedCssData[] = [];

      for (const url of urls) {
        const context = await this._browser.newContext({
          viewport: { width: 1280, height: 720 },
          userAgent: "aesthetic-eval/2.0 (Playwright)",
        });
        const page = await context.newPage();
        this._browserPages.push(page);

        await page.goto(url, {
          waitUntil: "networkidle",
          timeout: this.fetchTimeout,
        });

        // Extract page data via evaluate
        const pageData = await page.evaluate(extractPageDataInBrowser);
        const cssData = await page.evaluate(extractCssDataInBrowser);

        const $ = cheerioLoad(pageData.html);
        const htmlBytes = Buffer.byteLength(pageData.html, "utf-8");

        pages.push({
          file: url,
          $,
          html: pageData.html,
          size: htmlBytes,
          sections: pageData.sections,
          navs: pageData.navs,
          headers: pageData.headers,
          footers: pageData.footers,
          mains: pageData.mains,
          headings: pageData.headings,
          headingOrder: pageData.headingOrder,
          headingSkips: pageData.headingSkips,
          images: pageData.images,
          hasLang: !!pageData.lang,
          ariaLandmarks: pageData.ariaLandmarks,
          hasSkipLink: pageData.hasSkipLink,
          disablesZoom: pageData.disablesZoom,
          hasViewport: pageData.hasViewport,
          scripts: pageData.scripts,
          stylesheets: pageData.stylesheets,
          preloads: pageData.preloads,
          prefetches: pageData.prefetches,
          fontPreloads: pageData.fontPreloads,
        });

        allCssData.push(cssData);
      }

      const css = mergeCssData(allCssData);
      return { pages, css };
    } catch (err) {
      await this.close();
      throw err;
    }
    // NOTE: we don't close here — audits need the page handles.
    // The caller (index.ts) calls close() after audits complete.
  }

  async close(): Promise<void> {
    if (this._browser) {
      await this._browser.close();
      this._browser = null;
      this._browserPages = [];
    }
  }
}

// ---------------------------------------------------------------------------
// Functions executed inside the browser via page.evaluate()
// Must be self-contained — no closures over Node.js scope.
// ---------------------------------------------------------------------------

function extractPageDataInBrowser(): ExtractedPageData {
  const html = document.documentElement.outerHTML;
  const lang = document.documentElement.getAttribute("lang") || "";

  // Skip link
  const links = Array.from(document.querySelectorAll("a[href^='#']"));
  const hasSkipLink = links.some((a) => {
    const text = (a.textContent || "").toLowerCase();
    return text.includes("skip") || text.includes("jump to");
  });

  // Viewport meta
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  const hasViewport = !!viewportMeta;
  const viewportContent = viewportMeta?.getAttribute("content") || "";
  const disablesZoom =
    /maximum-scale\s*=\s*1(\b|\.|,)/.test(viewportContent) ||
    /user-scalable\s*=\s*no/.test(viewportContent);

  // Headings
  const headings: PageHeadings = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  const headingOrder: number[] = [];
  for (let i = 1; i <= 6; i++) {
    const els = document.querySelectorAll(`h${i}`);
    headings[`h${i}` as keyof PageHeadings] = els.length;
    els.forEach(() => headingOrder.push(i));
  }
  // Re-sort heading order by document position
  const allH = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"));
  const orderedLevels = allH.map((el) => parseInt(el.tagName[1], 10));
  let headingSkips = 0;
  for (let i = 1; i < orderedLevels.length; i++) {
    if (orderedLevels[i] > orderedLevels[i - 1] + 1) headingSkips++;
  }

  // Semantic elements
  const sections = document.querySelectorAll("section").length;
  const navs = document.querySelectorAll("nav").length;
  const headers = document.querySelectorAll("header").length;
  const footers = document.querySelectorAll("footer").length;
  const mains = document.querySelectorAll("main").length;

  // ARIA landmarks
  const landmarks = document.querySelectorAll(
    '[role="banner"],[role="navigation"],[role="main"],[role="contentinfo"],[role="complementary"],[role="search"],[role="form"],[role="region"]',
  );
  const ariaLandmarks = landmarks.length;

  // Images
  const imgs = Array.from(document.querySelectorAll("img"));
  const images: ImageData[] = imgs.map((img) => ({
    src: img.getAttribute("src") || "",
    alt: img.getAttribute("alt") ?? undefined,
    hasAlt: img.hasAttribute("alt"),
    width: img.getAttribute("width") ?? undefined,
    height: img.getAttribute("height") ?? undefined,
    loading: img.getAttribute("loading") ?? undefined,
  }));

  // Resources
  const scripts = document.querySelectorAll("script[src]").length;
  const stylesheets = document.querySelectorAll('link[rel="stylesheet"]').length;
  const preloads = document.querySelectorAll('link[rel="preload"]').length;
  const prefetches = document.querySelectorAll('link[rel="prefetch"],link[rel="dns-prefetch"]').length;
  const fontPreloads = document.querySelectorAll('link[rel="preload"][as="font"]').length;

  return {
    html,
    lang,
    hasSkipLink,
    disablesZoom,
    hasViewport,
    headings,
    headingOrder: orderedLevels,
    headingSkips,
    sections,
    navs,
    headers,
    footers,
    mains,
    ariaLandmarks,
    images,
    scripts,
    stylesheets,
    preloads,
    prefetches,
    fontPreloads,
  };
}

function extractCssDataInBrowser(): ExtractedCssData {
  const allColors = new Set<string>();
  const backgroundColors: string[] = [];
  const textColors: string[] = [];
  const fontFamilies = new Set<string>();
  const fontSizes: number[] = [];
  const lineHeights: number[] = [];
  const spacingValues: number[] = [];
  const animationDurations: number[] = [];
  const touchTargetSizes: Array<{ width: number; height: number }> = [];
  let whiteSpaceNowrapCount = 0;
  let longUnbrokenStrings = 0;

  // Walk visible elements and extract computed styles
  const allElements = document.querySelectorAll("body *");
  const seenFonts = new Set<string>();

  for (const el of allElements) {
    const style = window.getComputedStyle(el);

    // Skip invisible elements
    if (style.display === "none" || style.visibility === "hidden") continue;

    // Colors
    const color = style.color;
    const bgColor = style.backgroundColor;
    if (color && color !== "rgba(0, 0, 0, 0)") {
      allColors.add(color);
      textColors.push(color);
    }
    if (bgColor && bgColor !== "rgba(0, 0, 0, 0)") {
      allColors.add(bgColor);
      backgroundColors.push(bgColor);
    }

    // Border colors
    const borderColor = style.borderColor;
    if (borderColor && borderColor !== "rgba(0, 0, 0, 0)" && borderColor !== "rgb(0, 0, 0)") {
      allColors.add(borderColor);
    }

    // Fonts
    const ff = style.fontFamily;
    if (ff && !seenFonts.has(ff)) {
      seenFonts.add(ff);
      // Extract first family name
      const primary = ff.split(",")[0].trim().replace(/['"]/g, "");
      fontFamilies.add(primary);
    }

    // Font sizes
    const fs = parseFloat(style.fontSize);
    if (fs > 0) fontSizes.push(fs);

    // Line heights
    const lh = parseFloat(style.lineHeight);
    if (lh > 0 && style.lineHeight !== "normal") {
      lineHeights.push(lh / fs); // normalize to ratio
    }

    // Spacing (margin + padding)
    for (const prop of ["marginTop", "marginBottom", "marginLeft", "marginRight", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"] as const) {
      const val = parseFloat((style as any)[prop]);
      if (val > 0 && val < 500) spacingValues.push(val);
    }

    // White-space nowrap
    if (style.whiteSpace === "nowrap") whiteSpaceNowrapCount++;

    // Touch target sizes for interactive elements
    const tag = el.tagName.toLowerCase();
    if (tag === "button" || tag === "a" || tag === "input" || tag === "select" || tag === "textarea" || (el as HTMLElement).getAttribute("role") === "button") {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        touchTargetSizes.push({ width: rect.width, height: rect.height });
      }
    }
  }

  // Animation durations from stylesheets
  const hasTransitions = false;
  const hasAnimations = false;
  const hasHoverStates = false;
  let hasReducedMotion = false;
  let hasFocusVisible = false;
  let hasMaxWidth = false;
  let hasMediaQueries = false;
  let mediaQueryCount = 0;
  let hasFlexbox = false;
  let hasGrid = false;
  let hasContainerQuery = false;
  let hasClamp = false;
  let hasViewportUnits = false;
  let hasPrintStyles = false;
  let hasDarkMode = false;
  let hasOverflowWrap = false;
  let hasWordBreak = false;
  let hasTextOverflowEllipsis = false;
  let hasChMaxWidth = false;
  let hasReasonablePxMaxWidth = false;
  let hasResponsiveFontSizing = false;
  let totalRules = 0;
  let rawCssText = "";

  // Parse actual stylesheets for features we can't get from computed styles
  try {
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        totalRules += rules.length;

        for (const rule of rules) {
          const text = rule.cssText || "";
          rawCssText += text + "\n";

          if (rule instanceof CSSMediaRule) {
            hasMediaQueries = true;
            mediaQueryCount++;
            const media = rule.conditionText || "";
            if (media.includes("prefers-reduced-motion")) hasReducedMotion = true;
            if (media.includes("print")) hasPrintStyles = true;
            if (media.includes("prefers-color-scheme")) hasDarkMode = true;
          }

          if (text.includes(":focus-visible")) hasFocusVisible = true;
          if (text.includes("transition")) {
            // detect transitions
            const durationMatch = text.match(/transition[^;]*?(\d+(?:\.\d+)?)(ms|s)/);
            if (durationMatch) {
              let ms = parseFloat(durationMatch[1]);
              if (durationMatch[2] === "s") ms *= 1000;
              animationDurations.push(ms);
            }
          }
          if (text.includes("animation")) {
            const durationMatch = text.match(/animation[^;]*?(\d+(?:\.\d+)?)(ms|s)/);
            if (durationMatch) {
              let ms = parseFloat(durationMatch[1]);
              if (durationMatch[2] === "s") ms *= 1000;
              animationDurations.push(ms);
            }
          }
          if (text.includes("display: flex") || text.includes("display:flex")) hasFlexbox = true;
          if (text.includes("display: grid") || text.includes("display:grid")) hasGrid = true;
          if (text.includes("container-type")) hasContainerQuery = true;
          if (text.includes("clamp(")) hasClamp = true;
          if (/\d+v[wh]/.test(text)) hasViewportUnits = true;
          if (text.includes("max-width")) hasMaxWidth = true;
          if (text.includes("overflow-wrap") || text.includes("word-wrap")) hasOverflowWrap = true;
          if (text.includes("word-break")) hasWordBreak = true;
          if (text.includes("text-overflow")) hasTextOverflowEllipsis = true;

          // ch-based max-width
          if (/max-width\s*:\s*\d+ch/.test(text)) hasChMaxWidth = true;
          // reasonable px max-width (600-1200px)
          const pxMaxMatch = text.match(/max-width\s*:\s*(\d+)px/);
          if (pxMaxMatch) {
            const px = parseInt(pxMaxMatch[1], 10);
            if (px >= 400 && px <= 1400) hasReasonablePxMaxWidth = true;
          }

          // Responsive font sizing
          if (/font-size\s*:.*?(clamp|vw|calc)/.test(text)) hasResponsiveFontSizing = true;
        }
      } catch {
        // Cross-origin stylesheet — skip
      }
    }
  } catch {
    // StyleSheet access error
  }

  // Long unbroken strings
  const textElements = document.querySelectorAll("p, span, div, li, td, th, h1, h2, h3, h4, h5, h6");
  for (const el of textElements) {
    const text = el.textContent || "";
    const words = text.split(/\s+/);
    for (const word of words) {
      if (word.length > 30) longUnbrokenStrings++;
    }
  }

  const totalBrTags = document.querySelectorAll("br").length;

  return {
    allColors: [...allColors],
    backgroundColors,
    textColors,
    fontFamilies: [...fontFamilies],
    fontSizes: [...new Set(fontSizes)],
    lineHeights: [...new Set(lineHeights)],
    spacingValues,
    hasReducedMotion,
    hasFocusVisible,
    hasTransitions: rawCssText.includes("transition"),
    hasAnimations: rawCssText.includes("animation"),
    hasHoverStates: rawCssText.includes(":hover"),
    hasMaxWidth,
    animationDurations,
    touchTargetSizes,
    hasMediaQueries,
    mediaQueryCount,
    hasFlexbox,
    hasGrid,
    hasContainerQuery,
    hasClamp,
    hasViewportUnits,
    hasPrintStyles,
    hasDarkMode,
    hasOverflowWrap,
    hasWordBreak,
    hasTextOverflowEllipsis,
    hasChMaxWidth,
    hasReasonablePxMaxWidth,
    whiteSpaceNowrapCount,
    totalBrTags,
    longUnbrokenStrings,
    totalRules,
    rawCssText,
    hasResponsiveFontSizing,
  };
}

// ---------------------------------------------------------------------------
// Merge CSS data from multiple pages
// ---------------------------------------------------------------------------

function mergeCssData(pages: ExtractedCssData[]): ParsedCSS {
  const allColors = new Set<string>();
  const backgroundColors: string[] = [];
  const textColors: string[] = [];
  const fontFamilies = new Set<string>();
  const fontSizes = new Set<number>();
  const lineHeights = new Set<number>();
  const spacingValues: number[] = [];
  const animationDurations: number[] = [];
  const touchTargetSizes: number[] = [];
  let totalRules = 0;
  let rawCssText = "";

  let hasReducedMotion = false;
  let hasFocusVisible = false;
  let hasTransitions = false;
  let hasAnimations = false;
  let hasHoverStates = false;
  let hasMaxWidth = false;
  let hasMediaQueries = false;
  let mediaQueryCount = 0;
  let hasFlexbox = false;
  let hasGrid = false;
  let hasContainerQuery = false;
  let hasClamp = false;
  let hasViewportUnits = false;
  let hasPrintStyles = false;
  let hasDarkMode = false;
  let hasOverflowWrap = false;
  let hasWordBreak = false;
  let hasTextOverflowEllipsis = false;
  let hasChMaxWidth = false;
  let hasReasonablePxMaxWidth = false;
  let whiteSpaceNowrapCount = 0;
  let totalBrTags = 0;
  let longUnbrokenStrings = 0;
  let hasResponsiveFontSizing = false;

  for (const p of pages) {
    p.allColors.forEach((c) => allColors.add(c));
    backgroundColors.push(...p.backgroundColors);
    textColors.push(...p.textColors);
    p.fontFamilies.forEach((f) => fontFamilies.add(f));
    p.fontSizes.forEach((s) => fontSizes.add(s));
    p.lineHeights.forEach((l) => lineHeights.add(l));
    spacingValues.push(...p.spacingValues);
    animationDurations.push(...p.animationDurations);
    for (const t of p.touchTargetSizes) {
      touchTargetSizes.push(Math.min(t.width, t.height));
    }
    totalRules += p.totalRules;
    rawCssText += p.rawCssText;

    if (p.hasReducedMotion) hasReducedMotion = true;
    if (p.hasFocusVisible) hasFocusVisible = true;
    if (p.hasTransitions) hasTransitions = true;
    if (p.hasAnimations) hasAnimations = true;
    if (p.hasHoverStates) hasHoverStates = true;
    if (p.hasMaxWidth) hasMaxWidth = true;
    if (p.hasMediaQueries) hasMediaQueries = true;
    mediaQueryCount += p.mediaQueryCount;
    if (p.hasFlexbox) hasFlexbox = true;
    if (p.hasGrid) hasGrid = true;
    if (p.hasContainerQuery) hasContainerQuery = true;
    if (p.hasClamp) hasClamp = true;
    if (p.hasViewportUnits) hasViewportUnits = true;
    if (p.hasPrintStyles) hasPrintStyles = true;
    if (p.hasDarkMode) hasDarkMode = true;
    if (p.hasOverflowWrap) hasOverflowWrap = true;
    if (p.hasWordBreak) hasWordBreak = true;
    if (p.hasTextOverflowEllipsis) hasTextOverflowEllipsis = true;
    if (p.hasChMaxWidth) hasChMaxWidth = true;
    if (p.hasReasonablePxMaxWidth) hasReasonablePxMaxWidth = true;
    whiteSpaceNowrapCount += p.whiteSpaceNowrapCount;
    totalBrTags += p.totalBrTags;
    longUnbrokenStrings += p.longUnbrokenStrings;
    if (p.hasResponsiveFontSizing) hasResponsiveFontSizing = true;
  }

  return {
    rawText: rawCssText,
    asts: [], // Not available in browser mode — we use computed styles instead
    colors: {
      all: allColors,
      background: backgroundColors,
      text: textColors,
    },
    fonts: {
      families: fontFamilies,
      sizes: [...fontSizes],
      lineHeights: [...lineHeights],
      letterSpacings: [],
      hasResponsiveFontSizing,
    },
    spacing: {
      values: spacingValues,
    },
    metrics: {
      totalRules,
      hasReducedMotion,
      hasFocusVisible,
      hasTransitions,
      hasAnimations,
      hasHoverStates,
      hasMaxWidth,
      animationDurations,
      touchTargetSizes,
      allCssClasses: new Set<string>(),
      htmlClassesUsed: new Set<string>(),
    },
    responsive: {
      hasMediaQueries,
      mediaQueryCount,
      breakpoints: new Set<number>(),
      hasFlexbox,
      hasGrid,
      hasContainerQuery,
      hasClamp,
      hasMinMax: rawCssText.includes("minmax("),
      hasViewportUnits,
      hasLogicalProperties: rawCssText.includes("inline-start") || rawCssText.includes("block-start"),
    },
    vendorPrefixes: {
      webkit: (rawCssText.match(/-webkit-/g) || []).length,
      moz: (rawCssText.match(/-moz-/g) || []).length,
      ms: (rawCssText.match(/-ms-/g) || []).length,
      o: (rawCssText.match(/-o-/g) || []).length,
      prefixedProperties: new Set<string>(),
      missingPrefixes: [],
    },
    features: {
      hasFeatureQueries: rawCssText.includes("@supports"),
      featureQueryCount: (rawCssText.match(/@supports/g) || []).length,
      hasTouchMediaQuery: rawCssText.includes("hover: none"),
      hasPointerMediaQuery: rawCssText.includes("pointer:"),
      hasOrientationQuery: rawCssText.includes("orientation:"),
      hasCharsetMeta: rawCssText.includes("charset"),
      hasViewportMeta: true, // checked at page level
      hasPictureElement: rawCssText.includes("<picture"),
      hasSrcset: rawCssText.includes("srcset"),
      usesModernInputTypes: false,
      hasPrintStyles,
      hasDarkMode,
      hasColorScheme: rawCssText.includes("color-scheme"),
    },
    textWrapping: {
      hasOverflowWrap,
      hasWordWrap: hasOverflowWrap,
      hasWordBreak,
      hasHyphens: rawCssText.includes("hyphens"),
      hasTextWrapBalance: rawCssText.includes("text-wrap: balance") || rawCssText.includes("text-wrap:balance"),
      hasTextWrapPretty: rawCssText.includes("text-wrap: pretty") || rawCssText.includes("text-wrap:pretty"),
      whiteSpaceNowrapCount,
      hasTextOverflowEllipsis,
      hasChMaxWidth,
      hasReasonablePxMaxWidth,
      hasOrphans: rawCssText.includes("orphans"),
      hasWidows: rawCssText.includes("widows"),
      totalBrTags,
      totalWbrTags: 0,
      totalShyEntities: 0,
      longUnbrokenStrings,
    },
  };
}
