/**
 * Color utilities: parsing, luminance, contrast ratio, harmony detection.
 * Phase 3: upgraded with LAB/LCH color space via color-convert for perceptually
 * accurate clustering and harmony detection.
 */

import convert from "color-convert";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export interface LAB {
  l: number; // 0-100
  a: number; // -128 to 128
  b: number; // -128 to 128
}

export interface LCH {
  l: number; // 0-100
  c: number; // 0-~150 (chroma)
  h: number; // 0-360 (hue angle)
}

// Complete CSS named colors (CSS Color Level 4)
const NAMED_COLORS: Record<string, [number, number, number]> = {
  white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0],
  green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
  orange: [255, 165, 0], gray: [128, 128, 128], grey: [128, 128, 128],
  silver: [192, 192, 192], navy: [0, 0, 128], teal: [0, 128, 128],
  maroon: [128, 0, 0], purple: [128, 0, 128], olive: [128, 128, 0],
  aqua: [0, 255, 255], lime: [0, 255, 0], fuchsia: [255, 0, 255],
  coral: [255, 127, 80], pink: [255, 192, 203], gold: [255, 215, 0],
  ivory: [255, 255, 240], beige: [245, 245, 220], lavender: [230, 230, 250],
  wheat: [245, 222, 179], tan: [210, 180, 140], crimson: [220, 20, 60],
  indigo: [75, 0, 130], violet: [238, 130, 238], turquoise: [64, 224, 208],
  salmon: [250, 128, 114], khaki: [240, 230, 140], orchid: [218, 112, 214],
  plum: [221, 160, 221], sienna: [160, 82, 45], peru: [205, 133, 63],
  tomato: [255, 99, 71], chocolate: [210, 105, 30], firebrick: [178, 34, 34],
  darkred: [139, 0, 0], darkgreen: [0, 100, 0], darkblue: [0, 0, 139],
  darkgray: [169, 169, 169], darkgrey: [169, 169, 169],
  lightgray: [211, 211, 211], lightgrey: [211, 211, 211],
  dimgray: [105, 105, 105], dimgrey: [105, 105, 105],
  whitesmoke: [245, 245, 245], ghostwhite: [248, 248, 255],
  aliceblue: [240, 248, 255], mintcream: [245, 255, 250],
  honeydew: [240, 255, 240], azure: [240, 255, 255],
  snow: [255, 250, 250], seashell: [255, 245, 238],
  linen: [250, 240, 230], oldlace: [253, 245, 230],
  floralwhite: [255, 250, 240], antiquewhite: [250, 235, 215],
  papayawhip: [255, 239, 213], blanchedalmond: [255, 235, 205],
  bisque: [255, 228, 196], moccasin: [255, 228, 181],
  navajowhite: [255, 222, 173], peachpuff: [255, 218, 185],
  mistyrose: [255, 228, 225], lemonchiffon: [255, 250, 205],
  lightyellow: [255, 255, 224], lightgoldenrodyellow: [250, 250, 210],
  cornsilk: [255, 248, 220],
};

const TRANSPARENT_KEYWORDS = new Set([
  "transparent", "inherit", "initial", "currentColor", "currentcolor",
  "unset", "revert", "none",
]);

/** Parse a CSS color string to RGB, or null if unparseable. */
export function parseColor(str: string | null | undefined): RGB | null {
  if (!str || TRANSPARENT_KEYWORDS.has(str)) return null;
  str = str.trim().toLowerCase();

  // Named colors
  const named = NAMED_COLORS[str];
  if (named) {
    const [r, g, b] = named;
    return { r, g, b };
  }

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
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

  // rgb/rgba with commas: rgb(255, 0, 0) or rgba(255, 0, 0, 0.5)
  const rgbMatch = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgbMatch) return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };

  // Modern syntax: rgb(255 0 0 / 0.5)
  const rgbModern = str.match(/rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (rgbModern) return { r: +rgbModern[1], g: +rgbModern[2], b: +rgbModern[3] };

  // HSL: hsl(120, 100%, 50%) or hsl(120 100% 50%)
  const hslMatch = str.match(/hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?/);
  if (hslMatch) {
    return hslToRgb(+hslMatch[1], +hslMatch[2], +hslMatch[3]);
  }

  return null;
}

