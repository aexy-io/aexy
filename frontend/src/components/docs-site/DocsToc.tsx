"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TocHeading {
  id: string;
  text: string;
  depth: 2 | 3;
}

interface DocsTocProps {
  headings: TocHeading[];
}

export function DocsToc({ headings }: DocsTocProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const top = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
          );
          setActiveId(top.target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: [0, 1] },
    );

    const els: Element[] = [];
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) {
        observer.observe(el);
        els.push(el);
      }
    }
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <div className="text-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3">
        On this page
      </div>
      <ul className="space-y-1.5 border-l border-white/[0.06]">
        {headings.map((h) => (
          <li
            key={h.id}
            className={cn(h.depth === 3 && "pl-3")}
          >
            <a
              href={`#${h.id}`}
              className={cn(
                "block py-1 -ml-px border-l border-transparent pl-3 text-white/45 hover:text-white/80 transition-colors leading-snug",
                activeId === h.id && "text-primary-400 border-primary-400",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
