import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function DocsNotFound() {
  return (
    <div className="py-20 text-center max-w-xl mx-auto">
      <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/20 to-purple-500/20 border border-primary-500/30 items-center justify-center mb-6">
        <FileQuestion className="h-8 w-8 text-primary-400" />
      </div>
      <h1 className="text-3xl font-bold text-white mb-2">Doc not found</h1>
      <p className="text-white/55 mb-6">
        That page either moved or never existed. Try searching, or head back to the index.
      </p>
      <Link
        href="/handbook"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to docs home
      </Link>
    </div>
  );
}
