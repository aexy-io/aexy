import { SiGithub } from "@icons-pack/react-simple-icons";
import { Globe } from "lucide-react";

export interface Author {
  slug: string;
  name: string;
  role: string;
  bio: string;
  avatarUrl: string;
  githubUrl: string;
  websiteUrl?: string;
}

// Single source of truth for content authors. Only verifiable, public facts —
// bios back the Person JSON-LD that AI engines cross-check against GitHub etc.
export const authors: Record<string, Author> = {
  bhanu: {
    slug: "bhanu",
    name: "Bhanu Pratap Chaudhary",
    role: "Founder, Aexy",
    bio: "Founder of Aexy, building the open-source AI company operating system. Long-time open-source developer — the code behind every claim on this page is public on GitHub.",
    avatarUrl: "https://github.com/bhanuc.png",
    githubUrl: "https://github.com/bhanuc",
    websiteUrl: "https://bhanu.io",
  },
};

export const defaultAuthor = authors.bhanu;

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    "@id": "https://aexy.io/#organization",
    name: "Aexy",
    url: "https://aexy.io",
    sameAs: ["https://github.com/aexy-io/aexy"],
    founder: { "@id": `https://aexy.io/about#${defaultAuthor.slug}` },
  };
}

export function personJsonLd(author: Author = defaultAuthor) {
  return {
    "@type": "Person",
    "@id": `https://aexy.io/about#${author.slug}`,
    name: author.name,
    jobTitle: author.role,
    description: author.bio,
    image: author.avatarUrl,
    url: author.websiteUrl ?? author.githubUrl,
    sameAs: [author.githubUrl, ...(author.websiteUrl ? [author.websiteUrl] : [])],
    worksFor: { "@id": "https://aexy.io/#organization" },
  };
}

export function AuthorByline({ author = defaultAuthor }: { author?: Author }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-5 sm:flex-row sm:items-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- external GitHub avatar, not worth allowlisting */}
      <img
        src={author.avatarUrl}
        alt={author.name}
        className="h-12 w-12 shrink-0 rounded-full border border-ledger-ink/15"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-ledger-ink">{author.name}</span>
          <span className="font-brand-mono text-xs text-ledger-ink/55">{author.role}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-ledger-ink/55">{author.bio}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <a href={author.githubUrl} className="text-ledger-ink/50 transition hover:text-ledger-green" aria-label={`${author.name} on GitHub`}>
          <SiGithub className="h-4 w-4" />
        </a>
        {author.websiteUrl && (
          <a href={author.websiteUrl} className="text-ledger-ink/50 transition hover:text-ledger-green" aria-label={`${author.name}'s website`}>
            <Globe className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
