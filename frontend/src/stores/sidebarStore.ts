/**
 * Sidebar Layout Store
 * Zustand store for sidebar layout preference with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    SidebarLayoutType,
    SIDEBAR_LAYOUTS,
    DEFAULT_SIDEBAR_LAYOUT,
    SidebarLayoutConfig
} from '@/config/sidebarLayouts';

interface SidebarStore {
    layout: SidebarLayoutType;
    setLayout: (layout: SidebarLayoutType) => void;
    getLayoutConfig: () => SidebarLayoutConfig;

    /** Narrowed to icons only. Persisted: this was component state, so someone
     *  who prefers the narrow sidebar had to re-collapse it on every reload. */
    isCollapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
    toggleCollapsed: () => void;
}

export const useSidebarStore = create<SidebarStore>()(
    persist(
        (set, get) => ({
            layout: DEFAULT_SIDEBAR_LAYOUT,
            setLayout: (layout) => set({ layout }),
            getLayoutConfig: () => SIDEBAR_LAYOUTS[get().layout],

            isCollapsed: false,
            setCollapsed: (isCollapsed) => set({ isCollapsed }),
            toggleCollapsed: () => set({ isCollapsed: !get().isCollapsed }),
        }),
        {
            name: 'aexy-sidebar-layout',
            // `isHidden` is deliberately NOT persisted: it is set automatically on
            // docs and automation-editor pages, so persisting it would leave
            // someone with no sidebar on their next visit to an unrelated page
            // with no obvious way to get it back.
            partialize: (state) => ({
                layout: state.layout,
                isCollapsed: state.isCollapsed,
            }),
        }
    )
);
