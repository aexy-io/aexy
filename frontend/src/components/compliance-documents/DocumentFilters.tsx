"use client";

import { useState } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { ComplianceDocumentStatus } from "@/lib/api";

interface DocumentFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: ComplianceDocumentStatus | undefined;
  onStatusChange: (value: ComplianceDocumentStatus | undefined) => void;
  selectedTag: string | undefined;
  onTagChange: (value: string | undefined) => void;
  availableTags: string[];
  sortBy: string;
  onSortChange: (sortBy: string, sortOrder: string) => void;
  sortOrder: string;
}

export function DocumentFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  selectedTag,
  onTagChange,
  availableTags,
  sortBy,
  onSortChange,
  sortOrder,
}: DocumentFiltersProps) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        {/* Toggle Filters */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg ${
            showFilters || status || selectedTag
              ? "border-blue-300 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
              : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </button>
      </div>

      {/* Filter Row */}
      {showFilters && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status */}
          <select
            value={status || ""}
            onChange={(e) => onStatusChange((e.target.value as ComplianceDocumentStatus) || undefined)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>

          {/* Tag */}
          <select
            value={selectedTag || ""}
            onChange={(e) => onTagChange(e.target.value || undefined)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [by, order] = e.target.value.split(":");
              onSortChange(by, order);
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="created_at:desc">Newest first</option>
            <option value="created_at:asc">Oldest first</option>
            <option value="name:asc">Name A-Z</option>
            <option value="name:desc">Name Z-A</option>
            <option value="file_size:desc">Largest first</option>
            <option value="file_size:asc">Smallest first</option>
          </select>

          {/* Clear Filters */}
          {(status || selectedTag) && (
            <button
              onClick={() => {
                onStatusChange(undefined);
                onTagChange(undefined);
              }}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
