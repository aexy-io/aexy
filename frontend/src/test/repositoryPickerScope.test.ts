/**
 * Which repositories a docs picker offers.
 *
 * Adoption is a workspace decision, but it writes a `developer_repositories`
 * row only for the adopter. Both pickers read `/repositories?enabled_only=true`,
 * which is that per-developer table — so a colleague could see a repository's
 * merges in "Recently merged" and its stale documents in the review inbox, then
 * find it missing from the generator, with "Document this" appearing to do
 * nothing at all.
 *
 * A source assertion rather than a render: the defect was in which endpoint got
 * called, and a component test with a mocked client passes either way.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(resolve(__dirname, "..", relative), "utf8");

const PICKERS = [
  ["the docs generator", "app/(app)/docs/page.tsx"],
  ["the link-to-code panel", "components/docs/CodeLinkPanel.tsx"],
] as const;

describe("repository pickers in docs", () => {
  for (const [what, file] of PICKERS) {
    it(`${what} lists the workspace's adopted repositories`, () => {
      const source = read(file);
      expect(source).toMatch(/workspaceRepositoriesApi\.list\(/);
    });

    it(`${what} no longer reads the per-developer list`, () => {
      const source = read(file);
      // The whole defect, in one call.
      expect(source).not.toMatch(/listRepositories\(\{\s*enabled_only/);
    });

    it(`${what} leaves out an adoption somebody paused`, () => {
      const source = read(file);
      // `is_active` false is a workspace saying "not this one for now"; offering
      // it would generate a document against a repository nobody is syncing.
      expect(source).toMatch(/\.filter\(\(row\) => row\.is_active\)/);
    });
  }

  it("both pickers hold the same narrow shape, so they cannot drift", () => {
    // A full `Repository` is only obtainable from the per-developer endpoint, so
    // the wide type was what forced the wrong call in the first place.
    for (const [, file] of PICKERS) {
      expect(read(file)).toMatch(/RepositoryChoice/);
    }
  });
});
