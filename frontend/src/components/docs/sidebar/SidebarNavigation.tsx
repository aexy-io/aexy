"use client";

import Link from "next/link";
import { Search, Home, HardDrive } from "lucide-react";

interface SidebarNavigationProps {
  onOpenSearch: () => void;
}

export function SidebarNavigation({ onOpenSearch }: SidebarNavigationProps) {
  return (
    <nav className="px-2 py-2 space-y-0.5">
      {/* Search */}
      <button
        onClick={onOpenSearch}
        className="w-full flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left text-sm">Search</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded border border-border">
          <span className="text-xs">Cmd</span>
          <span>K</span>
        </kbd>
      </button>

      {/* Home */}
      <Link
        href="/docs"
        className="flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
      >
        <Home className="h-4 w-4" />
        <span className="text-sm">Home</span>
      </Link>

      {/* Files — the Drive surface used to be reachable only by URL,
          which the audit flagged as an IA confusion. Surfacing it
          inside the docs nav makes the relationship explicit:
          docs are the writing surface, Files is the storage surface
          and they share the same workspace. */}
      <Link
        href="/docs/drive"
        className="flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
      >
        <HardDrive className="h-4 w-4" />
        <span className="text-sm">Files</span>
      </Link>

      {/* No Inbox entry. It opened a docs-only notification list backed by a
          `document_notifications` table that carried exactly one thing — "an AI
          proposed an edit" — with no email, no per-user preference and no place in
          the main notification bell. That event now goes through
          NotificationService, so document notifications live in the same inbox as
          everything else rather than in a panel you had to know to open. */}
    </nav>
  );
}
