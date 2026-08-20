/**
 * Every translation key these surfaces ask for must exist in both locales.
 *
 * Caught by rendering, not by any test: the review inbox's approve-all button
 * displayed the literal string `review.approveAll`, because the key was never
 * added. next-intl renders the key path when it cannot resolve one, so a missing
 * key is not an error anywhere — it is a button with debug text on it, shipped.
 *
 * Scoped to the files this branch added or changed. A repo-wide sweep would fail
 * on gaps that are somebody else's to close and would say nothing about whether
 * this work is complete.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const FILES = [
  "app/(app)/review/page.tsx",
  "components/docs/DocumentImprovements.tsx",
  "components/docs/DocumentProvenance.tsx",
  "components/docs/MergedChanges.tsx",
  "components/docs/RepositoryScopePanel.tsx",
  "components/docs/ProposedEditReview.tsx",
  "components/docs/impact/ImpactDocumentCard.tsx",
  "components/docs/impact/ImpactGuidance.tsx",
  "app/(app)/docs/impact/[repositoryId]/[prNumber]/page.tsx",
  "components/settings/DocImpactSettings.tsx",
  "app/(app)/settings/docs/page.tsx",
  "app/(app)/settings/ai/models/page.tsx",
  "components/docs/DocxReviewRail.tsx",
];

const LOCALES = ["en", "hi"] as const;

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(resolve(__dirname, `../../messages/${locale}.json`), "utf8")
    ),
  ])
) as Record<(typeof LOCALES)[number], Record<string, unknown>>;

/** Walks a dotted path, so a namespace of "docs.provenance" resolves. */
function lookup(tree: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      tree
    );
}

/** The namespaces a file asks for, and the keys it asks for within them. */
function keysUsedBy(source: string): { namespace: string; keys: string[] }[] {
  const namespaces = [
    ...source.matchAll(/useTranslations\("([^"]+)"\)/g),
  ].map((m) => m[1]);
  // Every `t("…")` in the file. A file with two namespaces is rare here, and
  // when it happens the key is checked against both — a false pass is better
  // than a false failure in a guard nobody can read.
  const keys = [...new Set([...source.matchAll(/\bt\("([^"]+)"/g)].map((m) => m[1]))];
  return namespaces.map((namespace) => ({ namespace, keys }));
}

describe("translation keys used by the docs and review surfaces", () => {
  for (const file of FILES) {
    const source = readFileSync(resolve(__dirname, "..", file), "utf8");
    const used = keysUsedBy(source);

    it(`${file} declares at least one namespace`, () => {
      expect(used.length).toBeGreaterThan(0);
    });

    for (const locale of LOCALES) {
      it(`${file} resolves every key in ${locale}`, () => {
        const missing: string[] = [];
        for (const { namespace, keys } of used) {
          for (const key of keys) {
            const resolved = used.length > 1
              ? used.some(
                  (candidate) =>
                    lookup(messages[locale], `${candidate.namespace}.${key}`) !==
                    undefined
                )
              : lookup(messages[locale], `${namespace}.${key}`) !== undefined;
            if (!resolved) missing.push(`${namespace}.${key}`);
          }
        }
        // Named rather than counted: the failure has to say which key, or the
        // next person has to re-derive it by hand.
        expect(missing).toEqual([]);
      });
    }
  }
});
