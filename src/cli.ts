#!/usr/bin/env node

/**
 * aesthetic-eval CLI
 *
 * Unified command-line interface for website aesthetic quality evaluation.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { evaluate } from "./index.js";
import { formatTable } from "./output/table.js";
import { formatJson } from "./output/json.js";
import { formatSarif } from "./output/sarif.js";
import { saveBaseline, loadBaseline, compareBaseline, formatDiff } from "./output/baseline.js";
import type { EvalMode, OutputFormat } from "./config/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"));

const program = new Command();

program
  .name("aesthetic-eval")
  .description("Website aesthetic quality evaluation tool — scores any site across 10 UI/UX dimensions")
  .version(pkg.version)
  .argument("[target]", "URL (https://...) or local directory path (defaults to ./out)")
  .option("-m, --mode <mode>", "evaluation mode: static or browser", "browser")
  .option("-f, --format <format>", "output format: table, json, sarif", "table")
  .option("-c, --config <path>", "path to aesthetic-eval.config.json")
  .option("-t, --threshold <number>", "exit with code 1 if overall score below this", "0")
  .option("-o, --output <path>", "write report to file (JSON or SARIF)")
  .option("--save-baseline <path>", "save evaluation as a baseline snapshot")
  .option("--compare-baseline <path>", "compare against a saved baseline")
  .option("--compare <urls...>", "compare multiple URLs side-by-side")
  .action(async (target: string | undefined, opts: Record<string, string | string[] | undefined>) => {
    try {
      const mode = (opts.mode || "browser") as EvalMode;
      const format = (opts.format || "table") as OutputFormat;
      const threshold = parseInt(opts.threshold as string || "0", 10);
      const configPath = opts.config as string | undefined;
      const outputPath = opts.output as string | undefined;
      const baselineSavePath = opts.saveBaseline as string | undefined;
      const baselineComparePath = opts.compareBaseline as string | undefined;
      const compareUrls = opts.compare as string[] | undefined;

      console.log("=== Aesthetic Quality Evaluation Tool v2 ===\n");

      // Multi-site comparison mode
      if (compareUrls && compareUrls.length > 0) {
        const urls = target ? [target, ...compareUrls] : compareUrls;
        console.log(`Comparing ${urls.length} sites...\n`);

        const results = [];
        for (const url of urls) {
          console.log(`Evaluating: ${url}...`);
          const result = await evaluate(url, { mode, configPath });
          results.push({ url, result });
        }

        console.log("\n=== Comparison Results ===\n");
        console.log("URL".padEnd(50) + "Score  Grade");
        console.log("-".repeat(65));
        for (const { url, result } of results) {
          console.log(`${url.padEnd(50)} ${String(result.score).padStart(3)}    ${result.grade}`);
        }
        console.log("-".repeat(65));

        // Per-category breakdown
        console.log("\nPer-Category Breakdown:");
        const categories = results[0].result.categories;
        for (const cat of categories) {
          const scores = results.map((r) => {
            const c = r.result.categories.find((c2) => c2.id === cat.id);
            return c?.score ?? 0;
          });
          console.log(`  ${cat.name.padEnd(35)} ${scores.map((s) => String(s).padStart(5)).join("  ")}`);
        }
        console.log("\nDone.");
        return;
      }

      const evalTarget = target || "./out";
      console.log(`Target: ${evalTarget}`);
      console.log(`Mode: ${mode}\n`);

      const result = await evaluate(evalTarget, { mode, configPath });

      // Save baseline
      if (baselineSavePath) {
        saveBaseline(result, evalTarget, baselineSavePath);
        console.log(`Baseline saved to: ${baselineSavePath}\n`);
      }

      // Compare baseline
      if (baselineComparePath && fs.existsSync(baselineComparePath)) {
        const baseline = loadBaseline(baselineComparePath);
        const diff = compareBaseline(baseline, result);
        console.log(formatDiff(diff));
        console.log();
      }

      // Output formats
      if (format === "json" || (outputPath && !outputPath.endsWith(".sarif"))) {
        const jsonReport = formatJson(result);
        const reportPath = outputPath || path.join(process.cwd(), "report.json");
        fs.writeFileSync(reportPath, JSON.stringify(jsonReport, null, 2));
        console.log(`Report saved to: ${reportPath}\n`);
        if (format === "json") {
          console.log(JSON.stringify(jsonReport, null, 2));
        }
      }

      if (format === "sarif" || (outputPath && outputPath.endsWith(".sarif"))) {
        const sarifReport = formatSarif(result, evalTarget, pkg.version);
        const reportPath = outputPath || path.join(process.cwd(), "report.sarif");
        fs.writeFileSync(reportPath, JSON.stringify(sarifReport, null, 2));
        console.log(`SARIF report saved to: ${reportPath}\n`);
        if (format === "sarif") {
          console.log(JSON.stringify(sarifReport, null, 2));
        }
      }

      if (format === "table") {
        formatTable(result, result.categories.length, 0);
      }

      console.log("Done.");

      // CI gating
      if (threshold > 0 && result.score < threshold) {
        console.error(`\nFAILED: Overall score ${result.score} is below threshold ${threshold}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`Fatal error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
