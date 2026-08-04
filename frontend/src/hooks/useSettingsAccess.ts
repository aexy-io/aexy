"use client";

import { usePathname } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePermissions } from "@/hooks/usePermissions";
import { useAdmin } from "@/hooks/useAdmin";
import {
  canAccessSettingsItem,
  getAllSettingsNavItems,
  type SettingsNavItem,
} from "@/config/settingsNavigation";

/**
 * Whether the current user may open the settings page they are on.
 *
 * Resolves the nav entry from the pathname rather than making each page name its
 * own permission, so the sidebar, the index and the page itself can never
 * disagree — one declaration in `settingsNavigation.ts` drives all three.
 *
 * `isLoading` matters: permissions arrive over the network, and treating "not
 * loaded yet" as "no access" would flash an access-denied panel at people who do
 * have access.
 */
export function useSettingsAccess(): {
  allowed: boolean;
  isLoading: boolean;
  item: SettingsNavItem | undefined;
} {
  const pathname = usePathname();
  const { currentWorkspaceId } = useWorkspace();
  const { permissions, isLoading, isWorkspaceOwner } = usePermissions(currentWorkspaceId);
  const { isAdmin: isPlatformAdmin } = useAdmin();

  // Longest matching href wins, so `/settings/organization/roles` resolves to the
  // Roles entry rather than to Organization — the two have different gates, and
  // matching the shorter one would hand out the owner-only page.
  const item = getAllSettingsNavItems()
    .filter((i) => !i.external && (pathname === i.href || pathname.startsWith(i.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0];

  // A page with no nav entry (a deep sub-route) inherits nothing — let it render
  // rather than locking out a legitimate page nobody remembered to register.
  if (!item) return { allowed: true, isLoading: false, item: undefined };

  return {
    allowed: canAccessSettingsItem(item, {
      permissions,
      isOwner: isWorkspaceOwner,
      isPlatformAdmin,
    }),
    isLoading,
    item,
  };
}
