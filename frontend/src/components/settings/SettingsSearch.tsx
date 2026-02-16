"use client";

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsSearch } from "@/hooks/useSettingsSearch";
import { getAllSettingsNavItems, type SettingsNavItem } from "@/config/settingsNavigation";

interface SettingsSearchProps {
  isAdmin: boolean;
}

export function SettingsSearch({ isAdmin }: SettingsSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const items = getAllSettingsNavItems().filter(
    (item) => !item.adminOnly || isAdmin
  );

  const { query, setQuery, results, selectedIndex, setSelectedIndex, onKeyDown, reset } =
    useSettingsSearch(items);

  const handleSelect = (item: SettingsNavItem) => {
    router.push(item.href);
    reset();
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
      return;
    }
    onKeyDown(e);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        reset();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [reset]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search settings..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-3 py-1.5 text-sm bg-accent/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {query.trim() && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden"
        >
          {results.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                  index === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/50"
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{item.label}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {query.trim() && results.length === 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 p-3"
        >
          <p className="text-sm text-muted-foreground text-center">
            No settings found
          </p>
        </div>
      )}
    </div>
  );
}
