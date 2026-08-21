/**
 * The font substitution table.
 *
 * Pinned because the whole mechanism is silent when it is wrong: a renamed or
 * missing asset does not throw, it just puts that family back on the fixed-width
 * estimate, and the only symptom is pagination that is subtly not Word's.
 */

import { describe, expect, it } from "vitest";

import {
  expectedFontFiles,
  substitutableFamilies,
} from "@/components/docs/docxFonts";

describe("substitutableFamilies", () => {
  it("maps the Microsoft families a corporate document actually uses", () => {
    expect(substitutableFamilies(["Calibri"])[0].stem).toBe("Carlito");
    expect(substitutableFamilies(["Cambria"])[0].stem).toBe("Caladea");
    expect(substitutableFamilies(["Arial"])[0].stem).toBe("Arimo");
    expect(substitutableFamilies(["Times New Roman"])[0].stem).toBe("Tinos");
    expect(substitutableFamilies(["Courier New"])[0].stem).toBe("Cousine");
  });

  it("is case- and whitespace-insensitive, since w:rFonts casing is arbitrary", () => {
    expect(substitutableFamilies(["  CALIBRI "])[0].stem).toBe("Carlito");
    expect(substitutableFamilies(["times new roman"])[0].stem).toBe("Tinos");
  });

  it("keeps the family name the document asked for, not the substitute's", () => {
    // The substitute is registered under the Microsoft name because that is what
    // `w:rFonts` says; the engine never learns it was handed Carlito.
    expect(substitutableFamilies(["Calibri"])[0].family).toBe("Calibri");
  });

  it("de-duplicates a family used many times", () => {
    expect(substitutableFamilies(["Calibri", "calibri", "Calibri"])).toHaveLength(1);
  });

  it("ignores families it cannot substitute", () => {
    expect(substitutableFamilies(["Wingdings", "Comic Sans MS"])).toEqual([]);
  });
});

describe("expectedFontFiles", () => {
  it("lists four faces per distinct substitute, deduplicated across aliases", () => {
    const files = expectedFontFiles();
    // Five substitutes (Arial/Helvetica and Times/Times New Roman share one),
    // four faces each.
    expect(files).toHaveLength(20);
    expect(new Set(files).size).toBe(20);
    expect(files).toContain("Carlito-Regular.ttf");
    expect(files).toContain("Caladea-BoldItalic.ttf");
    expect(files).toContain("Cousine-Bold.ttf");
  });

  it("is sorted, so a diff of the asset list reads cleanly", () => {
    const files = expectedFontFiles();
    expect(files).toEqual([...files].sort());
  });
});

describe("the bundled assets", () => {
  it("has every face the resolver will request", async () => {
    // The point of `expectedFontFiles` is to make a missing or renamed asset
    // fail here. Without this the failure is silent: the request 404s, the
    // engine falls back to the fixed-width estimate for that family, and the
    // editor's own "fonts aren't available" notice does not appear — it is
    // suppressed as soon as a resolver is supplied at all, whether or not any
    // face loaded.
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");

    const dir = join(process.cwd(), "public", "fonts", "docx");
    const missing = expectedFontFiles().filter(
      (file) => !existsSync(join(dir, file))
    );

    expect(missing).toEqual([]);
  });

  it("serves sfnt bytes, not woff2", async () => {
    // The engine admits sfnt only and rejects woff2 with "unsupported sfnt
    // signature". A well-meaning optimisation to woff2 would break every
    // family at once, and quietly.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    const dir = join(process.cwd(), "public", "fonts", "docx");
    const head = readFileSync(join(dir, "Carlito-Regular.ttf")).subarray(0, 4);
    // 0x00010000 is the TrueType sfnt version; 'wOF2' would be 0x774F4632.
    expect([...head]).toEqual([0x00, 0x01, 0x00, 0x00]);
  });
});
