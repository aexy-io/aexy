"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { DocsSidebar } from "./DocsSidebar";
import { DocsSearch } from "./DocsSearch";
import type { DocSection, DocSearchEntry } from "@/lib/docs";

interface DocsMobileNavProps {
  sections: DocSection[];
  searchEntries: DocSearchEntry[];
}

export function DocsMobileNav({ sections, searchEntries }: DocsMobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden flex items-center justify-between gap-3 px-4 py-3 sticky top-[64px] z-20 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/[0.06]">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/70 text-sm"
      >
        <Menu className="h-4 w-4" />
        Menu
      </button>
      <div className="flex-1 max-w-xs">
        <DocsSearch entries={searchEntries} variant="button" />
      </div>

      {open && (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[80%] max-w-[320px] bg-[#0a0a0f] border-r border-white/[0.06] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
              <span className="text-white font-semibold">Documentation</span>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-white/50 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4" onClick={() => setOpen(false)}>
              <DocsSidebar sections={sections} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
