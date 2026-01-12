"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Target,
  Calendar,
  Ticket,
  FileText,
  ClipboardCheck,
  GraduationCap,
  Building2,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SubMenu {
  title: string;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  color: string;
  submenu?: SubMenu[];
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "from-blue-500 to-blue-600" },
  {
    href: "/tracking",
    label: "Tracking",
    icon: Target,
    color: "from-emerald-500 to-emerald-600",
    submenu: [
      { title: "My Tracking", href: "/tracking" },
      { title: "Standups", href: "/tracking/standups" },
      { title: "Time Reports", href: "/tracking/time" },
      { title: "Blockers", href: "/tracking/blockers" },
    ],
  },
  { href: "/sprints", label: "Planning", icon: Calendar, color: "from-green-500 to-green-600" },
  { href: "/tickets", label: "Tickets", icon: Ticket, color: "from-pink-500 to-pink-600" },
  { href: "/docs", label: "Docs", icon: FileText, color: "from-indigo-500 to-indigo-600" },
  {
    href: "/reviews",
    label: "Reviews",
    icon: ClipboardCheck,
    color: "from-orange-500 to-orange-600",
    submenu: [
      { title: "Performance Reviews", href: "/reviews" },
      { title: "Management View", href: "/reviews/manage" },
      { title: "Manage Cycles", href: "/reviews/cycles" },
      { title: "My Goals", href: "/reviews/goals" },
      { title: "Feedback Requests", href: "/reviews/peer-requests" },
    ],
  },
  { href: "/learning", label: "Learning", icon: GraduationCap, color: "from-rose-500 to-rose-600" },
  {
    href: "/hiring",
    label: "Hiring",
    icon: Users,
    color: "from-cyan-500 to-cyan-600",
    submenu: [
      { title: "Hiring Dashboard", href: "/hiring/dashboard" },
      { title: "Candidates", href: "/hiring/candidates" },
      { title: "Assessments", href: "/hiring/assessments" },
      { title: "Analytics", href: "/hiring/analytics" },
      { title: "Templates", href: "/hiring/templates" },
    ],
  },
  {
    href: "/crm",
    label: "CRM",
    icon: Building2,
    color: "from-purple-500 to-purple-600",
    submenu: [
      { title: "CRM", href: "/crm" },
      { title: "Inbox", href: "/crm/inbox" },
      { title: "Calendar", href: "/crm/calendar" },
      { title: "Activities", href: "/crm/activities" },
      { title: "Companies", href: "/crm/company" },
      { title: "Deals", href: "/crm/deal" },
      { title: "People", href: "/crm/person" },
    ],
  },
  { href: "/settings", label: "Settings", icon: Settings, color: "from-slate-400 to-slate-500" },
];

export default function SideBar() {
  const pathname = usePathname();
  const router = useRouter();

  const [openMenu, setOpenMenu] = useState<NavItem | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ item: NavItem; top: number; left: number } | null>(null);

  const closeTimer = useRef<NodeJS.Timeout | null>(null);

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => {
      setOpenMenu(null);
      setAnchor(null);
      setTooltip(null);
    }, 120);
  };

  const openAt = (item: NavItem, el: HTMLDivElement) => {
    clearClose();

    const rect = el.getBoundingClientRect();

    if (!item.submenu) {
      setTooltip({ item, top: rect.top + 6, left: rect.right + 8 });
      setOpenMenu(null);
      return;
    }

    setTooltip(null);
    setOpenMenu(item);

    const viewport = window.innerHeight;
    const height = item.submenu.length * 40 + 60;
    let top = rect.top + 6;
    if (top + height > viewport) top = Math.max(80, viewport - height - 20);

    setAnchor({ top, left: rect.right + 10 });
  };

  return (
    <div
      className="fixed top-[69px] h-screen z-40 flex"
      onMouseEnter={clearClose}
      onMouseLeave={scheduleClose}
    >
      {/* ICON RAIL */}
      <div className="w-16 py-3 flex flex-col h-full border border-slate-800 bg-slate-950/80 backdrop-blur-xl">
        <div className="flex flex-col gap-3 items-center">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <div
                key={item.href}
                onMouseEnter={(e) => openAt(item, e.currentTarget)}
                onClick={() => !item.submenu && router.push(item.href)}
                className={cn(
                  "py-3 px-1 w-[80%] rounded-xl flex justify-center cursor-pointer transition-all",
                  `hover:bg-gradient-to-br ${item.color}`,
                  isActive && `bg-gradient-to-br ${item.color}`
                )}
              >
                <item.icon className="h-5 w-5 text-white" />
              </div>
            );
          })}
        </div>
      </div>

      {/* TOOLTIP */}
      <AnimatePresence>
        {tooltip && (
          <motion.div
            initial={{ x: -6, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -6, opacity: 0 }}
            className="fixed bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 z-50"
            style={{ top: tooltip.top, left: tooltip.left }}
          >
            {tooltip.item.label}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SUBMENU */}
      <AnimatePresence>
        {openMenu?.submenu && anchor && (
          <motion.div
            onMouseEnter={clearClose}
            onMouseLeave={scheduleClose}
            initial={{ x: -6, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -6, opacity: 0 }}
            className="fixed w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-3 z-50"
            style={{ top: anchor.top, left: anchor.left }}
          >
            <div className="text-xs uppercase text-slate-500 px-3 mb-2">
              {openMenu.label}
            </div>

            {openMenu.submenu.map((sub) => (
              <Link
                key={sub.href}
                href={sub.href}
                className={cn(
                  "block px-3 py-2 rounded-lg text-sm",
                  pathname === sub.href ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                {sub.title}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
