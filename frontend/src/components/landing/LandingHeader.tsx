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
  { href: "/products/tracking", label: "Activity Tracking" },
  { href: "/products/planning", label: "Sprint Planning" },
  { href: "/products/tickets", label: "Ticketing" },
  { href: "/products/forms", label: "Forms" },
  { href: "/products/docs", label: "Documentation" },
  { href: "/products/reviews", label: "Performance Reviews" },
  { href: "/products/learning", label: "Learning & Dev" },
  { href: "/products/hiring", label: "Technical Hiring" },
  { href: "/products/crm", label: "CRM" },
  { href: "/products/email-marketing", label: "Email Marketing" },
  { href: "/products/ai-agents", label: "AI Agents" },
  { href: "/products/mcp", label: "MCP Server" },
  { href: "/products/gtm-intelligence", label: "GTM Intelligence" },
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
            <SheetContent
              side="right"
              className="w-[300px] overflow-y-auto border-ledger-ink/12 bg-ledger-paper text-ledger-ink"
            >
              <SheetTitle className="mb-6 font-display text-lg font-semibold text-ledger-ink">
                Menu
              </SheetTitle>
              <nav className="flex flex-col gap-4 font-brand-mono text-sm uppercase tracking-[0.1em] text-ledger-ink/75">
                {NAV_LINKS.map(([href, label]) => (
                  <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
                    {label}
                  </Link>
                ))}
                <a
                  href="https://github.com/aexy-io/aexy"
                  className="flex items-center gap-2"
                >
                  <SiGithub className="h-4 w-4" />
                  GitHub
                </a>
                {showGetStarted && (
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="mt-2 inline-flex items-center justify-center gap-2 rounded-[2px] bg-ledger-green px-4 py-2.5 font-sans font-semibold normal-case tracking-normal text-ledger-paper"
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
