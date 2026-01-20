"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
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
    ChevronDown,
    LogOut,
    MessageSquare,
    Ban,
    Clock,
    KanbanSquare,
    Milestone,
    Repeat,
    UserPlus,
    FileSpreadsheet,
    HelpCircle,
    FileStack,
    BarChart,
    Inbox,
    Headphones,
    Activity,
    Zap,
    Send,
    FileCode,
    Lock,
    Boxes,
    Star,
    Folder,
} from "lucide-react";
import React, { useState, ReactNode } from "react";
import { Button } from "../ui/button";
import { useNotionDocs } from "@/hooks/useNotionDocs";
import { useDocumentSpaces } from "@/hooks/useDocumentSpaces";
import { useWorkspace } from "@/hooks/useWorkspace";

interface SidebarProps {
    className?: string;
    user?: {
        name?: string | null;
        email?: string | null;
    } | null;
    logout?: () => void;
}

interface SidebarItemType {
    href: string;
    label: string;
    icon: any;
    component?: ReactNode; // Custom component to render instead of simple link
    items?: SidebarItemType[]; // Nested items
}

// Core navigation items
const coreItems: SidebarItemType[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    {
        href: "/tracking",
        label: "Tracking",
        icon: Target,
        items: [
            { href: "/tracking/standups", label: "Standups", icon: MessageSquare },
            { href: "/tracking/blockers", label: "Blockers", icon: Ban },
            { href: "/tracking/time", label: "Time", icon: Clock },
        ]
    },
    {
        href: "/sprints",
        label: "Planning",
        icon: Calendar,
        items: [
            { href: "/sprints", label: "Board", icon: KanbanSquare },
            { href: "/sprints?tab=epics", label: "Epics", icon: Milestone }
        ]
    },
    { href: "/tickets", label: "Tickets", icon: Ticket },
    { href: "/forms", label: "Forms", icon: FormInput },
    { href: "/learning", label: "Learning", icon: GraduationCap },
];

// Application items grouped together
const applicationItems: SidebarItemType[] = [
    {
        href: "/reviews",
        label: "Reviews",
        icon: ClipboardCheck,
        items: [
            { href: "/reviews/cycles", label: "Cycles", icon: Repeat },
            { href: "/reviews/goals", label: "Goals", icon: Target },
            { href: "/reviews/peer-requests", label: "Peer Requests", icon: Users },
            { href: "/reviews/manage", label: "Manage", icon: Settings },
        ]
    },
    {
        href: "/hiring",
        label: "Hiring",
        icon: Users,
        items: [
            { href: "/hiring/dashboard", label: "Dashboard", icon: LayoutDashboard },
            { href: "/hiring/candidates", label: "Candidates", icon: UserPlus },
            { href: "/hiring/assessments", label: "Assessments", icon: FileSpreadsheet },
            { href: "/hiring/questions", label: "Questions", icon: HelpCircle },
            { href: "/hiring/templates", label: "Templates", icon: FileStack },
            { href: "/hiring/analytics", label: "Analytics", icon: BarChart },
        ]
    },
    {
        href: "/crm",
        label: "CRM",
        icon: Building2,
        items: [
            { href: "/crm", label: "Overview", icon: LayoutDashboard },
            { href: "/crm/inbox", label: "Inbox", icon: Inbox },
            { href: "/crm/agents", label: "Agents", icon: Headphones },
            { href: "/crm/activities", label: "Activities", icon: Activity },
            { href: "/crm/automations", label: "Automations", icon: Zap },
            { href: "/crm/calendar", label: "Calendar", icon: Calendar },
        ]
    },
    {
        href: "/email-marketing",
        label: "Email",
        icon: Mail,
        items: [
            { href: "/email-marketing/campaigns", label: "Campaigns", icon: Send },
            { href: "/email-marketing/templates", label: "Templates", icon: FileCode },
            { href: "/email-marketing/settings", label: "Settings", icon: Settings },
        ]
    },
];

