"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { settingsNavigation, type SettingsNavItem } from "@/config/settingsNavigation";

interface SettingsSidebarProps {
  isAdmin: boolean;
  isEnterprise: boolean;
  onItemClick?: () => void;
}

export function SettingsSidebar({ isAdmin, isEnterprise, onItemClick }: SettingsSidebarProps) {
  const pathname = usePathname();

  const isActive = (item: SettingsNavItem) => {
    if (item.href === pathname) return true;
    // Match sub-routes like /settings/access/logs -> /settings/access
    if (!item.external && pathname.startsWith(item.href + "/")) return true;
    return false;
  };

  return (
    <nav className="space-y-6 py-2">
      {settingsNavigation.map((category) => {
        const visibleItems = category.items.filter(
          (item) => !item.adminOnly || isAdmin
        );

        if (visibleItems.length === 0) return null;

        return (
          <div key={category.id}>
            <h4 className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {category.label}
            </h4>
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);

                return (
                  <SimpleTooltip
                    key={item.id}
                    content={item.description}
                    side="right"
                  >
                    <Link
                      href={item.href}
                      onClick={onItemClick}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                        active
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {item.enterpriseBadge && !isEnterprise && (
                        <Crown className="h-3 w-3 text-amber-400 shrink-0 ml-auto" />
                      )}
                    </Link>
                  </SimpleTooltip>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
