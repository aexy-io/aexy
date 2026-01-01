"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Calendar,
  GraduationCap,
  Users,
  Settings,
  Layers,
  LogOut,
  LayoutDashboard,
  ClipboardCheck,
  ChevronDown,
  Sparkles,
  Grid3X3,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { NotificationBell } from "@/components/notifications";
import { OnCallIndicator } from "@/components/oncall/OnCallIndicator";

interface AppHeaderProps {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null | undefined;
  logout: () => void;
}

const appItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "from-blue-500 to-blue-600" },
  { href: "/sprints", label: "Planning", icon: Calendar, color: "from-green-500 to-green-600" },
  { href: "/epics", label: "Epics", icon: Layers, color: "from-purple-500 to-purple-600" },
  { href: "/reviews", label: "Reviews", icon: ClipboardCheck, color: "from-orange-500 to-orange-600" },
  { href: "/learning", label: "Learning", icon: GraduationCap, color: "from-pink-500 to-pink-600" },
  { href: "/hiring", label: "Hiring", icon: Users, color: "from-cyan-500 to-cyan-600" },
];

export function AppHeader({ user, logout }: AppHeaderProps) {
  const pathname = usePathname();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAppSwitcher, setShowAppSwitcher] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const appSwitcherRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

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

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            {/* Stylish animated logo */}
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 rounded-xl rotate-6 group-hover:rotate-12 transition-transform duration-300 opacity-60 blur-[2px]" />
              <div className="relative w-10 h-10 bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/30 group-hover:shadow-primary-500/50 transition-all duration-300 group-hover:scale-105">
                <svg
                  viewBox="0 0 24 24"
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" className="fill-white/20" />
                  <path d="M12 3v6m0 6v6" />
                  <path d="M3 12h6m6 0h6" />
                  <circle cx="12" cy="3" r="1.5" className="fill-white" />
                  <circle cx="12" cy="21" r="1.5" className="fill-white" />
                  <circle cx="3" cy="12" r="1.5" className="fill-white" />
                  <circle cx="21" cy="12" r="1.5" className="fill-white" />
                </svg>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold bg-gradient-to-r from-white via-white to-slate-400 bg-clip-text text-transparent tracking-tight">
                Devograph
              </span>
              <span className="text-[10px] text-slate-500 font-medium tracking-widest uppercase -mt-0.5">
                Developer Platform
              </span>
            </div>
          </Link>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Google-style App Switcher */}
          <div className="relative" ref={appSwitcherRef}>
            <button
              onClick={() => setShowAppSwitcher(!showAppSwitcher)}
              className={`p-2.5 rounded-full hover:bg-slate-800/70 transition-all duration-200 ${
                showAppSwitcher ? "bg-slate-800/70" : ""
              }`}
              aria-label="Apps"
            >
              <Grid3X3 className="h-5 w-5 text-slate-400 hover:text-white transition-colors" />
            </button>

            {/* App Switcher Dropdown */}
            {showAppSwitcher && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-2">
                  <div className="grid grid-cols-3 gap-1">
                    {appItems.map(({ href, label, icon: Icon, color }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setShowAppSwitcher(false)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 group ${
                          isActive(href)
                            ? "bg-slate-800"
                            : "hover:bg-slate-800/60"
                        }`}
                      >
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200`}>
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <span className={`text-xs font-medium ${
                          isActive(href) ? "text-white" : "text-slate-400 group-hover:text-white"
                        } transition-colors`}>
                          {label}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="border-t border-slate-700/50 p-2">
                  <Link
                    href="/settings"
                    onClick={() => setShowAppSwitcher(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all"
                  >
                    <Settings className="h-4 w-4" />
                    <span className="text-sm">Settings</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* On-Call Indicator */}
          <OnCallIndicator userId={user?.id} />

          {/* Upgrade Button (for free users) */}
          <Link
            href="/pricing"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Upgrade
          </Link>

          {/* Notification Bell */}
          <NotificationBell developerId={user?.id} />

          {/* User Profile Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-800/50 transition group"
            >
              {user?.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt={user.name || "User"}
                  width={32}
                  height={32}
                  className="rounded-lg ring-2 ring-slate-700 group-hover:ring-slate-600 transition"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-medium text-sm">
                  {(user?.name || user?.email || "U")[0].toUpperCase()}
                </div>
              )}
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium text-white leading-tight">
                  {user?.name?.split(" ")[0] || "User"}
                </p>
                <p className="text-xs text-slate-500 leading-tight">
                  {user?.email?.split("@")[0]}
                </p>
              </div>
              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${showUserMenu ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-xl shadow-black/20 overflow-hidden">
                <div className="p-3 border-b border-slate-800">
                  <p className="text-sm font-medium text-white">{user?.name}</p>
                  <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  <Link
                    href="/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                      <Users className="h-4 w-4 text-slate-400" />
                    </div>
                    My Profile
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                      <Settings className="h-4 w-4 text-slate-400" />
                    </div>
                    Settings
                  </Link>
                  <Link
                    href="/settings/billing"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-amber-400" />
                    </div>
                    Billing & Plan
                  </Link>
                </div>
                <div className="border-t border-slate-800 py-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 transition"
                  >
                    <div className="w-8 h-8 rounded-lg bg-red-900/30 flex items-center justify-center">
                      <LogOut className="h-4 w-4 text-red-400" />
                    </div>
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
