import { useState, useMemo, useCallback } from "react";
import { SettingsNavItem } from "@/config/settingsNavigation";

export function useSettingsSearch(items: SettingsNavItem[]) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const results = useMemo(() => {
    if (!query.trim()) return [];

    const q = query.toLowerCase();
    return items.filter((item) => {
      if (item.label.toLowerCase().includes(q)) return true;
      if (item.description.toLowerCase().includes(q)) return true;
      return item.keywords.some((kw) => kw.toLowerCase().includes(q));
    });
  }, [items, query]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (results.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % results.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
          break;
        case "Escape":
          setQuery("");
          setSelectedIndex(0);
          break;
      }
    },
    [results.length]
  );

  const reset = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
  }, []);

  return {
    query,
    setQuery,
    results,
    selectedIndex,
    setSelectedIndex,
    onKeyDown,
    reset,
  };
}
