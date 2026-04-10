#!/usr/bin/env node

/**
 * Web Aesthetic Quality Evaluation Tool
 *
 * Fetches a live website and evaluates it using the same metrics
 * as the local evaluate.mjs tool.
 *
 * Usage: node evaluate-url.mjs https://example.com [name]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import * as csstree from "css-tree";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers (same as evaluate.mjs)
// ---------------------------------------------------------------------------

function parseColor(str) {
  if (!str || str === "transparent" || str === "inherit" || str === "initial" || str === "currentColor" || str === "currentcolor" || str === "none") return null;
  str = str.trim().toLowerCase();
  const named = {
    white: [255,255,255], black: [0,0,0], red: [255,0,0], green: [0,128,0],
    blue: [0,0,255], yellow: [255,255,0], orange: [255,165,0], gray: [128,128,128],
    grey: [128,128,128], silver: [192,192,192], navy: [0,0,128], teal: [0,128,128],
    maroon: [128,0,0], purple: [128,0,128], olive: [128,128,0], aqua: [0,255,255],
    lime: [0,255,0], fuchsia: [255,0,255], coral: [255,127,80], pink: [255,192,203],
    gold: [255,215,0], ivory: [255,255,240], beige: [245,245,220],
    lavender: [230,230,250], wheat: [245,222,179], tan: [210,180,140],
  };
  if (named[str]) { const [r,g,b] = named[str]; return {r,g,b}; }
  const hexMatch = str.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    if (hex.length === 4) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3];
    return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
  }
  const rgbMatch = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgbMatch) return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };
  const rgbModern = str.match(/rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (rgbModern) return { r: +rgbModern[1], g: +rgbModern[2], b: +rgbModern[3] };
  const hslMatch = str.match(/hsla?\(\s*([\d.]+)\s*,?\s*([\d.]+)%?\s*,?\s*([\d.]+)%?/);
  if (hslMatch) {
    const h = +hslMatch[1]/360, s = +hslMatch[2]/100, l = +hslMatch[3]/100;
    const hue2rgb = (p,q,t) => { if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p; };
    if (s===0) { const v=Math.round(l*255); return {r:v,g:v,b:v}; }
    const q2=l<0.5?l*(1+s):l+s-l*s, p2=2*l-q2;
    return { r:Math.round(hue2rgb(p2,q2,h+1/3)*255), g:Math.round(hue2rgb(p2,q2,h)*255), b:Math.round(hue2rgb(p2,q2,h-1/3)*255) };
  }
  return null;
}

function luminance({r,g,b}) {
  const srgb = [r,g,b].map(c => { c=c/255; return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4); });
  return 0.2126*srgb[0]+0.7152*srgb[1]+0.0722*srgb[2];
}
function contrastRatio(c1,c2) {
  const l1=luminance(c1),l2=luminance(c2);
  return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
}
function clamp(v,lo=0,hi=100) { return Math.max(lo,Math.min(hi,v)); }
function parsePxValue(val) {
  if(!val)return null; val=String(val).trim();
  const m=val.match(/^([\d.]+)\s*px$/i); if(m)return parseFloat(m[1]);
  const rm=val.match(/^([\d.]+)\s*rem$/i); if(rm)return parseFloat(rm[1])*16;
  const em=val.match(/^([\d.]+)\s*em$/i); if(em)return parseFloat(em[1])*16;
  const n=parseFloat(val); return isNaN(n)?null:n;
}

// ---------------------------------------------------------------------------
// Fetch a URL with retries
// ---------------------------------------------------------------------------
async function fetchUrl(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AestheticEval/1.0",
          "Accept": "text/html,text/css,*/*",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok && i < retries) continue;
      return await resp.text();
    } catch (e) {
      if (i === retries) throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Extract CSS URLs from HTML
// ---------------------------------------------------------------------------
function extractCssUrls($, baseUrl) {
  const urls = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      try { urls.push(new URL(href, baseUrl).href); } catch {}
    }
  });
  // Also extract <style> tag contents
  const inlineCss = [];
  $("style").each((_, el) => {
    inlineCss.push($(el).html() || "");
  });
  return { urls, inlineCss };
}

