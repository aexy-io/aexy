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
}

export const useSidebarStore = create<SidebarStore>()(
    persist(
        (set, get) => ({
            layout: DEFAULT_SIDEBAR_LAYOUT,
            setLayout: (layout) => set({ layout }),
            getLayoutConfig: () => SIDEBAR_LAYOUTS[get().layout],
        }),
        {
            name: 'aexy-sidebar-layout',
        }
    )
);
