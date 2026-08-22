/**
 * One palette for every chart.
 *
 * There were 673 inline hex literals across the app's chart configs — the top
 * eight alone (`#6366f1`, `#3b82f6`, `#94a3b8`, `#f59e0b`, `#64748b`,
 * `#8b5cf6`, `#ef4444`, `#334155`) account for 300 of them. Two problems with
 * that, and only one of them is branding:
 *
 *  1. Every chart picked its own series colours, so the same metric is a
 *     different colour depending on which page you are looking at.
 *  2. Chart *chrome* — axes, gridlines, tooltip text — was hardcoded to dark
 *     values like `stroke="#374151"` and `color: "#F3F4F6"`. On a light ground
 *     those are a near-invisible grid and white-on-white tooltip text. This was
 *     already broken for anyone who chose light mode; making paper the default
 *     just makes it the common case.
 *
 * Chrome resolves through the theme tokens so it follows light/dark for free.
 * CSS custom properties resolve in SVG presentation attributes and in inline
 * styles, which is how Recharts consumes both.
 *
 * Series colours are fixed hexes rather than tokens on purpose: a categorical
 * scale has to stay distinguishable from its neighbours, and eight tokens that
 * each flip with the theme cannot guarantee that. These are picked at a middle
 * lightness so they carry on paper (#F2F3EE) and on pane (#0E1512) alike, and
 * the ramp is anchored on ledger green so charts read as part of the brand.
 */

/** Categorical series, in the order they should be assigned. */
export const CHART_SERIES = [
  "#1B8A52", // ledger green, lifted to carry on the dark pane
  "#B87514", // ochre
  "#2D6E9E", // slate blue
  "#A8342A", // ledger red
  "#6B4E9E", // violet
  "#137F76", // teal
  "#6E7B2E", // olive
  "#A33D63", // rose
] as const;

/** Stable colour for series `i`, wrapping past the end of the ramp. */
export function chartSeries(i: number): string {
  return CHART_SERIES[((i % CHART_SERIES.length) + CHART_SERIES.length) % CHART_SERIES.length];
}

/**
 * Semantic series, for charts whose categories *mean* good/bad rather than
 * merely differing. Reads the status tokens, so these do follow the theme.
 */
export const CHART_STATUS = {
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  danger: "hsl(var(--destructive))",
  info: "hsl(var(--info))",
  neutral: "hsl(var(--neutral))",
} as const;

/** Chart chrome. Spread these onto the Recharts primitives. */
export const CHART_CHROME = {
  /** <CartesianGrid stroke={CHART_CHROME.grid} /> */
  grid: "hsl(var(--border))",
  /** <XAxis stroke={CHART_CHROME.axis} /> */
  axis: "hsl(var(--border))",
  /** <XAxis tick={CHART_CHROME.tick} /> */
  tick: { fill: "hsl(var(--muted-foreground))", fontSize: 12 },
  /** <Tooltip contentStyle={CHART_CHROME.tooltip} /> */
  tooltip: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "var(--radius)",
    color: "hsl(var(--popover-foreground))",
  },
  /** <Tooltip labelStyle={CHART_CHROME.tooltipLabel} itemStyle={...} /> */
  tooltipLabel: { color: "hsl(var(--popover-foreground))" },
  tooltipItem: { color: "hsl(var(--muted-foreground))" },
} as const;
