import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface DocsBreadcrumbProps {
  section: string;
  title: string;
}

export function DocsBreadcrumb({ section, title }: DocsBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-[13px] text-white/40 mb-6 flex-wrap">
      <Link href="/handbook" className="hover:text-white/70 transition">
        Docs
      </Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-white/55">{section}</span>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-white/80">{title}</span>
    </nav>
  );
}
