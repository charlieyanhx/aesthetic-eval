/**
 * Parser factory — returns the appropriate parser based on mode and availability.
 * Browser parser requires Playwright; falls back to static if unavailable.
 */

import type { Parser } from "./types.js";
import type { EvalMode } from "../config/schema.js";
import { StaticDirectoryParser, StaticUrlParser } from "./static-parser.js";
import type { BrowserParser } from "./browser-parser.js";

export interface ParserOptions {
  mode: EvalMode;
  maxExternalCss?: number;
  fetchTimeout?: number;
}

export interface CreateParserResult {
  parser: Parser;
  effectiveMode: EvalMode;
  /** Non-null when effectiveMode === "browser". Call close() when done. */
  browserParser?: BrowserParser;
}

/**
 * Detect if the target is a URL or a local directory path.
 */
export function isUrl(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

/**
 * Create a parser for the given mode and target type.
 * In browser mode, attempts to load Playwright; falls back to static if unavailable.
 */
export async function createParser(
  target: string,
  options: ParserOptions,
): Promise<CreateParserResult> {
  const targetIsUrl = isUrl(target);

  if (options.mode === "browser") {
    try {
      // Dynamic import so Playwright stays optional
      const { BrowserParser } = await import("./browser-parser.js");
      // Verify Playwright is actually installed by probing chromium
      await import("playwright");
      const bp = new BrowserParser(options.fetchTimeout);
      return {
        parser: bp,
        effectiveMode: "browser",
        browserParser: bp,
      };
    } catch {
      console.warn(
        "Warning: Playwright not available. Install with `npm i playwright` for browser mode.\n" +
        "Falling back to static analysis.\n",
      );
    }
  }

  // Static mode
  if (targetIsUrl) {
    return {
      parser: new StaticUrlParser(options.maxExternalCss, options.fetchTimeout),
      effectiveMode: "static",
    };
  }

  return {
    parser: new StaticDirectoryParser(),
    effectiveMode: "static",
  };
}
