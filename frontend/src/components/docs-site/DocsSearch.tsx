"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, X } from "lucide-react";
import Fuse from "fuse.js";
import type { DocSearchEntry } from "@/lib/docs";

interface DocsSearchProps {
  entries: DocSearchEntry[];
  variant?: "button" | "input";
}

export function DocsSearch({ entries, variant = "button" }: DocsSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fuse = useMemo(
    () =>
      new Fuse(entries, {
        keys: [
          { name: "title", weight: 3 },
          { name: "section", weight: 1 },
          { name: "headings", weight: 2 },
          { name: "description", weight: 1.5 },
        ],
        threshold: 0.4,
        includeMatches: false,
        minMatchCharLength: 2,
      }),
    [entries],
  );

  const results = useMemo(() => {
    if (!query.trim()) return entries.slice(0, 8).map((e) => ({ item: e }));
    return fuse.search(query).slice(0, 12);
  }, [query, fuse, entries]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const navigate = (slug: string) => {
    setOpen(false);
    router.push(`/handbook/${slug}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      navigate(results[activeIndex].item.slug);
    }
  };

  return (
    <>
      {variant === "input" ? (
        <button
          onClick={() => setOpen(true)}
          className="group flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.05] transition text-left"
        >
          <Search className="h-4 w-4 text-white/40 group-hover:text-white/60 transition" />
          <span className="flex-1 text-white/40 group-hover:text-white/60 transition text-sm">
            Search docs…
          </span>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-[11px] text-white/50 font-mono">
            ⌘K
          </kbd>
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.15] hover:bg-white/[0.06] transition text-sm text-white/60 hover:text-white"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[10px] text-white/50 font-mono">
            ⌘K
          </kbd>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-2xl bg-[#12121a]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 px-4 border-b border-white/[0.06]">
              <Search className="h-4 w-4 text-white/40" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search documentation…"
                className="flex-1 bg-transparent py-4 text-white placeholder:text-white/30 outline-none text-sm"
              />
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <div className="px-4 py-12 text-center text-white/40 text-sm">
                  No results for &ldquo;{query}&rdquo;
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {results.map((r, i) => (
                    <li key={r.item.slug}>
                      <button
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => navigate(r.item.slug)}
                        className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition ${
                          i === activeIndex
                            ? "bg-primary-500/[0.12] border border-primary-500/30"
                            : "border border-transparent hover:bg-white/[0.04]"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            i === activeIndex
                              ? "bg-primary-500/20 text-primary-300"
                              : "bg-white/[0.04] text-white/50"
                          }`}
                        >
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-[11px] text-white/40 mb-0.5">
                            {r.item.section}
                          </div>
                          <div className="text-sm font-medium text-white truncate">
                            {r.item.title}
                          </div>
                          {r.item.description && (
                            <div className="text-[12.5px] text-white/50 mt-0.5 line-clamp-2 leading-snug">
                              {r.item.description}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.06] text-[11px] text-white/40 bg-white/[0.015]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] font-mono">↑↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] font-mono">↵</kbd>
                  open
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] font-mono">esc</kbd>
                close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
