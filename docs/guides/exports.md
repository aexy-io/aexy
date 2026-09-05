# Getting your data out

Every module can hand you its data, in a format that depends on what the data
is. This is where each one lives, and what each format is honestly good for.

## What comes out, and in what shape

| From | Formats | Where |
|---|---|---|
| [Knowledge base](../knowledge-base.md) | Markdown, HTML, PDF, raw JSON; a space as a zip | The page menu, or the space menu |
| [Service Desk](../service-desk.md) | CSV — the queue board, the ticket list, both reports | The Export button on each screen |
| [CRM](../crm.md) and [Tables](../tables.md) | CSV of the current view | The list's own menu |
| [Reports](../reports.md) | CSV, and scheduled deliveries by email | The report, or its schedule |
| [Leave](../leave.md) and [Compliance](../compliance.md) | CSV for the audit trail | Their reporting screens |

Two rules hold everywhere:

* **An export is a read.** It contains exactly what the person exporting can
  already see — a bulk export of a space is a read of every page in it, filtered
  the same way. Exporting is not a way around access.
* **A filtered view exports filtered.** What you are looking at is what you
  get, which is usually what you wanted and occasionally a surprise.

## Choosing a format

**CSV** for anything that will be opened in a spreadsheet or loaded somewhere
else. It is the format with the fewest opinions.

**Markdown** for text you intend to keep editing, or move into another tool.
It is the only format that round-trips: what comes out can go back in.

**HTML** for something that must look right in a browser or an email, and keep
its links.

**PDF** for something that will be read once, printed, or attached to a
contract — not for anything you plan to edit afterwards.

**Raw JSON**, on a document, is the editor's own representation. Useful for
migrations and scripts, not for reading.

## The PDF caveat worth knowing

PDF has to draw text rather than store it, which makes it the one format where
the script your content is written in matters.

Hindi, Arabic, Hebrew, Thai and other scripts that reshape or join their
characters **export correctly** — the text is shaped before it is drawn, so
vowel signs sit where they belong, conjuncts stay joined, and right-to-left
runs come out right to left.

Two things can still go wrong, and the export tells you on the page rather than
leaving you to spot it:

* **A character the font cannot draw.** The export names the script.
* **Shaping unavailable.** A deployment without the text shaper falls back to
  drawing characters one at a time, which is wrong for those scripts.

If either warning appears, take Markdown or HTML instead: those keep the text
exactly as written, because they do not draw anything.

Administrators running outside the shipped Docker image need one setting —
`AEXY_PDF_FONT_DIR`, pointing at a directory holding a font that covers the
scripts you write in. Without it, non-Latin pages export blank. The image
itself needs nothing.

## Scheduled exports

A report can be delivered rather than fetched: a cadence and a list of
recipients, and it arrives whether or not anybody opens the app. That is the
right shape for a weekly number somebody has to look at, and the wrong shape
for anything confidential going to a list nobody prunes.

The Service Desk's digest is the same idea with its own settings — see
[Notifications and digests](./notifications-and-digests.md).

## Common mistakes

- **Exporting to PDF what you meant to keep editing.** Markdown round-trips;
  PDF does not.
- **Assuming an export sees more than you do.** It sees exactly what you do.
- **Forgetting the filter.** The export is the view.
- **Adding recipients to a scheduled report and not revisiting the list.** It
  keeps arriving, at whoever is on it, long after the reason has gone.
