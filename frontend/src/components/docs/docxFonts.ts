/**
 * Fonts for the Word editor, and why this cannot just work.
 *
 * The engine shapes text with HarfBuzz and measures line and page breaks from
 * real font metrics. That needs the **font binaries**, and a browser cannot read
 * the fonts installed on the machine — there is no API that hands an arbitrary
 * local font file to WASM. So the editor can only measure with faces the app
 * itself serves. Given none, it falls back to a fixed-width approximation:
 * glyphs still paint in their true faces, so the page looks right, but wrap
 * points and pagination are estimated rather than Word-accurate. That is the
 * "Some fonts in this document aren't available" notice.
 *
 * Nor can the obvious fix be shipped: Calibri, Cambria, Arial and Times New Roman
 * are Microsoft/Monotype fonts and are not redistributable.
 *
 * What works instead is **metric compatibility**. For each of those there is an
 * open font with identical advance widths, commissioned precisely so documents
 * reflow identically:
 *
 *   Calibri          → Carlito   (OFL)
 *   Cambria          → Caladea   (OFL)
 *   Arial            → Arimo     (OFL, Chrome OS core font)
 *   Times New Roman  → Tinos     (OFL, Chrome OS core font)
 *   Courier New      → Cousine   (OFL, Chrome OS core font)
 *
 * Same widths means the same line and page breaks as Word, even though a few
 * glyph shapes differ slightly. This is the substitution LibreOffice and
 * Chrome OS both make.
 *
 * Served as raw TTF, not woff2: the engine admits sfnt bytes only and rejects a
 * woff2 with "unsupported sfnt signature". It does not decompress. Worth knowing
 * because the failure is quiet — the editor's own "fonts aren't available" notice
 * *disappears* once a resolver is supplied at all, whether or not a single face
 * loaded, so the only honest check is the resolver's own failure list.
 *
 * The bundled faces are the **Latin subset** (U+0000–00FF and companions), which
 * is what these families are used for. A document setting Calibri on Cyrillic or
 * Devanagari text falls back to the estimate for those runs and says so in the
 * editor's font notice.
 *
 * Each substitute is registered *under the Microsoft family name*, because that
 * is what the document's `w:rFonts` asks for. The engine never learns it was
 * handed Carlito.
 *
 * Nothing here is required. A missing file is reported by `loadFonts` as a
 * failure for that face and the engine falls back for that family only — so this
 * module is safe to ship before the assets land, and safe to ship for a document
 * using a font nobody has.
 */

// The font vocabulary is split across two entry points: the request/source types
// live in `core/editor` (chrome + fonts) while `FontConfiguration` itself is part
// of the document contract in `core/contracts/editor`.
import type {
  FontResolutionRequest,
  FontUrlSource,
} from "@docx-editor.dev/core/editor";
import type { FontConfiguration } from "@docx-editor.dev/core/contracts/editor";

/** Where the woff2 files live, relative to the site root. */
const FONT_DIR = "/fonts/docx";

interface Substitute {
  /** Basename stem of the four faces, e.g. `Carlito` → `Carlito-Regular.ttf`. */
  readonly stem: string;
  /** Whether an italic face is published. Liberation Mono has one; some do not. */
  readonly italic?: boolean;
}

/**
 * Microsoft family (lowercased) → the open face that matches its metrics.
 *
 * Keyed lowercase because `w:rFonts` casing is whatever the authoring tool wrote.
 * Aliases are listed separately rather than normalised, so the table reads as the
 * substitution list it is.
 */
const SUBSTITUTES: Record<string, Substitute> = {
  calibri: { stem: "Carlito", italic: true },
  cambria: { stem: "Caladea", italic: true },
  arial: { stem: "Arimo", italic: true },
  helvetica: { stem: "Arimo", italic: true },
  "times new roman": { stem: "Tinos", italic: true },
  times: { stem: "Tinos", italic: true },
  "courier new": { stem: "Cousine", italic: true },
  courier: { stem: "Cousine", italic: true },
};

