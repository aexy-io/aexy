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
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { SettingsSidebar } from "./SettingsSidebar";
import { SettingsSearch } from "./SettingsSearch";

interface SettingsShellProps {
  children: React.ReactNode;
}

export function SettingsShell({ children }: SettingsShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { currentWorkspaceId, currentWorkspace } = useWorkspace();
  const { isEnterprise } = useSubscription(currentWorkspaceId);

  const developerId =
    typeof window !== "undefined"
      ? localStorage.getItem("developer_id")
      : null;
  const member = currentWorkspace?.members?.find(
    (m) => m.developer_id === developerId
  );
  const isAdmin = member?.role === "owner" || member?.role === "admin";

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
                  isAdmin={isAdmin}
                  isEnterprise={isEnterprise}
                  onItemClick={() => setSheetOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>

          {/* Back to dashboard */}
          <Link
            href="/dashboard"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition hidden md:flex"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold text-foreground">Settings</h1>
          </div>

          {/* Search */}
          <div className="ml-auto w-full max-w-xs">
            <SettingsSearch isAdmin={isAdmin} />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-[240px] shrink-0 border-r border-border overflow-y-auto sticky top-[57px] h-[calc(100vh-57px)] px-2">
          <SettingsSidebar isAdmin={isAdmin} isEnterprise={isEnterprise} />
        </aside>

        {/* Content area */}
        <main className="flex-1 min-w-0 p-6 md:p-8 max-w-5xl">
          {children}
        </main>
      </div>
    </div>
  );
}
