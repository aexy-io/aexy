import { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsArticle } from "@/components/docs-site/DocsArticle";
import { DocsToc } from "@/components/docs-site/DocsToc";
import { DocsBreadcrumb } from "@/components/docs-site/DocsBreadcrumb";
import { DocsPager } from "@/components/docs-site/DocsPager";
import {
  getDocContent,
  getDocIndex,
  getAllDocSlugs,
  extractHeadings,
} from "@/lib/docs";

interface DocPageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
  return getAllDocSlugs().map((slug) => ({
    slug: slug.split("/"),
  }));
}

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { slug } = await params;
  const slugStr = slug.join("/");
  const meta = getDocIndex().lookup[slugStr];
  if (!meta) return { title: "Not found - Aexy Docs" };

  const content = getDocContent(slugStr) || "";
  let description = meta.description;
  if (!description) {
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("|")) {
        description = trimmed.replace(/[*_`[\]()]/g, "").slice(0, 180);
        break;
      }
    }
  }

  return {
    title: `${meta.title} - Aexy Docs`,
    description: description || `${meta.title} documentation for Aexy`,
    openGraph: {
      title: `${meta.title} - Aexy Docs`,
      description: description || undefined,
      type: "article",
    },
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;
  const slugStr = slug.join("/");
  const content = getDocContent(slugStr);
  const meta = getDocIndex().lookup[slugStr];

  if (!content || !meta) {
    notFound();
  }

  const headings = extractHeadings(content);
  const pager = getDocIndex().pager[slugStr] || { prev: null, next: null };

  // Strip the leading H1 from the markdown — we render breadcrumb + title separately.
  const lines = content.split("\n");
  const firstH1 = lines.findIndex((l) => l.match(/^#\s+/));
  let bodyContent = content;
  if (firstH1 !== -1) {
    bodyContent = lines.slice(firstH1 + 1).join("\n").replace(/^\n+/, "");
  }

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_220px] gap-12">
      <div className="min-w-0">
        <DocsBreadcrumb section={meta.section} title={meta.title} />

        <header className="mb-8 pb-8 border-b border-white/[0.06]">
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-3">
            {meta.title}
          </h1>
          {meta.description && (
            <p className="text-lg text-white/55 leading-relaxed">{meta.description}</p>
          )}
        </header>

        <DocsArticle content={bodyContent} />

        <DocsPager pager={pager} />
      </div>

      {/* TOC */}
      {headings.length > 0 && (
        <aside className="hidden xl:block">
          <div className="sticky top-[88px] max-h-[calc(100vh-108px)] overflow-y-auto pb-8">
            <DocsToc headings={headings} />
          </div>
        </aside>
      )}
    </div>
  );
}
