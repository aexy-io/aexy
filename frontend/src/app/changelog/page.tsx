import fs from "fs";
import path from "path";
import { Metadata } from "next";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

export const metadata: Metadata = {
  title: "Changelog - Aexy",
  description:
    "All notable changes to Aexy. Track new features, improvements, and fixes.",
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
        <strong key={key++} className="text-white font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      elements.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 bg-white/10 rounded text-primary-400 text-[13px] font-mono"
        >
          {match[4]}
        </code>
      );
    } else if (match[5]) {
      elements.push(
        <a
          key={key++}
          href={match[7]}
          className="text-primary-400 hover:underline"
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

const SECTION_STYLES: Record<string, string> = {
  added: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  changed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  fixed: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  removed: "bg-red-500/20 text-red-400 border-red-500/30",
  deprecated: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  security: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

/**
 * A section heading: the kind as a coloured pill, the rest as a heading.
 *
 * Entries here are written as `### Fixed: your work list showed every
 * workspace`, and the whole string used to go in the pill — so the colour
 * lookup never matched anything and every section came out the same grey,
 * while the actual heading was set in 12px pill text. The kind is worth
 * colouring; the sentence after it is a heading and should read like one.
 */
function SectionHeading({ title }: { title: string }) {
  const [, kind, rest] = title.match(/^([A-Za-z]+):\s*(.+)$/) ?? [];
  const label = kind ?? title;
  const color =
    SECTION_STYLES[label.toLowerCase()] || "bg-white/10 text-white/70 border-white/20";

  return (
    <h3 className="mt-10 mb-4 first:mt-0 flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <span
        className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full border ${color}`}
      >
        {label}
      </span>
      {rest && (
        <span className="text-lg font-semibold text-white tracking-tight">
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
          className="text-white/70 text-[15px] leading-[1.75] mb-5 max-w-[68ch]"
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
          className="text-base font-semibold text-white/90 mt-6 mb-2"
        >
          {renderInline(h4[1])}
        </h4>
      );
      continue;
    }

    if (line.trim() === "---") {
      flushAll();
      elements.push(<hr key={key++} className="border-white/[0.06] my-8" />);
      continue;
    }

    if (line.match(/^- /)) {
      flushParagraph();
      listItems.push(
        <li
          key={key++}
          className="text-white/70 text-[15px] leading-[1.75] flex items-start gap-3"
        >
          <span className="text-primary-500/70 mt-[10px] flex-shrink-0 w-1.5 h-1.5 rounded-full bg-current" />
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
    /* No `overflow-hidden` on this wrapper: it makes the element the scroll
       container for everything inside, which silently disables the sticky
       version rail. The blurred blobs it was clipping sit in their own
       `fixed inset-0 overflow-hidden` layer below, so they stay clipped. */
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-12 px-6 relative">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500/20 to-purple-500/20 border border-primary-500/30 rounded-full text-primary-400 text-sm mb-6">
            What&apos;s New
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Changelog
          </h1>
          <p className="text-lg text-white/50 max-w-xl mx-auto">
            All notable changes to Aexy, documented.
          </p>
        </div>
      </section>

      {/* Versions.

          The page is wide, the prose is not: paragraphs are capped at ~68
          characters because that is what stays readable, and the width buys a
          version rail beside the text instead of longer lines. On a long entry
          the rail sticks, so you can always see which release you are reading. */}
      <section className="pb-24 px-6 relative">
        <div className="max-w-6xl mx-auto">
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[15px] top-0 bottom-0 w-px bg-white/[0.06] hidden md:block" />

            {versions.map((version, i) => (
              <div key={version.version} className="relative mb-12 md:pl-12">
                {/* Timeline dot */}
                <div className="absolute left-[11px] top-2 w-[9px] h-[9px] rounded-full bg-primary-500/60 ring-4 ring-[#0a0a0f] hidden md:block" />

                {/* Version card */}
                <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] p-6 md:p-8 lg:p-10 hover:border-white/[0.12] transition-colors">
                  <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
                    <div className="mb-6 lg:mb-0">
                      <div className="lg:sticky lg:top-28 flex flex-wrap items-baseline gap-x-3 gap-y-2 lg:block">
                        <span className="text-2xl font-bold text-white tracking-tight lg:block">
                          v{version.version}
                        </span>
                        <span className="text-sm text-white/40 lg:block lg:mt-1">
                          {version.date}
                        </span>
                        {i === 0 && (
                          <span className="px-2 py-0.5 text-[11px] font-medium bg-primary-500/20 text-primary-400 rounded-full border border-primary-500/30 lg:inline-block lg:mt-3">
                            Latest
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0">{renderVersionContent(version.lines)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
