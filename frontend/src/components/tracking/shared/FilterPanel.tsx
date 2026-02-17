"use client";

import { useState, ReactNode } from "react";
import { Filter, ChevronDown, X } from "lucide-react";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  type: "select" | "multiselect" | "text" | "boolean";
  options?: FilterOption[];
  placeholder?: string;
}

export interface FilterValues {
  [key: string]: string | string[] | boolean | undefined;
}

interface FilterPanelProps {
  filters: FilterConfig[];
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  onClear?: () => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  className?: string;
  children?: ReactNode;
}

export function FilterPanel({
  filters,
  values,
  onChange,
  onClear,
  collapsible = true,
  defaultExpanded = false,
  className = "",
  children,
}: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const activeFiltersCount = Object.values(values).filter(
    (v) => v !== undefined && v !== "" && (Array.isArray(v) ? v.length > 0 : true)
  ).length;

  const handleFilterChange = (key: string, value: string | string[] | boolean | undefined) => {
    onChange({ ...values, [key]: value });
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      const clearedValues: FilterValues = {};
      filters.forEach((f) => {
        clearedValues[f.key] = undefined;
      });
      onChange(clearedValues);
    }
  };

  const renderFilter = (filter: FilterConfig) => {
    switch (filter.type) {
      case "select":
        return (
          <select
            value={(values[filter.key] as string) || ""}
            onChange={(e) => handleFilterChange(filter.key, e.target.value || undefined)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500"
          >
            <option value="">{filter.placeholder || `All ${filter.label}`}</option>
            {filter.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case "multiselect":
        const selectedValues = (values[filter.key] as string[]) || [];
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {selectedValues.map((val) => {
                const option = filter.options?.find((o) => o.value === val);
                return (
                  <span
                    key={val}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600/30 text-blue-300 text-xs rounded"
                  >
                    {option?.label || val}
                    <button
                      onClick={() =>
                        handleFilterChange(
                          filter.key,
                          selectedValues.filter((v) => v !== val)
                        )
                      }
                      className="hover:text-blue-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && !selectedValues.includes(e.target.value)) {
                  handleFilterChange(filter.key, [...selectedValues, e.target.value]);
                }
              }}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500"
            >
              <option value="">{filter.placeholder || `Select ${filter.label}`}</option>
              {filter.options
                ?.filter((opt) => !selectedValues.includes(opt.value))
                .map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
            </select>
          </div>
        );

      case "text":
        return (
          <input
            type="text"
            value={(values[filter.key] as string) || ""}
            onChange={(e) => handleFilterChange(filter.key, e.target.value || undefined)}
            placeholder={filter.placeholder || `Search ${filter.label.toLowerCase()}`}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
          />
        );

      case "boolean":
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(values[filter.key] as boolean) || false}
              onChange={(e) => handleFilterChange(filter.key, e.target.checked || undefined)}
              className="w-4 h-4 rounded border-border bg-background text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
            />
            <span className="text-sm text-foreground">{filter.label}</span>
          </label>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`bg-muted border border-border rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      {collapsible && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Filters</span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {/* Content */}
      {(isExpanded || !collapsible) && (
        <div className={`p-4 ${collapsible ? "border-t border-border" : ""}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filters.map((filter) => (
              <div key={filter.key}>
                {filter.type !== "boolean" && (
                  <label className="block text-xs text-muted-foreground mb-1.5">{filter.label}</label>
                )}
                {renderFilter(filter)}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <button
              onClick={handleClear}
              disabled={activeFiltersCount === 0}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Clear all filters
            </button>
            {children && <div className="flex items-center gap-2">{children}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// Quick filter badge component
export function FilterBadge({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-accent text-foreground text-xs rounded-lg">
      <span className="text-muted-foreground">{label}:</span>
      <span>{value}</span>
      <button onClick={onClear} className="hover:text-foreground transition-colors">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
