import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

/**
 * Renders a public community post as markdown.
 *
 * Every post here is user-authored and served to anonymous readers on a
 * crawlable page, which sets the whole shape of this component:
 *
 *  - **No raw HTML.** react-markdown ignores embedded HTML unless `rehype-raw`
 *    is added, and it deliberately is not. Untrusted markdown in, inert React
 *    elements out — there is no `dangerouslySetInnerHTML` anywhere on this path.
 *  - **No remote images.** An `<img>` an author controls is a way to log every
 *    visitor's IP from a page anyone can read, so images degrade to their alt
 *    text. See `img` below.
 *  - **Soft line breaks are breaks** (`remark-breaks`). Forum posts are written
 *    like messages, not like CommonMark documents; without this, every post
 *    already in the database — all of which were authored against a
 *    plain-text renderer that preserved newlines — would silently reflow into
 *    run-on paragraphs.
 *  - **Headings start at h3.** The page's h1 is the topic title and its h2s are
 *    section headings, so an author writing `# Added` gets an h3 rather than a
 *    second h1 competing with the title in the document outline.
 *
 * Server-rendered along with the rest of the thread, so a crawler and a reader
 * without JavaScript both get the fully rendered post, not the source.
 */

/**
 * Schemes safe to turn into a link. `javascript:`, `data:` and `vbscript:` are
 * the ones that must never become an href; `mailto:`/`tel:` carry no such risk
 * and a support address in a post is worth being clickable.
 */
function isExternalHttp(href: string | undefined): href is string {
  return !!href && /^(?:https?|mailto|tel):/i.test(href.trim());
}

/** A same-site path like `/docs/x`. Excludes `//evil.com` and `/\evil.com`. */
function isInternalPath(href: string | undefined): href is string {
  return (
    !!href &&
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.startsWith("/\\")
  );
}

const components = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-4 last:mb-0">{children}</p>
  ),

  a: ({ href, children }: { href?: string; children?: ReactNode }) => {
    if (isInternalPath(href)) {
      return (
        <a href={href} className="underline underline-offset-2 hover:opacity-70">
          {children}
        </a>
      );
    }
    if (!isExternalHttp(href)) {
      // Unknown or unsafe scheme: show the text, drop the link.
      return <>{children}</>;
    }
    return (
      <a
        href={href}
        target="_blank"
        // `ugc` and `nofollow` because anyone who can sign in can post here —
        // an open forum that passes ranking signal is a link-spam target. They
        // apply to every outbound link, including a staff-written one, since a
        // post carries no author role we could tell them apart by.
        rel="nofollow ugc noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-70"
        style={{ color: "var(--community-accent, #0B6B3A)" }}
      >
        {children}
      </a>
    );
  },

  // Demoted one level below the page's own headings; see the note above.
  h1: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-2 mt-6 font-display text-lg font-semibold first:mt-0">{children}</h3>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h4 className="mb-2 mt-6 font-display text-base font-semibold first:mt-0">{children}</h4>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h5 className="mb-2 mt-5 font-display text-[15px] font-semibold first:mt-0">{children}</h5>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h6 className="mb-2 mt-5 text-[15px] font-semibold first:mt-0">{children}</h6>
  ),
  h5: ({ children }: { children?: ReactNode }) => (
    <h6 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide first:mt-0">
      {children}
    </h6>
  ),
  h6: ({ children }: { children?: ReactNode }) => (
    <h6 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide first:mt-0">
      {children}
    </h6>
  ),

  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-4 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-4 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,

  // GFM task lists. Read-only: the box reflects what the author wrote and is
  // not a control the reader can operate.
  input: ({ checked, type }: { checked?: boolean; type?: string }) =>
    type === "checkbox" ? (
      <input
        type="checkbox"
        checked={!!checked}
        readOnly
        disabled
        className="mr-1.5 -translate-y-px align-middle accent-ledger-ink"
      />
    ) : null,

  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="mb-4 border-l-2 border-ledger-ink/20 pl-4 text-ledger-ink/70 last:mb-0">
      {children}
    </blockquote>
  ),

  // Styled as inline unconditionally. react-markdown v9 dropped the `inline`
  // prop, and the obvious replacement — testing for a `language-*` class — is
  // wrong: that class only appears when the fence names a language, so a bare
  // ``` fence and an indented block both look inline. The `pre` below strips
  // this pill back off whatever it wraps, which is true of every block form.
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded-[2px] bg-ledger-ink/[0.06] px-1 py-0.5 font-brand-mono text-[13px]">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="mb-4 overflow-x-auto rounded-[3px] border border-ledger-ink/12 bg-ledger-ink/[0.04] p-3 font-brand-mono text-[13px] leading-6 last:mb-0 [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),

  // A wide table must scroll inside its own box rather than widening the thread.
  table: ({ children }: { children?: ReactNode }) => (
    <div className="mb-4 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-ledger-ink/12 bg-ledger-ink/[0.04] px-2.5 py-1.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-ledger-ink/12 px-2.5 py-1.5 align-top">{children}</td>
  ),

  hr: () => <hr className="my-6 border-ledger-ink/12" />,

  // Not rendered as an image on purpose — see the note above. The alt text is
  // kept so the post still says what was meant to be there.
  img: ({ alt }: { alt?: string }) =>
    alt ? <span className="text-ledger-ink/50">[{alt}]</span> : null,
};

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="break-words text-[15px] leading-7 text-ledger-ink/85">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
