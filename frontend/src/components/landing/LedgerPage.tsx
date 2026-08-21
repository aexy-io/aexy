import { displayFont, brandMonoFont } from "@/components/landing/fonts";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";

// Root wrapper for every "Open Ledger" marketing page: the theme scope (which
// also restyles shared previews like McpChatPreview via globals.css), the
// display/mono font variables, the paper canvas, and the page chrome.
// Server component — pages compose it as their outermost element.
//
// It renders the header and footer itself, rather than letting each page do
// it, so the document landmarks cannot come out wrong. ARIA only grants
// <header> the `banner` role and <footer> the `contentinfo` role when they are
// NOT inside <main>. When pages rendered all three as siblings under a single
// <main>, every marketing page lost both landmarks and <main> itself became
// meaningless by spanning the whole document. Owning the structure here makes
// that impossible to reintroduce: header and footer stay outside, and only the
// page's own content is <main>.
//
// JSON-LD <script> tags that pages render before their content end up inside
// <main>. That is valid — script is flow content, and structured data is read
// wherever it appears in the document.
export function LedgerPage({
  children,
  className = "",
  chrome = true,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * Set false for standalone pages with no site nav (/login, /invite/[token]).
   * They get a <main> as the outer element instead, which keeps them a single
   * landmark and — importantly — preserves the flex layouts they pass through
   * `className`, since their content stays a direct child.
   */
  chrome?: boolean;
}) {
  const base = `theme-ledger ${displayFont.variable} ${brandMonoFont.variable} min-h-screen bg-ledger-paper text-ledger-ink antialiased`;

  if (!chrome) {
    return <main className={`${base} ${className}`}>{children}</main>;
  }

  return (
    <div className={`${base} ${className}`}>
      <LandingHeader />
      <main>{children}</main>
      <LandingFooter />
    </div>
  );
}
