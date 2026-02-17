"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Mail,
  Bell,
  Building2,
  Users,
  ArrowLeft,
  Shield,
  Loader2,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

const adminNavItems = [
  {
    title: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Email Logs",
    href: "/admin/emails",
    icon: Mail,
  },
  {
    title: "Notifications",
    href: "/admin/notifications",
    icon: Bell,
  },
  {
    title: "Workspaces",
    href: "/admin/workspaces",
    icon: Building2,
  },
  {
    title: "Users",
    href: "/admin/users",
    icon: Users,
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isAuthLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [mounted, isAuthLoading, isAuthenticated, router]);

  useEffect(() => {
    if (mounted && !isAuthLoading && !isAdminLoading && isAuthenticated && !isAdmin) {
      router.push("/dashboard");
    }
  }, [mounted, isAuthLoading, isAdminLoading, isAuthenticated, isAdmin, router]);

  // Loading state
  if (!mounted || isAuthLoading || isAdminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  // Not authenticated or not admin
  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Header */}
      <header className="border-b border-border bg-muted/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Shield className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-foreground">Platform Admin</h1>
                  <p className="text-muted-foreground text-sm">{user?.email}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-muted/30 min-h-[calc(100vh-65px)] sticky top-[65px]">
          <nav className="p-4 space-y-1">
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground hover:text-foreground hover:bg-accent/50 transition",
                    "group"
                  )}
                >
                  <Icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition" />
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
