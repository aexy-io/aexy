/**
 * Theme Hook
 * Wrapper around Zustand store for theme preference
 */

import { useEffect } from 'react';
import { useThemeStore, ThemeMode } from '@/stores/themeStore';

export function useTheme() {
    const { theme, setTheme, resolvedTheme, setResolvedTheme } = useThemeStore();

    useEffect(() => {
        const updateResolvedTheme = () => {
            if (theme === 'system') {
                const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                setResolvedTheme(systemTheme);
            } else {
                setResolvedTheme(theme);
            }
        };

        updateResolvedTheme();

        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (theme === 'system') {
                updateResolvedTheme();
            }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme, setResolvedTheme]);

    useEffect(() => {
        // Apply theme class to document
        const root = document.documentElement;

        if (resolvedTheme === 'light') {
            root.classList.add('light');
            root.classList.remove('dark');
        } else {
            root.classList.remove('light');
            root.classList.add('dark');
        }
    }, [resolvedTheme]);

    return {
        theme,
        setTheme,
        resolvedTheme,
        isDark: resolvedTheme === 'dark',
        isLight: resolvedTheme === 'light',
    };
}

export type { ThemeMode };
