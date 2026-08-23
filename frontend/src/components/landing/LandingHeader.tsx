"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, GitBranch, Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { SiGithub } from "@icons-pack/react-simple-icons";

// The header stays minimal on purpose — Products/Solutions are single links,
// and the full per-page catalogues below render in the footer instead of
// dropdown menus. marketingRouteParity.test.ts slices this file from the
// first product-links declaration to the solution-links declaration to
// assert every product route exists and is in the sitemap, so the two
// constants below (and their order) are load-bearing: keep them in this file
// even though only the footer renders them, and don't spell their
// declarations out in prose above them — the scan keys on first occurrence.

const productLinks = [
  // A curated dozen for the footer. The full catalogue is /products — 29 rows
  // in one footer column was 29 stacked links at 375px, which is a list nobody
  // reads rather than navigation. `marketingRouteParity.test.ts` checks every
  // product page is reachable from here *or* from the index.
  { href: "/products/planning", label: "Sprint Planning" },
  { href: "/products/tickets", label: "Ticketing" },
  { href: "/products/analytics", label: "Engineering Insights" },
  { href: "/products/crm", label: "CRM" },
  { href: "/products/service-desk", label: "Service Desk" },
  { href: "/products/gtm-intelligence", label: "GTM Intelligence" },
  { href: "/products/email-marketing", label: "Email Marketing" },
  { href: "/products/docs", label: "Documentation" },
  { href: "/products/tables", label: "Tables" },
  { href: "/products/ai-agents", label: "AI Agents" },
  { href: "/products/automations", label: "Automations" },
  { href: "/products/mcp", label: "MCP Server" },
];

const solutionLinks = [
  { href: "/for/founders", label: "Founders" },
  { href: "/for/revenue-teams", label: "Revenue Teams" },
  { href: "/for/operations", label: "Operations" },
  { href: "/for/ai-agent-builders", label: "AI Agent Builders" },
  { href: "/for/engineering-managers", label: "Engineering Managers" },
  { href: "/for/developers", label: "Developers" },
  { href: "/for/engineering-leaders", label: "CTOs & VPs" },
  { href: "/for/people-ops", label: "HR & People Ops" },
];

const NAV_LINKS: Array<[string, string]> = [
  ["/#platform", "Products"],
  ["/#solutions", "Solutions"],
  ["/pricing", "Pricing"],
  ["/handbook", "Docs"],
];

interface LandingHeaderProps {
  showGetStarted?: boolean;
}

