import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeHighlight from "rehype-highlight";
import Link from "next/link";

interface DocsArticleProps {
  content: string;
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

export function DocsArticle({ content }: DocsArticleProps) {
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
            // Using plain img tag since markdown images may point to any external host
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src || ""}
              alt={alt || ""}
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
