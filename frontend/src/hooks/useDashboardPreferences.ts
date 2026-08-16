/**
 * Dashboard Preferences Hook
 * React Query hook for fetching and updating dashboard preferences
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  dashboardApi,
  DashboardPreferences,
  DashboardPreferencesUpdate,
  DashboardSurface,
} from '@/lib/api';
import { useDashboardStore } from '@/stores/dashboardStore';
import { DASHBOARD_PRESETS, PresetType } from '@/config/dashboardPresets';
import { WidgetSize } from '@/config/dashboardWidgets';
import { useCallback } from 'react';

const PRESETS_KEY = ['dashboard', 'presets'];
const WIDGETS_KEY = ['dashboard', 'widgets'];

/** Preferences are cached per surface — two dashboards, two layouts. */
const preferencesKey = (surface: DashboardSurface) => ['dashboard', 'preferences', surface];

/**
 * Widget layout for one dashboard surface.
 *
 * `surface` decides which layout is read and written: "overview" (the default)
 * is the personal insights dashboard, "my_work" the home dashboard. Sidebar and
 * checklist state is shared — those live on the person, not on a dashboard.
 */
export function useDashboardPreferences(surface: DashboardSurface = 'overview') {
  const queryClient = useQueryClient();
  const {
    setLocalPreferences,
    localPreferences,
    localPreferencesSurface,
    setModalOpen,
    setCustomizing,
  } = useDashboardStore();
  const PREFERENCES_KEY = preferencesKey(surface);

  /** Optimistic write, tagged with the surface it belongs to. */
  const setLocal = useCallback(
    (prefs: Partial<DashboardPreferences> | null) => setLocalPreferences(prefs, surface),
    [setLocalPreferences, surface]
  );

  // Fetch preferences
  const {
    data: preferences,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: () => dashboardApi.getPreferences(surface),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Update preferences mutation
  const updateMutation = useMutation({
    mutationFn: (data: DashboardPreferencesUpdate) =>
      dashboardApi.updatePreferences(data, surface),
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: PREFERENCES_KEY });

      // Snapshot current value
      const previousPreferences = queryClient.getQueryData<DashboardPreferences>(PREFERENCES_KEY);

      // Optimistically update
      if (previousPreferences) {
        queryClient.setQueryData<DashboardPreferences>(PREFERENCES_KEY, {
          ...previousPreferences,
          ...newData,
        });
      }

      return { previousPreferences };
    },
    onError: (_err, _newData, context) => {
      // Rollback on error
      if (context?.previousPreferences) {
        queryClient.setQueryData(PREFERENCES_KEY, context.previousPreferences);
      }
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY });
    },
  });

  // Reset preferences mutation
  const resetMutation = useMutation({
    mutationFn: (presetType: PresetType) => dashboardApi.resetPreferences(presetType, surface),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY });
    },
  });

  // Derived state - use local preferences for immediate updates, fall back to
  // server data. The optimistic copy is tagged with the surface that set it:
  // the sidebar reads this hook too, and without the tag one dashboard's
  // in-flight widget edit would briefly appear to be the other's.
  const effectivePreferences =
    localPreferences && localPreferencesSurface === surface
      ? { ...preferences, ...localPreferences }
      : preferences;

  // Actions
  const setPreset = useCallback(
    async (presetType: PresetType) => {
      const preset = DASHBOARD_PRESETS[presetType];
      if (!preset) return;

      // Optimistic update
      setLocal({
        preset_type: presetType,
        visible_widgets: preset.widgets,
        widget_order: preset.widgets,
        widget_sizes: {},
      });

      // Server update
      await updateMutation.mutateAsync({
        preset_type: presetType,
        visible_widgets: preset.widgets,
        widget_order: preset.widgets,
        widget_sizes: {},
      });

      setLocal(null);
    },
    [updateMutation, setLocal]
  );

  const toggleWidget = useCallback(
    async (widgetId: string) => {
      if (!effectivePreferences) return;

      const currentWidgets = effectivePreferences.visible_widgets || [];
      const newWidgets = currentWidgets.includes(widgetId)
        ? currentWidgets.filter((id) => id !== widgetId)
        : [...currentWidgets, widgetId];

      // Optimistic update
      setLocal({
        visible_widgets: newWidgets,
        widget_order: newWidgets,
        preset_type: 'custom', // Switching to custom when manually editing
      });

      // Server update
      await updateMutation.mutateAsync({
        visible_widgets: newWidgets,
        widget_order: newWidgets,
        preset_type: 'custom',
      });

      setLocal(null);
    },
    [effectivePreferences, updateMutation, setLocal]
  );

  const reorderWidgets = useCallback(
    async (activeId: string, overId: string) => {
      if (!effectivePreferences) return;

      const widgets = [...(effectivePreferences.widget_order || effectivePreferences.visible_widgets || [])];
      const fromIndex = widgets.indexOf(activeId);
      const toIndex = widgets.indexOf(overId);
      if (fromIndex === -1 || toIndex === -1) return;

      const [removed] = widgets.splice(fromIndex, 1);
      widgets.splice(toIndex, 0, removed);

      // Optimistic update
      setLocal({
        widget_order: widgets,
        preset_type: 'custom',
      });

      // Server update
      await updateMutation.mutateAsync({
        widget_order: widgets,
        preset_type: 'custom',
      });

      setLocal(null);
    },
    [effectivePreferences, updateMutation, setLocal]
  );

  const setWidgetSize = useCallback(
    async (widgetId: string, size: WidgetSize) => {
      if (!effectivePreferences) return;

      const newSizes = {
        ...(effectivePreferences.widget_sizes || {}),
        [widgetId]: size,
      };

      // Optimistic update
      setLocal({
        widget_sizes: newSizes,
        preset_type: 'custom',
      });

      // Server update
      await updateMutation.mutateAsync({
        widget_sizes: newSizes,
        preset_type: 'custom',
      });

      setLocal(null);
    },
    [effectivePreferences, updateMutation, setLocal]
  );

  const updateChecklist = useCallback(
    async (stepId: string) => {
      const current = effectivePreferences?.checklist_progress || [];
      if (current.includes(stepId)) return;
      const updated = [...current, stepId];

      setLocal({ checklist_progress: updated });

      await updateMutation.mutateAsync({ checklist_progress: updated });
      setLocal(null);
    },
    [effectivePreferences, updateMutation, setLocal]
  );

  const dismissChecklist = useCallback(
    async () => {
      setLocal({ checklist_dismissed: true });

      await updateMutation.mutateAsync({ checklist_dismissed: true });
      setLocal(null);
    },
    [updateMutation, setLocal]
  );

  const resetToPreset = useCallback(
    async (presetType: PresetType = 'developer') => {
      await resetMutation.mutateAsync(presetType);
    },
    [resetMutation]
  );

  const openCustomizeModal = useCallback(() => {
    setModalOpen(true);
  }, [setModalOpen]);

  const closeCustomizeModal = useCallback(() => {
    setModalOpen(false);
    setLocal(null);
  }, [setModalOpen, setLocal]);

  const enterCustomizeMode = useCallback(() => {
    setCustomizing(true);
  }, [setCustomizing]);

  const exitCustomizeMode = useCallback(() => {
    setCustomizing(false);
    setLocal(null);
  }, [setCustomizing, setLocal]);

  return {
    // Data
    preferences: effectivePreferences as DashboardPreferences | undefined,
    isLoading,
    error,
    isUpdating: updateMutation.isPending,
    isResetting: resetMutation.isPending,

    // Actions
    setPreset,
    toggleWidget,
    reorderWidgets,
    setWidgetSize,
    resetToPreset,
    updateChecklist,
    dismissChecklist,
    refetch,

    // UI actions
    openCustomizeModal,
    closeCustomizeModal,
    enterCustomizeMode,
    exitCustomizeMode,
  };
}

/**
 * Hook to fetch available presets from server
 */
export function useDashboardPresets() {
  return useQuery({
    queryKey: PRESETS_KEY,
    queryFn: dashboardApi.getPresets,
    staleTime: 30 * 60 * 1000, // 30 minutes - presets rarely change
  });
}

/**
 * Hook to fetch available widgets from server
 */
export function useDashboardWidgets() {
  return useQuery({
    queryKey: WIDGETS_KEY,
    queryFn: dashboardApi.getWidgets,
    staleTime: 30 * 60 * 1000, // 30 minutes - widgets rarely change
  });
}
