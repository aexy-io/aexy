"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid,
  Layers,
  ListTodo,
  Calendar,
  Target,
  Settings,
  BookOpen,
  Package,
  Bug,
  MoreHorizontal,
  Vote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  pattern: RegExp;
  group?: "planning" | "tracking" | "delivery";
}

export default function ProjectLayoutClient({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const pathname = usePathname();
  const { projectId } = params;
  const [showMore, setShowMore] = useState(false);

  const navItems: NavItem[] = [
    {
      label: "Board",
      href: `/sprints/${projectId}/board`,
      icon: <LayoutGrid className="h-4 w-4" />,
      pattern: /\/board$/,
      group: "planning",
    },
    {
      label: "Backlog",
      href: `/sprints/${projectId}/backlog`,
      icon: <ListTodo className="h-4 w-4" />,
      pattern: /\/backlog$/,
      group: "planning",
    },
    {
      label: "Sprints",
      href: `/sprints/${projectId}`,
      icon: <Layers className="h-4 w-4" />,
      pattern: /\/sprints\/[^\/]+$/,
      group: "planning",
    },
    {
      label: "Stories",
      href: `/sprints/${projectId}/stories`,
      icon: <BookOpen className="h-4 w-4" />,
      pattern: /\/stories$/,
      group: "tracking",
    },
    {
      label: "Bugs",
      href: `/sprints/${projectId}/bugs`,
      icon: <Bug className="h-4 w-4" />,
      pattern: /\/bugs$/,
      group: "tracking",
    },
    {
      label: "Goals",
      href: `/sprints/${projectId}/goals`,
      icon: <Target className="h-4 w-4" />,
      pattern: /\/goals$/,
      group: "delivery",
    },
    {
      label: "Releases",
      href: `/sprints/${projectId}/releases`,
      icon: <Package className="h-4 w-4" />,
      pattern: /\/releases$/,
      group: "delivery",
    },
    {
      label: "Timeline",
      href: `/sprints/${projectId}/timeline`,
      icon: <Calendar className="h-4 w-4" />,
      pattern: /\/timeline$/,
      group: "delivery",
    },
    {
      label: "Roadmap",
      href: `/sprints/${projectId}/roadmap`,
      icon: <Vote className="h-4 w-4" />,
      pattern: /\/roadmap$/,
      group: "delivery",
    },
  ];

  // Pages that should show the sub-nav
  const subNavPages = ['/board', '/backlog', '/timeline', '/roadmap', '/stories', '/bugs', '/goals', '/releases'];
  const showSubNav = subNavPages.some(page => pathname.endsWith(page)) ||
    /\/sprints\/[^\/]+$/.test(pathname);

  // Don't show sub-nav on sprint detail pages (they have their own header)
  if (!showSubNav) {
    return <>{children}</>;
  }

  // Group nav items
  const planningItems = navItems.filter(item => item.group === "planning");
  const trackingItems = navItems.filter(item => item.group === "tracking");
  const deliveryItems = navItems.filter(item => item.group === "delivery");

  return (
    <div className="min-h-screen bg-background">
      {/* Sub-navigation for planning views */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-[1800px] mx-auto px-4">
          <nav className="flex items-center gap-1 py-1 overflow-x-auto">
            {/* Planning group */}
            <div className="flex items-center gap-1">
              {planningItems.map((item) => {
                const isActive = item.pattern.test(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-accent mx-2" />

            {/* Tracking group */}
            <div className="flex items-center gap-1">
              {trackingItems.map((item) => {
                const isActive = item.pattern.test(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-accent mx-2" />

            {/* Delivery group */}
            <div className="flex items-center gap-1">
              {deliveryItems.map((item) => {
                const isActive = item.pattern.test(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
