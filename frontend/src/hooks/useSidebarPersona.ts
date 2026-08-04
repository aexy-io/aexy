/**
 * Sidebar Persona Hook
 * Provides persona-based filtering for sidebar sections/items,
 * computes frequently-used items, and manages pinned items.
 *
 * The persona used to be `preferences.preset_type` — the *dashboard widget*
 * preset, which defaults to "developer" and which nothing but Settings →
 * Appearance ever set. So every person who joined navigated the product as a
 * developer until they happened across an unrelated settings page, whatever they
 * were hired to do.
 *
 * Now it resolves in three steps: an explicit personal choice
 * (`sidebar_persona`) wins; failing that, the view implied by the person's
 * primary department; failing that, "developer".
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { dashboardApi, DashboardPreferences } from "@/lib/api";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { useAppAccess } from "@/hooks/useAppAccess";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  SidebarSectionConfig,
  SidebarLayoutConfig,
} from "@/config/sidebarLayouts";

const DEFAULT_PERSONA = "developer";
const MIN_VISITS_FOR_FREQUENT = 3;
/** How many favourites the sidebar shows. Exported because the cap has to be
 *  applied *after* persona filtering, which happens in the sidebar — it used to
 *  be declared here, unused, and hardcoded again there. */
export const MAX_FAVORITES = 5;
/** Return extra candidates so persona filtering in the sidebar doesn't leave gaps */
const MAX_FAVORITES_CANDIDATES = 15;
const PREFERENCES_KEY = ["dashboard", "preferences"];

/** Check if an item is visible for a given persona */
function matchesPersona(personas: string[] | undefined, persona: string): boolean {
  if (!personas || personas.length === 0) return true;
  return personas.includes(persona);
}

export function useSidebarPersona() {
  const queryClient = useQueryClient();
  const { preferences, isLoading } = useDashboardPreferences();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { suggestedPersona, isLoading: accessLoading } = useAppAccess(
    currentWorkspace?.id ?? null,
    user?.id ?? null
  );

  const chosenPersona = preferences?.sidebar_persona || null;
  const persona = chosenPersona || suggestedPersona || DEFAULT_PERSONA;
  /** True when the view comes from the department rather than a personal choice. */
  const isPersonaDerived = !chosenPersona && !!suggestedPersona;
  // Memoised so the `|| {}` fallback doesn't mint a new object on every render
  // and invalidate every memo and callback below it.
  const pageVisits = useMemo(
    () => preferences?.sidebar_page_visits || {},
    [preferences?.sidebar_page_visits]
  );
  const pinnedItems = useMemo(
    () => preferences?.sidebar_pinned_items || [],
    [preferences?.sidebar_pinned_items]
  );

  /** Filter a layout config by persona, removing sections/items that don't match */
  const filterByPersona = useCallback(
    (layout: SidebarLayoutConfig): SidebarLayoutConfig => {
      // Admin and custom see everything
      if (persona === "admin" || persona === "custom") return layout;

      const filteredSections: SidebarSectionConfig[] = [];

      for (const section of layout.sections) {
        if (!matchesPersona(section.personas, persona)) continue;

        const filteredItems = section.items.filter((item) =>
          matchesPersona(item.personas, persona)
        );

        if (filteredItems.length > 0) {
          filteredSections.push({ ...section, items: filteredItems });
        }
      }

      return { ...layout, sections: filteredSections };
    },
    [persona]
  );

  /** Compute favorite items: pinned first, then auto-detected from visits */
  const favoriteItems = useMemo(() => {
    const favorites: Array<{ path: string; pinned: boolean }> = [];

    for (const path of pinnedItems) {
      favorites.push({ path, pinned: true });
    }

    const sortedVisits = Object.entries(pageVisits)
      .filter(([path, count]) => count >= MIN_VISITS_FOR_FREQUENT && !pinnedItems.includes(path))
      .sort((a, b) => b[1] - a[1]);

    for (const [path] of sortedVisits) {
      if (favorites.length >= MAX_FAVORITES_CANDIDATES) break;
      favorites.push({ path, pinned: false });
    }

    return favorites;
  }, [pageVisits, pinnedItems]);

  /** Toggle a path in the pinned items list — optimistic update + server persist */
  const togglePin = useCallback(
    (path: string) => {
      const current = [...pinnedItems];
      const idx = current.indexOf(path);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(path);
      }

      // Optimistic cache update
      const prev = queryClient.getQueryData<DashboardPreferences>(PREFERENCES_KEY);
      if (prev) {
        queryClient.setQueryData<DashboardPreferences>(PREFERENCES_KEY, {
          ...prev,
          sidebar_pinned_items: current,
        });
      }

      // Persist to server, rollback on failure, invalidate on success
      dashboardApi.updatePreferences({ sidebar_pinned_items: current }).then(() => {
        queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY });
      }).catch(() => {
        if (prev) {
          queryClient.setQueryData(PREFERENCES_KEY, prev);
        }
      });
    },
    [pinnedItems, queryClient]
  );

  /** Remove a path from recent/auto-detected favorites by zeroing its visit count */
  const dismissRecent = useCallback(
    (path: string) => {
      const prev = queryClient.getQueryData<DashboardPreferences>(PREFERENCES_KEY);
      const updatedVisits = { ...(prev?.sidebar_page_visits || pageVisits) };
      delete updatedVisits[path];

      // Optimistic cache update
      if (prev) {
        queryClient.setQueryData<DashboardPreferences>(PREFERENCES_KEY, {
          ...prev,
          sidebar_page_visits: updatedVisits,
        });
      }

      // Persist to server
      dashboardApi.updatePreferences({ sidebar_page_visits: updatedVisits }).then(() => {
        queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY });
      }).catch(() => {
        if (prev) {
          queryClient.setQueryData(PREFERENCES_KEY, prev);
        }
      });
    },
    [pageVisits, queryClient]
  );

  /**
   * Pin the sidebar view to an explicit choice, or pass null to go back to
   * following the department.
   *
   * Null is sent to the API as `""`, because a JSON null is indistinguishable
   * from the nulls every other untouched field carries in a PATCH.
   */
  const setPersona = useCallback(
    (next: string | null) => {
      const prev = queryClient.getQueryData<DashboardPreferences>(PREFERENCES_KEY);
      if (prev) {
        queryClient.setQueryData<DashboardPreferences>(PREFERENCES_KEY, {
          ...prev,
          sidebar_persona: next,
        });
      }

      dashboardApi
        .updatePreferences({ sidebar_persona: next ?? "" })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY });
        })
        .catch(() => {
          if (prev) {
            queryClient.setQueryData(PREFERENCES_KEY, prev);
          }
        });
    },
    [queryClient]
  );

  return {
    persona,
    /** The person's explicit choice, or null when following their department. */
    chosenPersona,
    /** What their department implies, whether or not it is being used. */
    suggestedPersona,
    isPersonaDerived,
    setPersona,
    // Persona filtering runs off access data too, so callers that render a
    // skeleton should wait for both rather than filtering with a default view.
    isLoading: isLoading || accessLoading,
    filterByPersona,
    favoriteItems,
    pinnedItems,
    togglePin,
    dismissRecent,
  };
}
