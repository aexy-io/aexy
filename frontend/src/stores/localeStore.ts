/**
 * Locale Store
 * Zustand store for language preference with localStorage persistence + cookie sync
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SupportedLocale = "en" | "hi";

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  hi: "हिन्दी",
};

export const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "hi"];

interface LocaleStore {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
}

export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set) => ({
      locale: "en",
      setLocale: (locale) => {
        // Sync to cookie for middleware to read on next request
        if (typeof document !== "undefined") {
          document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
        }
        set({ locale });
      },
    }),
    {
      name: "aexy-locale",
      partialize: (state) => ({ locale: state.locale }),
    }
  )
);
