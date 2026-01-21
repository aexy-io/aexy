/**
 * Theme Store
 * Zustand store for theme preference with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeStore {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
    resolvedTheme: 'dark' | 'light';
    setResolvedTheme: (theme: 'dark' | 'light') => void;
}

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: 'dark',
            resolvedTheme: 'dark',
            setTheme: (theme) => set({ theme }),
            setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
        }),
        {
            name: 'aexy-theme',
            partialize: (state) => ({ theme: state.theme }), // Only persist theme preference
        }
    )
);
