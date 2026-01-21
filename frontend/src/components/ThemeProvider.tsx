"use client";

import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { theme, setResolvedTheme } = useThemeStore();

    useEffect(() => {
        const updateTheme = () => {
            let resolvedTheme: 'dark' | 'light';

            if (theme === 'system') {
                resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            } else {
                resolvedTheme = theme;
            }

            setResolvedTheme(resolvedTheme);

            // Apply theme class to document
            const root = document.documentElement;
            if (resolvedTheme === 'light') {
                root.classList.add('light');
                root.classList.remove('dark');
            } else {
                root.classList.remove('light');
                root.classList.add('dark');
            }
        };

        updateTheme();

        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (theme === 'system') {
                updateTheme();
            }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme, setResolvedTheme]);

    return <>{children}</>;
}
