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
          "block px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.04] transition",
          pathname === "/handbook" && "text-white bg-white/[0.06]",
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
              className="flex items-center justify-between w-full px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40 hover:text-white/60 transition"
            >
              <span>{section.title}</span>
              <span className="text-white/30 text-[10px]">{isCollapsed ? "+" : "−"}</span>
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
                          "block px-3 py-1.5 rounded-md text-white/55 hover:text-white hover:bg-white/[0.04] transition-colors leading-snug",
                          active && "text-white bg-primary-500/10 border-l-2 border-primary-500 pl-[10px] font-medium",
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
