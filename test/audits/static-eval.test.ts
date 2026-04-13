/**
 * Integration tests: static-mode evaluation on the sample fixture site.
 * Verifies that scores are within expected ranges and guards produce sensible results.
 */

import { describe, it, expect } from "vitest";
import { evaluate } from "../../src/index.js";
import path from "node:path";

const FIXTURE_DIR = path.join(import.meta.dirname, "..", "fixtures", "sample-site");

describe("Static evaluation on sample-site fixture", () => {
  let result: Awaited<ReturnType<typeof evaluate>>;

  it("should evaluate without errors", async () => {
    result = await evaluate(FIXTURE_DIR, { mode: "static" });
    expect(result).toBeDefined();
    expect(result.score).toBeGreaterThan(0);
    expect(result.grade).toBeDefined();
  });

  it("should produce an overall score >= 85 (well-designed fixture)", () => {
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("should return grade A or B", () => {
    expect(["A", "B"]).toContain(result.grade);
  });

  it("should have 10 categories", () => {
    expect(result.categories).toHaveLength(10);
  });

  it("should have all categories with scores 0-100", () => {
    for (const cat of result.categories) {
      expect(cat.score).toBeGreaterThanOrEqual(0);
      expect(cat.score).toBeLessThanOrEqual(100);
      expect(cat.weight).toBeGreaterThan(0);
      expect(cat.guardResults.length).toBeGreaterThan(0);
    }
  });

  it("should detect skip-link present", () => {
    const a11y = result.categories.find((c) => c.id === "accessibility");
    expect(a11y).toBeDefined();
    const skipLink = a11y!.guardResults.find((g) => g.guardId === "skip-link");
    expect(skipLink?.passed).toBe(true);
  });

  it("should detect lang attribute", () => {
    const a11y = result.categories.find((c) => c.id === "accessibility");
    const lang = a11y!.guardResults.find((g) => g.guardId === "html-lang");
    expect(lang?.passed).toBe(true);
  });

  it("should detect focus-visible styles", () => {
    const a11y = result.categories.find((c) => c.id === "accessibility");
    const focus = a11y!.guardResults.find((g) => g.guardId === "focus-visible-styles");
    expect(focus?.passed).toBe(true);
  });

  it("should detect overflow-wrap", () => {
    const tw = result.categories.find((c) => c.id === "text-wrapping");
    const ow = tw!.guardResults.find((g) => g.guardId === "overflow-wrap");
    expect(ow?.passed).toBe(true);
  });

  it("should detect image alt text present", () => {
    const img = result.categories.find((c) => c.id === "imagery");
    const alt = img!.guardResults.find((g) => g.guardId === "image-alt-text");
    expect(alt?.passed).toBe(true);
  });

  it("should detect spacing grid adherence", () => {
    const sp = result.categories.find((c) => c.id === "spacing");
    const grid = sp!.guardResults.find((g) => g.guardId === "spacing-grid-adherence");
    expect(grid?.passed).toBe(true);
  });

  it("should skip browser-only guards in static mode", () => {
    const browserGuards = result.categories.flatMap((c) =>
      c.guardResults.filter((g) => g.skipped && g.detail?.includes("requires browser")),
    );
    expect(browserGuards.length).toBeGreaterThan(0);
  });

  it("should detect design tokens in spacing", () => {
    const sp = result.categories.find((c) => c.id === "spacing");
    const tokens = sp!.guardResults.find((g) => g.guardId === "spacing-design-tokens");
    expect(tokens).toBeDefined();
    expect(tokens!.penalty).toBeLessThanOrEqual(5);
  });

  it("should check browser compat data without errors", () => {
    const cb = result.categories.find((c) => c.id === "cross-browser");
    const compat = cb!.guardResults.find((g) => g.guardId === "browser-compat-data");
    expect(compat).toBeDefined();
    expect(compat!.detail).toContain("properties");
  });
});
