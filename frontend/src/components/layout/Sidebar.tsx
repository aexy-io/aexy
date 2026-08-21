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
    Compass,
    Pin,
    PinOff,
    X,
    Plus,
    Loader2,
    ArrowRight,
    Bell,
    Clock,
    Send,
} from "lucide-react";
import React, { useState, useMemo, useCallback } from "react";
import { Button } from "../ui/button";
import { useNotionDocs } from "@/hooks/useNotionDocs";
import { useDocumentSpaces } from "@/hooks/useDocumentSpaces";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";
import { useSidebarLayout } from "@/hooks/useSidebarLayout";
import { useSidebarStore } from "@/stores/sidebarStore";
import { useAppAccess } from "@/hooks/useAppAccess";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/utils";
import { useSidebarPersona, MAX_FAVORITES } from "@/hooks/useSidebarPersona";
import { LocaleSelector } from "@/components/LocaleSelector";
import { SidebarItemConfig, SidebarSectionConfig, SidebarLayoutConfig } from "@/config/sidebarLayouts";
import { appAccessApi } from "@/lib/api";
import { useAccessRequests } from "@/hooks/useAccessRequests";
import { getAppIdFromPath, getModuleIdFromPath, APP_CATALOG, CATEGORY_LABELS, PERSONA_LABELS, AppCategory, AppDefinition } from "@/config/appDefinitions";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

interface SidebarProps {
    className?: string;
    user?: {
        name?: string | null;
        email?: string | null;
    } | null;
    logout?: () => void;
}

interface FavoriteLookupEntry {
    item: SidebarItemConfig;
    /** Parent label for context, e.g. "CRM" when item is "Overview" under CRM */
    parentLabel?: string;
}

/** Build a flat map of path -> item+context from a layout config.
 *  When a parent and sub-item share the same href (e.g. /crm → "CRM" parent
 *  with "Overview" sub-item), use the sub-item but include parent label so
 *  favorites can show "CRM - Overview". */
function buildItemLookup(sections: SidebarSectionConfig[]): Map<string, FavoriteLookupEntry> {
    const map = new Map<string, FavoriteLookupEntry>();
    for (const section of sections) {
        for (const item of section.items) {
            map.set(item.href, { item });
            if (item.items) {
                for (const sub of item.items) {
                    if (sub.href === item.href) {
                        // Sub-item shares href with parent — use sub-item label with parent context
                        map.set(sub.href, { item: sub, parentLabel: item.label });
                    } else if (!map.has(sub.href)) {
                        map.set(sub.href, {
                            item: sub,
                            parentLabel: sub.label !== item.label ? item.label : undefined,
                        });
                    }
                }
            }
        }
    }
    return map;
}

type HiddenReason = "no_access" | "persona_hidden";

interface DiscoverItem {
    item: SidebarItemConfig;
    appId: string | undefined;
    appDef: AppDefinition | undefined;
    category: AppCategory | "other";
    reason: HiddenReason;
    availableInPersonas?: string[];
}

/** Placeholder row widths for the loading skeleton — varied so it reads as
 *  navigation rather than as a progress bar. */
const SKELETON_ROWS = ["60%", "45%", "70%", "40%", "55%", "65%", "38%", "50%"];

/** Check if personas array matches the given persona */
function matchesPersona(personas: string[] | undefined, currentPersona: string): boolean {
    if (!personas || personas.length === 0) return true;
    return personas.includes(currentPersona);
}

/** Get the list of non-admin personas that would see a given item href */
function getItemPersonas(targetHref: string, layout: SidebarLayoutConfig): string[] {
    const allPersonas = ["developer", "manager", "product", "hr", "support", "sales"];
    return allPersonas.filter(p => {
        for (const section of layout.sections) {
            if (!matchesPersona(section.personas, p)) continue;
            if (section.items.some(item => item.href === targetHref && matchesPersona(item.personas, p))) {
                return true;
            }
        }
        return false;
    });
}

