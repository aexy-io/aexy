"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Menu, Settings } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscription } from "@/hooks/useSubscription";
import { useAdmin } from "@/hooks/useAdmin";
import { useSettingsAccess } from "@/hooks/useSettingsAccess";
import { SettingsSidebar } from "./SettingsSidebar";
import { SettingsSearch } from "./SettingsSearch";
import { SettingsAccessDenied, SettingsSkeleton } from "./SettingsPrimitives";

interface SettingsShellProps {
  children: React.ReactNode;
}

export function SettingsShell({ children }: SettingsShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { currentWorkspaceId } = useWorkspace();
  const { isEnterprise } = useSubscription(currentWorkspaceId);
  const { isAdmin: isPlatformAdmin } = useAdmin();
  // Real permissions, not a role guess: each page declares what it needs and
  // `canAccessSettingsItem` decides. Previously a single `isAdmin` boolean gated
  // 10 of 30 pages and left the rest open to everyone.
  const { permissions, isWorkspaceOwner } = usePermissions(currentWorkspaceId);

  const access = { permissions, isOwner: isWorkspaceOwner, isPlatformAdmin };

  // Guarding here covers all 39 pages at once. Doing it per page would mean 39
  // chances to forget, and hiding a link was never access control anyway — the
  // URL still resolves, and the page used to render and then fail piecemeal as
  // each of its API calls came back 403.
  const { allowed, isLoading: accessLoading } = useSettingsAccess();

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Mobile hamburger */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition md:hidden">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetHeader className="px-4 pt-4 pb-2">
                <SheetTitle className="text-base">Settings</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto px-2 pb-4">
                <SettingsSidebar
                  {...access}
                  isEnterprise={isEnterprise}
                  onItemClick={() => setSheetOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>

          {/* Back to dashboard */}
          <SimpleTooltip content="Back to dashboard" side="bottom">
            <Link
              href="/dashboard"
              aria-label="Back to dashboard"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition hidden md:flex"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </SimpleTooltip>

          {/* The title is a link, so the index is reachable from any sub-page —
              it is the only route that lists all 29 destinations. */}
          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:text-foreground"
          >
            <Settings className="h-5 w-5 text-muted-foreground" aria-hidden />
            <span className="text-base font-semibold text-foreground">Settings</span>
          </Link>

          {/* Search */}
          <div className="ml-auto w-full max-w-xs">
            <SettingsSearch {...access} />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-[232px] shrink-0 border-r border-border overflow-y-auto sticky top-[57px] h-[calc(100vh-57px)] px-2">
          <SettingsSidebar {...access} isEnterprise={isEnterprise} />
        </aside>

        {/* Content area. The width contract lives in `SettingsPage` (which
            centres itself) rather than here — a `max-w-*` on this element left a
            wide screen with all the content jammed left and a third of the
            viewport empty. */}
        <main className="min-w-0 flex-1 px-6 py-6 md:px-10 md:py-8">
          {/* Permissions arrive over the network; showing the denial while they
              load would flash it at people who do have access. */}
          {accessLoading ? (
            <div className="mx-auto w-full max-w-3xl">
              <SettingsSkeleton rows={2} />
            </div>
          ) : allowed ? (
            children
          ) : (
            <SettingsAccessDenied />
          )}
        </main>
      </div>
    </div>
  );
}
