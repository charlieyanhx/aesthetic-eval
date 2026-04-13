/**
 * Static parser — uses cheerio + css-tree to analyze HTML/CSS
 * without a browser. Works for both local directories and fetched URLs.
 *
 * Extracted and unified from evaluate.mjs and evaluate-url.mjs.
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import * as csstree from "css-tree";
import { extractColorStrings, extractSpacingValues, SPACING_PROPERTIES, extractPrimaryFontFamily, parsePxValue } from "../utils/css.js";
import type { ParsedPage, ParsedCSS, ParseResult, Parser, ImageData, PageHeadings } from "./types.js";

// ---------------------------------------------------------------------------
// File discovery helpers
// ---------------------------------------------------------------------------

function findHtmlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_next" || entry.name === "node_modules") continue;
      results.push(...findHtmlFiles(full));
    } else if (entry.name.endsWith(".html")) {
      results.push(full);
    }
  }
  return results;
}

function findCssFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findCssFiles(full));
    } else if (entry.name.endsWith(".css")) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// HTML page extraction
// ---------------------------------------------------------------------------

function extractPageData(file: string, $: cheerio.CheerioAPI, html: string): ParsedPage {
  const size = Buffer.byteLength(html);

  // Semantic elements
  const sections = $("section").length;
  const navs = $("nav").length;
  const headers = $("header").length;
  const footers = $("footer").length;
  const mains = $("main").length;

  // Headings
  const headings: PageHeadings = {
    h1: $("h1").length, h2: $("h2").length, h3: $("h3").length,
    h4: $("h4").length, h5: $("h5").length, h6: $("h6").length,
  };
  const headingOrder: number[] = [];
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    headingOrder.push(parseInt(el.tagName.replace("h", ""), 10));
  });
  let headingSkips = 0;
  for (let i = 1; i < headingOrder.length; i++) {
    if (headingOrder[i] > headingOrder[i - 1] + 1) headingSkips++;
  }

  // Images
  const images: ImageData[] = [];
  $("img").each((_, el) => {
    images.push({
      src: $(el).attr("src") || "",
      alt: $(el).attr("alt"),
      hasAlt: $(el).attr("alt") !== undefined,
      width: $(el).attr("width"),
      height: $(el).attr("height"),
      loading: $(el).attr("loading"),
    });
  });

  // Accessibility
  const hasLang = !!$("html").attr("lang");
  const ariaLandmarks = $("[role='banner'],[role='navigation'],[role='main'],[role='contentinfo'],[role='complementary'],[role='search']").length;
  const hasSkipLink = $('a[href="#main-content"],a[href="#content"],a[href="#main"],a.skip-link,a.skip-to-content,[class*="skip"]').length > 0;
  const viewport = $('meta[name="viewport"]').attr("content") || "";
  const disablesZoom = /maximum-scale\s*=\s*1(?:\.0)?(?:\s|,|$)/.test(viewport) || /user-scalable\s*=\s*no/.test(viewport);
  const hasViewport = viewport.includes("width=device-width");

  // Resources
  const scripts = $("script[src]").length;
  const stylesheets = $('link[rel="stylesheet"]').length;
  const preloads = $('link[rel="preload"]').length;
  const prefetches = $('link[rel="prefetch"]').length;
  const fontPreloads = $('link[rel="preload"][as="font"]').length;

  return {
    file, $, html, size,
    sections, navs, headers, footers, mains,
    headings, headingOrder, headingSkips,
    images, hasLang, ariaLandmarks, hasSkipLink, disablesZoom, hasViewport,
    scripts, stylesheets, preloads, prefetches, fontPreloads,
  };
}

// ---------------------------------------------------------------------------
// CSS extraction — walks all ASTs to collect metrics
// ---------------------------------------------------------------------------

function extractCssData(cssAsts: unknown[], pages: ParsedPage[]): ParsedCSS {
  const colors = { all: new Set<string>(), background: [] as string[], text: [] as string[] };
  const fonts = {
    families: new Set<string>(), sizes: [] as number[],
    lineHeights: [] as number[], letterSpacings: [] as string[],
    hasResponsiveFontSizing: false,
  };
  const spacing = { values: [] as number[] };
  const metrics = {
    totalRules: 0, hasReducedMotion: false, hasFocusVisible: false,
    hasTransitions: false, hasAnimations: false, hasHoverStates: false,
    hasMaxWidth: false, animationDurations: [] as number[],
    touchTargetSizes: [] as number[],
    allCssClasses: new Set<string>(), htmlClassesUsed: new Set<string>(),
  };
  const responsive = {
    hasMediaQueries: false, mediaQueryCount: 0, breakpoints: new Set<number>(),
    hasFlexbox: false, hasGrid: false, hasContainerQuery: false,
    hasClamp: false, hasMinMax: false, hasViewportUnits: false,
    hasLogicalProperties: false,
  };
  const vendorPrefixes = {
    webkit: 0, moz: 0, ms: 0, o: 0,
    prefixedProperties: new Set<string>(), missingPrefixes: [] as string[],
  };
  const features = {
    hasFeatureQueries: false, featureQueryCount: 0,
    hasTouchMediaQuery: false, hasPointerMediaQuery: false, hasOrientationQuery: false,
    hasCharsetMeta: false, hasViewportMeta: false,
    hasPictureElement: false, hasSrcset: false, usesModernInputTypes: false,
    hasPrintStyles: false, hasDarkMode: false, hasColorScheme: false,
  };
  const textWrapping = {
    hasOverflowWrap: false, hasWordWrap: false, hasWordBreak: false,
    hasHyphens: false, hasTextWrapBalance: false, hasTextWrapPretty: false,
    whiteSpaceNowrapCount: 0, hasTextOverflowEllipsis: false,
    hasChMaxWidth: false, hasReasonablePxMaxWidth: false,
    hasOrphans: false, hasWidows: false,
    totalBrTags: 0, totalWbrTags: 0, totalShyEntities: 0,
    longUnbrokenStrings: 0,
  };

  // Properties that commonly need vendor prefixes
  const commonPrefixNeeded = new Set([
    "appearance", "backdrop-filter", "background-clip",
    "text-fill-color", "text-stroke", "text-stroke-width", "text-stroke-color",
    "user-select", "hyphens", "text-size-adjust",
  ]);
  const prefixedInCss = new Set<string>();
  const unprefixedModernProps = new Set<string>();

  for (const ast of cssAsts) {
    csstree.walk(ast as csstree.CssNode, (node: csstree.CssNode) => {
      // Rule count
      if (node.type === "Rule") metrics.totalRules++;

      // At-rules
      if (node.type === "Atrule") {
        if (node.name === "media" && node.prelude) {
          const mediaText = csstree.generate(node.prelude);
          responsive.hasMediaQueries = true;
          responsive.mediaQueryCount++;

          if (/prefers-reduced-motion/.test(mediaText)) metrics.hasReducedMotion = true;
          if (/prefers-color-scheme/.test(mediaText)) features.hasDarkMode = true;
          if (/print/.test(mediaText)) features.hasPrintStyles = true;
          if (/hover\s*:\s*none|pointer\s*:\s*coarse/.test(mediaText)) features.hasTouchMediaQuery = true;
          if (/pointer\s*:/.test(mediaText)) features.hasPointerMediaQuery = true;
          if (/orientation\s*:/.test(mediaText)) features.hasOrientationQuery = true;

          // Breakpoints
          const bpMatches = mediaText.match(/(?:min|max)-width\s*:\s*([\d.]+)\s*(px|em|rem)/gi);
          if (bpMatches) {
            bpMatches.forEach((bp: string) => {
              const val = bp.match(/([\d.]+)\s*(px|em|rem)/i);
              if (val) {
                let px = parseFloat(val[1]);
                if (val[2] === "em" || val[2] === "rem") px *= 16;
                responsive.breakpoints.add(Math.round(px));
              }
            });
          }
        }
        if (node.name === "container") responsive.hasContainerQuery = true;
        if (node.name === "supports") {
          features.hasFeatureQueries = true;
          features.featureQueryCount++;
        }
      }

      // Pseudo-class selectors
      if (node.type === "PseudoClassSelector") {
        if (node.name === "focus-visible") metrics.hasFocusVisible = true;
        if (node.name === "hover") metrics.hasHoverStates = true;
      }

      // Class selectors
      if (node.type === "ClassSelector") {
        metrics.allCssClasses.add(node.name);
      }

      // Declarations
      if (node.type === "Declaration") {
        const prop = node.property;
        const val = csstree.generate(node.value);

        // --- Colors ---
        const colorStrings = extractColorStrings(val);
        for (const c of colorStrings) {
          colors.all.add(c);
          if (/^(background|background-color)$/.test(prop)) colors.background.push(c);
          if (prop === "color") colors.text.push(c);
        }

        // --- Fonts ---
        if (prop === "font-family") {
          const primary = extractPrimaryFontFamily(val);
          if (primary) fonts.families.add(primary);
        }
        if (prop === "font-size") {
          const px = parsePxValue(val);
          if (px) fonts.sizes.push(px);
          if (/clamp|vw|vmin|vmax/.test(val)) fonts.hasResponsiveFontSizing = true;
        }
        if (prop === "line-height") {
          const num = parseFloat(val);
          if (!isNaN(num)) fonts.lineHeights.push(num > 10 ? num / 16 : num);
        }
        if (prop === "letter-spacing") fonts.letterSpacings.push(val);

        // --- Spacing ---
        if (SPACING_PROPERTIES.test(prop)) {
          spacing.values.push(...extractSpacingValues(val));
        }

        // --- Layout ---
        if (prop === "max-width") metrics.hasMaxWidth = true;

        // --- Display / layout mode ---
        if (prop === "display") {
          if (/flex/.test(val)) responsive.hasFlexbox = true;
          if (/grid/.test(val)) responsive.hasGrid = true;
        }

        // --- Modern CSS functions ---
        if (/clamp\(/.test(val)) responsive.hasClamp = true;
        if (/min\(|max\(/.test(val)) responsive.hasMinMax = true;
        if (/[^a-z](vw|vh|vmin|vmax|dvh|dvw|svh|svw|lvh|lvw)[^a-z]/i.test(val)) {
          responsive.hasViewportUnits = true;
        }

        // --- Logical properties ---
        if (/^(margin|padding|border)-(inline|block)/.test(prop) ||
            /^(inline|block)-size/.test(prop) || /^inset/.test(prop)) {
          responsive.hasLogicalProperties = true;
        }

        // --- Animations ---
        if (/^transition/.test(prop)) {
          metrics.hasTransitions = true;
          const durMatch = val.match(/([\d.]+)s/g);
          if (durMatch) {
            durMatch.forEach((d: string) => {
              const ms = parseFloat(d) * 1000;
              if (ms > 0) metrics.animationDurations.push(ms);
            });
          }
          const msDurMatch = val.match(/([\d.]+)ms/g);
          if (msDurMatch) {
            msDurMatch.forEach((d: string) => metrics.animationDurations.push(parseFloat(d)));
          }
        }
        if (/^animation/.test(prop)) {
          metrics.hasAnimations = true;
          const durMatch = val.match(/([\d.]+)s/g);
          if (durMatch) {
            durMatch.forEach((d: string) => {
              const ms = parseFloat(d) * 1000;
              if (ms > 0) metrics.animationDurations.push(ms);
            });
          }
        }

        // --- Touch targets ---
        if (/^(min-height|min-width|height|width)$/.test(prop)) {
          const px = parsePxValue(val);
          if (px) metrics.touchTargetSizes.push(px);
        }

        // --- Vendor prefixes ---
        if (prop.startsWith("-webkit-")) { vendorPrefixes.webkit++; prefixedInCss.add(prop.replace("-webkit-", "")); }
        else if (prop.startsWith("-moz-")) { vendorPrefixes.moz++; prefixedInCss.add(prop.replace("-moz-", "")); }
        else if (prop.startsWith("-ms-")) { vendorPrefixes.ms++; prefixedInCss.add(prop.replace("-ms-", "")); }
        else if (prop.startsWith("-o-")) { vendorPrefixes.o++; prefixedInCss.add(prop.replace("-o-", "")); }
        if (commonPrefixNeeded.has(prop)) unprefixedModernProps.add(prop);

        // --- Color scheme ---
        if (prop === "color-scheme") features.hasColorScheme = true;

        // --- Text wrapping ---
        if (prop === "overflow-wrap") textWrapping.hasOverflowWrap = true;
        if (prop === "word-wrap") textWrapping.hasWordWrap = true;
        if (prop === "word-break") textWrapping.hasWordBreak = true;
        if (prop === "hyphens" && /auto/.test(val)) textWrapping.hasHyphens = true;
        if (prop === "text-wrap") {
          if (/balance/.test(val)) textWrapping.hasTextWrapBalance = true;
          if (/pretty/.test(val)) textWrapping.hasTextWrapPretty = true;
        }
        if (prop === "white-space" && /nowrap/.test(val)) textWrapping.whiteSpaceNowrapCount++;
        if (prop === "text-overflow" && /ellipsis/.test(val)) textWrapping.hasTextOverflowEllipsis = true;
        if (prop === "max-width") {
          if (/ch/.test(val)) textWrapping.hasChMaxWidth = true;
          const pxVal = parsePxValue(val);
          if (pxVal && pxVal >= 600 && pxVal <= 900) textWrapping.hasReasonablePxMaxWidth = true;
        }
        if (prop === "orphans") textWrapping.hasOrphans = true;
        if (prop === "widows") textWrapping.hasWidows = true;
      }
    });
  }

  // Vendor prefix analysis
  vendorPrefixes.missingPrefixes = [...unprefixedModernProps].filter((p) => !prefixedInCss.has(p));
  vendorPrefixes.prefixedProperties = prefixedInCss;

  // HTML-level metrics from pages
  for (const { $, html } of pages) {
    // Inline style colors
    $("[style]").each((_, el) => {
      const style = $(el).attr("style") || "";
      extractColorStrings(style).forEach((c) => colors.all.add(c));
    });

    // HTML classes used
    $("[class]").each((_, el) => {
      const cls = $(el).attr("class") || "";
      cls.split(/\s+/).forEach((c: string) => { if (c) metrics.htmlClassesUsed.add(c); });
    });

    // HTML features
    if ($('meta[charset]').length > 0) features.hasCharsetMeta = true;
    if ($('meta[name="viewport"]').length > 0) features.hasViewportMeta = true;
    if ($("picture").length > 0) features.hasPictureElement = true;
    if ($("img[srcset]").length > 0 || $("source[srcset]").length > 0) features.hasSrcset = true;
    if ($('input[type="email"],input[type="tel"],input[type="url"],input[type="search"],input[type="date"],input[type="number"]').length > 0) {
      features.usesModernInputTypes = true;
    }

    // Text wrapping HTML checks
    $("p br, h1 br, h2 br, h3 br, h4 br, h5 br, h6 br").each(() => { textWrapping.totalBrTags++; });
    $("wbr").each(() => { textWrapping.totalWbrTags++; });
    textWrapping.totalShyEntities += (html.match(/&shy;/g) || []).length;

    $("p, h1, h2, h3, h4, h5, h6, li, td, th, span, a, label").each((_, el) => {
      const text = $(el).text() || "";
      const words = text.split(/[\s\-]+/);
      for (const word of words) {
        if (word.length > 30) textWrapping.longUnbrokenStrings++;
      }
    });
  }

  return {
    rawText: "",
    asts: cssAsts,
    colors, fonts, spacing, metrics, responsive, vendorPrefixes, features, textWrapping,
  };
}

// ---------------------------------------------------------------------------
// Static parser for local directories
// ---------------------------------------------------------------------------

export class StaticDirectoryParser implements Parser {
  async parse(target: string): Promise<ParseResult> {
    if (!fs.existsSync(target)) {
      throw new Error(`Directory not found: ${target}`);
    }

    const htmlFiles = findHtmlFiles(target);
    if (htmlFiles.length === 0) {
      throw new Error(`No HTML files found in ${target}`);
    }

    const cssFiles = findCssFiles(target);
    console.log(`Found ${htmlFiles.length} HTML files and ${cssFiles.length} CSS files.\n`);

    // Parse CSS
    const cssAsts: csstree.CssNode[] = [];
    let allCssText = "";
    for (const f of cssFiles) {
      try {
        const text = fs.readFileSync(f, "utf-8");
        allCssText += text + "\n";
        cssAsts.push(csstree.parse(text, { parseCustomProperty: true }));
      } catch (e) {
        console.warn(`Warning: could not parse CSS file ${f}: ${(e as Error).message}`);
      }
    }

    // Parse HTML
    const pages: ParsedPage[] = [];
    for (const f of htmlFiles) {
      try {
        const html = fs.readFileSync(f, "utf-8");
        const $ = cheerio.load(html);

        // Extract inline CSS from <style> tags
        $("style").each((_, el) => {
          const styleText = $(el).text();
          if (styleText) {
            allCssText += styleText + "\n";
            try {
              cssAsts.push(csstree.parse(styleText, { parseCustomProperty: true }));
            } catch { /* ignore parse errors in inline styles */ }
          }
        });

        pages.push(extractPageData(path.relative(target, f), $, html));
      } catch (e) {
        console.warn(`Warning: could not parse HTML file ${f}: ${(e as Error).message}`);
      }
    }

    const css = extractCssData(cssAsts, pages);
    css.rawText = allCssText;

    return { pages, css };
  }
}

