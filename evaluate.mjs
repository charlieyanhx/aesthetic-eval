#!/usr/bin/env node

/**
 * Aesthetic Quality Evaluation Tool
 *
 * Analyzes a Next.js static export (out/ directory) and produces a scored
 * report across ten UI/UX dimensions: Color & Contrast, Typography,
 * Spacing Consistency, Layout & Structure, Imagery, Accessibility,
 * Performance Indicators, Animation & Interaction,
 * Cross-Browser & Device Compatibility, and Text Wrapping & Line Breaking.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import * as csstree from "css-tree";

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("out");
const REPORT_PATH = path.join(__dirname, "report.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findHtmlFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip _next static chunks
      if (entry.name === "_next") continue;
      results.push(...findHtmlFiles(full));
    } else if (entry.name.endsWith(".html")) {
      results.push(full);
    }
  }
  return results;
}

function findCssFiles(dir) {
  const results = [];
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

/** Parse a CSS color string to {r,g,b} or null */
function parseColor(str) {
  if (!str || str === "transparent" || str === "inherit" || str === "initial" || str === "currentColor" || str === "currentcolor") return null;
  str = str.trim().toLowerCase();

  // Named colors (common subset)
  const named = {
    white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0],
    green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
    orange: [255, 165, 0], gray: [128, 128, 128], grey: [128, 128, 128],
    silver: [192, 192, 192], navy: [0, 0, 128], teal: [0, 128, 128],
    maroon: [128, 0, 0], purple: [128, 0, 128], olive: [128, 128, 0],
    aqua: [0, 255, 255], lime: [0, 255, 0], fuchsia: [255, 0, 255],
  };
  if (named[str]) {
    const [r, g, b] = named[str];
    return { r, g, b };
  }

  // Hex
  const hexMatch = str.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  // rgb/rgba
  const rgbMatch = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };

  // Modern rgb(r g b / a)
  const rgbModern = str.match(/rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)/);
  if (rgbModern) return { r: +rgbModern[1], g: +rgbModern[2], b: +rgbModern[3] };

  // hsl – rough conversion
  const hslMatch = str.match(/hsla?\(\s*([\d.]+)\s*,?\s*([\d.]+)%?\s*,?\s*([\d.]+)%?/);
  if (hslMatch) {
    const h = +hslMatch[1] / 360;
    const s = +hslMatch[2] / 100;
    const l = +hslMatch[3] / 100;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    if (s === 0) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p2 = 2 * l - q2;
    return {
      r: Math.round(hue2rgb(p2, q2, h + 1 / 3) * 255),
      g: Math.round(hue2rgb(p2, q2, h) * 255),
      b: Math.round(hue2rgb(p2, q2, h - 1 / 3) * 255),
    };
  }

  return null;
}

