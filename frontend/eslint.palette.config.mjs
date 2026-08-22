/**
 * Debt report for the Open Ledger colour migration.
 *
 *   npm run lint:palette
 *
 * A separate config because the main one deliberately does NOT enable
 * `local/no-raw-palette` outside migrated modules: switching it on across the
 * whole tree takes `npm run lint` from 1,122 warnings to 16,202, which buries
 * every real one. The gate lives in eslint.config.mjs (`TOKEN_MIGRATED`); this
 * file is for asking "how much is left, and where".
 */
import base, { NOT_APP_SURFACE } from "./eslint.config.mjs";
import noRawPalette from "./eslint-rules/no-raw-palette.mjs";

const config = [
  ...base,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...NOT_APP_SURFACE, "src/test/**"],
    plugins: { local: { rules: { "no-raw-palette": noRawPalette } } },
    rules: { "local/no-raw-palette": "warn" },
  },
];

export default config;
