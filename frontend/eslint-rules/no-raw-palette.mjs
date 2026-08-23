/**
 * Flag raw Tailwind palette colours so they move onto the Open Ledger tokens.
 *
 * This is a named rule rather than another `no-restricted-syntax` entry for a
 * concrete reason: flat config replaces a rule's options wholesale, it does not
 * merge them. A second `no-restricted-syntax` block covering `src/**` silently
 * dropped the `createObjectURL` guard that block already carried — the guard
 * stopped firing and nothing said so. Two checks that need two severities
 * (that one is `error` and starts clean; this one is `warn` over 12,485
 * existing violations) cannot share one rule name.
 *
 * Scanning every string literal rather than only `className` attributes is
 * deliberate. A large share of the debt lives in variant maps and `cn()`
 * helpers — `const TONE = { high: "bg-red-100 text-red-700" }` — which an
 * attribute-scoped selector never sees.
 */

const UTILITIES =
  "bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder|decoration|outline|shadow|accent|caret";
const PALETTES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const SHADES = "50|100|200|300|400|500|600|700|800|900|950";

// `text-white` and friends take no shade, so the shaded pattern below never saw
// them — and they are the single most dangerous class for a paper default.
// There are 1,370 of them in `app/(app)` and `components/`, 921 being
// `text-white`, every one of which is invisible on #F2F3EE. A migration gate
// that cannot see them is not a gate.
const BARE = "white|black";

// `(?![0-9])` keeps `bg-red-50` from matching inside `bg-red-500` while still
// allowing the opacity form `bg-red-500/20`. Optional `dark:`/`hover:` etc.
// prefixes are covered by the leading boundary.
const RAW_CLASS = new RegExp(
  `(?:^|[\\s"'\`])(?:[a-z-]+:)*(?:${UTILITIES})-(?:(?:${PALETTES})-(?:${SHADES})|(?:${BARE}))(?![0-9a-z-])`,
  "g",
);

// Three-, six- and eight-digit forms. The six-digit-only version missed
// `#fff`, which is the same mistake as missing `text-white`.
const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/** What to reach for instead, keyed by the palette family. */
const SUGGESTION = {
  slate: "text-foreground / text-muted-foreground / bg-muted / border-border",
  gray: "text-foreground / text-muted-foreground / bg-muted / border-border",
  zinc: "text-foreground / text-muted-foreground / bg-muted / border-border",
  neutral: "text-foreground / text-muted-foreground / bg-muted / border-border",
  stone: "text-foreground / text-muted-foreground / bg-muted / border-border",
  red: "destructive / destructive-subtle / destructive-border",
  rose: "destructive / destructive-subtle / destructive-border",
  orange: "warning / warning-subtle / warning-border",
  amber: "warning / warning-subtle / warning-border",
  yellow: "warning / warning-subtle / warning-border",
  green: "success / success-subtle / success-border",
  emerald: "success / success-subtle / success-border",
  lime: "success / success-subtle / success-border",
  teal: "success / success-subtle / success-border",
  // Blue is the ambiguous one: this codebase uses it both for genuinely
  // informational chrome and as a second accent. Name both so the author picks.
  blue: "info / info-subtle / info-border — or primary, if it is acting as the accent",
  sky: "info / info-subtle / info-border — or primary, if it is acting as the accent",
  cyan: "info / info-subtle / info-border — or primary, if it is acting as the accent",
  indigo: "primary (the brand accent is ledger-green, not indigo)",
  violet: "primary (the brand accent is ledger-green, not indigo)",
  purple: "primary (the brand accent is ledger-green, not indigo)",
  fuchsia: "primary (the brand accent is ledger-green, not indigo)",
  pink: "primary (the brand accent is ledger-green, not indigo)",
  // Not a colour so much as an assumption about the ground underneath it.
  white:
    "text-primary-foreground on a filled control, text-foreground on a surface, or bg-card — `white` assumes a dark ground and there is not one any more",
  black:
    "text-foreground / bg-foreground — `black` assumes a light ground, which Ledger Dark is not",
};

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Use the Open Ledger token layer instead of raw Tailwind palette colours or hex literals.",
    },
    schema: [
      {
        type: "object",
        properties: { hex: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      rawClass:
        "`{{cls}}` is a raw palette colour. Use {{suggestion}}. (Open Ledger token migration — see eslint.config.mjs.)",
      rawHex:
        "`{{hex}}` is a hardcoded colour. Chart colours come from @/lib/chartPalette; everything else uses hsl(var(--token)).",
    },
  },

  create(context) {
    const checkHex = context.options[0]?.hex !== false;

    function check(node, text) {
      if (typeof text !== "string" || !text) return;

      for (const m of text.matchAll(RAW_CLASS)) {
        // The match carries its leading boundary character, which may be a
        // quote rather than whitespace.
        const cls = m[0].replace(/^[\s"'`]+/, "");
        const parts = cls.split("-");
        // `bg-red-500` names its family second-to-last; `text-white` last.
        const family = /^\d+$/.test(parts.at(-1)) ? parts.at(-2) : parts.at(-1);
        context.report({
          node,
          messageId: "rawClass",
          data: { cls, suggestion: SUGGESTION[family] ?? "a semantic token" },
        });
      }

      if (checkHex) {
        for (const m of text.matchAll(HEX)) {
          context.report({ node, messageId: "rawHex", data: { hex: m[0] } });
        }
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked);
      },
    };
  },
};

export default rule;