// ---------------------------------------------------------------------------
// Main evaluation (adapted for fetched content)
// ---------------------------------------------------------------------------
async function evaluateSite(url, siteName) {
  console.log(`\n  Fetching ${url} ...`);
  const html = await fetchUrl(url);
  const $ = cheerio.load(html);
  const pageSize = Buffer.byteLength(html);

  // Fetch CSS
  const { urls: cssUrls, inlineCss } = extractCssUrls($, url);
  let allCssText = inlineCss.join("\n");
  let cssFileCount = inlineCss.filter(c => c.trim()).length;

  for (const cssUrl of cssUrls.slice(0, 10)) {
    try {
      console.log(`  Fetching CSS: ${cssUrl.substring(0, 80)}...`);
      const css = await fetchUrl(cssUrl);
      allCssText += "\n" + css;
      cssFileCount++;
    } catch (e) {
      console.log(`  (skipped: ${e.message})`);
    }
  }

  // Parse CSS
  const cssAsts = [];
  if (allCssText.trim()) {
    try {
      cssAsts.push(csstree.parse(allCssText, { parseCustomProperty: true }));
    } catch (e) {
      // Try parsing in chunks
      for (const chunk of allCssText.split(/(?=@media|@keyframes|@font-face)/)) {
        try { cssAsts.push(csstree.parse(chunk, { parseCustomProperty: true })); } catch {}
      }
    }
  }

  console.log(`  Parsed ${cssFileCount} CSS sources, ${cssAsts.length} ASTs\n`);

  // -- Colors --
  const colorSet = new Set();
  const bgColors = [], textColors = [];
  for (const ast of cssAsts) {
    csstree.walk(ast, node => {
      if (node.type === "Declaration") {
        const val = csstree.generate(node.value);
        const colors = val.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g);
        if (colors) {
          for (const c of colors) {
            colorSet.add(c.toLowerCase());
            if (/^(background|background-color)$/.test(node.property)) bgColors.push(c);
            if (/^(color)$/.test(node.property)) textColors.push(c);
          }
        }
      }
    });
  }
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const colors = style.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g);
    if (colors) colors.forEach(c => colorSet.add(c.toLowerCase()));
  });

  // -- Fonts --
  const fontFamilies = new Set();
  const fontSizes = [], lineHeights = [], letterSpacings = [];
  let hasResponsiveFontSizing = false;
  for (const ast of cssAsts) {
    csstree.walk(ast, node => {
      if (node.type === "Declaration") {
        const val = csstree.generate(node.value);
        if (node.property === "font-family") {
          const fam = val.split(",")[0].replace(/['"]/g,"").trim();
          if (fam && !fam.startsWith("-") && fam !== "inherit" && fam !== "initial") fontFamilies.add(fam);
        }
        if (node.property === "font-size") {
          const px = parsePxValue(val);
          if (px) fontSizes.push(px);
          if (/clamp|vw|vmin|vmax/.test(val)) hasResponsiveFontSizing = true;
        }
        if (node.property === "line-height") {
          const num = parseFloat(val);
          if (!isNaN(num)) lineHeights.push(num > 10 ? num/16 : num);
        }
        if (node.property === "letter-spacing") letterSpacings.push(val);
      }
    });
  }

  // -- Spacing --
  const spacingValues = [];
  for (const ast of cssAsts) {
    csstree.walk(ast, node => {
      if (node.type === "Declaration" && /^(margin|padding|margin-top|margin-bottom|margin-left|margin-right|padding-top|padding-bottom|padding-left|padding-right|gap|row-gap|column-gap)$/.test(node.property)) {
        const val = csstree.generate(node.value);
        const nums = val.match(/[\d.]+px/g);
        if (nums) nums.forEach(n => spacingValues.push(parseFloat(n)));
        const rems = val.match(/[\d.]+rem/g);
        if (rems) rems.forEach(n => spacingValues.push(parseFloat(n)*16));
      }
    });
  }

  // -- Layout --
  const sections = $("section").length;
  const navs = $("nav").length;
  const headers = $("header").length;
  const footers = $("footer").length;
  const mains = $("main").length;
  const headingOrder = [];
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    headingOrder.push(parseInt(el.tagName.replace("h",""),10));
  });
  let headingSkips = 0;
  for (let i=1;i<headingOrder.length;i++) {
    if (headingOrder[i]>headingOrder[i-1]+1) headingSkips++;
  }
  const h1Count = $("h1").length;

  // -- Images --
  const images = [];
  $("img").each((_, el) => {
    images.push({
      hasAlt: $(el).attr("alt") !== undefined,
      width: $(el).attr("width"),
      height: $(el).attr("height"),
      loading: $(el).attr("loading"),
    });
  });

  // -- Accessibility --
  const hasLang = !!$("html").attr("lang");
  const ariaLandmarks = $("[role='banner'],[role='navigation'],[role='main'],[role='contentinfo']").length;
  const hasSkipLink = $('a[href="#main-content"],a[href="#content"],a[href="#main"],a.skip-link,[class*="skip"]').length > 0;
  const viewport = $('meta[name="viewport"]').attr("content") || "";
  const disablesZoom = /maximum-scale\s*=\s*1(?:\.0)?/.test(viewport) || /user-scalable\s*=\s*no/.test(viewport);
  const hasViewport = viewport.includes("width=device-width");

  // -- CSS metrics --
  let totalRules = 0, hasReducedMotion = false, hasFocusVisible = false;
  let hasTransitions = false, hasAnimations = false, hasHoverStates = false, hasMaxWidth = false;
  const animationDurations = [];
  for (const ast of cssAsts) {
    csstree.walk(ast, node => {
      if (node.type === "Rule") totalRules++;
      if (node.type === "Atrule" && node.name === "media") {
        const mt = csstree.generate(node.prelude);
        if (/prefers-reduced-motion/.test(mt)) hasReducedMotion = true;
      }
      if (node.type === "PseudoClassSelector" && node.name === "focus-visible") hasFocusVisible = true;
      if (node.type === "PseudoClassSelector" && node.name === "hover") hasHoverStates = true;
      if (node.type === "Declaration") {
        if (/^transition/.test(node.property)) {
          hasTransitions = true;
          const val = csstree.generate(node.value);
          const d = val.match(/([\d.]+)s/g);
          if (d) d.forEach(v => { const ms=parseFloat(v)*1000; if(ms>0)animationDurations.push(ms); });
        }
        if (/^animation/.test(node.property)) hasAnimations = true;
        if (node.property === "max-width") hasMaxWidth = true;
      }
    });
  }

  // ------------------------------------------------------------------
  // SCORING (same logic as local tool)
  // ------------------------------------------------------------------
  const categories = {};

  // 1. Color & Contrast (20%)
  // Recalibrated: modern sites use many CSS colors via utilities/variables —
  // penalize gently for palette bloat, focus more on actual contrast quality
  {
    const parsedBg = bgColors.map(parseColor).filter(Boolean);
    const parsedText = textColors.map(parseColor).filter(Boolean);
    const effectiveBg = parsedBg.length > 0 ? parsedBg : [{r:255,g:255,b:255}];
    const effectiveText = parsedText.length > 0 ? parsedText : [{r:0,g:0,b:0}];
    const ratios = [];
    for (const tc of effectiveText) for (const bc of effectiveBg) ratios.push(contrastRatio(tc,bc));
    const avgContrast = ratios.length > 0 ? ratios.reduce((a,b)=>a+b,0)/ratios.length : 21;
    const passAA = ratios.filter(r=>r>=4.5).length;
    const passRate = Math.round((passAA / Math.max(1, ratios.length)) * 100);
    let score = 100;
    // Color count: modern CSS frameworks generate many colors — be lenient
    // Only penalize extreme bloat (100+) or very sparse (<3)
    if (colorSet.size > 100) score -= Math.min(15, (colorSet.size-100)*0.15);
    else if (colorSet.size < 3) score -= 10;
    // Contrast is what matters most
    if (passRate < 100) score -= (100-passRate)*0.25;
    if (avgContrast < 3) score -= 15; else if (avgContrast < 4.5) score -= 8; else if (avgContrast < 7) score -= 3;
    // Bonus for having both bg and text colors defined (intentional design)
    if (parsedBg.length > 0 && parsedText.length > 0) score += 5;
    categories["Color & Contrast"] = { score: clamp(Math.round(score)), uniqueColors: colorSet.size, wcagAAPassRate: passRate, avgContrast: Math.round(avgContrast*100)/100 };
  }

  // 2. Typography (15%)
  // Recalibrated: many sites use CSS custom properties (var(--font-*)) or system
  // font stacks that can't be parsed. Don't penalize for 0 detected fonts.
  {
    let score = 100;
    // Only penalize if we detect excessive fonts, not missing ones
    // (missing often means CSS variables are used — that's good practice)
    if (fontFamilies.size > 6) score -= (fontFamilies.size-6)*3;
    const minFont = fontSizes.length > 0 ? Math.min(...fontSizes) : 16;
    if (minFont < 10) score -= 10; else if (minFont < 12) score -= 5;
    if (lineHeights.length > 0) {
      const body = lineHeights.filter(lh=>lh>=1.0&&lh<=3.0);
      const good = body.filter(lh=>lh>=1.4&&lh<=1.8);
      if (body.length > 0 && good.length/body.length < 0.3) score -= 10;
    }
    if (!hasResponsiveFontSizing) score -= 5;
    categories["Typography"] = { score: clamp(Math.round(score)), fontFamilies: [...fontFamilies], fontCount: fontFamilies.size, minFontSize: minFont, responsive: hasResponsiveFontSizing };
  }

  // 3. Spacing (15%)
  // Recalibrated: real sites have 30-80+ unique spacing values — that's normal.
  // Focus on grid adherence and whether spacing is systematic, not count.
  {
    const onGrid = spacingValues.filter(v=>v%4===0||v%2===0||v===0);
    const gridRate = spacingValues.length > 0 ? Math.round((onGrid.length/spacingValues.length)*100) : 100;
    const unique = [...new Set(spacingValues.map(v=>Math.round(v)))].sort((a,b)=>a-b);
    let score = 100;
    // Mild penalty for poor grid adherence
    score -= Math.max(0, (100-gridRate)*0.2);
    // Only penalize extreme spacing chaos (100+ unique values)
    if (unique.length > 80) score -= Math.min(15, (unique.length-80)*0.2);
    categories["Spacing Consistency"] = { score: clamp(Math.round(score)), gridAdherence: gridRate, uniqueValues: unique.length };
  }

  // 4. Layout (15%)
  {
    let score = 100;
    if (headingSkips > 0) score -= headingSkips * 10;
    if (h1Count > 1) score -= 10;
    if (h1Count === 0) score -= 10;
    if (mains === 0) score -= 10;
    if (headers === 0 && navs === 0) score -= 5;
    if (footers === 0) score -= 5;
    if (!hasViewport) score -= 10;
    if (!hasMaxWidth) score -= 5;
    categories["Layout & Structure"] = { score: clamp(Math.round(score)), sections, h1Count, headingSkips, semantic: { nav: navs, header: headers, footer: footers, main: mains } };
  }

  // 5. Imagery (10%)
  {
    let score = 100;
    const missingAlt = images.filter(i=>!i.hasAlt).length;
    const missingDims = images.filter(i=>!i.width||!i.height).length;
    if (missingAlt > 0) score -= missingAlt * 10;
    if (missingDims > 0) score -= Math.min(20, missingDims*3);
    if (images.length > 2) {
      const lazyRate = images.filter(i=>i.loading==="lazy").length / images.length;
      if (lazyRate < 0.5) score -= 10;
    }
    categories["Imagery"] = { score: clamp(Math.round(score)), totalImages: images.length, missingAlt, missingDims };
  }

  // 6. Accessibility (15%)
  {
    let score = 100;
    if (!hasLang) score -= 15;
    if (!hasSkipLink) score -= 10;
    if (disablesZoom) score -= 15;
    if (ariaLandmarks === 0 && mains === 0 && navs === 0) score -= 10;
    if (!hasFocusVisible) score -= 10;
    categories["Accessibility"] = { score: clamp(Math.round(score)), hasLang, hasSkipLink, disablesZoom, hasFocusVisible, ariaLandmarks };
  }

  // 7. Performance (5%)
  {
    let score = 100;
    if (totalRules > 2000) score -= Math.min(15, (totalRules-2000)/200);
    if (pageSize > 200*1024) score -= 10;
    categories["Performance Indicators"] = { score: clamp(Math.round(score)), totalRules, pageSizeKB: Math.round(pageSize/1024*10)/10 };
  }

  // 8. Animation (5%)
  {
    let score = 100;
    if (!hasTransitions && !hasAnimations) score -= 15;
    if (!hasHoverStates) score -= 10;
    if ((hasTransitions || hasAnimations) && !hasReducedMotion) score -= 20;
    const ideal = animationDurations.filter(d=>d>=150&&d<=500);
    if (animationDurations.length > 0 && ideal.length/animationDurations.length < 0.5) score -= 10;
    categories["Animation & Interaction"] = { score: clamp(Math.round(score)), hasTransitions, hasAnimations, hasHoverStates, reducedMotion: hasReducedMotion };
  }

  // 9. Cross-Browser & Device Compat (15%)
  {
    let score = 100;

    // Responsive: media queries & breakpoints
    let mqCount = 0;
    const breakpoints = new Set();
    let hasFlexbox = false, hasGridLayout = false, usesClamp = false, usesVwVh = false;
    let hasPrintMedia = false, hasDarkMode = false, hasColorScheme = false;
    let hasTouchQuery = false;
    const prefixMissing = [];
    const commonPrefixNeeded = new Set(["appearance", "backdrop-filter", "background-clip", "text-fill-color", "text-stroke", "user-select", "hyphens", "text-size-adjust"]);
    const prefixedFound = new Set();

    for (const ast of cssAsts) {
      csstree.walk(ast, (node) => {
        if (node.type === "Atrule" && node.name === "media") {
          mqCount++;
          const mt = csstree.generate(node.prelude);
          const bps = mt.match(/(?:min|max)-width\s*:\s*([\d.]+)\s*(px|em|rem)/gi);
          if (bps) bps.forEach(bp => {
            const m = bp.match(/([\d.]+)\s*(px|em|rem)/i);
            if (m) { let px = parseFloat(m[1]); if (m[2] !== "px") px *= 16; breakpoints.add(Math.round(px)); }
          });
          if (/print/.test(mt)) hasPrintMedia = true;
          if (/prefers-color-scheme/.test(mt)) hasDarkMode = true;
          if (/hover\s*:\s*none|pointer\s*:\s*coarse/.test(mt)) hasTouchQuery = true;
        }
        if (node.type === "Declaration") {
          const val = csstree.generate(node.value);
          const prop = node.property;
          if (prop === "display" && /flex/.test(val)) hasFlexbox = true;
          if (prop === "display" && /grid/.test(val)) hasGridLayout = true;
          if (/clamp\(/.test(val)) usesClamp = true;
          if (/vw|vh|dvh|dvw/.test(val)) usesVwVh = true;
          if (prop === "color-scheme") hasColorScheme = true;
          if (prop.startsWith("-webkit-")) prefixedFound.add(prop.replace("-webkit-", ""));
          if (prop.startsWith("-moz-")) prefixedFound.add(prop.replace("-moz-", ""));
          if (commonPrefixNeeded.has(prop) && !prefixedFound.has(prop)) prefixMissing.push(prop);
        }
      });
    }

    // Responsive design
    if (mqCount === 0) score -= 20;
    else if (breakpoints.size < 2) score -= 10;
    else if (breakpoints.size < 3) score -= 5;
    if (!hasFlexbox && !hasGridLayout) score -= 10;

    // Modern CSS
    if (!usesClamp && !usesVwVh) score -= 10;

    // Vendor prefixes
    if (prefixMissing.length > 3) score -= 10;
    else if (prefixMissing.length > 0) score -= prefixMissing.length * 2;

    // Viewport meta
    if (!hasViewport) score -= 10;

    // Responsive images
    const hasSrcset = $("img[srcset]").length > 0 || $("source[srcset]").length > 0;
    const hasPicture = $("picture").length > 0;
    if (!hasSrcset && !hasPicture) score -= 5;

    // Print, dark mode (optional)
    if (!hasPrintMedia) score -= 3;
    if (!hasDarkMode && !hasColorScheme) score -= 5;

    categories["Cross-Browser & Device Compat"] = {
      score: clamp(Math.round(score)),
      mediaQueries: mqCount,
      breakpoints: [...breakpoints].sort((a,b)=>a-b),
      hasFlexbox, hasGrid: hasGridLayout, usesClamp, usesVwVh,
      hasPrintMedia, hasDarkMode, hasTouchQuery,
    };
  }

  // 10. Text Wrapping & Line Breaking
  {
    let hasOverflowWrap = false, hasWordWrap = false, hasWordBreak = false;
    let hasHyphens = false, hasTextWrapBalance = false, hasTextWrapPretty = false;
    let whiteSpaceNowrapCount = 0, hasTextOverflowEllipsis = false;
    let hasChMaxWidth = false, hasReasonablePxMaxWidth = false;
    let hasOrphans = false, hasWidows = false;

    for (const ast of cssAsts) {
      csstree.walk(ast, node => {
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

    // HTML checks
    let totalBrTags = 0, totalWbrTags = 0, totalShyEntities = 0;
    $("p br, h1 br, h2 br, h3 br, h4 br, h5 br, h6 br").each(() => { totalBrTags++; });
    $("wbr").each(() => { totalWbrTags++; });
    totalShyEntities = (html.match(/&shy;/g) || []).length;

    const hasWbrOrShy = totalWbrTags > 0 || totalShyEntities > 0;

    let score = 100;
    if (!hasOverflowWrap && !hasWordWrap) score -= 15;
    if (!hasTextOverflowEllipsis) score -= 5;
    if (whiteSpaceNowrapCount > 10) score -= 10;
    if (!hasChMaxWidth && !hasReasonablePxMaxWidth) score -= 10;
    if (totalBrTags > 5) score -= 10;
    if (hasTextWrapBalance || hasTextWrapPretty) score += 5;
    if (hasHyphens) score += 3;
    if (hasWbrOrShy) score += 2;

    categories["Text Wrapping & Line Breaking"] = {
      score: clamp(Math.round(score)),
      hasOverflowWrap, hasWordWrap, hasWordBreak, hasHyphens,
      hasTextWrapBalance, hasTextWrapPretty,
      whiteSpaceNowrapCount, hasTextOverflowEllipsis,
      hasChMaxWidth, hasReasonablePxMaxWidth,
      hasOrphans, hasWidows,
      brTags: totalBrTags, wbrTags: totalWbrTags, shyEntities: totalShyEntities,
    };
  }

  // Weighted overall
  const weights = {
    "Color & Contrast": 0.15, "Typography": 0.12, "Spacing Consistency": 0.10,
    "Layout & Structure": 0.12, "Imagery": 0.08, "Accessibility": 0.10,
    "Performance Indicators": 0.05, "Animation & Interaction": 0.05,
    "Cross-Browser & Device Compat": 0.13, "Text Wrapping & Line Breaking": 0.10,
  };
  let overall = 0;
  for (const [cat, w] of Object.entries(weights)) overall += (categories[cat]?.score || 0) * w;
  overall = Math.round(overall);

  let grade;
  if (overall >= 90) grade = "A";
  else if (overall >= 80) grade = "B";
  else if (overall >= 70) grade = "C";
  else if (overall >= 60) grade = "D";
  else grade = "F";

  return { siteName, url, categories, overall, grade };
}

// ---------------------------------------------------------------------------
// Print comparison table
// ---------------------------------------------------------------------------
function printResults(results) {
  const cats = [
    "Color & Contrast", "Typography", "Spacing Consistency",
    "Layout & Structure", "Imagery", "Accessibility",
    "Performance Indicators", "Animation & Interaction",
    "Cross-Browser & Device Compat", "Text Wrapping & Line Breaking"
  ];
  const weights = { "Color & Contrast": 15, "Typography": 12, "Spacing Consistency": 10, "Layout & Structure": 12, "Imagery": 8, "Accessibility": 10, "Performance Indicators": 5, "Animation & Interaction": 5, "Cross-Browser & Device Compat": 13, "Text Wrapping & Line Breaking": 10 };

  // Header
  const nameWidth = 33;
  const colWidth = 16;
  let header = "│ " + "Category".padEnd(nameWidth) + "│ " + "Weight".padEnd(7) + "│";
  let sep1 = "├─" + "─".repeat(nameWidth) + "┼─" + "─".repeat(7) + "┼";
  let top = "┌─" + "─".repeat(nameWidth) + "┬─" + "─".repeat(7) + "┬";
  let bot = "└─" + "─".repeat(nameWidth) + "┴─" + "─".repeat(7) + "┴";

  for (const r of results) {
    header += " " + r.siteName.substring(0, colWidth-1).padEnd(colWidth-1) + "│";
    sep1 += "─".repeat(colWidth) + "┼";
    top += "─".repeat(colWidth) + "┬";
    bot += "─".repeat(colWidth) + "┴";
  }
  // Fix trailing
  header = header.slice(0, -1) + "│";
  sep1 = sep1.slice(0, -1) + "┤";
  top = top.slice(0, -1) + "┐";
  bot = bot.slice(0, -1) + "┘";

  console.log("\n╔══════════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                    WEBSITE AESTHETIC COMPARISON REPORT                              ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════════════╝\n");

  console.log(top);
  console.log(header);
  console.log(sep1);

  for (const cat of cats) {
    let row = "│ " + cat.padEnd(nameWidth) + "│ " + (weights[cat]+"%").padEnd(7) + "│";
    for (const r of results) {
      const s = r.categories[cat]?.score ?? 0;
      const icon = s >= 80 ? "✓" : s >= 60 ? "△" : "✗";
      row += " " + `${s}/100 ${icon}`.padEnd(colWidth-1) + "│";
    }
    console.log(row);
  }

  console.log(sep1);
  let overallRow = "│ " + "OVERALL".padEnd(nameWidth) + "│ " + "100%".padEnd(7) + "│";
  for (const r of results) {
    overallRow += " " + `${r.overall}/100 (${r.grade})`.padEnd(colWidth-1) + "│";
  }
  console.log(overallRow);
  console.log(bot);
  console.log();
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  const sites = [
    // Finance
    { url: "https://www.goldmansachs.com", name: "Goldman Sachs" },
    { url: "https://www.morganstanley.com", name: "Morgan Stanley" },
    { url: "https://www.jpmorgan.com", name: "JPMorgan" },
    { url: "https://www.blackrock.com", name: "BlackRock" },
    { url: "https://www.citadel.com", name: "Citadel" },
    { url: "https://www.twosigma.com", name: "Two Sigma" },
    { url: "https://www.janestreet.com", name: "Jane Street" },
    { url: "https://www.deshaw.com", name: "D.E. Shaw" },
    { url: "https://www.bridgewater.com", name: "Bridgewater" },
    { url: "https://www.aqr.com", name: "AQR Capital" },
    // Tech giants
    { url: "https://www.apple.com", name: "Apple" },
    { url: "https://www.google.com", name: "Google" },
    { url: "https://www.microsoft.com", name: "Microsoft" },
    { url: "https://www.amazon.com", name: "Amazon" },
    { url: "https://www.meta.com", name: "Meta" },
    { url: "https://www.netflix.com", name: "Netflix" },
    { url: "https://www.nvidia.com", name: "NVIDIA" },
    { url: "https://www.tesla.com", name: "Tesla" },
    // Design-forward tech
    { url: "https://stripe.com", name: "Stripe" },
    { url: "https://vercel.com", name: "Vercel" },
    { url: "https://linear.app", name: "Linear" },
    { url: "https://www.figma.com", name: "Figma" },
    { url: "https://www.notion.so", name: "Notion" },
    { url: "https://www.framer.com", name: "Framer" },
    { url: "https://www.webflow.com", name: "Webflow" },
    { url: "https://www.supabase.com", name: "Supabase" },
    { url: "https://planetscale.com", name: "PlanetScale" },
    { url: "https://railway.app", name: "Railway" },
    // Media / Entertainment
    { url: "https://www.nytimes.com", name: "NY Times" },
    { url: "https://www.bbc.com", name: "BBC" },
    { url: "https://www.spotify.com", name: "Spotify" },
    { url: "https://www.airbnb.com", name: "Airbnb" },
    { url: "https://www.uber.com", name: "Uber" },
    // SaaS / B2B
    { url: "https://www.salesforce.com", name: "Salesforce" },
    { url: "https://www.slack.com", name: "Slack" },
    { url: "https://github.com", name: "GitHub" },
    { url: "https://www.atlassian.com", name: "Atlassian" },
    { url: "https://www.cloudflare.com", name: "Cloudflare" },
    { url: "https://www.twilio.com", name: "Twilio" },
    { url: "https://www.datadog.com", name: "Datadog" },
    // Crypto / Fintech
    { url: "https://www.coinbase.com", name: "Coinbase" },
    { url: "https://www.binance.com", name: "Binance" },
    { url: "https://www.robinhood.com", name: "Robinhood" },
    { url: "https://www.revolut.com", name: "Revolut" },
    { url: "https://www.wise.com", name: "Wise" },
    // Consulting / Professional
    { url: "https://www.mckinsey.com", name: "McKinsey" },
    { url: "https://www.bcg.com", name: "BCG" },
    { url: "https://www.bain.com", name: "Bain" },
    // Ecommerce / Consumer
    { url: "https://www.nike.com", name: "Nike" },
    { url: "https://www.shopify.com", name: "Shopify" },
    // Us
    { url: "https://foghnantrading.com", name: "Foghnan Trading" },
  ];

  // Allow override from CLI args
  const args = process.argv.slice(2);
  if (args.length > 0) {
    sites.length = 0;
    for (let i = 0; i < args.length; i += 2) {
      sites.push({ url: args[i], name: args[i+1] || new URL(args[i]).hostname });
    }
  }

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     Web Aesthetic Quality Evaluation Tool               ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const results = [];
  for (const site of sites) {
    try {
      const result = await evaluateSite(site.url, site.name);
      results.push(result);
    } catch (e) {
      console.log(`\n  ✗ Failed to evaluate ${site.name}: ${e.message}`);
      results.push({ siteName: site.name, url: site.url, categories: {}, overall: 0, grade: "N/A" });
    }
  }

  printResults(results);

  // Save report
  const reportPath = path.join(__dirname, "comparison-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`Full report saved to: ${reportPath}\n`);
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
