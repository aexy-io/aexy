"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  X,
  ChevronDown,
  User,
  Tag,
  AlertCircle,
  Target,
  Layers,
  Check,
} from "lucide-react";
import { TaskPriority, SprintListItem } from "@/lib/api";
import { BoardFilters } from "@/hooks/useProjectBoard";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/premium-card";

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: "critical", label: "Critical", color: "bg-red-500" },
  { value: "high", label: "High", color: "bg-orange-500" },
  { value: "medium", label: "Medium", color: "bg-yellow-500" },
  { value: "low", label: "Low", color: "bg-slate-500" },
];

interface FilterBarProps {
  filters: BoardFilters;
  onFilterChange: (update: Partial<BoardFilters>) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  filterOptions: {
    assignees: { id: string; name: string; avatar?: string }[];
    labels: string[];
    epics: { id: string; name: string }[];
    sprints: SprintListItem[];
  };
  className?: string;
}

interface FilterDropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

function FilterDropdown({ trigger, children, isOpen, onOpenChange }: FilterDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onOpenChange]);

  return (
    <div ref={dropdownRef} className="relative">
      <div onClick={() => onOpenChange(!isOpen)}>{trigger}</div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1 z-50 min-w-[200px] bg-slate-800/95 backdrop-blur-xl border border-slate-700 rounded-lg shadow-xl overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface MultiSelectProps {
  label: string;
  icon: React.ReactNode;
  options: { id: string; name: string; avatar?: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function MultiSelectFilter({ label, icon, options, selected, onChange }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOption = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <FilterDropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors",
            selected.length > 0
              ? "bg-primary-500/20 border-primary-500/50 text-primary-300"
              : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
          )}
        >
          {icon}
          <span>{label}</span>
          {selected.length > 0 && (
            <Badge variant="info" size="sm">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 ml-1" />
        </button>
      }
    >
      <div className="max-h-64 overflow-y-auto py-1">
        {options.length === 0 ? (
          <div className="px-3 py-2 text-sm text-slate-500">No options available</div>
        ) : (
          options.map((option) => (
            <button
              key={option.id}
              onClick={() => toggleOption(option.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-700/50 transition-colors"
            >
              <div
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                  selected.includes(option.id)
                    ? "bg-primary-500 border-primary-500"
                    : "border-slate-600"
                )}
              >
                {selected.includes(option.id) && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
              {option.avatar ? (
                <Image
                  src={option.avatar}
                  alt={option.name}
                  width={20}
                  height={20}
                  className="rounded-full"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center">
                  <User className="h-3 w-3 text-slate-400" />
                </div>
              )}
              <span className="text-white truncate">{option.name}</span>
            </button>
          ))
        )}
      </div>
    </FilterDropdown>
  );
}

function PriorityFilter({
  selected,
  onChange,
}: {
  selected: TaskPriority[];
  onChange: (selected: TaskPriority[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOption = (priority: TaskPriority) => {
    if (selected.includes(priority)) {
      onChange(selected.filter((s) => s !== priority));
    } else {
      onChange([...selected, priority]);
    }
  };

  return (
    <FilterDropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors",
            selected.length > 0
              ? "bg-primary-500/20 border-primary-500/50 text-primary-300"
              : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
          )}
        >
          <AlertCircle className="h-4 w-4" />
          <span>Priority</span>
          {selected.length > 0 && (
            <Badge variant="info" size="sm">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 ml-1" />
        </button>
      }
    >
      <div className="py-1">
        {PRIORITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => toggleOption(option.value)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-700/50 transition-colors"
          >
            <div
              className={cn(
                "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                selected.includes(option.value)
                  ? "bg-primary-500 border-primary-500"
                  : "border-slate-600"
              )}
            >
              {selected.includes(option.value) && (
                <Check className="h-3 w-3 text-white" />
              )}
            </div>
            <div className={cn("w-2 h-2 rounded-full", option.color)} />
            <span className="text-white">{option.label}</span>
          </button>
        ))}
      </div>
    </FilterDropdown>
  );
}

export function FilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
  filterOptions,
  className,
}: FilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Count active filter chips
  const activeFilters: { key: keyof BoardFilters; label: string; value: string }[] = [];

  filters.assignees.forEach((id) => {
    const assignee = filterOptions.assignees.find((a) => a.id === id);
    if (assignee) {
      activeFilters.push({ key: "assignees", label: "Assignee", value: assignee.name });
    }
  });

  filters.priorities.forEach((priority) => {
    const option = PRIORITY_OPTIONS.find((p) => p.value === priority);
    if (option) {
      activeFilters.push({ key: "priorities", label: "Priority", value: option.label });
    }
  });

  filters.labels.forEach((label) => {
    activeFilters.push({ key: "labels", label: "Label", value: label });
  });

  filters.sprints.forEach((id) => {
    const sprint = filterOptions.sprints.find((s) => s.id === id);
    if (sprint) {
      activeFilters.push({ key: "sprints", label: "Sprint", value: sprint.name });
    }
  });

  const removeFilter = (filterKey: keyof BoardFilters, value: string) => {
    if (filterKey === "assignees") {
      const assignee = filterOptions.assignees.find((a) => a.name === value);
      if (assignee) {
        onFilterChange({
          assignees: filters.assignees.filter((id) => id !== assignee.id),
        });
      }
    } else if (filterKey === "priorities") {
      const option = PRIORITY_OPTIONS.find((p) => p.label === value);
      if (option) {
        onFilterChange({
          priorities: filters.priorities.filter((p) => p !== option.value),
        });
      }
    } else if (filterKey === "labels") {
      onFilterChange({
        labels: filters.labels.filter((l) => l !== value),
      });
    } else if (filterKey === "sprints") {
      const sprint = filterOptions.sprints.find((s) => s.name === value);
      if (sprint) {
        onFilterChange({
          sprints: filters.sprints.filter((id) => id !== sprint.id),
        });
      }
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Main filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="w-full pl-9 pr-4 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 transition-colors"
          />
          {filters.search && (
            <button
              onClick={() => onFilterChange({ search: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Filter toggle (mobile) */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="lg:hidden flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300"
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <Badge variant="info" size="sm">
              {activeFilters.length}
            </Badge>
          )}
        </button>

        {/* Filter dropdowns (desktop) */}
        <div className={cn(
          "flex items-center gap-2 flex-wrap",
          !isExpanded && "hidden lg:flex"
        )}>
          {/* Assignee filter */}
          <MultiSelectFilter
            label="Assignee"
            icon={<User className="h-4 w-4" />}
            options={filterOptions.assignees}
            selected={filters.assignees}
            onChange={(selected) => onFilterChange({ assignees: selected })}
          />

          {/* Priority filter */}
          <PriorityFilter
            selected={filters.priorities}
            onChange={(selected) => onFilterChange({ priorities: selected })}
          />

          {/* Label filter */}
          {filterOptions.labels.length > 0 && (
            <MultiSelectFilter
              label="Label"
              icon={<Tag className="h-4 w-4" />}
              options={filterOptions.labels.map((l) => ({ id: l, name: l }))}
              selected={filters.labels}
              onChange={(selected) => onFilterChange({ labels: selected })}
            />
          )}

          {/* Sprint filter */}
          <MultiSelectFilter
            label="Sprint"
            icon={<Layers className="h-4 w-4" />}
            options={filterOptions.sprints.map((s) => ({ id: s.id, name: s.name }))}
            selected={filters.sprints}
            onChange={(selected) => onFilterChange({ sprints: selected })}
          />

          {/* Clear all */}
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      <AnimatePresence>
        {activeFilters.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-center gap-2 flex-wrap overflow-hidden"
          >
            {activeFilters.map((filter, i) => (
              <motion.span
                key={`${filter.key}-${filter.value}`}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ delay: i * 0.03 }}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded-full text-xs text-slate-300"
              >
                <span className="text-slate-500">{filter.label}:</span>
                <span>{filter.value}</span>
                <button
                  onClick={() => removeFilter(filter.key, filter.value)}
                  className="p-0.5 hover:bg-slate-600 rounded transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default FilterBar;
