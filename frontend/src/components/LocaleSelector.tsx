"use client";

import { useLocaleStore, LOCALE_LABELS, SUPPORTED_LOCALES, type SupportedLocale } from "@/stores/localeStore";
import { Globe } from "lucide-react";

export function LocaleSelector() {
  const { locale, setLocale } = useLocaleStore();

  const handleChange = (newLocale: SupportedLocale) => {
    setLocale(newLocale);
    // Reload to apply new locale from server
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-2">
      <Globe className="h-4 w-4 text-muted-foreground" />
      <select
        value={locale}
        onChange={(e) => handleChange(e.target.value as SupportedLocale)}
        className="bg-transparent border-none text-sm text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
        aria-label="Select language"
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_LABELS[loc]}
          </option>
        ))}
      </select>
    </div>
  );
}
