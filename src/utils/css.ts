/**
 * CSS value extraction utilities.
 */

/** Parse a CSS length value to px, or null. Assumes 16px root font size. */
export function parsePxValue(val: string | null | undefined): number | null {
  if (!val) return null;
  val = String(val).trim();

  const px = val.match(/^([\d.]+)\s*px$/i);
  if (px) return parseFloat(px[1]);

  const rem = val.match(/^([\d.]+)\s*rem$/i);
  if (rem) return parseFloat(rem[1]) * 16;

  const em = val.match(/^([\d.]+)\s*em$/i);
  if (em) return parseFloat(em[1]) * 16;

  // Plain number (e.g., unitless line-height)
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

/** Extract all color strings from a CSS value. */
export function extractColorStrings(cssValue: string): string[] {
  const pattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g;
  return (cssValue.match(pattern) || []).map((c) => c.toLowerCase());
}

/** Regex for spacing-related CSS properties. */
export const SPACING_PROPERTIES = /^(margin|padding|margin-top|margin-bottom|margin-left|margin-right|padding-top|padding-bottom|padding-left|padding-right|gap|row-gap|column-gap)$/;

/** Extract px values from a spacing CSS value string. */
export function extractSpacingValues(cssValue: string): number[] {
  const values: number[] = [];

  const pxMatches = cssValue.match(/[\d.]+px/g);
  if (pxMatches) pxMatches.forEach((n) => values.push(parseFloat(n)));

  const remMatches = cssValue.match(/[\d.]+rem/g);
  if (remMatches) remMatches.forEach((n) => values.push(parseFloat(n) * 16));

  return values;
}

/** Set of CSS generic font families. */
export const GENERIC_FONT_FAMILIES = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy",
  "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace",
  "ui-rounded", "emoji", "math", "fangsong",
]);

/**
 * Extract the primary (first non-generic, non-variable) font family
 * from a font-family declaration value.
 */
export function extractPrimaryFontFamily(fontFamilyValue: string): string | null {
  const families = fontFamilyValue.split(",").map((f) => f.replace(/['"]/g, "").trim());
  for (const fam of families) {
    if (!fam) continue;
    if (/^var\(/.test(fam)) continue;
    if (GENERIC_FONT_FAMILIES.has(fam.toLowerCase())) continue;
    return fam;
  }
  return null;
}
