/**
 * Audit registry — collects all audit modules.
 */

import type { AuditModule } from "./types.js";
import { colorContrastAudit } from "./color-contrast.js";
import { typographyAudit } from "./typography.js";
import { spacingAudit } from "./spacing.js";
import { layoutAudit } from "./layout.js";
import { imageryAudit } from "./imagery.js";
import { accessibilityAudit } from "./accessibility.js";
import { performanceAudit } from "./performance.js";
import { animationAudit } from "./animation.js";
import { crossBrowserAudit } from "./cross-browser.js";
import { textWrappingAudit } from "./text-wrapping.js";

/** All registered audit modules in display order. */
export const ALL_AUDITS: AuditModule[] = [
  colorContrastAudit,
  typographyAudit,
  spacingAudit,
  layoutAudit,
  imageryAudit,
  accessibilityAudit,
  performanceAudit,
  animationAudit,
  crossBrowserAudit,
  textWrappingAudit,
];

/** Get audit by ID. */
export function getAudit(id: string): AuditModule | undefined {
  return ALL_AUDITS.find((a) => a.id === id);
}
