/**
 * Theme Store
 * Zustand store for theme preference with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light' | 'system';

/**
 * What a visitor with no saved preference gets.
 *
 * Open Ledger is a paper design, so this is on its way to 'light'. It is still
 * 'dark' because of a measurement, not an opinion: `npm run audit:contrast`
 * over ten representative routes reports **49 text nodes below a 3:1 contrast
 * ratio in light versus 1 in dark**. The whole app was authored against the
 * dark palette — `text-green-400` on a card reads fine on #0E1512 and is
 * near-invisible on paper — and there are 12,485 raw palette classes still
 * carrying that assumption.
 *
 * Flipping this line today would ship those 49 as real accessibility failures
 * to every new user. So the flip is staged: the token layer, the status slots
 * and the 2px radius land now and improve both themes; this constant goes to
 * 'light' in the PR that finishes migrating the high-traffic modules, when the
 * audit reads zero. It is a one-line change gated on a number.
 *
 * Note the CSS cascade already puts paper on `:root` — that is the end state
 * and is what an unstamped document paints. Only the stored *preference*
 * default lags.
 *
 * The pre-hydration script in app/layout.tsx is interpolated with this value
 * rather than repeating the literal. The two must agree: if the script assumes
 * one default and the store another, the class stamped before paint is
 * replaced by a different one on hydration, which is the exact flash the
 * script exists to prevent.
 */
export const DEFAULT_THEME: ThemeMode = 'dark';

/** localStorage key. Shared with the pre-hydration script for the same reason. */
export const THEME_STORAGE_KEY = 'aexy-theme';

/**
 * Collapse a preference to the class actually stamped on <html>.
 *
 * 'system' can only be resolved in the browser, so callers without a
 * `matchMedia` result (the store's initial state, SSR) get the light face —
 * matching what the pre-hydration script falls back to.
 */
export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
    return mode === 'dark' ? 'dark' : 'light';
}

interface ThemeStore {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
    resolvedTheme: 'dark' | 'light';
    setResolvedTheme: (theme: 'dark' | 'light') => void;
}

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: DEFAULT_THEME,
            resolvedTheme: resolveTheme(DEFAULT_THEME),
            setTheme: (theme) => set({ theme }),
            setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
        }),
        {
            name: THEME_STORAGE_KEY,
            partialize: (state) => ({ theme: state.theme }), // Only persist theme preference
        }
    )
);
