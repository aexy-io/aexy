/**
 * Dashboard Store
 * Zustand store for managing dashboard customization state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DashboardPreferences } from '@/lib/api';
import type { PresetType } from '@/config/dashboardPresets';
import type { WidgetSize } from '@/config/dashboardWidgets';

interface DashboardState {
  // UI State
  isCustomizing: boolean;
  isModalOpen: boolean;

  // Optimistic state (for immediate UI updates before API confirms)
  localPreferences: Partial<DashboardPreferences> | null;

  // Actions
  setCustomizing: (value: boolean) => void;
  setModalOpen: (value: boolean) => void;
  setLocalPreferences: (preferences: Partial<DashboardPreferences> | null) => void;

  // Widget management (local/optimistic)
  toggleWidgetVisibility: (widgetId: string, currentWidgets: string[]) => string[];
  reorderWidgets: (widgets: string[], fromIndex: number, toIndex: number) => string[];
  setWidgetSize: (widgetId: string, size: WidgetSize, currentSizes: Record<string, WidgetSize>) => Record<string, WidgetSize>;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      // Initial state
      isCustomizing: false,
      isModalOpen: false,
      localPreferences: null,

      // Actions
      setCustomizing: (value) => set({ isCustomizing: value }),
      setModalOpen: (value) => set({ isModalOpen: value }),
      setLocalPreferences: (preferences) => set({ localPreferences: preferences }),

      // Widget visibility toggle (returns new array)
      toggleWidgetVisibility: (widgetId, currentWidgets) => {
        if (currentWidgets.includes(widgetId)) {
          return currentWidgets.filter((id) => id !== widgetId);
        }
        return [...currentWidgets, widgetId];
      },

      // Reorder widgets (returns new array)
      reorderWidgets: (widgets, fromIndex, toIndex) => {
        const newWidgets = [...widgets];
        const [removed] = newWidgets.splice(fromIndex, 1);
        newWidgets.splice(toIndex, 0, removed);
        return newWidgets;
      },

      // Set widget size (returns new sizes object)
      setWidgetSize: (widgetId, size, currentSizes) => {
        return {
          ...currentSizes,
          [widgetId]: size,
        };
      },
    }),
    {
      name: 'dashboard-ui-state',
      partialize: (state) => ({
        // Only persist UI state, not preferences (those come from API)
        isCustomizing: state.isCustomizing,
      }),
    }
  )
);

/**
 * Selector hooks for specific state slices
 */
export const useIsCustomizing = () => useDashboardStore((state) => state.isCustomizing);
export const useIsModalOpen = () => useDashboardStore((state) => state.isModalOpen);
export const useLocalPreferences = () => useDashboardStore((state) => state.localPreferences);
