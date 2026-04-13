# aesthetic-eval

Best-in-class website aesthetic quality evaluation. Scores any site across 10 UI/UX dimensions with research-backed thresholds.

No other open-source tool produces a unified design quality score. Lighthouse does performance, axe-core does accessibility, Wallace does CSS complexity. **aesthetic-eval answers: "how well-designed is this website?"**

## Features

- **10 scoring categories**: color contrast, typography, spacing, layout, imagery, accessibility, performance, animation, cross-browser compatibility, text wrapping
- **Guard-based scoring**: each check has a capped penalty, citation, and configurable threshold — no runaway deductions
- **Dual mode**: browser (Playwright + axe-core) for real computed styles, static (cheerio + css-tree) for fast CI
- **SARIF output**: integrates with GitHub Code Scanning for PR-level design feedback
- **Baseline diffing**: save snapshots, compare between commits to catch design regressions
- **Research-backed**: every threshold cites WCAG, Material Design, Bringhurst, or peer-reviewed research

## Quick Start

```bash
# Install globally
npm install -g aesthetic-eval

# Evaluate a live site (browser mode, requires Playwright)
aesthetic-eval https://example.com

# Evaluate a local build directory (static mode, no browser needed)
aesthetic-eval ./dist --mode static

# Output SARIF for CI
aesthetic-eval ./out --format sarif --output report.sarif --threshold 80
```

## Installation

```bash
npm install aesthetic-eval
```

For browser mode, install Playwright browsers:

```bash
npx playwright install chromium
```

## CLI Usage

```
aesthetic-eval [target] [options]

Arguments:
  target                     URL or local directory (default: ./out)

Options:
  -m, --mode <mode>          static or browser (default: browser)
  -f, --format <format>      table, json, or sarif (default: table)
  -c, --config <path>        path to aesthetic-eval.config.json
  -t, --threshold <number>   exit code 1 if score below this (default: 0)
  -o, --output <path>        write report to file
  --save-baseline <path>     save evaluation as baseline snapshot
  --compare-baseline <path>  compare against a saved baseline
  --compare <urls...>        compare multiple sites side-by-side
  -V, --version              output version number
  -h, --help                 display help
```

### Examples

```bash
# Compare two sites
aesthetic-eval https://site-a.com --compare https://site-b.com

# Save baseline before a redesign
aesthetic-eval https://mysite.com --save-baseline baseline.json

# Compare after changes
aesthetic-eval https://mysite.com --compare-baseline baseline.json

# CI gating: fail if score < 80
aesthetic-eval ./build --mode static --threshold 80
```

## Programmatic API

```typescript
import { evaluate } from "aesthetic-eval";

const result = await evaluate("https://example.com", { mode: "browser" });

console.log(result.score);  // 0-100
console.log(result.grade);  // A+, A, B, C, D, F
console.log(result.categories); // per-category scores and guard details
```

### Types

```typescript
interface OverallResult {
  score: number;
  grade: string;
  generatedAt: string;
  categories: CategoryResult[];
}

interface CategoryResult {
  id: string;
  name: string;
  score: number;
  weight: number;
  guards: GuardResult[];
}
```

## Scoring Categories

| Category | Weight | What it measures |
|----------|--------|------------------|
| Color & Contrast | 15% | WCAG contrast ratios (AA/AAA), palette size, color harmony (LCH) |
| Typography | 12% | Type scale consistency, font count, line height, line length, font-display |
| Spacing | 10% | Grid alignment, spacing consistency, design token coverage |
| Layout | 12% | Viewport meta, z-index layering, responsive patterns |
| Imagery | 8% | Alt text, modern formats (WebP/AVIF), srcset/sizes, aspect ratios |
| Accessibility | 10% | axe-core violations (browser), ARIA, semantic HTML, skip links |
| Performance | 5% | CSS size, unused rules, Core Web Vitals (LCP, CLS, TBT in browser) |
| Animation | 5% | prefers-reduced-motion, duration ranges, will-change usage |
| Cross-Browser | 13% | Real CSS property support via @mdn/browser-compat-data + browserslist |
| Text Wrapping | 10% | Overflow handling, nowrap abuse, `<br>` tag overuse, reflow at 320px |

## Configuration

Create `aesthetic-eval.config.json` to customize weights and thresholds:

