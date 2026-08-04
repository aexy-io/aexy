"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Crown, ExternalLink, Search, Shield, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";
import {
  canAccessSettingsItem,
  settingsNavigation,
  type SettingsNavCategory,
  type SettingsNavItem,
} from "@/config/settingsNavigation";

interface SettingsSidebarProps {
  /** The caller's effective workspace permissions. */
  permissions: string[];
  isOwner: boolean;
  isPlatformAdmin: boolean;
  isEnterprise: boolean;
  onItemClick?: () => void;
}

// Collapsed groups persist, so someone who works in Billing every day isn't
// scrolling past Development each time.
const COLLAPSED_KEY = "settings_collapsed_categories";

function loadCollapsed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // A corrupt value shouldn't cost the user their navigation.
    return [];
  }
}

export function SettingsSidebar({
  permissions,
  isOwner,
  isPlatformAdmin,
  isEnterprise,
  onItemClick,
}: SettingsSidebarProps) {
  const pathname = usePathname();
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);

  // Read on mount rather than in useState: this component renders on the server
  // too, and seeding from localStorage there would hydrate mismatched.
  useEffect(() => setCollapsed(loadCollapsed()), []);

  const persistCollapsed = (next: string[]) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
    } catch {
      // Private-mode storage failures are not worth surfacing.
    }
  };

  const isActive = (item: SettingsNavItem) => {
    if (item.href === pathname) return true;
    // Match sub-routes like /settings/access/logs -> /settings/access
    if (!item.external && pathname.startsWith(item.href + "/")) return true;
    return false;
  };

  const query = filter.trim().toLowerCase();

  const visible = useMemo(() => {
    const matches = (item: SettingsNavItem) => {
      if (!query) return true;
      return (
        item.label.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.keywords.some((k) => k.toLowerCase().includes(query))
      );
    };

    return settingsNavigation
      .map((category: SettingsNavCategory) => ({
        ...category,
        items: category.items.filter(
          (item) =>
            canAccessSettingsItem(item, { permissions, isOwner, isPlatformAdmin }) && matches(item)
        ),
      }))
      .filter((category) => category.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions.join(","), isOwner, isPlatformAdmin, query]);

  const activeCategoryId = useMemo(
    () => visible.find((c) => c.items.some(isActive))?.id,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, pathname]
  );

  return (
    <nav className="py-2">
      <div className="relative mb-3 px-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter settings"
          aria-label="Filter settings"
          className="w-full rounded-md border border-border bg-background/60 py-1.5 pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {filter && (
          <button
            type="button"
            onClick={() => setFilter("")}
            aria-label="Clear filter"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {visible.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          Nothing matches “{filter}”.
        </p>
      )}

      <div className="space-y-4">
        {visible.map((category) => {
          // While filtering, everything stays open — hiding a match behind a
          // collapsed header is the one thing a filter must never do.
          const isCollapsed = !query && collapsed.includes(category.id) && category.id !== activeCategoryId;
          const allRestricted = category.items.every((i) => i.ownerOnly || i.platformAdminOnly);

          return (
            <div key={category.id}>
              <button
                type="button"
                onClick={() =>
                  persistCollapsed(
                    isCollapsed
                      ? collapsed.filter((id) => id !== category.id)
                      : [...collapsed, category.id]
                  )
                }
                aria-expanded={!isCollapsed}
                disabled={!!query}
                className={cn(
                  "group flex w-full items-center gap-1.5 rounded px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors",
                  !query && "hover:text-foreground"
                )}
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 shrink-0 transition-transform",
                    isCollapsed && "-rotate-90",
                    query && "opacity-0"
                  )}
                  aria-hidden
                />
                <span className="truncate">{category.label}</span>
                {allRestricted && (
                  <SimpleTooltip content="Restricted to the workspace owner" side="right">
                    <Shield className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden />
                  </SimpleTooltip>
                )}
              </button>

              {!isCollapsed && (
                <div className="mt-0.5 space-y-0.5">
                  {category.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item);

                    return (
                      <SimpleTooltip
                        key={item.id}
                        content={item.description}
                        side="right"
                        // Block-level: the default `inline-block` makes these
                        // flow inline and short labels share a row.
                        className="block w-full"
                      >
                        <Link
                          href={item.href}
                          onClick={onItemClick}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                            active
                              ? "bg-accent font-medium text-accent-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="truncate">{item.label}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-1">
                            {/* These two leave the settings shell entirely. */}
                            {item.external && (
                              <ExternalLink className="h-3 w-3 text-muted-foreground/50" aria-hidden />
                            )}
                            {item.enterpriseBadge && !isEnterprise && (
                              <Crown className="h-3 w-3 text-amber-400" aria-hidden />
                            )}
                          </span>
                        </Link>
                      </SimpleTooltip>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
