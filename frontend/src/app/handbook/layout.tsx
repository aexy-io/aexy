import "highlight.js/styles/github-dark-dimmed.css";
import "./docs.css";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";
import { displayFont, brandMonoFont } from "@/components/landing/fonts";
import { DocsSidebar } from "@/components/docs-site/DocsSidebar";
import { DocsSearch } from "@/components/docs-site/DocsSearch";
import { DocsMobileNav } from "@/components/docs-site/DocsMobileNav";
import { getDocIndex, getSearchIndex } from "@/lib/docs";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const { sections } = getDocIndex();
  const searchEntries = getSearchIndex();

  return (
    <div
      className={`theme-ledger ${displayFont.variable} ${brandMonoFont.variable} min-h-screen bg-ledger-paper text-ledger-ink antialiased`}
    >
      <LandingHeader />

      <DocsMobileNav sections={sections} searchEntries={searchEntries} />

      <div className="relative pt-[64px]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-8 lg:gap-12">
            {/* Sidebar */}
            <aside className="hidden lg:block sticky top-[80px] self-start max-h-[calc(100vh-100px)] overflow-y-auto py-8 pr-2 -ml-2">
              <div className="mb-6 px-3">
                <DocsSearch entries={searchEntries} variant="button" />
              </div>
              <DocsSidebar sections={sections} />
            </aside>

            {/* Main column */}
            <main className="py-8 lg:py-12 min-w-0">{children}</main>
          </div>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
}
