import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeHighlight from "rehype-highlight";
import Link from "next/link";

interface DocsArticleProps {
  content: string;
  /**
   * The page's own slug, e.g. `guides/deployment`. Needed to resolve relative
   * image paths: an image written beside the prose as
   * `./images/x.png` in `docs/guides/deployment.md` lives at
   * `/docs/guides/images/x.png` once served.
   */
  slug?: string;
}

function rewriteInternalLink(href: string): string {
  if (!href) return href;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("#")) return href;
  if (href.startsWith("mailto:")) return href;
  let stripped = href.replace(/^\.\//, "");
  if (stripped.endsWith(".md")) stripped = stripped.slice(0, -3);
  if (stripped.endsWith("/README")) stripped = stripped.slice(0, -7);
  if (stripped === "README") return "/handbook";
  if (stripped.startsWith("/")) return stripped;
  return `/handbook/${stripped}`;
}

/**
 * Where an image referenced from a doc actually lives.
 *
 * Markdown images are written relative to the source file, so the same link
 * has to work in an editor and on the site. The pages are served from
 * `/handbook/<slug>` but their assets from `/docs/<path>`, so a raw relative
 * `src` resolves against the wrong prefix and every image on the page is
 * broken — silently, because a missing image renders as nothing much.
 */
function rewriteImageSrc(src: string, slug?: string): string {
  if (!src) return src;
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  if (src.startsWith("data:")) return src;
  if (src.startsWith("/")) return src;

  const cleaned = src.replace(/^\.\//, "");
  const dir = (slug || "").split("/").slice(0, -1).join("/");
  return dir ? `/docs/${dir}/${cleaned}` : `/docs/${cleaned}`;
}

export function DocsArticle({ content, slug }: DocsArticleProps) {
  return (
    <article className="docs-article max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: "append",
              properties: { className: ["heading-anchor"], "aria-hidden": "true", tabIndex: -1 },
              content: { type: "text", value: "#" },
            },
          ],
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        components={{
          h1: ({ children, id }) => (
            <h1
              id={id}
              className="font-display text-4xl md:text-5xl font-bold text-ledger-ink tracking-tight mb-4 mt-0"
            >
              {children}
            </h1>
          ),
          h2: ({ children, id }) => (
            <h2
              id={id}
              className="group font-display text-2xl font-semibold text-ledger-ink tracking-tight mt-12 mb-4 pb-2 border-b border-ledger-ink/12 scroll-mt-24"
            >
              {children}
            </h2>
          ),
          h3: ({ children, id }) => (
            <h3
              id={id}
              className="group font-display text-lg font-semibold text-ledger-ink/95 mt-8 mb-3 scroll-mt-24"
            >
              {children}
            </h3>
          ),
          h4: ({ children, id }) => (
            <h4
              id={id}
              className="text-base font-semibold text-ledger-ink/90 mt-6 mb-2 scroll-mt-24"
            >
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="text-ledger-ink/70 leading-relaxed my-4 text-[15px]">{children}</p>
          ),
          a: ({ href, children, ...props }) => {
            const url = rewriteInternalLink(href || "");
            const isExternal = url.startsWith("http://") || url.startsWith("https://");
            if (isExternal) {
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ledger-green hover:text-[#095A31] underline underline-offset-4 decoration-ledger-green/30 hover:decoration-ledger-green/60 transition"
                >
                  {children}
                </a>
              );
            }
            return (
              <Link
                href={url}
                className="text-ledger-green hover:text-[#095A31] underline underline-offset-4 decoration-ledger-green/30 hover:decoration-ledger-green/60 transition"
              >
                {children}
              </Link>
            );
          },
          ul: ({ children }) => (
            <ul className="my-4 space-y-2 ml-6 list-disc marker:text-ledger-green/60 text-[15px] text-ledger-ink/70">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 space-y-2 ml-6 list-decimal marker:text-ledger-ink/50 text-[15px] text-ledger-ink/70">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-6 border-l-2 border-ledger-green bg-ledger-green/5 pl-5 pr-4 py-3 text-ledger-ink/75 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-10 border-ledger-ink/12" />,
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto rounded-[2px] border border-ledger-ink/12">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-ledger-ink/[0.04] border-b border-ledger-ink/12">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-ledger-ink/[0.08]">{children}</tbody>
          ),
          tr: ({ children }) => <tr className="hover:bg-ledger-ink/[0.02] transition-colors">{children}</tr>,
          th: ({ children }) => (
            <th className="px-4 py-3 text-left font-brand-mono font-medium text-ledger-ink/70 text-[12px] uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-ledger-ink/70 align-top">{children}</td>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded-[2px] bg-ledger-ink/[0.06] border border-ledger-ink/12 text-ledger-green text-[0.875em] font-mono">
                  {children}
                </code>
              );
            }
            return <code className={className}>{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="my-6 overflow-x-auto rounded-[4px] border border-ledger-ink/25 bg-ledger-pane p-4 text-[13px] leading-relaxed font-mono text-[#E6EDE7]">
              {children}
            </pre>
          ),
          img: ({ src, alt }) => (
            // A plain <img>: markdown images may point at any external host, and
            // next/image would need every one allowlisted.
            //
            // The src is rewritten because a doc writes its images relative to
            // the source file — the same link has to work in an editor and on
            // the site — while pages serve from /handbook/<slug> and their
            // assets from /docs/<path>. Passing it through unchanged, which is
            // what this did, resolved every relative image against the wrong
            // prefix and broke all of them at once.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={rewriteImageSrc(typeof src === "string" ? src : "", slug)}
              alt={alt || ""}
              loading="lazy"
              className="my-6 rounded-[2px] border border-ledger-ink/12 max-w-full"
            />
          ),
          strong: ({ children }) => (
            <strong className="text-ledger-ink font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="text-ledger-ink/80 italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