export function Sidebar({ className, user, logout }: SidebarProps) {
    const pathname = usePathname();
    const params = useParams();
    const documentId = params?.documentId as string | undefined;
    const isDocsPage = pathname.startsWith("/docs");

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isHidden, setIsHidden] = useState(false);
    const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
        "/docs": false,
        "applications": false,
    });

    // Auto-hide sidebar on docs pages
    React.useEffect(() => {
        if (isDocsPage) {
            setIsHidden(true);
        } else {
            setIsHidden(false);
        }
    }, [isDocsPage]);

    // Docs data
    const { currentWorkspace } = useWorkspace();
    const workspaceId = currentWorkspace?.id || null;
    const { spaces, isLoading: spacesLoading } = useDocumentSpaces(workspaceId);
    const { privateTree, sharedTree, favorites, isLoading: docsLoading } = useNotionDocs(workspaceId);

    const toggleSidebar = () => setIsCollapsed(!isCollapsed);
    const toggleHidden = () => setIsHidden(!isHidden);

    const toggleExpand = (key: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setExpandedItems(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const isActive = (href: string) => {
        if (href === "/dashboard") return pathname === "/dashboard";
        return pathname.startsWith(href);
    };

    const renderItem = (item: SidebarItemType, depth: number = 0) => {
        const isExpanded = expandedItems[item.href];
        const active = isActive(item.href);
        const hasSubmenu = item.items && item.items.length > 0;

        return (
            <div key={item.href} className="group">
                <div
                    className={cn(
                        "flex items-center gap-x-3 rounded-md px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground",
                        active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                        isCollapsed && "justify-center px-2"
                    )}
                    style={depth > 0 ? { paddingLeft: `${(depth * 12) + 12}px` } : undefined}
                >
                    <Link href={item.href} className="flex-1 flex items-center gap-x-3 truncate">
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>

                    {!isCollapsed && hasSubmenu && (
                        <button
                            onClick={(e) => toggleExpand(item.href, e)}
                            className="p-0.5 hover:bg-slate-700/50 rounded"
                        >
                            <motion.div
                                animate={{ rotate: isExpanded ? 90 : 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <ChevronRight className="h-3 w-3" />
                            </motion.div>
                        </button>
                    )}

                    {!isCollapsed && !hasSubmenu && active && (
                        <div className="ml-auto w-1 h-1 rounded-full bg-primary" />
                    )}
                </div>

                {/* Submenu */}
                <AnimatePresence>
                    {!isCollapsed && isExpanded && hasSubmenu && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                        >
                            <div className="ml-4 mt-1 border-l border-slate-800/50 pl-2 space-y-1">
                                {item.items?.map(subItem => renderItem(subItem, depth + 1))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    // Render a document item in the docs tree
    const renderDocItem = (doc: any, depth: number = 0) => {
        const hasChildren = doc.children && doc.children.length > 0;
        const isActive = documentId === doc.id;
        const isExpanded = expandedItems[`doc-${doc.id}`];

        return (
            <div key={doc.id}>
                <div
                    className={cn(
                        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors cursor-pointer",
                        isActive && "bg-accent/50 text-accent-foreground font-medium"
                    )}
                    style={{ paddingLeft: `${(depth * 12) + 12}px` }}
                >
                    {hasChildren ? (
                        <button
                            onClick={(e) => { e.preventDefault(); toggleExpand(`doc-${doc.id}`, e); }}
                            className="p-0.5 hover:bg-white/10 rounded mr-1"
                        >
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                    ) : (
                        <span className="w-5" />
                    )}
                    <Link href={`/docs/${doc.id}`} className="flex-1 flex items-center gap-2 truncate">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{doc.title}</span>
                    </Link>
                </div>
                {isExpanded && hasChildren && (
                    <div>
                        {doc.children.map((child: any) => renderDocItem(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    // Render the docs section
    const renderDocsSection = () => {
        const isExpanded = expandedItems["/docs"];
        const active = pathname.startsWith("/docs");
        const isLoadingDocs = spacesLoading || docsLoading;

        return (
            <div className="group">
                <div className={cn(
                    "flex items-center gap-x-3 rounded-md px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground",
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                    isCollapsed && "justify-center px-2"
                )}>
                    <Link href="/docs" className="flex-1 flex items-center gap-x-3 truncate">
                        <FileText className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="truncate">Docs</span>}
                    </Link>

                    {!isCollapsed && (
                        <button
                            onClick={(e) => toggleExpand("/docs", e)}
                            className="p-0.5 hover:bg-slate-700/50 rounded"
                        >
                            <motion.div
                                animate={{ rotate: isExpanded ? 90 : 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <ChevronRight className="h-3 w-3" />
                            </motion.div>
                        </button>
                    )}
                </div>

                <AnimatePresence>
                    {!isCollapsed && isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                        >
                            <div className="ml-4 mt-1 border-l border-slate-800/50 pl-2 space-y-2">
                                {isLoadingDocs ? (
                                    <div className="text-xs text-muted-foreground px-2 py-1">Loading...</div>
                                ) : (
                                    <>
                                        {/* Favorites */}
                                        {favorites.length > 0 && (
                                            <div>
                                                <p className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                                                    <Star className="h-3 w-3" /> Favorites
                                                </p>
                                                {favorites.map(doc => renderDocItem(doc))}
                                            </div>
                                        )}

                                        {/* Spaces */}
                                        {spaces.length > 0 && (
                                            <div>
                                                <p className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                                                    <Folder className="h-3 w-3" /> Spaces
                                                </p>
                                                {spaces.map((space: any) => (
                                                    <Link
                                                        key={space.id}
                                                        href={`/docs?space=${space.id}`}
                                                        className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground rounded-md transition-colors"
                                                    >
                                                        <span className="text-sm">{space.icon || "📁"}</span>
                                                        <span className="truncate">{space.name}</span>
                                                    </Link>
                                                ))}
                                            </div>
                                        )}

                                        {/* Shared */}
                                        {sharedTree.length > 0 && (
                                            <div>
                                                <p className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                                                    <Users className="h-3 w-3" /> Shared
                                                </p>
                                                {sharedTree.map(doc => renderDocItem(doc))}
                                            </div>
                                        )}

                                        {/* Private */}
                                        {privateTree.length > 0 && (
                                            <div>
                                                <p className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                                                    <Lock className="h-3 w-3" /> Private
                                                </p>
                                                {privateTree.map(doc => renderDocItem(doc))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    // Render the applications section
    const renderApplicationsSection = () => {
        const isExpanded = expandedItems["applications"];
        const active = applicationItems.some(item => isActive(item.href));

        return (
            <div className="group">
                <div className={cn(
                    "flex items-center gap-x-3 rounded-md px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground",
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                    isCollapsed && "justify-center px-2"
                )}>
                    <button
                        onClick={(e) => toggleExpand("applications", e)}
                        className="flex-1 flex items-center gap-x-3 truncate text-left"
                    >
                        <Boxes className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="truncate">Applications</span>}
                    </button>

                    {!isCollapsed && (
                        <button
                            onClick={(e) => toggleExpand("applications", e)}
                            className="p-0.5 hover:bg-slate-700/50 rounded"
                        >
                            <motion.div
                                animate={{ rotate: isExpanded ? 90 : 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <ChevronRight className="h-3 w-3" />
                            </motion.div>
                        </button>
                    )}
                </div>

                <AnimatePresence>
                    {!isCollapsed && isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                        >
                            <div className="ml-4 mt-1 border-l border-slate-800/50 pl-2 space-y-1">
                                {applicationItems.map(item => renderItem(item, 1))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    // Calculate the sidebar width based on state
    const sidebarWidth = isHidden ? 0 : isCollapsed ? 64 : 256;

    return (
        <>
            {/* Floating reveal button when sidebar is hidden */}
            <AnimatePresence>
                {isHidden && (
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="fixed top-4 left-4 z-50"
                    >
                        <Button
                            variant="outline"
                            size="icon"
                            className="bg-card/80 backdrop-blur-sm border-border shadow-lg hover:bg-accent"
                            onClick={toggleHidden}
                        >
                            <PanelLeftOpen className="h-4 w-4" />
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sidebar wrapper - controls layout width */}
            <motion.div
                initial={false}
                animate={{ width: sidebarWidth }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className={cn("relative h-full shrink-0", className)}
            >
                {/* Sidebar content - slides in/out */}
                <motion.div
                    initial={false}
                    animate={{ x: isHidden ? "-100%" : 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className={cn(
                        "absolute inset-y-0 left-0 flex flex-col border-r bg-card",
                        isCollapsed ? "w-16" : "w-64"
                    )}
                >
                    <div className="flex h-16 items-center justify-between border-b px-4">
                        {!isCollapsed && (
                            <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl">
                                <span className="text-primary">Aexy</span>
                            </Link>
                        )}
                        <div className="flex items-center gap-1">
                            {isDocsPage && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground"
                                    onClick={toggleHidden}
                                    title="Hide sidebar"
                                >
                                    <PanelLeftClose className="h-4 w-4" />
                                </Button>
                            )}
                            {!isDocsPage && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn("text-muted-foreground", isCollapsed && "mx-auto")}
                                    onClick={toggleSidebar}
                                >
                                    {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-4">
                        <nav className="grid gap-1 px-2">
                            {/* Core navigation items */}
                            {coreItems.map(item => renderItem(item))}

                            {/* Docs section with tree structure */}
                            {renderDocsSection()}

                            {/* Applications section */}
                            {renderApplicationsSection()}
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
                </motion.div>
            </motion.div>
        </>
    );
}