/** Relative luminance per WCAG 2.x */
function luminance({ r, g, b }) {
  const srgb = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

function parsePxValue(val) {
  if (!val) return null;
  val = String(val).trim();
  const m = val.match(/^([\d.]+)\s*px$/i);
  if (m) return parseFloat(m[1]);
  // rem -> px (assume 16px root)
  const rm = val.match(/^([\d.]+)\s*rem$/i);
  if (rm) return parseFloat(rm[1]) * 16;
  // em -> px (rough)
  const em = val.match(/^([\d.]+)\s*em$/i);
  if (em) return parseFloat(em[1]) * 16;
  // plain number (could be unitless line-height)
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== Aesthetic Quality Evaluation Tool ===\n");

  // Verify directory exists
  if (!fs.existsSync(OUT_DIR)) {
    console.error(`ERROR: Directory not found at ${OUT_DIR}`);
    console.error("\nUsage: node evaluate.mjs [path-to-html-directory]");
    console.error("  Defaults to ./out if no path given.\n");
    console.error("Examples:");
    console.error("  node evaluate.mjs                    # analyze ./out/");
    console.error("  node evaluate.mjs ../my-site/out     # analyze a specific build");
    console.error("  node evaluate.mjs /var/www/html       # analyze any HTML directory");
    process.exit(1);
  }

  // Gather files
  const htmlFiles = findHtmlFiles(OUT_DIR);
  if (htmlFiles.length === 0) {
    console.error("ERROR: No HTML files found in", OUT_DIR);
    process.exit(1);
  }

  const cssFiles = findCssFiles(OUT_DIR);
  console.log(`Found ${htmlFiles.length} HTML files and ${cssFiles.length} CSS files.\n`);

  // Parse all CSS
  let allCssText = "";
  const cssAsts = [];
  for (const f of cssFiles) {
    try {
      const text = fs.readFileSync(f, "utf-8");
      allCssText += text + "\n";
      cssAsts.push(csstree.parse(text, { parseCustomProperty: true }));
    } catch (e) {
      console.warn(`Warning: could not parse CSS file ${f}: ${e.message}`);
    }
  }

  // Parse all HTML
  const pages = [];
  for (const f of htmlFiles) {
    try {
      const html = fs.readFileSync(f, "utf-8");
      const $ = cheerio.load(html);
      pages.push({ file: path.relative(OUT_DIR, f), $, html, size: Buffer.byteLength(html) });
    } catch (e) {
      console.warn(`Warning: could not parse HTML file ${f}: ${e.message}`);
    }
  }

  // ------------------------------------------------------------------
  // Collect data across pages
  // ------------------------------------------------------------------

  // -- Colors --
  const colorSet = new Set();
  const bgColors = [];
  const textColors = [];

  function extractColorsFromCss(ast) {
    csstree.walk(ast, (node, item, list) => {
      if (node.type === "Declaration") {
        const val = csstree.generate(node.value);
        const colors = val.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g);
        if (colors) {
          for (const c of colors) {
            colorSet.add(c.toLowerCase());
            if (/^(background|background-color)$/.test(node.property)) {
              bgColors.push(c);
            }
            if (/^(color)$/.test(node.property)) {
              textColors.push(c);
            }
          }
        }
      }
    });
  }
  for (const ast of cssAsts) extractColorsFromCss(ast);
  // Also extract inline styles
  for (const { $ } of pages) {
    $("[style]").each((_, el) => {
      const style = $(el).attr("style") || "";
      const colors = style.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g);
      if (colors) colors.forEach((c) => colorSet.add(c.toLowerCase()));
    });
  }

  // -- Fonts --
  const fontFamilies = new Set();
  const fontSizes = [];
  const lineHeights = [];
  const letterSpacings = [];
  let hasResponsiveFontSizing = false;

  for (const ast of cssAsts) {
    csstree.walk(ast, (node) => {
      if (node.type === "Declaration") {
        const val = csstree.generate(node.value);
        if (node.property === "font-family") {
          // Extract the primary (first meaningful) font family from the stack
          const genericFamilies = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong"]);
          const families = val.split(",").map(f => f.replace(/['"]/g, "").trim());
          // Find the first real font family (not a var() or generic)
          for (const fam of families) {
            if (!fam) continue;
            if (/^var\(/.test(fam)) continue;
            if (genericFamilies.has(fam.toLowerCase())) continue;
            fontFamilies.add(fam);
            break; // only count the primary font from each stack
          }
        }
        if (node.property === "font-size") {
          const px = parsePxValue(val);
          if (px) fontSizes.push(px);
          if (/clamp|vw|vmin|vmax/.test(val)) hasResponsiveFontSizing = true;
        }
        if (node.property === "line-height") {
          const num = parseFloat(val);
          if (!isNaN(num)) lineHeights.push(num > 10 ? num / 16 : num); // convert px to ratio
        }
        if (node.property === "letter-spacing") {
          letterSpacings.push(val);
        }
      }
    });
  }

  // -- Spacing --
  const spacingValues = [];
  for (const ast of cssAsts) {
    csstree.walk(ast, (node) => {
      if (node.type === "Declaration") {
        if (/^(margin|padding|margin-top|margin-bottom|margin-left|margin-right|padding-top|padding-bottom|padding-left|padding-right|gap|row-gap|column-gap)$/.test(node.property)) {
          const val = csstree.generate(node.value);
          // Extract numeric px values
          const nums = val.match(/[\d.]+px/g);
          if (nums) nums.forEach((n) => spacingValues.push(parseFloat(n)));
          const rems = val.match(/[\d.]+rem/g);
          if (rems) rems.forEach((n) => spacingValues.push(parseFloat(n) * 16));
        }
      }
    });
  }

  // -- Layout data per page --
  const pageData = pages.map(({ file, $, html, size }) => {
    const sections = $("section").length;
    const navs = $("nav").length;
    const headers = $("header").length;
    const footers = $("footer").length;
    const mains = $("main").length;
    const headings = {
      h1: $("h1").length,
      h2: $("h2").length,
      h3: $("h3").length,
      h4: $("h4").length,
      h5: $("h5").length,
      h6: $("h6").length,
    };
    // Check heading hierarchy – build a list of heading levels in order
    const headingOrder = [];
    $("h1,h2,h3,h4,h5,h6").each((_, el) => {
      headingOrder.push(parseInt(el.tagName.replace("h", ""), 10));
    });
    let headingSkips = 0;
    for (let i = 1; i < headingOrder.length; i++) {
      if (headingOrder[i] > headingOrder[i - 1] + 1) headingSkips++;
    }

    // Images
    const images = [];
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
    const hasLang = $("html").attr("lang") ? true : false;
    const ariaLandmarks = $("[role='banner'],[role='navigation'],[role='main'],[role='contentinfo'],[role='complementary'],[role='search']").length;
    const hasSkipLink = $('a[href="#main-content"],a[href="#content"],a[href="#main"],a.skip-link,a.skip-to-content,[class*="skip"]').length > 0;
    const viewport = $('meta[name="viewport"]').attr("content") || "";
    const disablesZoom = /maximum-scale\s*=\s*1(?:\.0)?(?:\s|,|$)/.test(viewport) || /user-scalable\s*=\s*no/.test(viewport);
    const hasViewport = viewport.includes("width=device-width");

    // External resources
    const scripts = $("script[src]").length;
    const stylesheets = $('link[rel="stylesheet"]').length;
    const preloads = $('link[rel="preload"]').length;
    const prefetches = $('link[rel="prefetch"]').length;
    const fontPreloads = $('link[rel="preload"][as="font"]').length;

    return {
      file, size, sections, navs, headers, footers, mains,
      headings, headingOrder, headingSkips,
      images, hasLang, ariaLandmarks, hasSkipLink, disablesZoom, hasViewport,
      scripts, stylesheets, preloads, prefetches, fontPreloads,
    };
  });

  // -- CSS metrics --
  let totalRules = 0;
  let hasReducedMotion = false;
  let hasFocusVisible = false;
  const animationDurations = [];
  let hasTransitions = false;
  let hasAnimations = false;
  let hasHoverStates = false;
  const allCssClasses = new Set();
  const touchTargetSizes = [];

  for (const ast of cssAsts) {
    csstree.walk(ast, (node) => {
      if (node.type === "Rule") totalRules++;
      if (node.type === "Atrule" && node.name === "media") {
        const mediaText = csstree.generate(node.prelude);
        if (/prefers-reduced-motion/.test(mediaText)) hasReducedMotion = true;
      }
      if (node.type === "PseudoClassSelector" && node.name === "focus-visible") {
        hasFocusVisible = true;
      }
      if (node.type === "PseudoClassSelector" && node.name === "hover") {
        hasHoverStates = true;
      }
      if (node.type === "Declaration") {
        if (/^transition/.test(node.property)) {
          hasTransitions = true;
          const val = csstree.generate(node.value);
          const durMatch = val.match(/([\d.]+)s/g);
          if (durMatch) {
            durMatch.forEach((d) => {
              const ms = parseFloat(d) * 1000;
              if (ms > 0) animationDurations.push(ms);
            });
          }
          const msDurMatch = val.match(/([\d.]+)ms/g);
          if (msDurMatch) {
            msDurMatch.forEach((d) => animationDurations.push(parseFloat(d)));
          }
        }
        if (/^animation/.test(node.property)) {
          hasAnimations = true;
          const val = csstree.generate(node.value);
          const durMatch = val.match(/([\d.]+)s/g);
          if (durMatch) {
            durMatch.forEach((d) => {
              const ms = parseFloat(d) * 1000;
              if (ms > 0) animationDurations.push(ms);
            });
          }
        }
        // Touch target sizes
        if (/^(min-height|min-width|height|width)$/.test(node.property)) {
          const val = csstree.generate(node.value);
          const px = parsePxValue(val);
          if (px) touchTargetSizes.push(px);
        }
      }
      // Collect class selectors
      if (node.type === "ClassSelector") {
        allCssClasses.add(node.name);
      }
    });
  }

  // Check max-width constraints in CSS
  let hasMaxWidth = false;
  for (const ast of cssAsts) {
    csstree.walk(ast, (node) => {
      if (node.type === "Declaration" && node.property === "max-width") {
        hasMaxWidth = true;
      }
    });
  }

  // Check for unused CSS classes (sample from first page)
  const htmlClassesUsed = new Set();
  for (const { $ } of pages) {
    $("[class]").each((_, el) => {
      const cls = $(el).attr("class") || "";
      cls.split(/\s+/).forEach((c) => { if (c) htmlClassesUsed.add(c); });
    });
  }
  const unusedCssClasses = [...allCssClasses].filter((c) => !htmlClassesUsed.has(c));

  // ------------------------------------------------------------------
  // Scoring
  // ------------------------------------------------------------------
  const report = {
    generatedAt: new Date().toISOString(),
    outDir: OUT_DIR,
    pagesAnalyzed: pages.length,
    cssFilesAnalyzed: cssFiles.length,
    categories: {},
    overall: 0,
    recommendations: [],
  };

  // === 1. Color & Contrast (20%) ===
  {
    const details = {};
    details.uniqueColors = colorSet.size;
    // Contrast checks
    const parsedBg = bgColors.map(parseColor).filter(Boolean);
    const parsedText = textColors.map(parseColor).filter(Boolean);
    const contrastRatios = [];
    // Check each text color against each bg color (or use defaults)
    const effectiveBg = parsedBg.length > 0 ? parsedBg : [{ r: 255, g: 255, b: 255 }];
    const effectiveText = parsedText.length > 0 ? parsedText : [{ r: 0, g: 0, b: 0 }];
    for (const tc of effectiveText) {
      for (const bc of effectiveBg) {
        contrastRatios.push(contrastRatio(tc, bc));
      }
    }
    const avgContrast = contrastRatios.length > 0
      ? contrastRatios.reduce((a, b) => a + b, 0) / contrastRatios.length
      : 21;
    const passAA = contrastRatios.filter((r) => r >= 4.5).length;
    const totalPairs = contrastRatios.length || 1;
    details.avgContrastRatio = Math.round(avgContrast * 100) / 100;
    details.wcagAAPassRate = Math.round((passAA / totalPairs) * 100);
    details.contrastPairsChecked = totalPairs;

    // Scoring
    let score = 100;
    // Penalize for too many or too few unique colors (aligned with URL evaluator)
    const colorCount = colorSet.size;
    if (colorCount > 60) score -= Math.min(25, Math.round((colorCount - 60) * 0.5));
    else if (colorCount < 3) score -= 15;
    // Penalize for low contrast — use gentler curve since cartesian product creates many false pairs
    if (details.wcagAAPassRate < 100) score -= Math.round((100 - details.wcagAAPassRate) * 0.25);
    // Reward good avg contrast
    if (avgContrast < 3) score -= 20;
    else if (avgContrast < 4.5) score -= 10;
    else if (avgContrast < 7) score -= 3;

    details.score = clamp(Math.round(score));
    report.categories["Color & Contrast"] = details;
    if (details.score < 80) {
      report.recommendations.push({
        category: "Color & Contrast",
        score: details.score,
        suggestions: [
          colorCount > 20 ? `Reduce the color palette: ${colorCount} unique colors found (ideal: 5-8 for brand consistency).` : null,
          details.wcagAAPassRate < 100 ? `Improve contrast ratios: only ${details.wcagAAPassRate}% of text/bg pairs pass WCAG AA (4.5:1).` : null,
          avgContrast < 4.5 ? `Average contrast ratio (${details.avgContrastRatio}:1) is below WCAG AA minimum.` : null,
        ].filter(Boolean),
      });
    }
  }

  // === 2. Typography (15%) ===
  {
    const details = {};
    details.uniqueFontFamilies = [...fontFamilies];
    details.fontFamilyCount = fontFamilies.size;
    details.fontSizeRange = fontSizes.length > 0
      ? { min: Math.min(...fontSizes), max: Math.max(...fontSizes) }
      : null;
    details.lineHeightRange = lineHeights.length > 0
      ? { min: Math.round(Math.min(...lineHeights) * 100) / 100, max: Math.round(Math.max(...lineHeights) * 100) / 100 }
      : null;
    details.letterSpacingValues = [...new Set(letterSpacings)].slice(0, 10);
    details.hasResponsiveFontSizing = hasResponsiveFontSizing;

    let score = 100;
    // Font families: ideal 2-3
    if (fontFamilies.size === 0) score -= 10;
    else if (fontFamilies.size === 1) score -= 5;
    else if (fontFamilies.size > 4) score -= (fontFamilies.size - 4) * 5;

    // Body font size check
    const minFont = details.fontSizeRange ? details.fontSizeRange.min : 16;
    if (minFont < 12) score -= 15;
    else if (minFont < 14) score -= 5;

    // Line height check — only penalize body text line heights (>= 1.2), heading line heights (0.85-1.2) are fine
    if (lineHeights.length > 0) {
      const bodyLineHeights = lineHeights.filter((lh) => lh >= 1.2 && lh <= 3.0);
      const goodLh = bodyLineHeights.filter((lh) => lh >= 1.3 && lh <= 2.0);
      if (bodyLineHeights.length > 0 && goodLh.length / bodyLineHeights.length < 0.3) {
        score -= 10;
      }
    }

    // Responsive font sizing
    if (!hasResponsiveFontSizing) score -= 5;

    details.score = clamp(Math.round(score));
    report.categories["Typography"] = details;
    if (details.score < 80) {
      report.recommendations.push({
        category: "Typography",
        score: details.score,
        suggestions: [
          fontFamilies.size > 4 ? `Too many font families (${fontFamilies.size}). Aim for 2-3 for consistency.` : null,
          minFont < 14 ? `Smallest font size is ${minFont}px. Body text should be at least 16px.` : null,
          !hasResponsiveFontSizing ? "Consider using clamp() or vw units for responsive font sizing." : null,
        ].filter(Boolean),
      });
    }
  }

  // === 3. Spacing Consistency (15%) ===
  {
    const details = {};
    details.totalSpacingValues = spacingValues.length;
    // Check adherence to 4px/8px grid
    const onGrid = spacingValues.filter((v) => v % 4 === 0 || v === 0);
    details.gridAdherenceRate = spacingValues.length > 0
      ? Math.round((onGrid.length / spacingValues.length) * 100)
      : 100;
    // Spacing scale analysis
    const uniqueSpacing = [...new Set(spacingValues.map((v) => Math.round(v)))].sort((a, b) => a - b);
    details.uniqueSpacingValues = uniqueSpacing.length;
    details.spacingScale = uniqueSpacing.slice(0, 20);
    // Outlier detection (values > 3 stddevs from mean)
    if (spacingValues.length > 2) {
      const mean = spacingValues.reduce((a, b) => a + b, 0) / spacingValues.length;
      const stddev = Math.sqrt(spacingValues.reduce((a, b) => a + (b - mean) ** 2, 0) / spacingValues.length);
      const outliers = spacingValues.filter((v) => Math.abs(v - mean) > 3 * stddev);
      details.outlierCount = outliers.length;
    } else {
      details.outlierCount = 0;
    }

    let score = 100;
    // Grid adherence
    score -= Math.max(0, (100 - details.gridAdherenceRate) * 0.4);
    // Too many unique spacing values = inconsistent
    if (uniqueSpacing.length > 15) score -= Math.min(20, (uniqueSpacing.length - 15) * 1);
    // Outliers
    if (details.outlierCount > 0) score -= Math.min(10, details.outlierCount * 2);

    details.score = clamp(Math.round(score));
    report.categories["Spacing Consistency"] = details;
    if (details.score < 80) {
      report.recommendations.push({
        category: "Spacing Consistency",
        score: details.score,
        suggestions: [
          details.gridAdherenceRate < 80 ? `Only ${details.gridAdherenceRate}% of spacing values are on a 4px grid. Standardize spacing.` : null,
          uniqueSpacing.length > 15 ? `${uniqueSpacing.length} unique spacing values detected. Use a consistent spacing scale (e.g., 4/8/12/16/24/32/48/64).` : null,
          details.outlierCount > 0 ? `${details.outlierCount} spacing outliers detected. Review for consistency.` : null,
        ].filter(Boolean),
      });
    }
  }

  // === 4. Layout & Structure (15%) ===
  {
    const details = { pages: [] };
    let totalScore = 0;

    for (const p of pageData) {
      const pd = {
        file: p.file,
        sections: p.sections,
        semanticElements: { nav: p.navs, header: p.headers, footer: p.footers, main: p.mains },
        headings: p.headings,
        headingSkips: p.headingSkips,
        hasViewport: p.hasViewport,
      };
      let s = 100;
      // Heading hierarchy
      if (p.headingSkips > 0) s -= p.headingSkips * 10;
      if (p.headings.h1 > 1) s -= 10; // Multiple h1s
      if (p.headings.h1 === 0 && (p.headings.h2 > 0 || p.headings.h3 > 0)) s -= 10;
      // Semantic HTML
      if (p.mains === 0) s -= 10;
      if (p.headers === 0 && p.navs === 0) s -= 5;
      if (p.footers === 0) s -= 5;
      // Viewport
      if (!p.hasViewport) s -= 10;
      pd.score = clamp(Math.round(s));
      details.pages.push(pd);
      totalScore += pd.score;
    }

    details.hasMaxWidthConstraints = hasMaxWidth;
    if (!hasMaxWidth) totalScore -= pages.length * 5;

    details.score = clamp(Math.round(totalScore / Math.max(1, pages.length)));
    report.categories["Layout & Structure"] = details;
    if (details.score < 80) {
      const avgSkips = pageData.reduce((a, p) => a + p.headingSkips, 0);
      const missingMain = pageData.filter((p) => p.mains === 0).length;
      report.recommendations.push({
        category: "Layout & Structure",
        score: details.score,
        suggestions: [
          avgSkips > 0 ? `${avgSkips} heading hierarchy skips found across pages. Ensure h1 > h2 > h3 order.` : null,
          missingMain > 0 ? `${missingMain} pages are missing a <main> element.` : null,
          !hasMaxWidth ? "No max-width constraints found. Content may stretch too wide on large screens." : null,
        ].filter(Boolean),
      });
    }
  }

  // === 5. Imagery (10%) ===
  {
    const details = { pages: [] };
    let totalScore = 0;

    for (const p of pageData) {
      const pd = {
        file: p.file,
        imageCount: p.images.length,
        missingAlt: p.images.filter((i) => !i.hasAlt).length,
        missingDimensions: p.images.filter((i) => !i.width || !i.height).length,
        lazyLoaded: p.images.filter((i) => i.loading === "lazy").length,
      };
      let s = 100;
      if (pd.missingAlt > 0) s -= pd.missingAlt * 10;
      if (pd.missingDimensions > 0) s -= Math.min(20, pd.missingDimensions * 3);
      if (p.images.length > 0) {
        const lazyRate = pd.lazyLoaded / p.images.length;
        if (lazyRate < 0.5 && p.images.length > 2) s -= 10;
      }
      pd.score = clamp(Math.round(s));
      details.pages.push(pd);
      totalScore += pd.score;
    }

    details.score = clamp(Math.round(totalScore / Math.max(1, pages.length)));
    report.categories["Imagery"] = details;
    if (details.score < 80) {
      const totalMissingAlt = pageData.reduce((a, p) => a + p.images.filter((i) => !i.hasAlt).length, 0);
      report.recommendations.push({
        category: "Imagery",
        score: details.score,
        suggestions: [
          totalMissingAlt > 0 ? `${totalMissingAlt} images are missing alt text. Add descriptive alt attributes.` : null,
          "Consider adding width/height attributes to prevent layout shift.",
          "Use loading=\"lazy\" on below-the-fold images.",
        ].filter(Boolean),
      });
    }
  }

  // === 6. Accessibility (15%) ===
  {
    const details = { pages: [] };
    let totalScore = 0;

    for (const p of pageData) {
      const pd = {
        file: p.file,
        hasLang: p.hasLang,
        ariaLandmarks: p.ariaLandmarks,
        hasSkipLink: p.hasSkipLink,
        disablesZoom: p.disablesZoom,
      };
      let s = 100;
      if (!p.hasLang) s -= 15;
      if (!p.hasSkipLink) s -= 10;
      if (p.disablesZoom) s -= 15;
      if (p.ariaLandmarks === 0 && p.mains === 0 && p.navs === 0) s -= 10;
      pd.score = clamp(Math.round(s));
      details.pages.push(pd);
      totalScore += pd.score;
    }

    // Global CSS checks
    details.hasFocusVisibleStyles = hasFocusVisible;
    if (!hasFocusVisible) totalScore -= pages.length * 10;
    details.hasTouchTargets = touchTargetSizes.some((s) => s >= 44);

    details.score = clamp(Math.round(totalScore / Math.max(1, pages.length)));
    report.categories["Accessibility"] = details;
    if (details.score < 80) {
      const missingLang = pageData.filter((p) => !p.hasLang).length;
      report.recommendations.push({
        category: "Accessibility",
        score: details.score,
        suggestions: [
          missingLang > 0 ? `${missingLang} pages missing lang attribute on <html>.` : null,
          !hasFocusVisible ? "Add :focus-visible styles for keyboard navigation." : null,
          pageData.some((p) => p.disablesZoom) ? "Viewport meta disables zoom. Remove maximum-scale=1 or user-scalable=no." : null,
          pageData.some((p) => !p.hasSkipLink) ? "Add a skip-to-content link for keyboard users." : null,
        ].filter(Boolean),
      });
    }
  }

  // === 7. Performance Indicators (5%) ===
  {
    const details = {};
    details.totalCssRules = totalRules;
    details.totalCssClasses = allCssClasses.size;
    details.unusedCssClassCount = unusedCssClasses.length;
    details.unusedCssRate = allCssClasses.size > 0
      ? Math.round((unusedCssClasses.length / allCssClasses.size) * 100)
      : 0;
    details.pageSizes = pageData.map((p) => ({
      file: p.file,
      sizeBytes: p.size,
      sizeKB: Math.round(p.size / 1024 * 10) / 10,
    }));
    const avgSize = pageData.reduce((a, p) => a + p.size, 0) / Math.max(1, pages.length);
    details.avgPageSizeKB = Math.round(avgSize / 1024 * 10) / 10;
    details.externalScripts = pageData.reduce((a, p) => a + p.scripts, 0);
    details.totalPreloads = pageData.reduce((a, p) => a + p.preloads, 0);
    details.totalPrefetches = pageData.reduce((a, p) => a + p.prefetches, 0);

    let score = 100;
    if (totalRules > 2000) score -= Math.min(15, (totalRules - 2000) / 200);
    if (details.unusedCssRate > 50) score -= Math.min(20, (details.unusedCssRate - 50) * 0.5);
    if (avgSize > 200 * 1024) score -= 10;
    if (details.totalPreloads === 0) score -= 5;

    details.score = clamp(Math.round(score));
    report.categories["Performance Indicators"] = details;
    if (details.score < 80) {
      report.recommendations.push({
        category: "Performance Indicators",
        score: details.score,
        suggestions: [
          totalRules > 2000 ? `${totalRules} CSS rules found. Consider removing unused styles.` : null,
          details.unusedCssRate > 50 ? `${details.unusedCssRate}% of CSS classes appear unused. Run a CSS purge.` : null,
          avgSize > 200 * 1024 ? `Average HTML page size is ${details.avgPageSizeKB}KB. Consider code-splitting.` : null,
        ].filter(Boolean),
      });
    }
  }

  // === 8. Animation & Interaction (5%) ===
  {
    const details = {};
    details.hasTransitions = hasTransitions;
    details.hasAnimations = hasAnimations;
    details.hasHoverStates = hasHoverStates;
    details.prefersReducedMotion = hasReducedMotion;
    details.animationDurations = animationDurations.slice(0, 20);
    const idealDurations = animationDurations.filter((d) => d >= 150 && d <= 500);
    details.idealDurationRate = animationDurations.length > 0
      ? Math.round((idealDurations.length / animationDurations.length) * 100)
      : 100;

    let score = 100;
    if (!hasTransitions && !hasAnimations) score -= 15;
    if (!hasHoverStates) score -= 10;
    if ((hasTransitions || hasAnimations) && !hasReducedMotion) score -= 20;
    if (animationDurations.length > 0 && details.idealDurationRate < 50) {
      score -= 10;
    }

    details.score = clamp(Math.round(score));
    report.categories["Animation & Interaction"] = details;
    if (details.score < 80) {
      report.recommendations.push({
        category: "Animation & Interaction",
        score: details.score,
        suggestions: [
          !hasReducedMotion && (hasTransitions || hasAnimations) ? "Add a @media (prefers-reduced-motion) query to respect user preferences." : null,
          !hasHoverStates ? "Add hover states to interactive elements for better feedback." : null,
          details.idealDurationRate < 50 ? "Aim for transition durations between 200-500ms for smooth, perceptible animations." : null,
        ].filter(Boolean),
      });
    }
  }

  // === 9. Cross-Browser & Device Compatibility (10%) ===
  {
    const details = {};

    // --- A. Responsive Design Signals ---
    let hasMediaQueries = false;
    let mediaQueryCount = 0;
    const breakpoints = new Set();
    let hasFlexbox = false;
    let hasGrid = false;
    let hasContainerQuery = false;
    let hasClamp = false;
    let hasMinMax = false;
    let hasViewportUnits = false;
    let hasLogicalProperties = false;

    for (const ast of cssAsts) {
      csstree.walk(ast, (node) => {
        // Media queries
        if (node.type === "Atrule" && node.name === "media") {
          hasMediaQueries = true;
          mediaQueryCount++;
          const mediaText = csstree.generate(node.prelude);
          // Extract breakpoint values
          const bpMatches = mediaText.match(/(?:min|max)-width\s*:\s*([\d.]+)\s*(px|em|rem)/gi);
          if (bpMatches) {
            bpMatches.forEach((bp) => {
              const val = bp.match(/([\d.]+)\s*(px|em|rem)/i);
              if (val) {
                let px = parseFloat(val[1]);
                if (val[2] === "em" || val[2] === "rem") px *= 16;
                breakpoints.add(Math.round(px));
              }
            });
          }
        }
        // Container queries
        if (node.type === "Atrule" && node.name === "container") {
          hasContainerQuery = true;
        }
        // Declarations
        if (node.type === "Declaration") {
          const val = csstree.generate(node.value);
          const prop = node.property;
          // Flexbox / Grid
          if (prop === "display") {
            if (/flex/.test(val)) hasFlexbox = true;
            if (/grid/.test(val)) hasGrid = true;
          }
          // Modern CSS functions
          if (/clamp\(/.test(val)) hasClamp = true;
          if (/min\(|max\(/.test(val)) hasMinMax = true;
          // Viewport units
          if (/[^a-z](vw|vh|vmin|vmax|dvh|dvw|svh|svw|lvh|lvw)[^a-z]/i.test(val) || /^(vw|vh|vmin|vmax|dvh|dvw)$/i.test(val)) {
            hasViewportUnits = true;
          }
          // Logical properties
          if (/^(margin|padding|border)-(inline|block)/.test(prop) || /^(inline|block)-size/.test(prop) || /^(inset)/.test(prop)) {
            hasLogicalProperties = true;
          }
        }
      });
    }

    // --- B. Vendor Prefix Coverage ---
    const vendorPrefixes = { webkit: 0, moz: 0, ms: 0, o: 0 };
    const prefixedProperties = new Set();
    const unprefixedModernProps = new Set();
    // Properties that commonly need prefixes for broader compat
    const commonPrefixNeeded = new Set([
      "appearance", "backdrop-filter", "background-clip",
      "text-fill-color", "text-stroke", "text-stroke-width", "text-stroke-color",
      "user-select", "hyphens", "text-size-adjust",
    ]);
    const prefixedInCss = new Set();

    for (const ast of cssAsts) {
      csstree.walk(ast, (node) => {
        if (node.type === "Declaration") {
          const prop = node.property;
          if (prop.startsWith("-webkit-")) { vendorPrefixes.webkit++; prefixedInCss.add(prop.replace("-webkit-", "")); }
          else if (prop.startsWith("-moz-")) { vendorPrefixes.moz++; prefixedInCss.add(prop.replace("-moz-", "")); }
          else if (prop.startsWith("-ms-")) { vendorPrefixes.ms++; prefixedInCss.add(prop.replace("-ms-", "")); }
          else if (prop.startsWith("-o-")) { vendorPrefixes.o++; prefixedInCss.add(prop.replace("-o-", "")); }
          // Track modern props that may need prefixes
          if (commonPrefixNeeded.has(prop)) {
            unprefixedModernProps.add(prop);
          }
        }
      });
    }
    // Check which modern props lack vendor prefix counterparts
    const missingPrefixes = [...unprefixedModernProps].filter((p) => !prefixedInCss.has(p));

    // --- C. Feature Queries (@supports) ---
    let hasFeatureQueries = false;
    let featureQueryCount = 0;
    for (const ast of cssAsts) {
      csstree.walk(ast, (node) => {
        if (node.type === "Atrule" && node.name === "supports") {
          hasFeatureQueries = true;
          featureQueryCount++;
        }
      });
    }

    // --- D. Touch & Mobile Friendliness ---
    let hasTouchMediaQuery = false;
    let hasPointerMediaQuery = false;
    let hasOrientationQuery = false;
    for (const ast of cssAsts) {
      csstree.walk(ast, (node) => {
        if (node.type === "Atrule" && node.name === "media") {
          const mediaText = csstree.generate(node.prelude);
          if (/hover\s*:\s*none|pointer\s*:\s*coarse/.test(mediaText)) hasTouchMediaQuery = true;
          if (/pointer\s*:/.test(mediaText)) hasPointerMediaQuery = true;
          if (/orientation\s*:/.test(mediaText)) hasOrientationQuery = true;
        }
      });
    }

    // Touch target sizing: check if interactive elements have adequate size
    const interactiveSizes = [];
    for (const { $ } of pages) {
      $("a, button, input, select, textarea, [role='button']").each((_, el) => {
        const style = $(el).attr("style") || "";
        const classes = $(el).attr("class") || "";
        // Check for padding classes (Tailwind) — match px-N, py-N, p-N where N >= 2
        // Also match explicit size classes, inline padding/height styles, and btn-* classes
        const hasPadding = /\bp[xy]?-(?:[2-9]|1[0-9]|2[0-9])(?:\s|$)|\btext-(?:sm|base|lg|xl)/.test(classes)
          || /padding|min-height|height/.test(style);
        const hasMinSize = /\bmin-[hw]-|h-(?:[89]|[1-9]\d)|w-(?:[89]|[1-9]\d)|\bbtn[-_]/.test(classes)
          || /min-height|min-width/.test(style);
        // Buttons and inputs are generally adequate touch targets by default
        const isNativeInteractive = /^(BUTTON|INPUT|SELECT|TEXTAREA)$/i.test(el.tagName);
        interactiveSizes.push({ hasPadding, hasMinSize, isNativeInteractive });
      });
    }
    const adequateTouchTargets = interactiveSizes.filter((s) => s.hasPadding || s.hasMinSize || s.isNativeInteractive).length;
    const touchTargetRate = interactiveSizes.length > 0
      ? Math.round((adequateTouchTargets / interactiveSizes.length) * 100) : 100;

    // --- E. HTML Compatibility Signals ---
    let hasCharsetMeta = false;
    let hasXUACompat = false;
    let hasViewportMeta = false;
    let hasPictureElement = false;
    let hasSrcset = false;
    let usesModernInputTypes = false;

    for (const { $ } of pages) {
      if ($('meta[charset]').length > 0) hasCharsetMeta = true;
      if ($('meta[http-equiv="X-UA-Compatible"]').length > 0) hasXUACompat = true;
      if ($('meta[name="viewport"]').length > 0) hasViewportMeta = true;
      if ($("picture").length > 0) hasPictureElement = true;
      if ($("img[srcset]").length > 0 || $("source[srcset]").length > 0) hasSrcset = true;
      if ($('input[type="email"],input[type="tel"],input[type="url"],input[type="search"],input[type="date"],input[type="number"]').length > 0) {
        usesModernInputTypes = true;
      }
    }

    // --- F. CSS Print Styles ---
    let hasPrintStyles = false;
    for (const ast of cssAsts) {
      csstree.walk(ast, (node) => {
        if (node.type === "Atrule" && node.name === "media") {
          const mediaText = csstree.generate(node.prelude);
          if (/print/.test(mediaText)) hasPrintStyles = true;
        }
      });
    }

    // --- G. Dark Mode / Color Scheme Support ---
    let hasDarkMode = false;
    let hasColorScheme = false;
    for (const ast of cssAsts) {
      csstree.walk(ast, (node) => {
        if (node.type === "Atrule" && node.name === "media") {
          const mediaText = csstree.generate(node.prelude);
          if (/prefers-color-scheme/.test(mediaText)) hasDarkMode = true;
        }
        if (node.type === "Declaration" && node.property === "color-scheme") {
          hasColorScheme = true;
        }
      });
    }

    // --- Build Details ---
    details.responsive = {
      hasMediaQueries,
      mediaQueryCount,
      breakpoints: [...breakpoints].sort((a, b) => a - b),
      breakpointCount: breakpoints.size,
      hasFlexbox,
      hasGrid,
      hasContainerQuery,
      hasClamp,
      hasMinMax,
      hasViewportUnits,
      hasLogicalProperties,
    };
    details.vendorPrefixes = {
      counts: vendorPrefixes,
      totalPrefixed: Object.values(vendorPrefixes).reduce((a, b) => a + b, 0),
      missingPrefixes,
    };
    details.featureQueries = { hasFeatureQueries, featureQueryCount };
    details.touchFriendliness = {
      hasTouchMediaQuery,
      hasPointerMediaQuery,
      hasOrientationQuery,
      interactiveElements: interactiveSizes.length,
      adequateTouchTargetRate: touchTargetRate,
    };
    details.htmlCompat = {
      hasCharsetMeta,
      hasViewportMeta,
      hasPictureElement,
      hasSrcset,
      usesModernInputTypes,
    };
    details.extras = {
      hasPrintStyles,
      hasDarkMode,
      hasColorScheme,
    };

    // --- Scoring ---
    let score = 100;

    // Responsive design (up to -30)
    if (!hasMediaQueries) score -= 20;
    else if (breakpoints.size < 2) score -= 10;
    else if (breakpoints.size < 3) score -= 5;
    if (!hasFlexbox && !hasGrid) score -= 10;

    // Modern CSS techniques (up to -15)
    if (!hasClamp && !hasMinMax && !hasViewportUnits) score -= 10;
    // Bonus for using multiple modern techniques
    const modernCount = [hasClamp, hasMinMax, hasViewportUnits, hasContainerQuery, hasLogicalProperties].filter(Boolean).length;
    if (modernCount === 0) score -= 5;

    // Vendor prefix coverage (up to -10)
    if (missingPrefixes.length > 3) score -= 10;
    else if (missingPrefixes.length > 0) score -= missingPrefixes.length * 2;

    // Touch & mobile (up to -15)
    if (!hasViewportMeta) score -= 10;
    if (touchTargetRate < 50) score -= 10;
    else if (touchTargetRate < 70) score -= 5;

    // Responsive images (up to -5)
    if (!hasPictureElement && !hasSrcset) score -= 5;

    // Print styles (optional, up to -3)
    if (!hasPrintStyles) score -= 3;

    // Dark mode support (optional, up to -5)
    if (!hasDarkMode && !hasColorScheme) score -= 5;

    details.score = clamp(Math.round(score));
    report.categories["Cross-Browser & Device Compat"] = details;
    if (details.score < 80) {
      report.recommendations.push({
        category: "Cross-Browser & Device Compat",
        score: details.score,
        suggestions: [
          !hasMediaQueries ? "No media queries found. Add responsive breakpoints for mobile/tablet/desktop." : null,
          breakpoints.size < 3 && hasMediaQueries ? `Only ${breakpoints.size} breakpoint(s) found (${[...breakpoints].join("px, ")}px). Consider at least 3 (mobile, tablet, desktop).` : null,
          !hasFlexbox && !hasGrid ? "No flexbox or grid layout detected. Use modern layout for better cross-device rendering." : null,
          !hasClamp && !hasMinMax && !hasViewportUnits ? "No fluid sizing (clamp/min/max/vw) found. Use fluid values for smoother scaling across devices." : null,
          missingPrefixes.length > 0 ? `Properties missing vendor prefixes: ${missingPrefixes.join(", ")}. Add -webkit- prefixes for Safari/older browser support.` : null,
          !hasViewportMeta ? "Missing viewport meta tag. Essential for mobile rendering." : null,
          touchTargetRate < 70 ? `Only ${touchTargetRate}% of interactive elements appear to have adequate touch target sizes (44px+). Increase padding on buttons/links for mobile.` : null,
          !hasPictureElement && !hasSrcset ? "No responsive images (<picture> or srcset) found. Serve optimized images per device." : null,
          !hasDarkMode && !hasColorScheme ? "No dark mode or color-scheme support. Consider adding @media (prefers-color-scheme) for user preference." : null,
          !hasPrintStyles ? "No print styles found. Add @media print for better print compatibility." : null,
        ].filter(Boolean),
      });
    }
  }

  // === 10. Text Wrapping & Line Breaking ===
  {
    const details = {};

    // --- CSS checks ---
    let hasOverflowWrap = false;
    let hasWordWrap = false;
    let hasWordBreak = false;
    let hasHyphens = false;
    let hasTextWrapBalance = false;
    let hasTextWrapPretty = false;
    let whiteSpaceNowrapCount = 0;
    let hasTextOverflowEllipsis = false;
    let hasChMaxWidth = false;
    let hasReasonablePxMaxWidth = false;
    let hasOrphans = false;
    let hasWidows = false;

    for (const ast of cssAsts) {
      csstree.walk(ast, (node) => {
        if (node.type === "Declaration") {
          const prop = node.property;
          const val = csstree.generate(node.value);

          if (prop === "overflow-wrap") hasOverflowWrap = true;
          if (prop === "word-wrap") hasWordWrap = true;
          if (prop === "word-break") hasWordBreak = true;
          if (prop === "hyphens" && /auto/.test(val)) hasHyphens = true;
          if (prop === "text-wrap") {
            if (/balance/.test(val)) hasTextWrapBalance = true;
            if (/pretty/.test(val)) hasTextWrapPretty = true;
          }
          if (prop === "white-space" && /nowrap/.test(val)) whiteSpaceNowrapCount++;
          if (prop === "text-overflow" && /ellipsis/.test(val)) hasTextOverflowEllipsis = true;
          if (prop === "max-width") {
            if (/ch/.test(val)) hasChMaxWidth = true;
            const pxVal = parsePxValue(val);
            if (pxVal && pxVal >= 600 && pxVal <= 900) hasReasonablePxMaxWidth = true;
          }
          if (prop === "orphans") hasOrphans = true;
          if (prop === "widows") hasWidows = true;
        }
      });
    }

    // --- HTML checks ---
    let totalBrTags = 0;
    let totalWbrTags = 0;
    let totalShyEntities = 0;
    let longUnbrokenStrings = 0;

    for (const { $, html } of pages) {
      // Count <br> tags inside paragraph/heading text
      $("p br, h1 br, h2 br, h3 br, h4 br, h5 br, h6 br").each(() => { totalBrTags++; });
      // Count <wbr> tags
      $("wbr").each(() => { totalWbrTags++; });
      // Count &shy; entities
      const shyCount = (html.match(/&shy;/g) || []).length;
      totalShyEntities += shyCount;
      // Check for long unbroken strings (words > 30 chars)
      $("p, h1, h2, h3, h4, h5, h6, li, td, th, span, a, label").each((_, el) => {
        const text = $(el).text() || "";
        const words = text.split(/[\s\-]+/);
        for (const word of words) {
          if (word.length > 30) longUnbrokenStrings++;
        }
      });
    }

    const avgBrPerPage = pages.length > 0 ? totalBrTags / pages.length : 0;
    const hasWbrOrShy = totalWbrTags > 0 || totalShyEntities > 0;

    // --- Build details ---
    details.css = {
      hasOverflowWrap,
      hasWordWrap,
      hasWordBreak,
      hasHyphens,
      hasTextWrapBalance,
      hasTextWrapPretty,
      whiteSpaceNowrapCount,
      hasTextOverflowEllipsis,
      hasChMaxWidth,
      hasReasonablePxMaxWidth,
      hasOrphans,
      hasWidows,
    };
    details.html = {
      totalBrTags,
      avgBrPerPage: Math.round(avgBrPerPage * 10) / 10,
      totalWbrTags,
      totalShyEntities,
      longUnbrokenStrings,
    };

    // --- Scoring (start at 100) ---
    let score = 100;

    // No overflow-wrap or word-wrap anywhere: -15
    if (!hasOverflowWrap && !hasWordWrap) score -= 15;
    // No text-overflow: ellipsis anywhere: -5
    if (!hasTextOverflowEllipsis) score -= 5;
    // Excessive white-space: nowrap (more than 10 declarations): -10
    if (whiteSpaceNowrapCount > 10) score -= 10;
    // No max-width constraints on text (using ch units or reasonable px): -10
    if (!hasChMaxWidth && !hasReasonablePxMaxWidth) score -= 10;
    // Excessive <br> tags in content (more than 5 per page average): -10
    if (avgBrPerPage > 5) score -= 10;
    // Bonuses (capped at 100)
    if (hasTextWrapBalance || hasTextWrapPretty) score += 5;
    if (hasHyphens) score += 3;
    if (hasWbrOrShy) score += 2;

    details.score = clamp(Math.round(score));
    report.categories["Text Wrapping & Line Breaking"] = details;
    if (details.score < 80) {
      report.recommendations.push({
        category: "Text Wrapping & Line Breaking",
        score: details.score,
        suggestions: [
          !hasOverflowWrap && !hasWordWrap ? "Add overflow-wrap: break-word (or word-wrap: break-word) to prevent text from overflowing containers." : null,
          !hasTextOverflowEllipsis ? "Consider using text-overflow: ellipsis for graceful truncation of long text." : null,
          whiteSpaceNowrapCount > 10 ? `Excessive white-space: nowrap usage (${whiteSpaceNowrapCount} declarations). This can cause horizontal scrolling on small screens.` : null,
          !hasChMaxWidth && !hasReasonablePxMaxWidth ? "Set max-width on text containers using ch units (45-75ch) or reasonable px (600-900px) for optimal reading line length." : null,
          avgBrPerPage > 5 ? `Excessive <br> tags (avg ${Math.round(avgBrPerPage * 10) / 10}/page). Use CSS for spacing instead of line breaks.` : null,
          longUnbrokenStrings > 0 ? `${longUnbrokenStrings} long unbroken strings (>30 chars) found. Add word-break or <wbr> hints.` : null,
        ].filter(Boolean),
      });
    }
  }

  // ------------------------------------------------------------------
  // Overall weighted score
  // ------------------------------------------------------------------
  const weights = {
    "Color & Contrast": 0.15,
    "Typography": 0.12,
    "Spacing Consistency": 0.10,
    "Layout & Structure": 0.12,
    "Imagery": 0.08,
    "Accessibility": 0.10,
    "Performance Indicators": 0.05,
    "Animation & Interaction": 0.05,
    "Cross-Browser & Device Compat": 0.13,
    "Text Wrapping & Line Breaking": 0.10,
  };

  let overall = 0;
  for (const [cat, w] of Object.entries(weights)) {
    overall += (report.categories[cat]?.score || 0) * w;
  }
  report.overall = Math.round(overall);

  // ------------------------------------------------------------------
  // Output
  // ------------------------------------------------------------------

  // Save JSON
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Full report saved to: ${REPORT_PATH}\n`);

  // Human-readable summary
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║          AESTHETIC QUALITY EVALUATION REPORT            ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log(`  Pages analyzed: ${pages.length}`);
  console.log(`  CSS files analyzed: ${cssFiles.length}\n`);

  console.log("┌──────────────────────────────────┬───────┬────────┐");
  console.log("│ Category                         │ Score │ Weight │");
  console.log("├──────────────────────────────────┼───────┼────────┤");
  for (const [cat, w] of Object.entries(weights)) {
    const s = report.categories[cat]?.score ?? 0;
    const bar = s >= 80 ? "✓" : s >= 60 ? "△" : "✗";
    console.log(`│ ${cat.padEnd(33)}│ ${String(s).padStart(3)}/100│  ${(w * 100).toFixed(0).padStart(2)}%  │ ${bar}`);
  }
  console.log("├──────────────────────────────────┼───────┼────────┤");
  console.log(`│ OVERALL                          │ ${String(report.overall).padStart(3)}/100│  100% │`);
  console.log("└──────────────────────────────────┴───────┴────────┘\n");

  // Grade
  let grade;
  if (report.overall >= 90) grade = "A";
  else if (report.overall >= 80) grade = "B";
  else if (report.overall >= 70) grade = "C";
  else if (report.overall >= 60) grade = "D";
  else grade = "F";
  console.log(`  Overall Grade: ${grade}\n`);

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log("┌─────────────────────────────────────────────────────────┐");
    console.log("│                   RECOMMENDATIONS                      │");
    console.log("└─────────────────────────────────────────────────────────┘\n");
    for (const rec of report.recommendations) {
      console.log(`  [${rec.category}] (score: ${rec.score}/100)`);
      for (const s of rec.suggestions) {
        console.log(`    - ${s}`);
      }
      console.log();
    }
  } else {
    console.log("  No critical recommendations - all categories scored 80+!\n");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