/** The faces one family contributes: regular, bold, and their italics. */
function facesFor(family: string, substitute: Substitute): FontUrlSource[] {
  const faces: FontUrlSource[] = [
    {
      url: `${FONT_DIR}/${substitute.stem}-Regular.ttf`,
      family,
      weight: 400,
      style: "normal",
    },
    {
      url: `${FONT_DIR}/${substitute.stem}-Bold.ttf`,
      family,
      weight: 700,
      style: "normal",
    },
  ];
  if (substitute.italic) {
    faces.push(
      {
        url: `${FONT_DIR}/${substitute.stem}-Italic.ttf`,
        family,
        weight: 400,
        style: "italic",
      },
      {
        url: `${FONT_DIR}/${substitute.stem}-BoldItalic.ttf`,
        family,
        weight: 700,
        style: "italic",
      }
    );
  }
  return faces;
}

/**
 * The files this module will ask for, for documentation and for a build check.
 *
 * Exported so the set is assertable rather than discovered by watching the
 * network tab: a renamed asset should fail a test, not silently degrade every
 * document's pagination back to the estimate.
 */
export function expectedFontFiles(): string[] {
  const stems = new Map<string, Substitute>();
  for (const substitute of Object.values(SUBSTITUTES)) {
    stems.set(substitute.stem, substitute);
  }
  const files: string[] = [];
  for (const [stem, substitute] of stems) {
    files.push(`${stem}-Regular.ttf`, `${stem}-Bold.ttf`);
    if (substitute.italic) {
      files.push(`${stem}-Italic.ttf`, `${stem}-BoldItalic.ttf`);
    }
  }
  return files.sort();
}

/** Which of a document's families this module can serve. Exported for tests. */
export function substitutableFamilies(
  families: readonly string[]
): { family: string; stem: string }[] {
  const seen = new Set<string>();
  const out: { family: string; stem: string }[] = [];
  for (const family of families) {
    const key = family.trim().toLowerCase();
    const substitute = SUBSTITUTES[key];
    if (!substitute || seen.has(key)) continue;
    seen.add(key);
    out.push({ family, stem: substitute.stem });
  }
  return out;
}

/**
 * Resolve a document's fonts on demand.
 *
 * Called by the engine with the families a document actually uses, so a
 * two-font memo fetches two families rather than the whole table. Results are
 * cached by `loadFonts` in the Cache API, so the second document costs nothing.
 *
 * Returns undefined when nothing is substitutable — the engine then does exactly
 * what it does today, which is the correct outcome rather than a failure.
 */
export async function resolveDocxFonts(
  request: FontResolutionRequest
): Promise<FontConfiguration | undefined> {
  const wanted = substitutableFamilies([
    ...request.families,
    request.defaultFamily,
  ]);
  if (wanted.length === 0) return undefined;

  const sources = wanted.flatMap(({ family }) =>
    facesFor(family, SUBSTITUTES[family.trim().toLowerCase()])
  );

  // Imported here rather than at module scope: this module is pulled in by the
  // lazily-loaded canvas, and keeping the engine import inside the async path
  // means a route that merely references the resolver does not pull it in.
  const { composeFontConfiguration, loadFonts } = await import(
    "@docx-editor.dev/core/editor"
  );

  const loaded = await loadFonts({ sources });

  if (loaded.failures.length > 0) {
    // Not thrown. A missing or rejected face degrades that family to the
    // estimate, which is strictly better than refusing to open the document —
    // but it is worth saying out loud, because the symptom otherwise is
    // "pagination is subtly wrong" with no explanation.
    console.warn(
      "[docx] some substitute faces did not load; pagination for those " +
        "families falls back to an estimate:",
      `${loaded.failures.length} of ${loaded.failures.length + loaded.sources.length}:`,
      loaded.failures
    );
  }
  if (loaded.sources.length === 0) return undefined;

  return composeFontConfiguration(loaded);
}
