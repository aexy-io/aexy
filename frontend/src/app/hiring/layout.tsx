"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  BarChart3,
  FileText,
  Grid3X3,
  Settings,
  LogOut,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import Image from "next/image";
import { NotificationBell } from "@/components/notifications";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  pattern: RegExp;
}

const appItems = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", color: "from-blue-500 to-blue-600" },
  { href: "/tracking", label: "Tracking", icon: "Target", color: "from-emerald-500 to-emerald-600" },
  { href: "/sprints", label: "Planning", icon: "Calendar", color: "from-green-500 to-green-600" },
  { href: "/tickets", label: "Tickets", icon: "Ticket", color: "from-pink-500 to-pink-600" },
  { href: "/docs", label: "Docs", icon: "FileText", color: "from-indigo-500 to-indigo-600" },
  { href: "/reviews", label: "Reviews", icon: "ClipboardCheck", color: "from-orange-500 to-orange-600" },
  { href: "/learning", label: "Learning", icon: "GraduationCap", color: "from-rose-500 to-rose-600" },
  { href: "/hiring", label: "Hiring", icon: "Users", color: "from-cyan-500 to-cyan-600" },
];

export default function HiringLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAppSwitcher, setShowAppSwitcher] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const appSwitcherRef = useRef<HTMLDivElement>(null);

  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      href: "/hiring/dashboard",
      icon: <LayoutDashboard className="h-4 w-4" />,
      pattern: /\/hiring\/dashboard$/,
    },
    {
      label: "Candidates",
      href: "/hiring/candidates",
      icon: <Users className="h-4 w-4" />,
      pattern: /\/hiring\/candidates/,
    },
    {
      label: "Assessments",
      href: "/hiring/assessments",
      icon: <ClipboardCheck className="h-4 w-4" />,
      pattern: /\/hiring\/assessments/,
    },
    {
      label: "Analytics",
      href: "/hiring/analytics",
      icon: <BarChart3 className="h-4 w-4" />,
      pattern: /\/hiring\/analytics$/,
    },
    {
      label: "Templates",
      href: "/hiring/templates",
      icon: <FileText className="h-4 w-4" />,
      pattern: /\/hiring\/templates$/,
    },
  ];

  // Check if we're on the base /hiring route (for redirect)
  const isBaseRoute = pathname === "/hiring";

  // Don't show nav on assessment wizard/edit pages
  const isAssessmentEditPage = /\/hiring\/assessments\/[^\/]+\/(edit|publish|report)/.test(pathname);

  // Handle scroll
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 80);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (appSwitcherRef.current && !appSwitcherRef.current.contains(event.target as Node)) {
        setShowAppSwitcher(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isAssessmentEditPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Scroll-to-reveal Header */}
      <AnimatePresence>
        {isScrolled && !isBaseRoute && (
          <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-xl"
          >
            <div className="max-w-7xl mx-auto px-4">
              <div className="flex items-center justify-between h-14">
                {/* Logo */}
                <Link href="/dashboard" className="flex items-center gap-2 group">
                  <div className="relative w-8 h-8">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 rounded-lg rotate-6 group-hover:rotate-12 transition-transform duration-300 opacity-60 blur-[1px]" />
                    <div className="relative w-8 h-8 bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-lg shadow-primary-500/30">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-5 h-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="3" className="fill-white/20" />
                        <path d="M12 3v6m0 6v6" />
                        <path d="M3 12h6m6 0h6" />
                      </svg>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-white hidden sm:block">Aexy</span>
                </Link>

                {/* Center Navigation */}
                <nav className="flex items-center gap-1">
                  {navItems.map((item) => {
                    const isActive = item.pattern.test(pathname);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                          isActive
                            ? "bg-primary-500/20 text-primary-400"
                            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                        )}
                      >
                        {item.icon}
                        <span className="hidden md:inline">{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>

                {/* Right Section */}
                <div className="flex items-center gap-2">
                  {/* App Switcher */}
                  <div className="relative" ref={appSwitcherRef}>
                    <button
                      onClick={() => setShowAppSwitcher(!showAppSwitcher)}
                      className={`p-2 rounded-full hover:bg-slate-800/70 transition-all duration-200 ${
                        showAppSwitcher ? "bg-slate-800/70" : ""
                      }`}
                    >
                      <Grid3X3 className="h-4 w-4 text-slate-400 hover:text-white transition-colors" />
                    </button>

                    {showAppSwitcher && (
                      <div className="absolute right-0 mt-2 w-72 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
                        <div className="p-2">
                          <div className="grid grid-cols-3 gap-1">
                            {appItems.map(({ href, label, color }) => (
                              <Link
                                key={href}
                                href={href}
                                onClick={() => setShowAppSwitcher(false)}
                                className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 group ${
                                  pathname.startsWith(href)
                                    ? "bg-slate-800"
                                    : "hover:bg-slate-800/60"
                                }`}
                              >
                                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200`}>
                                  <Users className="h-4 w-4 text-white" />
                                </div>
                                <span className={`text-xs font-medium ${
                                  pathname.startsWith(href) ? "text-white" : "text-slate-400 group-hover:text-white"
                                } transition-colors`}>
                                  {label}
                                </span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notification Bell */}
                  <NotificationBell developerId={user?.id} />

                  {/* User Menu */}
                  <div className="relative" ref={menuRef}>
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-800/50 transition"
                    >
                      {user?.avatar_url ? (
                        <Image
                          src={user.avatar_url}
                          alt={user.name || "User"}
                          width={28}
                          height={28}
                          className="rounded-lg ring-2 ring-slate-700"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-medium text-xs">
                          {(user?.name || user?.email || "U")[0].toUpperCase()}
                        </div>
                      )}
                      <ChevronDown className={`h-3 w-3 text-slate-500 transition-transform ${showUserMenu ? "rotate-180" : ""}`} />
                    </button>

                    {showUserMenu && (
                      <div className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
                        <div className="p-3 border-b border-slate-800">
                          <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                        </div>
                        <div className="py-1">
                          <Link
                            href="/settings"
                            onClick={() => setShowUserMenu(false)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800"
                          >
                            <Settings className="h-4 w-4" />
                            Settings
                          </Link>
                          <Link
                            href="/settings/billing"
                            onClick={() => setShowUserMenu(false)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800"
                          >
                            <Sparkles className="h-4 w-4 text-amber-400" />
                            Billing
                          </Link>
                        </div>
                        <div className="border-t border-slate-800 py-1">
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              logout();
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20"
                          >
                            <LogOut className="h-4 w-4" />
                            Sign Out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Page content with padding when header is visible */}
      <div className={cn(isScrolled && !isBaseRoute ? "pt-14" : "")}>
        {children}
      </div>
    </div>
  );
}
