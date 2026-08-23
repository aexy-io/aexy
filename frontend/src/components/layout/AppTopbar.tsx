"use client";

/**
 * The topbar the app has never had.
 *
 * `AppShell` rendered a sidebar and a bare `<main>`; the only header was
 * `AppHeader.tsx`, 485 lines with zero imports anywhere — written to solve this
 * and never wired up. On mobile the shell drew a 64px bar containing a hamburger
 * and the literal string "Aexy".
 *
 * Four things live here because they belong to the app rather than to any page:
 *
 *  - **Where am I.** A breadcrumb trail derived from the pathname
 *    (`lib/routeLabels`), so all 277 routes get one without a single page edit.
 *    On `/sprints/<id>/<id>/analytics` nothing previously told you where you
 *    were or how to go up a level.
 *  - **Search.** The command palette existed but was invisible: ⌘K with no
 *    on-screen affordance anywhere except a `<kbd>` buried in the sprint board.
 *    A product that requires you to guess a keystroke requires training.
 *  - **Help.** The handbook has 31 documents and the app linked to none of them.
 *    The per-module deep links land with the module-help registry; the menu
 *    frame is here.
 *  - **Notifications**, which previously only existed inside the sidebar footer.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight, Search, HelpCircle, BookOpen, Keyboard, MessageSquarePlus } from "lucide-react";

import { breadcrumbsFor, labelFor } from "@/lib/routeLabels";
import type { Breadcrumb } from "@/components/ui/page";
import { openCommandPalette, openKeyboardShortcuts } from "@/lib/appCommands";
import { getModifierKey } from "@/hooks/useKeyboardShortcuts";
import { useFeedbackStore } from "@/stores/feedbackStore";
import { NotificationBell } from "@/components/notifications";
import { cn } from "@/lib/utils";

export function AppTopbar({
  userId,
  leading,
  breadcrumbs,
}: {
  userId?: string | null;
  /** Mobile sidebar trigger, supplied by the shell so this file owns no nav state. */
  leading?: React.ReactNode;
  /** A page's own trail, when it knows a name the pathname cannot supply. */
  breadcrumbs?: Breadcrumb[] | null;
}) {
  const pathname = usePathname() || "/";
  const derived = useMemo(() => breadcrumbsFor(pathname), [pathname]);
  const trail = breadcrumbs?.length ? breadcrumbs : derived;
  const current = useMemo(() => labelFor(pathname), [pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6">
      {leading}

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        {trail.length > 0 ? (
          <ol className="flex min-w-0 items-center gap-1 text-sm">
            {trail.map((crumb, i) => {
              // The page you are on is never a link to itself, whatever the
              // caller passed. `ui/breadcrumb` forwards trails written when the
              // last crumb was just another styled span.
              const isCurrent = i === trail.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
                  {/* Every separator hides on the same breakpoint as the
                      crumbs it separates. Below `sm` only the current page is
                      shown, so a visible chevron would render as a leading "›"
                      with nothing before it. */}
                  {i > 0 && (
                    <ChevronRight
                      className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/50 sm:block"
                      aria-hidden
                    />
                  )}
                  {crumb.href && !isCurrent ? (
                    <Link
                      href={crumb.href}
                      // Intermediate crumbs collapse before the current page
                      // does: on a narrow window the answer to "where am I"
                      // matters more than the answer to "what is above me".
                      className="hidden truncate text-muted-foreground transition-colors hover:text-foreground sm:block"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={cn(
                        "truncate",
                        isCurrent
                          ? "font-medium text-foreground"
                          : "hidden text-muted-foreground sm:block",
                      )}
                      {...(isCurrent ? { "aria-current": "page" as const } : {})}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          current && <span className="truncate text-sm font-medium text-foreground">{current}</span>
        )}
      </nav>

      <SearchAffordance />
      <HelpMenu />
      <NotificationBell developerId={userId} />
    </header>
  );
}

function SearchAffordance() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-neutral hover:text-foreground sm:w-56 sm:justify-between"
    >
      <span className="flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Search or jump to…</span>
        <span className="sr-only sm:hidden">Search</span>
      </span>
      <kbd className="hidden shrink-0 rounded border border-border px-1.5 font-brand-mono text-[11px] text-muted-foreground sm:inline">
        {getModifierKey()}K
      </kbd>
    </button>
  );
}

function HelpMenu() {
  const [open, setOpen] = useState(false);
  const openFeedback = useFeedbackStore((state) => state.open);

  const items: Array<{ label: string; icon: typeof BookOpen; onSelect: () => void; href?: string }> = [
    { label: "Handbook", icon: BookOpen, href: "/handbook", onSelect: () => {} },
    { label: "Keyboard shortcuts", icon: Keyboard, onSelect: openKeyboardShortcuts },
    { label: "Send feedback", icon: MessageSquarePlus, onSelect: () => openFeedback() },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Help"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <HelpCircle className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <>
          {/* Click-away. A plain overlay rather than a focus-trap library: this
              menu has three items and no form. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1 w-52 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
          >
            {items.map(({ label, icon: Icon, href, onSelect }) => {
              const className = cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent"
              );
              return href ? (
                <Link
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  role="menuitem"
                  className={className}
                  onClick={() => setOpen(false)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  {label}
                </Link>
              ) : (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  className={className}
                  onClick={() => {
                    setOpen(false);
                    onSelect();
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
