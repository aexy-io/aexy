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
              className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-4 mt-0"
            >
              {children}
            </h1>
          ),
          h2: ({ children, id }) => (
            <h2
              id={id}
              className="group text-2xl font-semibold text-white tracking-tight mt-12 mb-4 pb-2 border-b border-white/[0.06] scroll-mt-24"
            >
              {children}
            </h2>
          ),
          h3: ({ children, id }) => (
            <h3
              id={id}
              className="group text-lg font-semibold text-white/95 mt-8 mb-3 scroll-mt-24"
            >
              {children}
            </h3>
          ),
          h4: ({ children, id }) => (
            <h4
              id={id}
              className="text-base font-semibold text-white/90 mt-6 mb-2 scroll-mt-24"
            >
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="text-white/65 leading-relaxed my-4 text-[15px]">{children}</p>
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
                  className="text-primary-400 hover:text-primary-300 underline underline-offset-4 decoration-primary-400/30 hover:decoration-primary-400/60 transition"
                >
                  {children}
                </a>
              );
            }
            return (
              <Link
                href={url}
                className="text-primary-400 hover:text-primary-300 underline underline-offset-4 decoration-primary-400/30 hover:decoration-primary-400/60 transition"
              >
                {children}
              </Link>
            );
          },
          ul: ({ children }) => (
            <ul className="my-4 space-y-2 ml-6 list-disc marker:text-primary-500/50 text-[15px] text-white/65">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 space-y-2 ml-6 list-decimal marker:text-white/40 text-[15px] text-white/65">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-6 border-l-2 border-primary-500/50 bg-primary-500/5 pl-5 pr-4 py-3 rounded-r-lg text-white/75 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-10 border-white/[0.06]" />,
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto rounded-xl border border-white/[0.08]">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/[0.04] border-b border-white/[0.08]">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-white/[0.04]">{children}</tbody>
          ),
          tr: ({ children }) => <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>,
          th: ({ children }) => (
            <th className="px-4 py-3 text-left font-semibold text-white/85 text-[13px] uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-white/65 align-top">{children}</td>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded-md bg-white/[0.08] border border-white/[0.06] text-primary-300 text-[0.875em] font-mono">
                  {children}
                </code>
              );
            }
            return <code className={className}>{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="my-6 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0d1117]/80 p-4 text-[13px] leading-relaxed font-mono">
              {children}
            </pre>
          ),
          img: ({ src, alt }) => (
            // Using plain img tag since markdown images may point to any external host
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src || ""}
              alt={alt || ""}
              className="my-6 rounded-xl border border-white/[0.08] max-w-full"
            />
          ),
          strong: ({ children }) => (
            <strong className="text-white font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="text-white/80 italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
