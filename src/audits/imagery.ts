/**
 * Audit: Imagery (weight: 0.08)
 * Phase 3: adds modern format detection, srcset validation, aspect ratio checks.
 */

import type { AuditModule, AuditContext, AuditResult, Guard, GuardResult } from "./types.js";
import { buildAuditResult } from "../scoring/guard.js";

const guards: Guard[] = [
  {
    id: "image-alt-text",
    name: "Image Alt Text",
    citation: "WCAG 1.1.1",
    maxPenalty: 30,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      let totalImages = 0;
      let missingAlt = 0;
      for (const p of ctx.pages) {
        totalImages += p.images.length;
        missingAlt += p.images.filter((i) => !i.hasAlt).length;
      }
      const penalty = Math.min(30, missingAlt * 10);
      return {
        guardId: "image-alt-text",
        passed: missingAlt === 0,
        value: missingAlt,
        penalty,
        detail: `${missingAlt}/${totalImages} images missing alt text`,
      };
    },
  },
  {
    id: "image-dimensions",
    name: "Image Dimensions",
    citation: "CLS prevention best practice",
    maxPenalty: 20,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      let missing = 0;
      for (const p of ctx.pages) {
        missing += p.images.filter((i) => !i.width || !i.height).length;
      }
      const penalty = Math.min(20, missing * 3);
      return {
        guardId: "image-dimensions",
        passed: missing === 0,
        value: missing,
        penalty,
        detail: `${missing} images missing width/height attributes`,
      };
    },
  },
  {
    id: "image-lazy-loading",
    name: "Lazy Loading",
    citation: "Performance best practice",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      let totalImages = 0;
      let lazyLoaded = 0;
      for (const p of ctx.pages) {
        totalImages += p.images.length;
        lazyLoaded += p.images.filter((i) => i.loading === "lazy").length;
      }
      if (totalImages <= 2) {
        return { guardId: "image-lazy-loading", passed: true, value: "few images", penalty: 0 };
      }
      const rate = lazyLoaded / totalImages;
      const penalty = rate < 0.5 ? 10 : 0;
      return {
        guardId: "image-lazy-loading",
        passed: rate >= 0.5,
        value: Math.round(rate * 100),
        penalty,
        detail: `${Math.round(rate * 100)}% of images use lazy loading`,
      };
    },
  },
  {
    id: "responsive-images",
    name: "Responsive Images",
    citation: "Performance best practice",
    maxPenalty: 5,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      const has = ctx.css.features.hasPictureElement || ctx.css.features.hasSrcset;
      return {
        guardId: "responsive-images",
        passed: has,
        value: has,
        penalty: has ? 0 : 5,
        detail: has ? "Uses <picture> or srcset" : "No responsive images found",
      };
    },
  },
  // Phase 3: Modern image formats
  {
    id: "modern-image-formats",
    name: "Modern Image Formats",
    citation: "Web.dev: Serve images in modern formats (WebP, AVIF)",
    maxPenalty: 10,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      let totalImages = 0;
      let modernFormats = 0;
      let legacyFormats = 0;

      for (const p of ctx.pages) {
        for (const img of p.images) {
          totalImages++;
          const src = (img.src || "").toLowerCase();
          if (src.endsWith(".webp") || src.endsWith(".avif")) {
            modernFormats++;
          } else if (src.endsWith(".jpg") || src.endsWith(".jpeg") || src.endsWith(".png") || src.endsWith(".gif") || src.endsWith(".bmp")) {
            legacyFormats++;
          }
        }

        // Also check <picture> <source> for modern formats
        const $ = p.$;
        $("picture source").each((_i, el) => {
          const type = $(el).attr("type") || "";
          if (type.includes("webp") || type.includes("avif")) {
            modernFormats++;
          }
        });
      }

      if (totalImages === 0) {
        return { guardId: "modern-image-formats", passed: true, value: "no images", penalty: 0 };
      }

      const hasModern = modernFormats > 0;
      const penalty = hasModern ? 0 : legacyFormats > 3 ? 10 : legacyFormats > 0 ? 5 : 0;

      return {
        guardId: "modern-image-formats",
        passed: hasModern || legacyFormats === 0,
        value: modernFormats,
        penalty,
        detail: `${modernFormats} modern format images (WebP/AVIF), ${legacyFormats} legacy format (JPEG/PNG/GIF)`,
      };
    },
  },
  // Phase 3: srcset + sizes validation
  {
    id: "srcset-sizes-validation",
    name: "srcset + sizes Attributes",
    citation: "Responsive Images Community Group; MDN",
    maxPenalty: 5,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      let imagesWithSrcset = 0;
      let imagesWithSizes = 0;
      let srcsetWithoutSizes = 0;

      for (const p of ctx.pages) {
        const $ = p.$;
        $("img").each((_i, el) => {
          const srcset = $(el).attr("srcset");
          const sizes = $(el).attr("sizes");
          if (srcset) {
            imagesWithSrcset++;
            if (sizes) imagesWithSizes++;
            else srcsetWithoutSizes++;
          }
        });
      }

      if (imagesWithSrcset === 0) {
        return { guardId: "srcset-sizes-validation", passed: true, value: "no srcset", penalty: 0, detail: "No images use srcset" };
      }

      const penalty = srcsetWithoutSizes > 0 ? Math.min(5, srcsetWithoutSizes * 2) : 0;
      return {
        guardId: "srcset-sizes-validation",
        passed: srcsetWithoutSizes === 0,
        value: srcsetWithoutSizes,
        penalty,
        detail: srcsetWithoutSizes > 0
          ? `${srcsetWithoutSizes} images have srcset but missing sizes attribute`
          : `${imagesWithSrcset} images properly use srcset + sizes`,
      };
    },
  },
  // Phase 3: Aspect ratio validation
  {
    id: "image-aspect-ratio",
    name: "Image Aspect Ratio",
    citation: "CLS best practice; CSS aspect-ratio property",
    maxPenalty: 5,
    requiresBrowser: false,
    evaluate(ctx: AuditContext): GuardResult {
      let totalWithDimensions = 0;
      let suspiciousRatios = 0;

      for (const p of ctx.pages) {
        for (const img of p.images) {
          const w = parseInt(img.width || "0", 10);
          const h = parseInt(img.height || "0", 10);
          if (w > 0 && h > 0) {
            totalWithDimensions++;
            const ratio = w / h;
            // Flag extremely unusual ratios (likely broken/placeholder)
            if (ratio > 10 || ratio < 0.1) {
              suspiciousRatios++;
            }
          }
        }
      }

      // Also check if aspect-ratio CSS property is used
      const hasAspectRatioCss = ctx.css.rawText.includes("aspect-ratio");

      const penalty = suspiciousRatios > 0 ? Math.min(5, suspiciousRatios * 2) : 0;
      return {
        guardId: "image-aspect-ratio",
        passed: suspiciousRatios === 0,
        value: suspiciousRatios,
        penalty,
        detail: suspiciousRatios > 0
          ? `${suspiciousRatios} images with suspicious aspect ratios (>10:1 or <1:10)`
          : `${totalWithDimensions} images with valid aspect ratios${hasAspectRatioCss ? " + uses CSS aspect-ratio" : ""}`,
      };
    },
  },
];

export const imageryAudit: AuditModule = {
  id: "imagery",
  name: "Imagery",
  defaultWeight: 0.08,
  guards,

  async run(ctx: AuditContext): Promise<AuditResult> {
    let totalMissing = 0;
    let totalImages = 0;
    let modernFormats = 0;
    for (const p of ctx.pages) {
      totalImages += p.images.length;
      totalMissing += p.images.filter((i) => !i.hasAlt).length;
      modernFormats += p.images.filter((i) => {
        const src = (i.src || "").toLowerCase();
        return src.endsWith(".webp") || src.endsWith(".avif");
      }).length;
    }

    const details = {
      totalImages,
      totalMissingAlt: totalMissing,
      modernFormatCount: modernFormats,
    };
    const recommendations = [
      totalMissing > 0 ? `${totalMissing} images missing alt text. Add descriptive alt attributes.` : "",
      modernFormats === 0 && totalImages > 0 ? "Consider using WebP or AVIF for better compression and performance." : "",
    ];
    return buildAuditResult(this, ctx, details, recommendations);
  },
};
