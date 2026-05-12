import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { DocPagerEntry } from "@/lib/docs";

interface DocsPagerProps {
  pager: DocPagerEntry;
}

export function DocsPager({ pager }: DocsPagerProps) {
  if (!pager.prev && !pager.next) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-16 pt-8 border-t border-white/[0.06]">
      {pager.prev ? (
        <Link
          href={`/handbook/${pager.prev.slug}`}
          className="group flex flex-col gap-1 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-primary-500/30 hover:bg-primary-500/[0.04] transition"
        >
          <span className="flex items-center gap-2 text-[12px] text-white/40 group-hover:text-primary-400/80 transition">
            <ArrowLeft className="h-3.5 w-3.5" />
            Previous
          </span>
          <span className="text-white/85 font-medium group-hover:text-white transition">
            {pager.prev.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
      {pager.next ? (
        <Link
          href={`/handbook/${pager.next.slug}`}
          className="group flex flex-col gap-1 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-primary-500/30 hover:bg-primary-500/[0.04] transition md:text-right md:items-end"
        >
          <span className="flex items-center gap-2 text-[12px] text-white/40 group-hover:text-primary-400/80 transition">
            Next
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
          <span className="text-white/85 font-medium group-hover:text-white transition">
            {pager.next.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
