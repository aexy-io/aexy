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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  pattern: RegExp;
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

  const navItems: NavItem[] = [
    {
      label: "Board",
      href: `/sprints/${projectId}/board`,
      icon: <LayoutGrid className="h-4 w-4" />,
      pattern: /\/board$/,
    },
    {
      label: "Backlog",
      href: `/sprints/${projectId}/backlog`,
      icon: <ListTodo className="h-4 w-4" />,
      pattern: /\/backlog$/,
    },
    {
      label: "Roadmap",
      href: `/sprints/${projectId}/roadmap`,
      icon: <Calendar className="h-4 w-4" />,
      pattern: /\/roadmap$/,
    },
    {
      label: "Sprints",
      href: `/sprints/${projectId}`,
      icon: <Layers className="h-4 w-4" />,
      pattern: /\/sprints\/[^\/]+$/,
    },
    {
      label: "Epics",
      href: `/epics`,
      icon: <Target className="h-4 w-4" />,
      pattern: /\/epics$/,
    },
  ];

  // Check if we're on a sprint detail page (has two path segments after projectId)
  const isSprintDetailPage = /\/sprints\/[^\/]+\/[^\/]+$/.test(pathname) &&
    !pathname.endsWith('/board') &&
    !pathname.endsWith('/backlog') &&
    !pathname.endsWith('/roadmap');

  // Don't show sub-nav on sprint detail pages (they have their own header)
  if (isSprintDetailPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Sub-navigation for planning views */}
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-[1800px] mx-auto px-4">
          <nav className="flex items-center gap-1 py-1 overflow-x-auto">
            {navItems.map((item) => {
              const isActive = item.pattern.test(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