```json
{
  "mode": "browser",
  "weights": {
    "color-contrast": 0.15,
    "typography": 0.12,
    "accessibility": 0.10
  },
  "thresholds": {
    "contrastRatioNormal": 4.5,
    "contrastRatioLarge": 3.0,
    "minBodyFontSize": 12,
    "minBodyLineHeight": 1.3,
    "maxFontFamilies": 4,
    "minTouchTarget": 44
  },
  "wcagLevel": "AA",
  "targetBrowsers": "> 0.5%, last 2 versions, not dead"
}
```

### All Thresholds (with Citations)

| Threshold | Default | Citation |
|-----------|---------|----------|
| `contrastRatioNormal` | 4.5 | WCAG 2.2 SC 1.4.3 (AA) |
| `contrastRatioLarge` | 3.0 | WCAG 2.2 SC 1.4.3 (AA, large text) |
| `minHarmonyScore` | 60 | Cohen-Or et al. (2006); Matsuda (1995) |
| `minBodyFontSize` | 12 | WCAG 1.4.4; Material Design 3 |
| `minBodyLineHeight` | 1.3 | WCAG 1.4.12; Bringhurst |
| `lineLengthRange` | [45, 75] | Bringhurst p.26; WCAG 1.4.8 |
| `maxFontFamilies` | 4 | Material Design 3; Google Fonts |
| `minTypeScaleConsistency` | 60 | Tim Brown, "More Meaningful Typography" (2012) |
| `spacingGridBase` | 4 | Material Design 3 (4dp grid); Nathan Curtis (2015) |
| `animationDurationRange` | [150, 500] | Material Design Motion; Nielsen (1993) |
| `minTouchTarget` | 44 | WCAG 2.5.8; Apple HIG; Material Design 3 |
| `lcpThresholds` | [2.5, 4.0] | Web Vitals (Google, 2020) |
| `clsThresholds` | [0.1, 0.25] | Web Vitals (Google, 2020) |
| `tbtThresholds` | [200, 600] | Web Vitals (Google, 2020) |

## GitHub Actions

Copy `.github/workflows/aesthetic-eval.yml` to your repo:

```yaml
name: Aesthetic Quality Check

on:
  pull_request:
    branches: [main]

permissions:
  security-events: write

jobs:
  aesthetic-eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      # Build your site first
      # - run: npm ci && npm run build

      - run: npm install -g aesthetic-eval
      - run: aesthetic-eval ./out --mode static --format sarif --output report.sarif --threshold 80

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: report.sarif
```

SARIF results appear under **Security > Code scanning alerts** in your GitHub repo.

## Browser vs Static Mode

| Capability | Static | Browser |
|------------|--------|---------|
| HTML/CSS parsing | cheerio + css-tree | Playwright (real rendering) |
| Contrast checking | CSS declaration pairs | Computed styles per element |
| Accessibility | Heuristic (ARIA/semantic) | axe-core injection (full audit) |
| Core Web Vitals | Not available | LCP, CLS, TBT via PerformanceObserver |
| Text overflow | CSS heuristic | `scrollWidth > clientWidth` |
| Layout reflow | Not available | 320px viewport test (WCAG 1.4.10) |
| Speed | Fast (~1s) | Slower (~5-15s) |
| Dependencies | None extra | Playwright + Chromium |

Static mode is ideal for CI pipelines where speed matters. Browser mode gives the most accurate results.

## Grading Scale

| Grade | Score |
|-------|-------|
| A+ | 95-100 |
| A | 90-94 |
| B | 80-89 |
| C | 70-79 |
| D | 60-69 |
| F | 0-59 |

## Architecture

```
src/
├── index.ts              # Programmatic API entry point
├── cli.ts                # CLI (commander)
├── config/               # Config schema, defaults (with citations), loader
├── parser/               # Static (cheerio) and browser (Playwright) parsers
├── audits/               # 10 audit modules, each with guards
├── scoring/              # Guard engine + weighted aggregator
├── output/               # Table, JSON, SARIF, baseline formatters
└── utils/                # Color (LAB/LCH), math, CSS, browser compat
```

Each audit module exports guards with:
- `id` — unique identifier
- `name` — human-readable name
- `citation` — research source for the threshold
- `maxPenalty` — cap on score deduction
- `requiresBrowser` — whether it needs Playwright
- `evaluate(ctx)` — returns pass/fail with penalty and message

## Dependencies

**Runtime**: cheerio, css-tree, commander, axe-core, @mdn/browser-compat-data, browserslist, color-convert

**Browser mode** (optional peer dep): playwright

## License

MIT
