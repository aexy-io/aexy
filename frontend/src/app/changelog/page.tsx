import fs from "fs";
import path from "path";
import { Metadata } from "next";
import { LedgerPage } from "@/components/landing/LedgerPage";

export const metadata: Metadata = {
  // Bare: the root title.template appends " | Aexy".
  title: "Changelog",
  description:
    "All notable changes to Aexy. Track new features, improvements, and fixes.",
  alternates: { canonical: "/changelog" },
};

interface Version {
  version: string;
  date: string;
  lines: string[];
}

function getChangelog(): string {
  const candidates = [
    path.join(process.cwd(), "public", "changelog.md"),
    path.join(process.cwd(), "..", "CHANGELOG.md"),
  ];
  for (const p of candidates) {
    try {
      return fs.readFileSync(p, "utf-8");
    } catch {
      continue;
    }
  }
  return "";
}

function parseVersions(raw: string): Version[] {
  const versions: Version[] = [];
  let current: Version | null = null;
  for (const line of raw.split("\n")) {
    const m = line.match(/^## \[(.+?)\]\s*-\s*(.+)$/);
    if (m) {
      if (current) versions.push(current);
      current = { version: m[1], date: m[2].trim(), lines: [] };
      continue;
    }
    if (
      line.startsWith("# ") ||
      line.startsWith("All notable") ||
      line.startsWith("The format")
    )
      continue;
    if (current) current.lines.push(line);
  }
  if (current) versions.push(current);
  return versions;
}

function renderInline(text: string): React.ReactNode {
  const elements: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex)
      elements.push(text.slice(lastIndex, match.index));
    if (match[1]) {
      elements.push(
        <strong key={key++} className="font-semibold text-ledger-ink">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      elements.push(
        <code
          key={key++}
          className="rounded-[2px] bg-ledger-ink/[0.06] px-1.5 py-0.5 font-brand-mono text-[13px] text-ledger-green"
        >
          {match[4]}
        </code>
      );
    } else if (match[5]) {
      elements.push(
        <a
          key={key++}
          href={match[7]}
          className="text-ledger-green hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {match[6]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) elements.push(text.slice(lastIndex));
  return elements.length === 1 ? elements[0] : <>{elements}</>;
}

/* Change-type tags are mono uppercase marks in the margin of the ledger, not
   coloured pills. Ledger-red is reserved for what a ledger subtracts — a
   removal — so every other kind carries the same green mark and unknown kinds
   (section headings that aren't a keep-a-changelog category) stay in ink. */
const SECTION_STYLES: Record<string, string> = {
  added: "text-ledger-green",
  changed: "text-ledger-green",
  fixed: "text-ledger-green",
  removed: "text-ledger-red",
  deprecated: "text-ledger-red",
  security: "text-ledger-green",
};

/**
 * A section heading: the kind as a mono tag, the rest as a heading.
 *
 * Entries here are written as `### Fixed: your work list showed every
 * workspace`, and the whole string used to go in the tag — so the colour
 * lookup never matched anything and every section came out the same grey,
 * while the actual heading was set in 12px tag text. The kind is worth
 * marking; the sentence after it is a heading and should read like one.
 */
function SectionHeading({ title }: { title: string }) {
  const [, kind, rest] = title.match(/^([A-Za-z]+):\s*(.+)$/) ?? [];
  const label = kind ?? title;
  const color = SECTION_STYLES[label.toLowerCase()] || "text-ledger-ink/55";

  return (
    <h3 className="mt-10 mb-4 first:mt-0 flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <span
        className={`font-brand-mono text-xs font-medium uppercase tracking-[0.18em] ${color}`}
      >
        {label}
      </span>
      {rest && (
        <span className="font-display text-lg font-semibold tracking-tight text-ledger-ink">
          {renderInline(rest)}
        </span>
      )}
    </h3>
  );
}

function renderVersionContent(lines: string[]) {
  const elements: React.ReactNode[] = [];
  let key = 0;
  let listItems: React.ReactNode[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="space-y-2.5 mb-6 max-w-[68ch]">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  /**
   * The source is hard-wrapped at about 80 columns, and each of those lines
   * used to become its own `<p>`. That put a paragraph break every eight or
   * nine words, which is what made the page read as a stack of fragments
   * rather than prose — and it re-wrapped at whatever width the reader's
   * screen happened to be, so the breaks landed mid-sentence. A paragraph is
   * everything up to a blank line, as markdown means it.
   */
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      elements.push(
        <p
          key={key++}
          className="mb-5 max-w-[68ch] text-[15px] leading-[1.75] text-ledger-ink/65"
        >
          {renderInline(paragraph.join(" "))}
        </p>
      );
      paragraph = [];
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    const h3 = line.match(/^### (.+)$/);
    if (h3) {
      flushAll();
      elements.push(<SectionHeading key={key++} title={h3[1]} />);
      continue;
    }

    const h4 = line.match(/^#### (.+)$/);
    if (h4) {
      flushAll();
      elements.push(
        <h4
          key={key++}
          className="mt-6 mb-2 font-display text-base font-semibold text-ledger-ink/90"
        >
          {renderInline(h4[1])}
        </h4>
      );
      continue;
    }

    if (line.trim() === "---") {
      flushAll();
      elements.push(<hr key={key++} className="my-8 border-ledger-ink/12" />);
      continue;
    }

    if (line.match(/^- /)) {
      flushParagraph();
      listItems.push(
        <li
          key={key++}
          className="flex items-start gap-3 text-[15px] leading-[1.75] text-ledger-ink/65"
        >
          <span className="mt-[10px] h-1.5 w-1.5 flex-shrink-0 rounded-[1px] bg-ledger-green" />
          <span>{renderInline(line.slice(2))}</span>
        </li>
      );
      continue;
    }

    if (line.trim() === "") {
      flushAll();
      continue;
    }

    // A continuation of the paragraph being built, not a paragraph of its own.
    flushList();
    paragraph.push(line.trim());
  }

  flushAll();
  return elements;
}

export default function ChangelogPage() {
  const content = getChangelog();
  const versions = parseVersions(content);

  return (
    /* No `overflow-hidden` anywhere on this page's wrappers: it makes the
       element the scroll container for everything inside, which silently
       disables the sticky version rail. */
    <LedgerPage>

      {/* Hero */}
      <section className="px-6 pt-32 pb-12">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
            What&apos;s New
          </div>
          <h1 className="mb-4 font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Changelog
          </h1>
          <p className="mx-auto max-w-xl text-lg text-ledger-ink/55">
            All notable changes to Aexy, documented.
          </p>
        </div>
      </section>

      {/* Versions.

          The page is wide, the prose is not: paragraphs are capped at ~68
          characters because that is what stays readable, and the width buys a
          version rail beside the text instead of longer lines. On a long entry
          the rail sticks, so you can always see which release you are reading.

          Releases are ruled off from each other with hairlines rather than
          boxed into cards — a ledger is a list of entries, and the rules keep
          the version numbers in one column the way a ledger keeps its dates. */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-6xl border-t border-ledger-ink/12">
          {versions.map((version, i) => (
            <div
              key={version.version}
              className="border-b border-ledger-ink/12 py-10 md:py-12 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10"
            >
              <div className="mb-6 lg:mb-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 lg:sticky lg:top-28 lg:block">
                  <span className="font-brand-mono text-2xl font-semibold tracking-tight text-ledger-ink lg:block">
                    v{version.version}
                  </span>
                  <span className="font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-ink/50 lg:mt-2 lg:block">
                    {version.date}
                  </span>
                  {i === 0 && (
                    <span className="font-brand-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ledger-green lg:mt-3 lg:inline-block">
                      Latest
                    </span>
                  )}
                </div>
              </div>
              <div className="min-w-0">{renderVersionContent(version.lines)}</div>
            </div>
          ))}
        </div>
      </section>

    </LedgerPage>
  );
}
