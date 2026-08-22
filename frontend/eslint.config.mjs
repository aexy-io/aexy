import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import noRawPalette from "./eslint-rules/no-raw-palette.mjs";

/**
 * Modules already migrated onto the Open Ledger token layer.
 *
 * This list IS the migration tracker. Append a path in the PR that migrates
 * that module and `local/no-raw-palette` turns from `warn` to `error` for it,
 * so the next feature added there cannot quietly reintroduce `bg-blue-600`.
 * Nothing else keeps a migrated surface migrated.
 *
 * Empty at the end of the token-foundation PR — no module has moved yet.
 */
const TOKEN_MIGRATED = [];

/**
 * Surfaces that are not the app. Marketing paints with the static `ledger-*`
 * Tailwind tokens and must NOT flip with the app's dark mode, so raw colour
 * there is correct rather than debt.
 *
 * Exported because eslint.palette.config.mjs needs the same exemptions; two
 * copies would drift and start reporting marketing as debt.
 */
export const NOT_APP_SURFACE = [
  "src/components/landing/**",
  "src/components/marketing/**",
  "src/components/docs-site/**",
  "src/lib/chartPalette.ts",
];

/**
 * ESLint 9 flat config.
 *
 * Next 16 removed the `next lint` command and ESLint 9 no longer reads
 * `.eslintrc.*`, so between the two the frontend had no working linter at all:
 * `npm run lint` failed with "Invalid project directory provided, no such
 * directory: .../lint", and a bare `npx eslint` failed for want of this file.
 * `npm run lint` now runs `eslint .` against this config.
 *
 * `eslint-config-next` v16 ships flat configs, so these import directly — no
 * FlatCompat, which chokes on it.
 */
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "public/**",
      "next-env.d.ts",
      // Generated: merge-messages.js writes these from messages/{locale}/*.json.
      "messages/en.json",
      "messages/hi.json",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // CommonJS Node files, not app modules. `require()` is the only thing that
    // works here: next.config.js is loaded by Node before any bundler, and
    // merge-messages.js runs as a bare `node` script from `predev`/`prebuild`.
    files: ["next.config.js", "scripts/**/*.js", "*.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Tests and Playwright fixtures render throwaway markup and assert on it.
    // `no-html-link-for-pages` is about real navigation in the app.
    files: ["src/test/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    rules: {
      // `next.config.js` already sets `ignoreBuildErrors` and
      // `ignoreDuringBuilds`, so treating these as errors would fail a lint run
      // over the whole existing codebase without gating anything. Warnings keep
      // the output readable while still surfacing new problems.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
  {
    // ── Blob downloads go through `saveBlob` ─────────────────────────────────
    //
    // Nine hand-rolled copies of "createObjectURL → anchor → click → revoke"
    // had accumulated, and every one carried at least one of two bugs that are
    // invisible to the person who wrote it: Firefox ignores `click()` on an
    // anchor that was never added to the document, and revoking the object URL
    // in the same tick can hand back a truncated file with no error. Chrome with
    // a small file forgives both, so neither survives review by clicking it.
    //
    // `saveBlob` in src/lib/utils.ts gets both right in one place. An `error`
    // rather than a `warn` because there are no remaining violations to grandfather
    // — unlike the debt held below, this one starts clean and should stay that way.
    //
    // Previews and `window.open` are legitimate reasons to make an object URL and
    // are not downloads. Those sites carry a line-scoped disable stating which
    // they are, so the exemption is argued where the code is rather than listed
    // in here.
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression > MemberExpression.callee[property.name='createObjectURL']",
          message:
            "Use `saveBlob` from @/lib/utils to download a blob — a hand-rolled anchor silently fails in Firefox and can truncate the file. For a preview or window.open, disable this line with a comment saying which.",
        },
      ],
    },
  },
  {
    // The sanctioned implementation. Everything else calls it.
    files: ["src/lib/utils.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // ── Colour goes through the token layer ──────────────────────────────────
  //
  // The app is mid-migration onto Open Ledger, and it is roughly 54/46:
  // ~14,700 semantic-token uses (`text-foreground`, `bg-muted`,
  // `border-border`) against **12,485 raw palette classes across 603 files**,
  // plus 693 inline hex literals. That ratio is why the retheme is not a
  // config change — recolouring the CSS variables repaints the semantic half
  // and leaves the other half indigo-on-paper.
  //
  // Two gaps produced the debt, and both are now closed at the source, which
  // is what makes holding the line reasonable rather than merely strict:
  //
  //   - there was no status vocabulary, so a quiet pill had to be spelled
  //     `bg-red-50 text-red-700 border-red-200`. It is now
  //     `bg-destructive-subtle text-destructive border-destructive-border`,
  //     with the same four slots on success / warning / info / neutral.
  //   - charts had nowhere to get a colour from, hence 693 hex literals.
  //     `@/lib/chartPalette` owns series colours plus axis/grid/tooltip
  //     chrome, and the chrome follows the theme instead of being pinned to
  //     dark values that vanish on paper.
  //
  // Unlike the other tracked migrations in this file, this one is NOT held at
  // `warn` globally. Turning it on everywhere took `npm run lint` from 1,122
  // warnings to 16,202 — a signal nobody reads is not a signal, and it would
  // have buried the 1,122 real ones. So it is an `error` on modules that have
  // already migrated (the list above), and `npm run lint:palette` prints the
  // outstanding debt on demand via eslint.palette.config.mjs.
  // Spread rather than a literal block: flat config rejects an empty `files`
  // array, and TOKEN_MIGRATED is empty until the first module lands.
  ...(TOKEN_MIGRATED.length
    ? [
        {
          files: TOKEN_MIGRATED,
          plugins: { local: { rules: { "no-raw-palette": noRawPalette } } },
          rules: { "local/no-raw-palette": "error" },
        },
      ]
    : []),
  {
    // ── React Compiler ruleset: a tracked migration, not noise ───────────────
    //
    // eslint-plugin-react-hooks v7 added rules that check what the React
    // Compiler needs, and this codebase predates them. When the linter was first
    // restored it reported 239 errors; 91 were mechanical and are fixed. These
    // six classes are what remain, and none of them is a mechanical edit — each
    // needs a decision about how a component should behave:
    //
    //   87 set-state-in-effect (63 files) — setState inside an effect. The right
    //      fix differs per site: derive during render, reset via a `key`, lift the
    //      state, or keep it because it genuinely syncs something external. The
    //      sites sampled were a hydration guard, a URL-param sync, a
    //      form-reset-from-props and an SSR `window` read — four patterns, four
    //      different answers.
    //   21 preserve-manual-memoization (6) — deps the compiler cannot verify.
    //   17 static-components (10) — components declared inside a component. The
    //      fix is hoisting them, which means threading what they close over as
    //      props.
    //    9 refs (5) — reading a ref during render.
    //    8 purity (7) — `Date.now()` during render. Whether these views should
    //      tick is a product question, and making them tick changes render
    //      behaviour.
    //    6 immutability (6) — self-referencing or recursive function declarations
    //      (WebSocket retry, recursive tree filter) used before declaration.
    //
    // Held at "warn" so `npm run lint` gates *new* code on everything else
    // instead of being red from the first run. The counts above are the debt;
    // they are not an assertion that the code is fine.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];
