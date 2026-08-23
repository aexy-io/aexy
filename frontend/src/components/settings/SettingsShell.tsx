"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscription } from "@/hooks/useSubscription";
import { useAdmin } from "@/hooks/useAdmin";
import { useSettingsAccess } from "@/hooks/useSettingsAccess";
import { SettingsSidebar } from "./SettingsSidebar";
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
    /*
      This used to open with `min-h-screen` and its own sticky header carrying a
      back arrow, a "Settings" title link and a search box. All three are now the
      app topbar's job — it renders "Settings › Service Desk › Mailboxes", every
      crumb a link, on every route. Keeping the old bar left /settings showing
      two breadcrumb trails and, with the sidebar filter forty pixels below it,
      three separate search inputs on one screen.
    */
    <div className="bg-background">
      {/* Mobile: the settings sub-nav needs its own trigger. This is the
          settings tree, not the app sidebar, so it cannot share the topbar's. */}
      <div className="sticky top-14 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground">
              <Menu className="h-4 w-4" />
              All settings
            </button>
          </SheetTrigger>
          {/* Capped against the viewport as well as in pixels: a flat 280px on a
              320px phone leaves a 40px strip of page, which is not enough of the
              underlay left to read as "tap here to dismiss". */}
          <SheetContent side="left" className="w-[min(280px,85vw)] p-0">
            <SheetHeader className="px-4 pb-2 pt-4">
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
      </div>

      <div className="flex">
        {/* Desktop sidebar. Sticks below the 56px app topbar. */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[232px] shrink-0 overflow-y-auto border-r border-border px-2 md:block">
          <SettingsSidebar {...access} isEnterprise={isEnterprise} />
        </aside>

        {/* Content area. The width contract lives in `SettingsPage` (which
            centres itself) rather than here — a `max-w-*` on this element left a
            wide screen with all the content jammed left and a third of the
            viewport empty. */}
        {/* A plain div: AppShell owns the page's single <main>, and nesting a
            second one makes the "skip to main content" target ambiguous for
            screen readers. */}
        <div className="min-w-0 flex-1 px-6 py-6 md:px-10 md:py-8">
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
        </div>
      </div>
    </div>
  );
}
