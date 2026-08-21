import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function DocsNotFound() {
  return (
    <div className="py-20 text-center max-w-xl mx-auto">
      <div className="inline-flex w-16 h-16 rounded-[2px] bg-ledger-card border border-ledger-ink/12 items-center justify-center mb-6">
        <FileQuestion className="h-8 w-8 text-ledger-green" />
      </div>
      <h1 className="font-display text-3xl font-bold text-ledger-ink mb-2">Doc not found</h1>
      <p className="text-ledger-ink/60 mb-6">
        That page either moved or never existed. Try searching, or head back to the index.
      </p>
      <Link
        href="/handbook"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-[2px] bg-ledger-green text-ledger-paper font-semibold hover:bg-[#095A31] transition"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to docs home
      </Link>
    </div>
  );
}
