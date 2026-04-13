/**
 * Cross-browser compatibility checker powered by @mdn/browser-compat-data + browserslist.
 * Replaces heuristic vendor prefix checking with real browser support data.
 *
 * Citation: MDN Browser Compatibility Data (https://github.com/mdn/browser-compat-data)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import browserslist from "browserslist";

// Load BCD data via fs.readFileSync to avoid ESM JSON import issues
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let bcdData: any = null;

function loadBcd(): any {
  if (bcdData) return bcdData;
  const bcdPath = path.join(__dirname, "../../node_modules/@mdn/browser-compat-data/data.json");
  bcdData = JSON.parse(fs.readFileSync(bcdPath, "utf-8"));
  return bcdData;
}

/** Map browserslist browser names to BCD browser names */
const BROWSERSLIST_TO_BCD: Record<string, string> = {
  chrome: "chrome",
  firefox: "firefox",
  safari: "safari",
  edge: "edge",
  opera: "opera",
  ios_saf: "safari_ios",
  and_chr: "chrome_android",
  and_ff: "firefox_android",
  samsung: "samsunginternet_android",
  ie: "ie",
  op_mob: "opera_android",
  android: "webview_android",
};

export interface CompatIssue {
  property: string;
  browser: string;
  requiredVersion: string;
  supportedSince: string | null;
  severity: "unsupported" | "partial" | "prefixed";
}

export interface CompatResult {
  issues: CompatIssue[];
  checkedProperties: number;
  unsupportedCount: number;
  partialCount: number;
  prefixedCount: number;
}

/**
 * Parse a browserslist query into a map of { bcdBrowserName -> minVersion }.
 */
function parseBrowserTargets(query: string): Map<string, number> {
  const targets = new Map<string, number>();
  const browsers = browserslist(query);

  for (const entry of browsers) {
    // entry format: "chrome 120" or "ios_saf 17.0-17.1"
    const [name, versionStr] = entry.split(" ");
    const bcdName = BROWSERSLIST_TO_BCD[name];
    if (!bcdName) continue;

    // Extract the minimum version number
    const version = parseFloat(versionStr.split("-")[0]);
    if (isNaN(version)) continue;

    // Keep the minimum version for each browser
    const existing = targets.get(bcdName);
    if (existing === undefined || version < existing) {
      targets.set(bcdName, version);
    }
  }

  return targets;
}

/**
 * Check if a CSS property is supported across target browsers.
 */
function checkPropertySupport(
  property: string,
  targets: Map<string, number>,
): CompatIssue[] {
  const bcd = loadBcd();
  const propData = bcd.css?.properties?.[property];
  if (!propData?.__compat?.support) return [];

  const support = propData.__compat.support;
  const issues: CompatIssue[] = [];

  for (const [browser, minVersion] of targets) {
    const browserSupport = support[browser];
    if (!browserSupport) continue;

    // BCD support can be an array (multiple support statements) or a single object
    const entries = Array.isArray(browserSupport) ? browserSupport : [browserSupport];
    const mainEntry = entries[0];

    if (!mainEntry) continue;

    const versionAdded = mainEntry.version_added;

    if (versionAdded === false) {
      issues.push({
        property,
        browser,
        requiredVersion: String(minVersion),
        supportedSince: null,
        severity: "unsupported",
      });
    } else if (typeof versionAdded === "string") {
      const supportedSince = parseFloat(versionAdded);
      if (!isNaN(supportedSince) && supportedSince > minVersion) {
        issues.push({
          property,
          browser,
          requiredVersion: String(minVersion),
          supportedSince: versionAdded,
          severity: mainEntry.prefix ? "prefixed" : "partial",
        });
      }
    }

    // Check if there's a prefixed-only entry
    if (mainEntry.prefix && !entries.some((e: any) => !e.prefix && e.version_added)) {
      const existing = issues.find((i) => i.property === property && i.browser === browser);
      if (!existing) {
        issues.push({
          property,
          browser,
          requiredVersion: String(minVersion),
          supportedSince: versionAdded === false ? null : String(versionAdded),
          severity: "prefixed",
        });
      }
    }
  }

  return issues;
}

/**
 * Check a set of CSS properties against browser targets.
 * Returns compatibility issues found.
 */
export function checkBrowserCompat(
  cssProperties: Set<string>,
  targetQuery: string,
): CompatResult {
  const targets = parseBrowserTargets(targetQuery);
  const allIssues: CompatIssue[] = [];
  let checked = 0;

  for (const prop of cssProperties) {
    // Normalize property name (remove vendor prefix for lookup)
    const normalized = prop.replace(/^-(?:webkit|moz|ms|o)-/, "");
    const issues = checkPropertySupport(normalized, targets);
    if (issues.length > 0) {
      allIssues.push(...issues);
    }
    checked++;
  }

  return {
    issues: allIssues,
    checkedProperties: checked,
    unsupportedCount: allIssues.filter((i) => i.severity === "unsupported").length,
    partialCount: allIssues.filter((i) => i.severity === "partial").length,
    prefixedCount: allIssues.filter((i) => i.severity === "prefixed").length,
  };
}

/**
 * Extract CSS property names from raw CSS text.
 * Returns a set of property names used in the stylesheet.
 */
export function extractCssProperties(rawCssText: string): Set<string> {
  const properties = new Set<string>();
  // Match property declarations: property-name: value
  const regex = /(?:^|[{;])\s*([a-z-]+)\s*:/gm;
  let match;
  while ((match = regex.exec(rawCssText)) !== null) {
    const prop = match[1];
    if (prop && !prop.startsWith("--")) { // Skip CSS custom properties
      properties.add(prop);
    }
  }
  return properties;
}
