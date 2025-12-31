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
} from "lucide-react";

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
  { href: "/sprints", label: "Sprint Planning", icon: Calendar },
  { href: "/epics", label: "Epics", icon: Layers },
  { href: "/learning", label: "Learning", icon: GraduationCap },
  { href: "/hiring", label: "Hiring", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppHeader({ user, logout }: AppHeaderProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="border-b border-slate-700 bg-slate-800">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo and Navigation */}
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-90 transition">
            <GitBranch className="h-8 w-8 text-primary-500" />
            <span className="text-2xl font-bold text-white">Devograph</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-6">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                  isActive(href)
                    ? "text-white bg-slate-700"
                    : "text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* User Profile Section */}
        <div className="flex items-center gap-4">
          <Link
            href="/profile"
            className="flex items-center gap-3 hover:opacity-80 transition group"
          >
            {user?.avatar_url && (
              <Image
                src={user.avatar_url}
                alt={user.name || "User"}
                width={32}
                height={32}
                className="rounded-full ring-2 ring-transparent group-hover:ring-primary-500 transition"
              />
            )}
            <span className="text-white group-hover:text-primary-400 transition">
              {user?.name || user?.email}
            </span>
          </Link>
          <button
            onClick={logout}
            className="text-slate-400 hover:text-white transition p-2 hover:bg-slate-700 rounded-lg"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