// ---------------------------------------------------------------------------
// Static parser for URLs — fetches HTML + linked CSS
// ---------------------------------------------------------------------------

export class StaticUrlParser implements Parser {
  private maxExternalCss: number;
  private fetchTimeout: number;

  constructor(maxExternalCss = 10, fetchTimeout = 15000) {
    this.maxExternalCss = maxExternalCss;
    this.fetchTimeout = fetchTimeout;
  }

  async parse(target: string | string[]): Promise<ParseResult> {
    const urls = Array.isArray(target) ? target : [target];
    const pages: ParsedPage[] = [];
    const cssAsts: csstree.CssNode[] = [];
    let allCssText = "";

    for (const url of urls) {
      try {
        // Fetch HTML
        const response = await fetch(url, {
          headers: { "User-Agent": "aesthetic-eval/2.0" },
          signal: AbortSignal.timeout(this.fetchTimeout),
        });
        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract inline CSS
        $("style").each((_, el) => {
          const styleText = $(el).text();
          if (styleText) {
            allCssText += styleText + "\n";
            try {
              cssAsts.push(csstree.parse(styleText, { parseCustomProperty: true }));
            } catch { /* ignore parse errors */ }
          }
        });

        // Fetch external CSS
        const cssUrls: string[] = [];
        $('link[rel="stylesheet"]').each((_, el) => {
          const href = $(el).attr("href");
          if (href) {
            try {
              cssUrls.push(new URL(href, url).toString());
            } catch { /* invalid URL */ }
          }
        });

        for (const cssUrl of cssUrls.slice(0, this.maxExternalCss)) {
          try {
            const cssResponse = await fetch(cssUrl, {
              headers: { "User-Agent": "aesthetic-eval/2.0" },
              signal: AbortSignal.timeout(this.fetchTimeout),
            });
            const cssText = await cssResponse.text();
            allCssText += cssText + "\n";
            try {
              cssAsts.push(csstree.parse(cssText, { parseCustomProperty: true }));
            } catch {
              // Try chunked parsing for malformed CSS
              const chunks = cssText.split(/(?=@media|@keyframes|@font-face)/);
              for (const chunk of chunks) {
                try {
                  cssAsts.push(csstree.parse(chunk, { parseCustomProperty: true }));
                } catch { /* skip unparseable chunk */ }
              }
            }
          } catch {
            console.warn(`Warning: could not fetch CSS ${cssUrl}`);
          }
        }

        const urlHostname = new URL(url).hostname;
        pages.push(extractPageData(urlHostname, $, html));
      } catch (e) {
        console.warn(`Warning: could not fetch ${url}: ${(e as Error).message}`);
      }
    }

    const css = extractCssData(cssAsts, pages);
    css.rawText = allCssText;

    return { pages, css };
  }
}
