/**
 * Unit tests for utility modules.
 */

import { describe, it, expect } from "vitest";
import { parseColor, contrastRatio, luminance, rgbToLab, rgbToLch, clusterColors, detectColorHarmony } from "../../src/utils/color.js";
import { detectTypeScale, mode, outliersByMode, mean, stddev } from "../../src/utils/math.js";

describe("Color utilities", () => {
  describe("parseColor", () => {
    it("should parse hex colors", () => {
      expect(parseColor("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
      expect(parseColor("#0f0")).toEqual({ r: 0, g: 255, b: 0 });
    });

    it("should parse rgb() colors", () => {
      expect(parseColor("rgb(0, 128, 255)")).toEqual({ r: 0, g: 128, b: 255 });
    });

    it("should parse named colors", () => {
      expect(parseColor("red")).toEqual({ r: 255, g: 0, b: 0 });
      expect(parseColor("white")).toEqual({ r: 255, g: 255, b: 255 });
    });

    it("should return null for transparent/inherit", () => {
      expect(parseColor("transparent")).toBeNull();
      expect(parseColor("inherit")).toBeNull();
      expect(parseColor(null)).toBeNull();
    });
  });

  describe("luminance", () => {
    it("should return ~1.0 for white", () => {
      expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1.0, 1);
    });
    it("should return ~0.0 for black", () => {
      expect(luminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0.0, 1);
    });
  });

  describe("contrastRatio", () => {
    it("should return 21:1 for black on white", () => {
      const ratio = contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
      expect(ratio).toBeCloseTo(21, 0);
    });
    it("should return 1:1 for same colors", () => {
      const ratio = contrastRatio({ r: 128, g: 128, b: 128 }, { r: 128, g: 128, b: 128 });
      expect(ratio).toBeCloseTo(1, 0);
    });
  });

  describe("rgbToLab", () => {
    it("should convert white to L=100", () => {
      const lab = rgbToLab({ r: 255, g: 255, b: 255 });
      expect(lab.l).toBeCloseTo(100, 0);
    });
    it("should convert black to L=0", () => {
      const lab = rgbToLab({ r: 0, g: 0, b: 0 });
      expect(lab.l).toBeCloseTo(0, 0);
    });
  });

  describe("rgbToLch", () => {
    it("should give high chroma for saturated red", () => {
      const lch = rgbToLch({ r: 255, g: 0, b: 0 });
      expect(lch.c).toBeGreaterThan(50);
    });
    it("should give ~0 chroma for gray", () => {
      const lch = rgbToLch({ r: 128, g: 128, b: 128 });
      expect(lch.c).toBeLessThan(2);
    });
  });

  describe("clusterColors (LAB space)", () => {
    it("should cluster similar colors together", () => {
      const colors = [
        { r: 255, g: 0, b: 0 },
        { r: 250, g: 5, b: 5 },
        { r: 0, g: 0, b: 255 },
        { r: 5, g: 5, b: 250 },
      ];
      const clusters = clusterColors(colors, 20);
      expect(clusters.length).toBeLessThanOrEqual(3);
    });
  });

  describe("detectColorHarmony (LCH-based)", () => {
    it("should detect complementary colors", () => {
      const result = detectColorHarmony([
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 255, b: 255 },
      ]);
      expect(result.score).toBeGreaterThan(0);
    });
    it("should return monochromatic for single color", () => {
      const result = detectColorHarmony([{ r: 100, g: 100, b: 100 }]);
      expect(result.type).toBe("monochromatic");
    });
  });
});

describe("Math utilities", () => {
  describe("detectTypeScale", () => {
    it("should detect Major Third scale (1.250)", () => {
      // 16, 20, 25, 31.25
      const result = detectTypeScale([16, 20, 25, 31.25]);
      expect(result.ratio).toBeCloseTo(1.25, 1);
      expect(result.consistency).toBeGreaterThan(50);
    });

    it("should return 0 consistency for insufficient data", () => {
      const result = detectTypeScale([16]);
      expect(result.consistency).toBe(0);
    });
  });

  describe("mode", () => {
    it("should return the most frequent value", () => {
      expect(mode([1, 2, 2, 3, 3, 3])).toBe(3);
    });
    it("should return 0 for empty array", () => {
      expect(mode([])).toBe(0);
    });
  });

  describe("outliersByMode", () => {
    it("should detect outliers far from mode", () => {
      const values = [8, 8, 8, 8, 16, 16, 100];
      const outlierIndices = outliersByMode(values, 3);
      // outliersByMode returns indices, not values
      expect(outlierIndices).toContain(6); // index of 100
      expect(values[outlierIndices[outlierIndices.length - 1]]).toBe(100);
    });
  });

  describe("mean and stddev", () => {
    it("should compute mean correctly", () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
    });
    it("should compute stddev correctly", () => {
      expect(stddev([1, 2, 3, 4, 5])).toBeCloseTo(1.414, 2);
    });
  });
});
