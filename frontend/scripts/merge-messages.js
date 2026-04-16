#!/usr/bin/env node

/**
 * Merge per-module i18n message files into a single JSON per locale.
 *
 * Structure:
 *   messages/en/*.json  →  messages/en.json
 *   messages/hi/*.json  →  messages/hi.json
 *
 * Each module file should export a single top-level namespace key:
 *   { "reviews": { ... } }
 *
 * Usage:
 *   node scripts/merge-messages.js
 *   npm run i18n:merge
 */

const fs = require("fs");
const path = require("path");

const MESSAGES_DIR = path.resolve(__dirname, "../messages");
const LOCALES = ["en", "hi"];

for (const locale of LOCALES) {
  const localeDir = path.join(MESSAGES_DIR, locale);

  if (!fs.existsSync(localeDir)) {
    console.warn(`⚠ Skipping ${locale}: directory ${localeDir} not found`);
    continue;
  }

  const files = fs
    .readdirSync(localeDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const merged = {};
  let keyCount = 0;

  for (const file of files) {
    const filePath = path.join(localeDir, file);
    try {
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const moduleKeys = Object.keys(content);

      for (const key of moduleKeys) {
        if (merged[key]) {
          console.warn(
            `⚠ Namespace "${key}" in ${locale}/${file} overwrites existing — check for duplicates`
          );
        }
        merged[key] = content[key];
      }

      keyCount += moduleKeys.length;
    } catch (err) {
      console.error(`✘ Failed to parse ${locale}/${file}: ${err.message}`);
      process.exit(1);
    }
  }

  const outPath = path.join(MESSAGES_DIR, `${locale}.json`);
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n");

  console.log(
    `✓ ${locale}.json — merged ${files.length} files, ${keyCount} namespaces`
  );
}

console.log("\nDone. Merged message files are ready for next-intl.");
