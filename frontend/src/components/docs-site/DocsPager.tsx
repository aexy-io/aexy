import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { DocPagerEntry } from "@/lib/docs";

interface DocsPagerProps {
  pager: DocPagerEntry;
}

export function DocsPager({ pager }: DocsPagerProps) {
  if (!pager.prev && !pager.next) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-16 pt-8 border-t border-ledger-ink/12">
      {pager.prev ? (
        <Link
          href={`/handbook/${pager.prev.slug}`}
          className="group flex flex-col gap-1 p-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-card hover:border-ledger-green/40 hover:bg-ledger-green/[0.04] transition"
        >
          <span className="flex items-center gap-2 font-brand-mono text-[11px] uppercase tracking-[0.1em] text-ledger-ink/50 group-hover:text-ledger-green transition">
            <ArrowLeft className="h-3.5 w-3.5" />
            Previous
          </span>
          <span className="text-ledger-ink/85 font-medium group-hover:text-ledger-ink transition">
            {pager.prev.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
      {pager.next ? (
        <Link
          href={`/handbook/${pager.next.slug}`}
          className="group flex flex-col gap-1 p-4 rounded-[2px] border border-ledger-ink/12 bg-ledger-card hover:border-ledger-green/40 hover:bg-ledger-green/[0.04] transition md:text-right md:items-end"
        >
          <span className="flex items-center gap-2 font-brand-mono text-[11px] uppercase tracking-[0.1em] text-ledger-ink/50 group-hover:text-ledger-green transition">
            Next
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
          <span className="text-ledger-ink/85 font-medium group-hover:text-ledger-ink transition">
            {pager.next.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
