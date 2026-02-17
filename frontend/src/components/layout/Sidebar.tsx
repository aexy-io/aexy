"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
    FileText,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    ChevronRight,
    ChevronDown,
    LogOut,
    Lock,
    Star,
    Folder,
    Users,
} from "lucide-react";
import React, { useState } from "react";
import { Button } from "../ui/button";
import { useNotionDocs } from "@/hooks/useNotionDocs";
import { useDocumentSpaces } from "@/hooks/useDocumentSpaces";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSidebarLayout } from "@/hooks/useSidebarLayout";
import { useAppAccess } from "@/hooks/useAppAccess";
import { useAuth } from "@/hooks/useAuth";
import { SidebarItemConfig, SidebarSectionConfig } from "@/config/sidebarLayouts";
import { getAppIdFromPath } from "@/config/appDefinitions";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

interface SidebarProps {
    className?: string;
    user?: {
        name?: string | null;
        email?: string | null;
    } | null;
    logout?: () => void;
}

export function Sidebar({ className, user, logout }: SidebarProps) {
    const pathname = usePathname();
    const params = useParams();
    const documentId = params?.documentId as string | undefined;
    const isDocsPage = pathname.startsWith("/docs");

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isHidden, setIsHidden] = useState(false);
    const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
        "/docs": false,
    });

    // Sidebar layout preference
    const { layoutConfig } = useSidebarLayout();

    // Check if on automation editor page (edit or new)
    const isAutomationEditorPage = pathname.startsWith("/automations/") && pathname !== "/automations";

    // Auto-hide sidebar on docs pages and automation editor
    React.useEffect(() => {
        if (isDocsPage || isAutomationEditorPage) {
            setIsHidden(true);
        } else {
            setIsHidden(false);
        }
    }, [isDocsPage, isAutomationEditorPage]);

    // Docs data
    const { currentWorkspace } = useWorkspace();
    const workspaceId = currentWorkspace?.id || null;
    const { spaces, isLoading: spacesLoading } = useDocumentSpaces(workspaceId);
    const { privateTree, sharedTree, favorites, isLoading: docsLoading } = useNotionDocs(workspaceId);

    // App access control
    const { user: developer } = useAuth();
    const developerId = developer?.id || null;
    const { hasAppAccess, hasRouteAccess, isLoading: accessLoading } = useAppAccess(workspaceId, developerId);

    // Filter a sidebar item based on app access
    const canAccessItem = (item: SidebarItemConfig): boolean => {
        // If access data is still loading, show all items
        if (accessLoading) return true;

        // Check if the route maps to an app that requires access
        const appId = getAppIdFromPath(item.href);
        if (!appId) return true; // Routes not in app catalog are accessible

        return hasAppAccess(appId);
    };

    // Filter sidebar items recursively
    const filterItems = (items: SidebarItemConfig[]): SidebarItemConfig[] => {
        return items
            .filter(item => canAccessItem(item))
            .map(item => ({
                ...item,
                items: item.items ? filterItems(item.items) : undefined,
            }));
    };

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
        // Handle query params in href
        const hrefBase = href.split("?")[0];
        return pathname.startsWith(hrefBase);
    };

    // Render a navigation item
    const renderItem = (item: SidebarItemConfig, depth: number = 0) => {
        const isExpanded = expandedItems[item.href];
        const active = isActive(item.href);
        const hasSubmenu = item.items && item.items.length > 0;
        const Icon = item.icon;

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
                        <Icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>

                    {!isCollapsed && hasSubmenu && (
                        <button
                            onClick={(e) => toggleExpand(item.href, e)}
                            className="p-0.5 hover:bg-accent/50 rounded"
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
                            <div className="ml-4 mt-1 border-l border-border/50 pl-2 space-y-1">
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
        const isDocActive = documentId === doc.id;
        const isExpanded = expandedItems[`doc-${doc.id}`];

        return (
            <div key={doc.id}>
                <div
                    className={cn(
                        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors cursor-pointer",
                        isDocActive && "bg-accent/50 text-accent-foreground font-medium"
                    )}
                    style={{ paddingLeft: `${(depth * 12) + 12}px` }}
                >
                    {hasChildren ? (
                        <button
                            onClick={(e) => { e.preventDefault(); toggleExpand(`doc-${doc.id}`, e); }}
                            className="p-0.5 hover:bg-accent/50 rounded mr-1"
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

    // Render the docs section with tree structure
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
                            className="p-0.5 hover:bg-accent/50 rounded"
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
                            <div className="ml-4 mt-1 border-l border-border/50 pl-2 space-y-2">
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

    // Render a section with optional label
    const renderSection = (section: SidebarSectionConfig) => {
        // Filter items based on app access
        const filteredItems = filterItems(section.items);

        // Don't render the section if all items are filtered out
        if (filteredItems.length === 0) {
            return null;
        }

        return (
            <div key={section.id} className="mb-2">
                {/* Section label */}
                {section.label && !isCollapsed && (
                    <p className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {section.label}
                    </p>
                )}

                {/* Section items */}
                <div className="space-y-1">
                    {filteredItems.map(item => {
                        // Special handling for Docs - render with tree structure
                        if (item.href === "/docs") {
                            return <React.Fragment key={item.href}>{renderDocsSection()}</React.Fragment>;
                        }
                        return renderItem(item);
                    })}
                </div>
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
                    <div className="flex h-14 items-center justify-between border-b px-4">
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

                    {/* Workspace Switcher */}
                    <div className={cn("border-b px-2 py-2", isCollapsed && "px-1")}>
                        <WorkspaceSwitcher collapsed={isCollapsed} />
                    </div>

                    <div className="flex-1 overflow-y-auto py-4">
                        <nav className="px-2">
                            {/* Render sections based on layout config */}
                            {layoutConfig.sections.map(section => renderSection(section))}
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
