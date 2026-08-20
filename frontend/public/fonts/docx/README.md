# Metric-compatible substitute fonts for the Word editor

These exist because a browser cannot read the fonts installed on the machine, so
the docx engine can only measure line and page breaks with faces this app serves.
Without them it falls back to a fixed-width approximation and pagination is
estimated rather than Word-accurate.

Microsoft's Calibri, Cambria, Arial, Times New Roman and Courier New are not
redistributable. Each of these is a font with **identical advance widths**, so a
document reflows to the same line and page breaks, and each is registered under
the Microsoft family name it stands in for (see `src/components/docs/docxFonts.ts`).

| Document asks for | Served face | Upstream |
|---|---|---|
| Calibri | Carlito | https://fonts.google.com/specimen/Carlito |
| Cambria | Caladea | https://fonts.google.com/specimen/Caladea |
| Arial, Helvetica | Arimo | https://fonts.google.com/specimen/Arimo |
| Times New Roman, Times | Tinos | https://fonts.google.com/specimen/Tinos |
| Courier New, Courier | Cousine | https://fonts.google.com/specimen/Cousine |

All five are licensed under the **SIL Open Font License 1.1**, which permits
redistribution and bundling: https://openfontlicense.org

Served as **raw TTF**, not woff2: the engine admits sfnt bytes only and rejects a
woff2 with "unsupported sfnt signature" — it does not decompress.

Built from the upstream statics in `google/fonts`, subset to Latin with
`pyftsubset` (four faces each: Regular, Bold, Italic, BoldItalic). Arimo ships
only as a variable font upstream, so its two weights are instanced with
`fonttools varLib.instancer` first. ~700 KB total, down from ~5 MB unsubset.

They are requested per-family on demand at runtime and cached by the engine, so a
document using two families fetches two.

Non-Latin text in these families is not covered by the subset and falls back to
the estimate, which the editor reports in its font notice.
