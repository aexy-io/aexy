import "highlight.js/styles/github-dark-dimmed.css";
import "./docs.css";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";
import { DocsSidebar } from "@/components/docs-site/DocsSidebar";
import { DocsSearch } from "@/components/docs-site/DocsSearch";
import { DocsMobileNav } from "@/components/docs-site/DocsMobileNav";
import { getDocIndex, getSearchIndex } from "@/lib/docs";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const { sections } = getDocIndex();
  const searchEntries = getSearchIndex();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-[600px] h-[600px] bg-primary-500/[0.08] rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/[0.06] rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

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
