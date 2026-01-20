"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Target,
    Calendar,
    Ticket,
    FormInput,
    FileText,
    ClipboardCheck,
    GraduationCap,
    Users,
    Building2,
    Mail,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    ChevronRight,
    LogOut,
} from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";

interface SidebarProps {
    className?: string;
    user?: {
        name?: string | null;
        email?: string | null;
    } | null;
    logout?: () => void;
}

const sidebarItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tracking", label: "Tracking", icon: Target },
    { href: "/sprints", label: "Planning", icon: Calendar },
    { href: "/tickets", label: "Tickets", icon: Ticket },
    { href: "/forms", label: "Forms", icon: FormInput },
    { href: "/docs", label: "Docs", icon: FileText },
    { href: "/reviews", label: "Reviews", icon: ClipboardCheck },
    { href: "/learning", label: "Learning", icon: GraduationCap },
    { href: "/hiring", label: "Hiring", icon: Users },
    { href: "/crm", label: "CRM", icon: Building2 },
    { href: "/email-marketing", label: "Email", icon: Mail },
];

export function Sidebar({ className, user, logout }: SidebarProps) {
    const pathname = usePathname();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const toggleSidebar = () => setIsCollapsed(!isCollapsed);

    const isActive = (href: string) => {
        if (href === "/dashboard") return pathname === "/dashboard";
        return pathname.startsWith(href);
    };

    return (
        <div
            className={cn(
                "relative flex flex-col border-r bg-card transition-all duration-300",
                isCollapsed ? "w-16" : "w-64",
                className
            )}
        >
            <div className="flex h-16 items-center justify-between border-b px-4">
                {!isCollapsed && (
                    <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl">
                        <span className="text-primary">Aexy</span>
                    </Link>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("text-muted-foreground", isCollapsed && "mx-auto")}
                    onClick={toggleSidebar}
                >
                    {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
                <nav className="grid gap-1 px-2">
                    {sidebarItems.map((item, index) => (
                        <Link
                            key={index}
                            href={item.href}
                            className={cn(
                                "group flex items-center gap-x-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-all",
                                isActive(item.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                                isCollapsed && "justify-center px-2"
                            )}
                        >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!isCollapsed && <span>{item.label}</span>}
                            {!isCollapsed && isActive(item.href) && (
                                <div className="ml-auto w-1 h-1 rounded-full bg-primary" />
                            )}
                        </Link>
                    ))}
                </nav>
            </div>

            <div className="border-t p-4">
                <div className={cn("flex items-center gap-3 mb-4", isCollapsed && "justify-center")}>
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {user?.name?.[0] || "U"}
                    </div>
                    {!isCollapsed && (
                        <div className="flex-1 overflow-hidden">
                            <p className="truncate text-sm font-medium">{user?.name || "User"}</p>
                            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                        </div>
                    )}
                </div>

                <nav className="grid gap-1">
                    <Link
                        href="/settings"
                        className={cn(
                            "group flex items-center gap-x-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-all",
                            isCollapsed && "justify-center px-2"
                        )}
                    >
                        <Settings className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span>Settings</span>}
                    </Link>
                    {logout && (
                        <button
                            onClick={logout}
                            className={cn(
                                "group flex items-center gap-x-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all w-full text-left",
                                isCollapsed && "justify-center px-2"
                            )}
                        >
                            <LogOut className="h-4 w-4 shrink-0" />
                            {!isCollapsed && <span>Logout</span>}
                        </button>
                    )}
                </nav>
            </div>
        </div>
    );
}
