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

function getSectionBadge(title: string) {
  const styles: Record<string, string> = {
    added:
      "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    changed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    fixed: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    removed: "bg-red-500/20 text-red-400 border-red-500/30",
    deprecated:
      "bg-orange-500/20 text-orange-400 border-orange-500/30",
    security:
      "bg-purple-500/20 text-purple-400 border-purple-500/30",
  };
  const color =
    styles[title.toLowerCase()] ||
    "bg-white/10 text-white/70 border-white/20";
  return (
    <span
      className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full border ${color}`}
    >
      {title}
    </span>
  );
}

function renderVersionContent(lines: string[]) {
  const elements: React.ReactNode[] = [];
  let key = 0;
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="space-y-1.5 mb-3">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const h3 = line.match(/^### (.+)$/);
    if (h3) {
      flushList();
      elements.push(
        <div key={key++} className="mt-5 mb-3 first:mt-0">
          {getSectionBadge(h3[1])}
        </div>
      );
      continue;
    }

    const h4 = line.match(/^#### (.+)$/);
    if (h4) {
      flushList();
      elements.push(
        <h4
          key={key++}
          className="text-[15px] font-medium text-white/90 mt-4 mb-2"
        >
          {h4[1]}
        </h4>
      );
      continue;
    }

    if (line.trim() === "---") {
      flushList();
      elements.push(
        <hr key={key++} className="border-white/[0.06] my-4" />
      );
      continue;
    }

    if (line.match(/^- /)) {
      listItems.push(
        <li
          key={key++}
          className="text-white/60 text-sm flex items-start gap-2"
        >
          <span className="text-primary-500/70 mt-[7px] flex-shrink-0 w-1 h-1 rounded-full bg-current" />
          <span>{renderInline(line.slice(2))}</span>
        </li>
      );
      continue;
    }

    if (line.trim() === "") {
      flushList();
      continue;
    }

    flushList();
    elements.push(
      <p key={key++} className="text-white/60 text-sm mb-2">
        {renderInline(line)}
      </p>
    );
  }

  flushList();
  return elements;
}

export default function ChangelogPage() {
  const content = getChangelog();
  const versions = parseVersions(content);

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
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

      {/* Versions */}
      <section className="pb-24 px-6 relative">
        <div className="max-w-3xl mx-auto">
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[15px] top-0 bottom-0 w-px bg-white/[0.06] hidden md:block" />

            {versions.map((version, i) => (
              <div key={version.version} className="relative mb-10 md:pl-12">
                {/* Timeline dot */}
                <div className="absolute left-[11px] top-2 w-[9px] h-[9px] rounded-full bg-primary-500/60 ring-4 ring-[#0a0a0f] hidden md:block" />

                {/* Version card */}
                <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] p-6 hover:border-white/[0.12] transition-colors">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-xl font-bold text-white">
                      v{version.version}
                    </span>
                    <span className="text-sm text-white/40">
                      {version.date}
                    </span>
                    {i === 0 && (
                      <span className="px-2 py-0.5 text-[11px] font-medium bg-primary-500/20 text-primary-400 rounded-full border border-primary-500/30">
                        Latest
                      </span>
                    )}
                  </div>
                  {renderVersionContent(version.lines)}
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
