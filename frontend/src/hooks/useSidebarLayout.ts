/**
 * Sidebar Layout Hook
 * Wrapper around Zustand store for sidebar layout preference
 */

import { useSidebarStore } from '@/stores/sidebarStore';
import { SIDEBAR_LAYOUTS } from '@/config/sidebarLayouts';

export function useSidebarLayout() {
    const { layout, setLayout, getLayoutConfig } = useSidebarStore();

    return {
        layout,
        setLayout,
        layoutConfig: getLayoutConfig(),
        isLoaded: true, // Zustand hydrates synchronously after first render
        availableLayouts: SIDEBAR_LAYOUTS,
    };
}
