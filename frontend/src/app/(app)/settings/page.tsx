"use client";

/**
 * The Settings index.
 *
 * This route used to be a bare `router.replace("/settings/appearance")`, so
 * "Settings" dropped you into the theme picker with no sense of what else was
 * there — 29 destinations, discoverable only by reading the sidebar top to
 * bottom. The descriptions and keywords already existed in
 * `config/settingsNavigation.ts`; nothing was showing them.
 */

import Link from "next/link";
import { ChevronRight, Crown, ExternalLink, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscription } from "@/hooks/useSubscription";
import { useAdmin } from "@/hooks/useAdmin";
import {
  canAccessSettingsItem,
  settingsNavigation,
  type SettingsNavItem,
} from "@/config/settingsNavigation";
import { SettingsPage, SettingsSection } from "@/components/settings/SettingsPrimitives";
import { useTranslations } from "next-intl";

export default function SettingsIndexPage() {
  const t = useTranslations("settingsIndex");
  const { currentWorkspaceId } = useWorkspace();
  const { isEnterprise } = useSubscription(currentWorkspaceId);
  const { isAdmin: isPlatformAdmin } = useAdmin();
  const { permissions, isWorkspaceOwner } = usePermissions(currentWorkspaceId);

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const categories = useMemo(() => {
    const matches = (item: SettingsNavItem) =>
      !q ||
      item.label.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.toLowerCase().includes(q));

    return settingsNavigation
      .map((category) => ({
        ...category,
        items: category.items.filter(
          (item) =>
            canAccessSettingsItem(item, {
              permissions,
              isOwner: isWorkspaceOwner,
              isPlatformAdmin,
            }) && matches(item)
        ),
      }))
      .filter((category) => category.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions.join(","), isWorkspaceOwner, isPlatformAdmin, q]);

  const total = categories.reduce((n, c) => n + c.items.length, 0);

  return (
    <SettingsPage title={t("title")} description={t("description")} width="wide">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("clear")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {q && (
        <p className="text-xs text-muted-foreground" role="status">
          {total === 0 ? t("noMatches", { query }) : t("matches", { count: total, query })}
        </p>
      )}

      {categories.map((category) => (
        <SettingsSection key={category.id} title={category.label} flush>
          <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
            {category.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    "group flex items-start gap-3 bg-surface p-4 transition-colors",
                    "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  )}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {item.label}
                      </span>
                      {item.external && (
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden />
                      )}
                      {item.enterpriseBadge && !isEnterprise && (
                        <Crown className="h-3 w-3 shrink-0 text-amber-400" aria-hidden />
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                  <ChevronRight
                    className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>
        </SettingsSection>
      ))}
    </SettingsPage>
  );
}