export function Sidebar({ className, user, logout }: SidebarProps) {
    const pathname = usePathname();
    const params = useParams();
    const documentId = params?.documentId as string | undefined;
    const isDocsPage = pathname.startsWith("/docs");

    // Collapsed is persisted (see sidebarStore); hidden is not, because it is set
    // automatically on docs and editor pages.
    const isCollapsed = useSidebarStore(state => state.isCollapsed);
    const toggleCollapsed = useSidebarStore(state => state.toggleCollapsed);
    const [isHidden, setIsHidden] = useState(false);
    const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
        "/docs": false,
        "__favorites": true,
    });
    const [togglingApp, setTogglingApp] = useState<string | null>(null);

    // Sidebar layout preference
    const { layoutConfig } = useSidebarLayout();

    // Persona filtering and favorites
    const {
        persona,
        isPersonaDerived,
        isLoading: personaLoading,
        filterByPersona,
        favoriteItems,
        pinnedItems,
        togglePin,
        dismissRecent,
    } = useSidebarPersona();

    // Apply persona filter to layout
    const personaConfig = useMemo(
        () => filterByPersona(layoutConfig),
        [filterByPersona, layoutConfig]
    );

    // Build item lookup from persona-filtered layout for favorites rendering
    // This ensures favorites only show items the current persona can see
    const itemLookup = useMemo(
        () => buildItemLookup(personaConfig.sections),
        [personaConfig.sections]
    );

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
    const badges = useSidebarBadges();
    const workspaceId = currentWorkspace?.id || null;
    const { spaces, isLoading: spacesLoading } = useDocumentSpaces(workspaceId);
    const { privateTree, sharedTree, favorites, isLoading: docsLoading } = useNotionDocs(workspaceId);

    // App access control
    const { user: developer } = useAuth();
    const developerId = developer?.id || null;
    const {
        hasAppAccess,
        hasModuleAccess,
        error: accessError,
        isAdmin,
        effectiveAccess,
        refetch: refetchAccess,
    } = useAppAccess(workspaceId, developerId);

    // Notifications for sidebar badge
    const { unreadCount } = useNotifications(developerId);

    /** There is no access answer to be had: no workspace or developer to resolve
     *  against (a fresh signup mid-onboarding), or the request failed. Filtering
     *  by "no access" here would empty the sidebar over a question we never got
     *  to ask, so nothing is filtered in this state. */
    const accessUnavailable = !workspaceId || !developerId || !!accessError;

    /** Navigation can't be drawn until we know what this person may see and which
     *  view they are in.
     *
     *  Keyed on the *absence of data* rather than on `isLoading`, because a query
     *  that hasn't started yet reports `isLoading: false` — so waiting on the flag
     *  alone would render a fully filtered (i.e. empty) sidebar in the gap between
     *  mount and the workspace arriving, replacing the old paint-then-vanish
     *  flicker with a paint-nothing-then-appear one. */
    const navIsResolving =
        !accessUnavailable && (!effectiveAccess || personaLoading);

    // Access requests for non-admin discover section
    const { getRequestForApp, createRequest, isCreatingRequest } = useAccessRequests(workspaceId);
    const [requestingAppId, setRequestingAppId] = useState<string | null>(null);

    /** Whether an item belongs in this person's navigation.
     *
     *  Checks module access as well as app access. Only app access was checked
     *  before, so every module toggle in the access templates, the bundles and
     *  the member editor was decorative: turn CRM's Inbox off and the Inbox link
     *  stayed in the sidebar and opened perfectly well. */
    const canAccessItem = (item: SidebarItemConfig): boolean => {
        if (accessUnavailable) return true; // nothing to filter by — see above
        const appId = getAppIdFromPath(item.href);
        if (!appId) return true; // Routes not in app catalog are accessible
        if (!hasAppAccess(appId)) return false;

        const moduleId = getModuleIdFromPath(item.href);
        if (!moduleId) return true;
        return hasModuleAccess(appId, moduleId);
    };

    /** Filter items recursively, dropping parents left with nothing under them.
     *
     *  A parent whose children have all been filtered out used to stay: it kept
     *  its own link and simply lost its expander, so "Uptime" remained in the
     *  sidebar as a dead heading for someone with access to none of its pages. */
    const filterItems = (items: SidebarItemConfig[]): SidebarItemConfig[] => {
        const result: SidebarItemConfig[] = [];
        for (const item of items) {
            if (!canAccessItem(item)) continue;
            if (!item.items?.length) {
                result.push(item);
                continue;
            }
            const children = filterItems(item.items);
            // A parent that had children and now has none is only worth keeping
            // if its own route is somewhere distinct to go.
            if (children.length === 0 && item.items.some(sub => sub.href === item.href)) {
                continue;
            }
            result.push({ ...item, items: children.length ? children : undefined });
        }
        return result;
    };

    const toggleSidebar = () => toggleCollapsed();
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
        const canPin = !hasSubmenu && !isCollapsed && item.href !== "/dashboard";
        const badgeCount = item.badge ? (badges[item.badge] ?? 0) : 0;
        const isItemPinned = pinnedItems.includes(item.href);

        return (
            <div key={item.href} className="group/nav">
                <div
                    className={cn(
                        "relative flex items-center gap-x-3 rounded-md px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground",
                        active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                        isCollapsed && "justify-center px-2"
                    )}
                    style={depth > 0 ? { paddingLeft: `${(depth * 12) + 12}px` } : undefined}
                >
                    <Link href={item.href} className="flex-1 flex items-center gap-x-3 truncate">
                        <Icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                        {/* Collapsed, the label is gone and a number would be
                            meaningless — so it becomes a dot that still says
                            "there is something here". */}
                        {badgeCount > 0 && (isCollapsed ? (
                            <span
                                data-testid={`sidebar-badge-dot-${item.badge}`}
                                aria-label={`${badgeCount} waiting`}
                                className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary"
                            />
                        ) : (
                            <span
                                data-testid={`sidebar-badge-${item.badge}`}
                                className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary"
                            >
                                {badgeCount > 99 ? "99+" : badgeCount}
                            </span>
                        ))}
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

                    {canPin && (
                        <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(item.href); }}
                            className={cn(
                                "p-0.5 rounded transition-opacity",
                                isItemPinned
                                    ? "text-primary opacity-100"
                                    : "opacity-0 group-hover/nav:opacity-100 text-muted-foreground hover:text-foreground"
                            )}
                            title={isItemPinned ? "Unpin from favorites" : "Pin to favorites"}
                        >
                            {isItemPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                        </button>
                    )}

                    {!isCollapsed && !hasSubmenu && !canPin && active && (
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
                        <span className="w-2" />
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

    // Collect discover items: both app-access-gated and persona-hidden items
    // Uses FULL layout (not persona-filtered) to surface everything not in main nav
    const discoverItems = useMemo((): DiscoverItem[] => {
        if (navIsResolving || accessUnavailable) return [];

        const seen = new Set<string>();
        const items: DiscoverItem[] = [];

        for (const section of layoutConfig.sections) {
            for (const item of section.items) {
                if (seen.has(item.href)) continue;
                seen.add(item.href);

                const isPersonaVisible = matchesPersona(section.personas, persona) && matchesPersona(item.personas, persona);
                const appId = getAppIdFromPath(item.href);
                const hasAccess = appId ? hasAppAccess(appId) : true;

                if (isPersonaVisible && hasAccess) continue; // Already in main nav

                const appDef = appId ? APP_CATALOG[appId] : undefined;
                const category: AppCategory | "other" = appDef?.category || "other";

                const reason: HiddenReason = !hasAccess ? "no_access" : "persona_hidden";
                const availableInPersonas = reason === "persona_hidden"
                    ? getItemPersonas(item.href, layoutConfig)
                    : undefined;

                items.push({ item, appId, appDef, category, reason, availableInPersonas });
            }
        }

        return items;
    }, [navIsResolving, accessUnavailable, layoutConfig, persona, hasAppAccess]);

    /** Split by *reason*, then group by category within each.
     *
     *  These used to share one list and one count, which made the number
     *  meaningless: "Discover more (18)" mixed apps you must ask an admin for
     *  with pages that are one click away in another view. They are different
     *  problems with different resolutions, so they are now different sections. */
    const groupByCategory = useCallback((items: DiscoverItem[]) => {
        const groups = new Map<AppCategory | "other", DiscoverItem[]>();
        for (const di of items) {
            const existing = groups.get(di.category) || [];
            existing.push(di);
            groups.set(di.category, existing);
        }
        return groups;
    }, []);

    const noAccessItems = useMemo(
        () => discoverItems.filter(d => d.reason === "no_access"),
        [discoverItems]
    );
    const personaHiddenItems = useMemo(
        () => discoverItems.filter(d => d.reason === "persona_hidden"),
        [discoverItems]
    );
    const groupedNoAccess = useMemo(
        () => groupByCategory(noAccessItems),
        [groupByCategory, noAccessItems]
    );
    const groupedPersonaHidden = useMemo(
        () => groupByCategory(personaHiddenItems),
        [groupByCategory, personaHiddenItems]
    );

    // Admin quick-enable: toggle an app on for the current user
    const handleToggleApp = async (appId: string) => {
        if (!workspaceId || !developerId || !effectiveAccess) return;

        setTogglingApp(appId);
        try {
            // Backend replaces full config, so rebuild from current state
            const appConfig: Record<string, { enabled: boolean; modules?: Record<string, boolean> }> = {};
            for (const [id, access] of Object.entries(effectiveAccess.apps)) {
                appConfig[id] = { enabled: access.enabled, modules: access.modules };
            }
            appConfig[appId] = { enabled: true };

            await appAccessApi.updateMemberAccess(workspaceId, developerId, {
                app_config: appConfig,
            });
            await refetchAccess();
        } catch (err) {
            // The spinner used to stop and nothing else happen: the failure went
            // to the console, so the app simply stayed disabled with no
            // explanation.
            //
            // The server's own reason first, because on a 403 it is more specific
            // than anything guessable from here — "requires the
            // 'can_manage_roles' permission in this workspace" names the exact
            // missing grant, where an invented sentence about roles would talk
            // over it. The fallback covers only a 403 that arrives with no detail
            // at all.
            const status = (err as { response?: { status?: number } })?.response?.status;
            toast.error(
                getApiErrorMessage(
                    err,
                    status === 403
                        ? "Your role cannot change app access here. Ask a workspace owner or admin."
                        : `Could not enable ${appId}.`
                )
            );
        } finally {
            setTogglingApp(null);
        }
    };

    // Render the Favorites section at the top of the sidebar
    const isFavoritesExpanded = expandedItems["__favorites"];
    const renderFavoritesSection = () => {
        if (isCollapsed) return null;
        // Cap applied after persona filtering, so a filtered-out item doesn't
        // silently consume one of the slots.
        const visibleFavorites = favoriteItems
            .filter(({ path }) => itemLookup.has(path))
            .slice(0, MAX_FAVORITES);
        if (visibleFavorites.length === 0) return null;

        return (
            <div className="mb-2 pb-2 border-b border-border/50">
                <button
                    onClick={(e) => toggleExpand("__favorites", e)}
                    className="w-full px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 hover:text-foreground transition-colors"
                >
                    <Star className="h-3 w-3" />
                    <span className="flex-1 text-left">Favorites</span>
                    <motion.div
                        animate={{ rotate: isFavoritesExpanded ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <ChevronRight className="h-3 w-3" />
                    </motion.div>
                </button>
                <AnimatePresence initial={false}>
                    {isFavoritesExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                        >
                            <div className="space-y-0.5">
                                {visibleFavorites.map(({ path, pinned }) => {
                                    const entry = itemLookup.get(path)!;
                                    const { item, parentLabel } = entry;
                                    const Icon = item.icon;
                                    const active = isActive(path);
                                    const tooltipLabel = parentLabel ? `${item.label} (${parentLabel})` : item.label;

                                    return (
                                        <div
                                            key={path}
                                            className={cn(
                                                "group/fav flex items-center gap-x-3 rounded-md px-3 py-1.5 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground",
                                                active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                                            )}
                                            title={tooltipLabel}
                                        >
                                            <Link href={path} className="flex-1 flex items-center gap-x-3 truncate min-w-0">
                                                <Icon className="h-4 w-4 shrink-0" />
                                                <span className="truncate">{item.label}</span>
                                                {parentLabel && (
                                                    <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-accent/80 text-muted-foreground/70 font-normal uppercase leading-none">
                                                        {parentLabel}
                                                    </span>
                                                )}
                                            </Link>
                                            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/fav:opacity-100 transition-opacity">
                                                {pinned ? (
                                                    <button
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(path); }}
                                                        className="p-0.5 rounded text-primary hover:text-primary/80"
                                                        title="Unpin"
                                                    >
                                                        <PinOff className="h-3 w-3" />
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(path); }}
                                                            className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                                                            title="Pin"
                                                        >
                                                            <Pin className="h-3 w-3" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissRecent(path); }}
                                                            className="p-0.5 rounded text-muted-foreground hover:text-destructive"
                                                            title="Remove"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
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

    // Render categorized "Discover more" section with persona-hidden + no-access items
    const categoryOrder: (AppCategory | "other")[] = ["engineering", "people", "business", "productivity", "other"];

    /** One collapsible group of discover items.
     *
     *  `key` distinguishes the two sections so each remembers its own expanded
     *  state, and `icon`/`title` name the actual problem: something you can ask
     *  for, versus something that is simply in another view. */
    const renderDiscoverGroup = (
        key: string,
        title: string,
        Icon: typeof Compass,
        items: DiscoverItem[],
        grouped: Map<AppCategory | "other", DiscoverItem[]>,
        showSettingsLink: boolean,
    ) => {
        if (items.length === 0 || isCollapsed) return null;
        const isExpanded = expandedItems[key];

        return (
            <div className="mb-2 mt-1 border-t border-border/50 pt-2">
                <button
                    onClick={(e) => toggleExpand(key, e)}
                    className="w-full flex items-center gap-x-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50 transition-all"
                >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left truncate">{title}</span>
                    <span className="text-[10px] bg-accent/80 px-1.5 py-0.5 rounded-full">{items.length}</span>
                    <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <ChevronRight className="h-3 w-3" />
                    </motion.div>
                </button>
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                        >
                            <div className="ml-4 mt-1 border-l border-border/30 pl-2 space-y-3">
                                {categoryOrder.map(cat => {
                                    const items = grouped.get(cat);
                                    if (!items || items.length === 0) return null;

                                    return (
                                        <div key={cat}>
                                            <p className="px-2 text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">
                                                {CATEGORY_LABELS[cat]}
                                            </p>
                                            <div className="space-y-0.5">
                                                {items.map(di => {
                                                    const Icon = di.item.icon;
                                                    const isToggling = togglingApp === di.appId;

                                                    return (
                                                        <div
                                                            key={di.item.href}
                                                            className="group/discover flex items-center gap-x-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/30 transition-all"
                                                        >
                                                            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-medium text-muted-foreground/70 truncate">
                                                                    {di.item.label}
                                                                </p>
                                                                {di.reason === "no_access" ? (
                                                                    <p className="text-[10px] text-muted-foreground/40 leading-tight">
                                                                        {!isAdmin && di.appId && getRequestForApp(di.appId) ? "Request pending" : "Not enabled"}
                                                                    </p>
                                                                ) : di.availableInPersonas && di.availableInPersonas.length > 0 ? (
                                                                    <p className="text-[10px] text-primary/50 leading-tight">
                                                                        Available in {di.availableInPersonas.map(p => PERSONA_LABELS[p] || p).join(", ")} view
                                                                    </p>
                                                                ) : null}
                                                            </div>

                                                            {/* Action button */}
                                                            {di.reason === "persona_hidden" ? (
                                                                <Link
                                                                    href={di.item.href}
                                                                    className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-primary opacity-0 group-hover/discover:opacity-100 transition-opacity"
                                                                    title={`Go to ${di.item.label}`}
                                                                >
                                                                    <ArrowRight className="h-3 w-3" />
                                                                </Link>
                                                            ) : isAdmin && di.appId ? (
                                                                <button
                                                                    onClick={() => handleToggleApp(di.appId!)}
                                                                    disabled={isToggling}
                                                                    className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-primary opacity-0 group-hover/discover:opacity-100 transition-opacity disabled:opacity-50"
                                                                    title={`Enable ${di.item.label}`}
                                                                >
                                                                    {isToggling ? (
                                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                                    ) : (
                                                                        <Plus className="h-3 w-3" />
                                                                    )}
                                                                </button>
                                                            ) : !isAdmin && di.appId && di.reason === "no_access" ? (
                                                                (() => {
                                                                    const pending = getRequestForApp(di.appId);
                                                                    const isRequesting = requestingAppId === di.appId && isCreatingRequest;
                                                                    if (pending) {
                                                                        return (
                                                                            <span
                                                                                className="shrink-0 p-1 text-amber-500/60"
                                                                                title="Request pending"
                                                                            >
                                                                                <Clock className="h-3 w-3" />
                                                                            </span>
                                                                        );
                                                                    }
                                                                    return (
                                                                        <button
                                                                            onClick={async () => {
                                                                                setRequestingAppId(di.appId!);
                                                                                try {
                                                                                    await createRequest({ appId: di.appId! });
                                                                                } catch (err) {
                                                                                    // `catch {}` here meant a failed
                                                                                    // request looked identical to a sent
                                                                                    // one: the icon returned to Send and
                                                                                    // nobody was ever asked.
                                                                                    toast.error(
                                                                                        getApiErrorMessage(
                                                                                            err,
                                                                                            "Could not send that request."
                                                                                        )
                                                                                    );
                                                                                }
                                                                                setRequestingAppId(null);
                                                                            }}
                                                                            disabled={isRequesting}
                                                                            className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-primary opacity-0 group-hover/discover:opacity-100 transition-opacity disabled:opacity-50"
                                                                            title={`Request access to ${di.item.label}`}
                                                                        >
                                                                            {isRequesting ? (
                                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                                            ) : (
                                                                                <Send className="h-3 w-3" />
                                                                            )}
                                                                        </button>
                                                                    );
                                                                })()
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Settings link for no_access items (admin only) */}
                                {showSettingsLink && isAdmin && (
                                    <Link
                                        href="/settings/access"
                                        className="flex items-center gap-x-2 rounded-md px-2 py-1.5 text-xs text-primary/70 hover:text-primary transition-all font-medium"
                                    >
                                        Manage access in Settings →
                                    </Link>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    const renderDiscoverSection = () => (
        <>
            {renderDiscoverGroup(
                "__discover_no_access",
                "Available to request",
                Lock,
                noAccessItems,
                groupedNoAccess,
                true,
            )}
            {renderDiscoverGroup(
                "__discover_persona",
                `Hidden in ${PERSONA_LABELS[persona] || persona} view`,
                Compass,
                personaHiddenItems,
                groupedPersonaHidden,
                false,
            )}
        </>
    );

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
                            {navIsResolving ? (
                                /* A skeleton, not an optimistic guess. Access used
                                   to default to "everything" while it loaded, so
                                   the full navigation painted and then items
                                   disappeared one group at a time as the real
                                   answer arrived — which is what made the sidebar
                                   feel unreliable. */
                                <div className="space-y-2" aria-busy="true" aria-label="Loading navigation">
                                    {SKELETON_ROWS.map((width, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center gap-x-3 px-3 py-2"
                                        >
                                            <div className="h-4 w-4 shrink-0 rounded bg-muted animate-pulse" />
                                            {!isCollapsed && (
                                                <div
                                                    className="h-3 rounded bg-muted animate-pulse"
                                                    style={{ width }}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <>
                                    {/* Favorites section - pinned + frequently used */}
                                    {renderFavoritesSection()}

                                    {/* Render sections based on persona-filtered layout config */}
                                    {personaConfig.sections.map(section => renderSection(section))}

                                    {/* Discover more tools - shows filtered-out modules */}
                                    {renderDiscoverSection()}
                                </>
                            )}
                        </nav>
                    </div>

                    <div className="border-t p-4">
                        <div className={cn("flex items-center gap-3 mb-4", isCollapsed && "flex-col gap-2")}>
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                                {user?.name?.[0] || "U"}
                            </div>
                            {!isCollapsed && (
                                <div className="flex-1 overflow-hidden">
                                    <p className="truncate text-sm font-medium">{user?.name || "User"}</p>
                                    <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                                    {/* Link, not a label: the view now comes from
                                        somewhere (a department, or your own
                                        choice), so it needs to be findable and
                                        changeable rather than just asserted. */}
                                    <Link
                                        href="/settings/appearance"
                                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        title={
                                            isPersonaDerived
                                                ? "This view comes from your department. Click to choose your own."
                                                : "Click to change your sidebar view"
                                        }
                                    >
                                        {PERSONA_LABELS[persona] || persona} view
                                        {isPersonaDerived && (
                                            <span className="text-muted-foreground/60"> · from department</span>
                                        )}
                                    </Link>
                                </div>
                            )}
                            <Link
                                href="/notifications"
                                className={cn(
                                    "relative p-1.5 rounded-md hover:bg-accent transition-all shrink-0",
                                    pathname === "/notifications" && "bg-accent text-accent-foreground"
                                )}
                                title="Notifications"
                            >
                                <Bell className="h-4 w-4 text-muted-foreground" />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full">
                                        {unreadCount > 99 ? "99+" : unreadCount}
                                    </span>
                                )}
                            </Link>
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
                            {!isCollapsed && (
                                <div className="px-3 py-1.5">
                                    <LocaleSelector />
                                </div>
                            )}
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
