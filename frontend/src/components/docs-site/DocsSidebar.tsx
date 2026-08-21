"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import type { DocSection } from "@/lib/docs";
import { cn } from "@/lib/utils";

interface DocsSidebarProps {
  sections: DocSection[];
}

export function DocsSidebar({ sections }: DocsSidebarProps) {
  const pathname = usePathname();
  const currentSlug = pathname?.startsWith("/handbook/") ? pathname.slice(10) : "";

  const sectionContainingCurrent =
    sections.find((s) => s.items.some((i) => i.slug === currentSlug))?.title ?? null;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const section of sections) {
      next[section.title] =
        sectionContainingCurrent !== null && section.title !== sectionContainingCurrent;
    }
    setCollapsed(next);
  }, [sectionContainingCurrent, sections]);

  return (
    <nav className="space-y-6 text-sm">
      <Link
        href="/handbook"
        className={cn(
          "block px-3 py-2 rounded-[2px] text-ledger-ink/70 hover:text-ledger-ink hover:bg-ledger-ink/[0.04] transition",
          pathname === "/handbook" && "text-ledger-ink bg-ledger-ink/[0.06]",
        )}
      >
        Docs Home
      </Link>
      {sections.map((section) => {
        const isCollapsed = collapsed[section.title];
        return (
          <div key={section.title}>
            <button
              onClick={() =>
                setCollapsed((c) => ({ ...c, [section.title]: !c[section.title] }))
              }
              className="flex items-center justify-between w-full px-3 mb-2 font-brand-mono text-[11px] font-medium uppercase tracking-wider text-ledger-ink/50 hover:text-ledger-ink/75 transition"
            >
              <span>{section.title}</span>
              <span className="text-ledger-ink/50 text-[10px]">{isCollapsed ? "+" : "−"}</span>
            </button>
            {!isCollapsed && (
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = currentSlug === item.slug;
                  return (
                    <li key={item.slug}>
                      <Link
                        href={`/handbook/${item.slug}`}
                        className={cn(
                          "block px-3 py-1.5 rounded-[2px] text-ledger-ink/60 hover:text-ledger-ink hover:bg-ledger-ink/[0.04] transition-colors leading-snug",
                          active && "text-ledger-green bg-ledger-green/10 border-l-2 border-ledger-green pl-[10px] font-medium",
                        )}
                      >
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
