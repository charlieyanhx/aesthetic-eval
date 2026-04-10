# Aesthetic Eval

A CLI tool that scores website aesthetic quality across **10 UI/UX dimensions**. Works with local static HTML builds or live URLs.

## Install

```bash
npm install
```

## Usage

### Evaluate a local build (static HTML directory)

```bash
node evaluate.mjs [path-to-directory]
```

Defaults to `./out` if no path given. Works with any directory containing HTML and CSS files — Next.js static exports, Hugo builds, plain HTML sites, etc.

```bash
# Analyze a Next.js static export
node evaluate.mjs ../my-site/out

# Analyze any HTML directory
node evaluate.mjs /var/www/html
```

### Evaluate live websites by URL

```bash
node evaluate-url.mjs <url> [name] [url2] [name2] ...
```

Fetches the page HTML + linked CSS and scores it. Pass multiple URLs for a comparison table.

```bash
# Single site
node evaluate-url.mjs https://www.apple.com Apple

# Compare multiple sites
node evaluate-url.mjs \
  https://www.goldmansachs.com "Goldman Sachs" \
  https://www.apple.com Apple \
  https://www.google.com Google
```

## Scoring Dimensions

Each category is scored 0-100. The overall score is a weighted average.

| # | Category | Weight | What it checks |
|---|----------|--------|----------------|
| 1 | Color & Contrast | 15% | Unique colors, WCAG AA contrast ratios, palette consistency |
| 2 | Typography | 12% | Font families, sizes, line-height, letter-spacing, responsive sizing |
| 3 | Spacing Consistency | 10% | 4px/8px grid adherence, spacing scale, outlier detection |
| 4 | Layout & Structure | 12% | Heading hierarchy, semantic HTML, max-width constraints, viewport |
| 5 | Imagery | 8% | Alt text, dimensions, lazy loading |
| 6 | Accessibility | 10% | Lang attr, ARIA landmarks, skip link, focus-visible, zoom |
| 7 | Performance Indicators | 5% | CSS rule count, unused classes, page size, preload hints |
| 8 | Animation & Interaction | 5% | Transitions, hover states, prefers-reduced-motion, durations |
| 9 | Cross-Browser & Device Compat | 13% | Media queries, breakpoints, flexbox/grid, vendor prefixes, touch targets, responsive images, print/dark mode |
| 10 | Text Wrapping & Line Breaking | 10% | overflow-wrap, text-wrap, text-overflow, max-width on text, orphans/widows, excessive `<br>` usage |

## Grading Scale

| Grade | Score |
|-------|-------|
| A | 90-100 |
| B | 80-89 |
| C | 70-79 |
| D | 60-69 |
| F | 0-59 |

## Output

- Human-readable table printed to stdout
- Detailed JSON report saved to `report.json` (local) or `comparison-report.json` (URL)
- Categories below 80 produce specific actionable recommendations

## Example Output

```
+----------------------------------+-------+--------+
| Category                         | Score | Weight |
+----------------------------------+-------+--------+
| Color & Contrast                 | 84/100|  15%   | ok
| Typography                       | 80/100|  12%   | ok
| Spacing Consistency              | 97/100|  10%   | ok
| Layout & Structure               | 84/100|  12%   | ok
| Imagery                          |100/100|   8%   | ok
| Accessibility                    | 80/100|  10%   | ok
| Performance Indicators           |100/100|   5%   | ok
| Animation & Interaction          | 80/100|   5%   | ok
| Cross-Browser & Device Compat    | 80/100|  13%   | ok
| Text Wrapping & Line Breaking    |100/100|  10%   | ok
+----------------------------------+-------+--------+
| OVERALL                          | 87/100| 100%   |
+----------------------------------+-------+--------+
  Overall Grade: B
```

## Dependencies

- [cheerio](https://cheerio.js.org/) - HTML parsing
- [css-tree](https://github.com/csstree/csstree) - CSS parsing and AST traversal

## License

MIT
