/**
 * Math/statistics utilities for scoring.
 */

/** Clamp a value between lo and hi. */
export function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Arithmetic mean. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Standard deviation (population). */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

/**
 * Statistical mode (most frequent value).
 * For continuous data, rounds to nearest integer first.
 * Wallace/css-analyzer pattern: mode is more robust than mean
 * for right-skewed distributions like spacing values.
 */
export function mode(values: number[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const v of values) {
    const rounded = Math.round(v);
    counts.set(rounded, (counts.get(rounded) || 0) + 1);
  }
  let maxCount = 0;
  let modeValue = 0;
  for (const [val, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      modeValue = val;
    }
  }
  return modeValue;
}

/**
 * Detect outliers using standard deviation from mean.
 * Returns indices of outlier values.
 */
export function outliersByStddev(values: number[], threshold = 3): number[] {
  if (values.length < 3) return [];
  const m = mean(values);
  const s = stddev(values);
  if (s === 0) return [];
  return values
    .map((v, i) => Math.abs(v - m) > threshold * s ? i : -1)
    .filter((i) => i >= 0);
}

/**
 * Detect outliers using mode-based analysis.
 * Values that deviate from the mode by more than factor * mode are outliers.
 * This is the Wallace/css-analyzer technique — more robust for spacing distributions.
 */
export function outliersByMode(values: number[], factor = 3): number[] {
  if (values.length < 3) return [];
  const m = mode(values);
  if (m === 0) return outliersByStddev(values);
  return values
    .map((v, i) => Math.abs(v - m) > factor * m ? i : -1)
    .filter((i) => i >= 0);
}

/**
 * Detect if a set of font sizes follows a known typographic scale.
 * Citation: Tim Brown, "More Meaningful Typography" (A List Apart, 2012).
 *
 * Returns the best-matching scale name and a consistency score (0-100).
 */
export interface TypeScaleResult {
  scaleName: string;
  ratio: number;
  consistency: number; // 0-100, how well the sizes match
  detectedRatios: number[];
}

export const KNOWN_TYPE_SCALES: Record<string, number> = {
  "Minor Second": 1.067,
  "Major Second": 1.125,
  "Minor Third": 1.200,
  "Major Third": 1.250,
  "Perfect Fourth": 1.333,
  "Augmented Fourth": 1.414,
  "Perfect Fifth": 1.500,
  "Golden Ratio": 1.618,
};

export function detectTypeScale(fontSizes: number[]): TypeScaleResult {
  // De-duplicate and sort descending
  const unique = [...new Set(fontSizes.map((s) => Math.round(s * 10) / 10))]
    .filter((s) => s > 0)
    .sort((a, b) => b - a);

  if (unique.length < 3) {
    return { scaleName: "insufficient data", ratio: 0, consistency: 0, detectedRatios: [] };
  }

  // Compute ratios between consecutive sizes
  const ratios: number[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const ratio = unique[i] / unique[i + 1];
    if (ratio > 1 && ratio < 3) {
      ratios.push(Math.round(ratio * 1000) / 1000);
    }
  }

  if (ratios.length === 0) {
    return { scaleName: "no pattern", ratio: 0, consistency: 0, detectedRatios: [] };
  }

  // Find the best matching known scale
  let bestScale = "custom";
  let bestRatio = mean(ratios);
  let bestScore = 0;

  for (const [name, targetRatio] of Object.entries(KNOWN_TYPE_SCALES)) {
    // Score = how closely each detected ratio matches the target
    const errors = ratios.map((r) => Math.abs(r - targetRatio) / targetRatio);
    const avgError = mean(errors);
    const score = Math.max(0, 100 - avgError * 500); // 20% avg error = 0 score

    if (score > bestScore) {
      bestScore = score;
      bestScale = name;
      bestRatio = targetRatio;
    }
  }

  return {
    scaleName: bestScale,
    ratio: bestRatio,
    consistency: Math.round(bestScore),
    detectedRatios: ratios,
  };
}

/**
 * Compute the uniqueness ratio of values.
 * Wallace/css-analyzer technique: unique/total < 0.66 = too much redundancy.
 */
export function uniquenessRatio(values: unknown[]): number {
  if (values.length === 0) return 1;
  const unique = new Set(values.map(String));
  return unique.size / values.length;
}