export function LandingHeader({ showGetStarted = true }: LandingHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-ledger-ink/12 bg-ledger-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="rounded-[2px] bg-ledger-ink p-2 text-ledger-paper">
            <GitBranch className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">Aexy</span>
        </Link>

        <nav className="hidden items-center gap-6 font-brand-mono text-xs font-medium uppercase tracking-[0.12em] text-ledger-ink/65 md:flex">
          {NAV_LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-ledger-ink transition">
              {label}
            </Link>
          ))}
          <a
            href="https://github.com/aexy-io/aexy"
            className="flex items-center gap-1.5 hover:text-ledger-ink transition"
          >
            <SiGithub className="h-4 w-4" />
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {showGetStarted && (
            <Link
              href="/login"
              className="hidden items-center gap-2 whitespace-nowrap rounded-[2px] bg-ledger-green px-4 py-2 text-sm font-semibold text-ledger-paper transition hover:bg-[#095A31] md:inline-flex"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="rounded-[2px] border border-ledger-ink/20 p-2 text-ledger-ink/80 md:hidden"
                aria-label="Toggle menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            {/*
              `px-6 py-5` is not decoration. `sheetVariants` deliberately drops
              `p-6` from its base so a sheet can lay out SheetHeader/Body/Footer
              itself — and this one used neither, so it inherited nothing: the
              title sat at y=0 against the top of the screen, every nav link
              started 1px from the panel edge, and the "Get started" button ran
              flush into the right edge of the viewport.

              The width is capped against the viewport as well as in pixels. A
              flat 300px leaves a 375px phone a 75px strip of page, and a 320px
              one barely 20px — not enough of the underlay left to read as
              "tap here to dismiss".
            */}
            <SheetContent
              side="right"
              className="w-[min(300px,85vw)] overflow-y-auto border-ledger-ink/12 bg-ledger-paper px-6 py-5 text-ledger-ink"
            >
              {/* pr-10 keeps the title clear of the absolutely-positioned close
                  button, which sits at right-4 top-4 inside this same box. */}
              <SheetTitle className="mb-5 pr-10 font-display text-lg font-semibold text-ledger-ink">
                Menu
              </SheetTitle>
              {/* gap-1 with py-3 rather than gap-4 with none: the links were
                  ~20px tall, less than half the 44px touch target a thumb
                  needs, with 16px of dead space between them. Same rhythm on
                  screen, and every row now clears 44. */}
              <nav className="-mx-2 flex flex-col gap-1 font-brand-mono text-sm uppercase tracking-[0.1em] text-ledger-ink/75">
                {NAV_LINKS.map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-[2px] px-2 py-3 transition hover:bg-ledger-ink/5 hover:text-ledger-ink"
                  >
                    {label}
                  </Link>
                ))}
                <a
                  href="https://github.com/aexy-io/aexy"
                  className="flex items-center gap-2 rounded-[2px] px-2 py-3 transition hover:bg-ledger-ink/5 hover:text-ledger-ink"
                >
                  <SiGithub className="h-4 w-4" />
                  GitHub
                </a>
                {showGetStarted && (
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="mx-2 mt-4 inline-flex items-center justify-center gap-2 rounded-[2px] bg-ledger-green px-4 py-3 font-sans font-semibold normal-case tracking-normal text-ledger-paper transition hover:bg-[#095A31]"
                  >
                    Get started
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

const resourceLinks: Array<[string, string]> = [
  ["/guides/what-is-an-ai-company-operating-system", "What is a Company OS?"],
  ["/guides/best-ai-company-operating-systems-2026", "Best Company OS 2026"],
  ["/guides/ai-agents-for-business-workflows", "AI Agents Guide"],
  ["/guides/self-hosted-ai-company-os", "Self-Hosting Guide"],
  ["/story", "Our Story"],
  ["/mission", "Mission"],
  ["/manifesto", "Company OS Manifesto"],
  ["/use-cases/replace-saas-sprawl", "Replace SaaS Sprawl"],
  ["/use-cases/company-knowledge-graph", "Knowledge Graph"],
  ["/compare/hubspot", "Compare HubSpot"],
  ["/compare/jira", "Compare Jira"],
  ["/pricing", "Pricing"],
  ["/handbook", "Documentation"],
  ["/changelog", "Changelog"],
];

const companyLinks: Array<[string, string]> = [
  ["/about", "About"],
  ["/blog", "Blog"],
  ["/careers", "Careers"],
  ["/contact", "Contact"],
];

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h4 className="font-brand-mono text-xs font-medium uppercase tracking-[0.16em] text-ledger-ink/50">
        {title}
      </h4>
      <ul className="mt-4 space-y-2.5 text-sm text-ledger-ink/70">
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} className="hover:text-ledger-green transition">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-ledger-ink/12 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-10 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-[2px] bg-ledger-ink p-2 text-ledger-paper">
                <GitBranch className="h-5 w-5" />
              </div>
              <span className="font-display text-lg font-semibold">Aexy</span>
            </div>
            <p className="mb-4 max-w-sm text-sm leading-6 text-ledger-ink/60">
              The open-source AI company OS. One system of record for CRM, engineering, workflows, people, and AI agents.
            </p>
            <a
              href="https://github.com/aexy-io/aexy"
              className="inline-flex items-center gap-2 font-brand-mono text-xs uppercase tracking-[0.14em] text-ledger-green hover:text-ledger-ink transition"
            >
              <SiGithub className="h-4 w-4" />
              github.com/aexy-io/aexy
            </a>
          </div>
          <FooterColumn
            title="Products"
            links={[
              ...productLinks,
              { href: "/products", label: "All products →" },
              { href: "/ai-company-os", label: "AI Company OS" },
              { href: "/open-source-company-os", label: "Open Source Company OS" },
            ]}
          />
          <FooterColumn title="Solutions" links={solutionLinks} />
          <FooterColumn
            title="Resources"
            links={resourceLinks.map(([href, label]) => ({ href, label }))}
          />
          <FooterColumn
            title="Company"
            links={companyLinks.map(([href, label]) => ({ href, label }))}
          />
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-ledger-ink/12 pt-6 md:flex-row">
          <p className="text-sm text-ledger-ink/50">&copy; 2026 Aexy. All rights reserved.</p>
          <div className="flex items-center gap-6 text-sm text-ledger-ink/50">
            <Link href="/privacy" className="hover:text-ledger-ink transition">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-ledger-ink transition">Terms of Service</Link>
            <Link href="/security" className="hover:text-ledger-ink transition">Security</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
