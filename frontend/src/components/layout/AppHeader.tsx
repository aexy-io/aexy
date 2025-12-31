"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  GitBranch,
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
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface AppHeaderProps {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null | undefined;
  logout: () => void;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sprints", label: "Planning", icon: Calendar },
  { href: "/epics", label: "Epics", icon: Layers },
  { href: "/reviews", label: "Reviews", icon: ClipboardCheck },
  { href: "/learning", label: "Learning", icon: GraduationCap },
  { href: "/hiring", label: "Hiring", icon: Users },
];

export function AppHeader({ user, logout }: AppHeaderProps) {
  const pathname = usePathname();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo and Navigation */}
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/20 group-hover:shadow-primary-500/40 transition-shadow">
              <GitBranch className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Devograph
            </span>
          </Link>

          <nav className="hidden lg:flex items-center">
            <div className="flex items-center bg-slate-900/50 rounded-xl p-1 border border-slate-800/50">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    isActive(href)
                      ? "text-white bg-slate-800 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive(href) ? "text-primary-400" : ""}`} />
                  {label}
                </Link>
              ))}
            </div>
          </nav>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          {/* Upgrade Button (for free users) */}
          <Link
            href="/pricing"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Upgrade
          </Link>

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