/** Convert HSL (h: 0-360, s: 0-100, l: 0-100) to RGB. */
export function hslToRgb(h: number, s: number, l: number): RGB {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/** Convert RGB to HSL. Returns h: 0-360, s: 0-100, l: 0-100. */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h: h * 360, s: s * 100, l: l * 100 };
}

// ---------------------------------------------------------------------------
// LAB/LCH conversions via color-convert (Phase 3)
// ---------------------------------------------------------------------------

/** Convert RGB to CIELAB. */
export function rgbToLab(rgb: RGB): LAB {
  const [l, a, b] = convert.rgb.lab([rgb.r, rgb.g, rgb.b]);
  return { l, a, b };
}

/** Convert RGB to LCH (cylindrical LAB). */
export function rgbToLch(rgb: RGB): LCH {
  const lab = rgbToLab(rgb);
  const c = Math.sqrt(lab.a ** 2 + lab.b ** 2);
  let h = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return { l: lab.l, c, h };
}

/** Relative luminance per WCAG 2.x. */
export function luminance(color: RGB): number {
  const srgb = [color.r, color.g, color.b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/** WCAG contrast ratio between two colors (1:1 to 21:1). */
export function contrastRatio(c1: RGB, c2: RGB): number {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Flatten a semi-transparent foreground onto an opaque background.
 * Implements CSS alpha compositing (premultiplied).
 * Citation: axe-core flattenColors algorithm.
 */
export function flattenColors(fg: RGB, bg: RGB, fgAlpha: number): RGB {
  const a = fgAlpha;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  };
}

/**
 * Perceptual color distance in CIELAB space (Delta E CIE76).
 * More accurate than RGB Euclidean distance for human perception.
 * Citation: CIE76 — International Commission on Illumination (1976).
 */
export function colorDistanceLab(c1: RGB, c2: RGB): number {
  const lab1 = rgbToLab(c1);
  const lab2 = rgbToLab(c2);
  return Math.sqrt(
    (lab1.l - lab2.l) ** 2 +
    (lab1.a - lab2.a) ** 2 +
    (lab1.b - lab2.b) ** 2,
  );
}

/**
 * Legacy RGB Euclidean distance (kept for backward compat).
 */
export function colorDistance(c1: RGB, c2: RGB): number {
  return Math.sqrt(
    (c1.r - c2.r) ** 2 +
    (c1.g - c2.g) ** 2 +
    (c1.b - c2.b) ** 2,
  );
}

/**
 * Cluster colors by proximity in CIELAB space. Greedy clustering.
 * Uses perceptual Delta E distance instead of RGB Euclidean.
 * Citation: CIE76 Delta E for perceptual color grouping.
 */
export function clusterColors(colors: RGB[], threshold = 20): Array<{ centroid: RGB; count: number; members: RGB[] }> {
  const clusters: Array<{ centroid: RGB; centroidLab: LAB; count: number; members: RGB[] }> = [];

  for (const color of colors) {
    const colorLab = rgbToLab(color);
    let bestCluster: (typeof clusters)[0] | null = null;
    let bestDist = Infinity;

    for (const cluster of clusters) {
      const dist = Math.sqrt(
        (colorLab.l - cluster.centroidLab.l) ** 2 +
        (colorLab.a - cluster.centroidLab.a) ** 2 +
        (colorLab.b - cluster.centroidLab.b) ** 2,
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestDist < threshold) {
      bestCluster.members.push(color);
      bestCluster.count++;
      // Update centroid as running average in LAB space
      const n = bestCluster.count;
      bestCluster.centroidLab = {
        l: (bestCluster.centroidLab.l * (n - 1) + colorLab.l) / n,
        a: (bestCluster.centroidLab.a * (n - 1) + colorLab.a) / n,
        b: (bestCluster.centroidLab.b * (n - 1) + colorLab.b) / n,
      };
      // Convert back to RGB for the centroid
      const [r, g, b_] = convert.lab.rgb([bestCluster.centroidLab.l, bestCluster.centroidLab.a, bestCluster.centroidLab.b]);
      bestCluster.centroid = { r, g, b: b_ };
    } else {
      clusters.push({
        centroid: { ...color },
        centroidLab: colorLab,
        count: 1,
        members: [color],
      });
    }
  }

  return clusters
    .sort((a, b) => b.count - a.count)
    .map(({ centroid, count, members }) => ({ centroid, count, members }));
}

/**
 * Detect color harmony pattern in a palette using LCH color space.
 * Based on Matsuda (1995) and Cohen-Or et al. (2006) harmonic templates.
 * Phase 3: upgraded to use LCH hue angles (perceptually uniform) instead of HSL.
 */
export type HarmonyType = "monochromatic" | "analogous" | "complementary" | "triadic" | "split-complementary" | "tetradic" | "none";

export interface HarmonyResult {
  type: HarmonyType;
  score: number; // 0-100, higher = better harmony
  hueAngles: number[];
}

export function detectColorHarmony(colors: RGB[]): HarmonyResult {
  if (colors.length < 2) {
    return { type: "monochromatic", score: 100, hueAngles: [] };
  }

  // Convert to LCH, filter out near-achromatic (chroma < 10)
  const lchs = colors.map(rgbToLch);
  const chromatic = lchs.filter((lch) => lch.c > 10);
  const hues = chromatic.map((lch) => lch.h);

  if (hues.length < 2) {
    return { type: "monochromatic", score: 95, hueAngles: hues };
  }

  // Normalize hues relative to the first
  const baseHue = hues[0];
  const relativeHues = hues.map((h) => ((h - baseHue + 360) % 360));

  // Test each harmony template
  const templates: Array<{ type: HarmonyType; angles: number[]; tolerance: number }> = [
    { type: "analogous", angles: [0, 30, 60], tolerance: 30 },
    { type: "complementary", angles: [0, 180], tolerance: 30 },
    { type: "triadic", angles: [0, 120, 240], tolerance: 30 },
    { type: "split-complementary", angles: [0, 150, 210], tolerance: 30 },
    { type: "tetradic", angles: [0, 90, 180, 270], tolerance: 30 },
  ];

  let bestType: HarmonyType = "none";
  let bestScore = 0;

  for (const template of templates) {
    const score = scoreHarmonyFit(relativeHues, template.angles, template.tolerance);
    if (score > bestScore) {
      bestScore = score;
      bestType = template.type;
    }
  }

  // Check monochromatic (all hues within 15 degrees)
  const hueRange = Math.max(...relativeHues) - Math.min(...relativeHues);
  if (hueRange < 15 || (360 - hueRange) < 15) {
    const monoScore = 90 - Math.min(hueRange, 360 - hueRange);
    if (monoScore > bestScore) {
      bestScore = monoScore;
      bestType = "monochromatic";
    }
  }

  return { type: bestType, score: Math.round(Math.min(100, bestScore)), hueAngles: hues };
}

function scoreHarmonyFit(hues: number[], templateAngles: number[], tolerance: number): number {
  let totalError = 0;
  let matched = 0;

  for (const hue of hues) {
    let minDist = Infinity;
    for (const angle of templateAngles) {
      const dist = Math.min(
        Math.abs(hue - angle),
        360 - Math.abs(hue - angle),
      );
      if (dist < minDist) minDist = dist;
    }
    if (minDist <= tolerance) {
      matched++;
      totalError += minDist;
    }
  }

  if (matched === 0) return 0;

  const matchRate = matched / hues.length;
  const avgError = totalError / matched;
  return matchRate * (100 - avgError * (100 / tolerance));
}
