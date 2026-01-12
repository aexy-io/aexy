/**
 * Dashboard Preferences Hook
 * React Query hook for fetching and updating dashboard preferences
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, DashboardPreferences, DashboardPreferencesUpdate } from '@/lib/api';
import { useDashboardStore } from '@/stores/dashboardStore';
import { DASHBOARD_PRESETS, PresetType } from '@/config/dashboardPresets';
import { WidgetSize } from '@/config/dashboardWidgets';
import { useCallback } from 'react';

const PREFERENCES_KEY = ['dashboard', 'preferences'];
const PRESETS_KEY = ['dashboard', 'presets'];
const WIDGETS_KEY = ['dashboard', 'widgets'];

export function useDashboardPreferences() {
  const queryClient = useQueryClient();
  const { setLocalPreferences, localPreferences, setModalOpen, setCustomizing } = useDashboardStore();

  // Fetch preferences
  const {
    data: preferences,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: dashboardApi.getPreferences,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Update preferences mutation
  const updateMutation = useMutation({
    mutationFn: dashboardApi.updatePreferences,
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
    mutationFn: (presetType: PresetType) => dashboardApi.resetPreferences(presetType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY });
    },
  });

  // Derived state - use local preferences for immediate updates, fall back to server data
  const effectivePreferences = localPreferences
    ? { ...preferences, ...localPreferences }
    : preferences;

  // Actions
  const setPreset = useCallback(
    async (presetType: PresetType) => {
      const preset = DASHBOARD_PRESETS[presetType];
      if (!preset) return;

      // Optimistic update
      setLocalPreferences({
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

      setLocalPreferences(null);
    },
    [updateMutation, setLocalPreferences]
  );

  const toggleWidget = useCallback(
    async (widgetId: string) => {
      if (!effectivePreferences) return;

      const currentWidgets = effectivePreferences.visible_widgets || [];
      const newWidgets = currentWidgets.includes(widgetId)
        ? currentWidgets.filter((id) => id !== widgetId)
        : [...currentWidgets, widgetId];

      // Optimistic update
      setLocalPreferences({
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

      setLocalPreferences(null);
    },
    [effectivePreferences, updateMutation, setLocalPreferences]
  );

  const reorderWidgets = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!effectivePreferences) return;

      const widgets = [...(effectivePreferences.widget_order || effectivePreferences.visible_widgets || [])];
      const [removed] = widgets.splice(fromIndex, 1);
      widgets.splice(toIndex, 0, removed);

      // Optimistic update
      setLocalPreferences({
        widget_order: widgets,
        preset_type: 'custom',
      });

      // Server update
      await updateMutation.mutateAsync({
        widget_order: widgets,
        preset_type: 'custom',
      });

      setLocalPreferences(null);
    },
    [effectivePreferences, updateMutation, setLocalPreferences]
  );

  const setWidgetSize = useCallback(
    async (widgetId: string, size: WidgetSize) => {
      if (!effectivePreferences) return;

      const newSizes = {
        ...(effectivePreferences.widget_sizes || {}),
        [widgetId]: size,
      };

      // Optimistic update
      setLocalPreferences({
        widget_sizes: newSizes,
        preset_type: 'custom',
      });

      // Server update
      await updateMutation.mutateAsync({
        widget_sizes: newSizes,
        preset_type: 'custom',
      });

      setLocalPreferences(null);
    },
    [effectivePreferences, updateMutation, setLocalPreferences]
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
    setLocalPreferences(null);
  }, [setModalOpen, setLocalPreferences]);

  const enterCustomizeMode = useCallback(() => {
    setCustomizing(true);
  }, [setCustomizing]);

  const exitCustomizeMode = useCallback(() => {
    setCustomizing(false);
    setLocalPreferences(null);
  }, [setCustomizing, setLocalPreferences]);

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
