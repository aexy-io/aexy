import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

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
];
