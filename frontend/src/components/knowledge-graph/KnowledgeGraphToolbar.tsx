"use client";

import { useState } from "react";
import {
  Search,
  Filter,
  Sparkles,
  RefreshCw,
  ChevronDown,
  User,
  Lightbulb,
  Cpu,
  FolderKanban,
  Building2,
  Code2,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";

interface GraphFilters {
  entityTypes: string[];
  relationshipTypes: string[];
  spaceIds: string[];
  dateFrom: string | null;
  dateTo: string | null;
  minConfidence: number;
  includeDocuments: boolean;
  includeEntities: boolean;
  maxNodes: number;
}

interface SearchResult {
  id: string;
  name: string;
  type: string;
  description?: string;
  occurrence_count: number;
}

interface Statistics {
  total_entities: number;
  total_documents: number;
  total_relationships: number;
  entity_type_counts: Record<string, number>;
}

interface KnowledgeGraphToolbarProps {
  filters: GraphFilters;
  onFilterChange: (filters: Partial<GraphFilters>) => void;
  onSearch: (query: string) => void;
  searchQuery: string;
  searchResults: SearchResult[];
  searchLoading: boolean;
  onTriggerExtraction: () => void;
  extractionLoading: boolean;
  statistics?: Statistics;
}

const ENTITY_TYPES = [
  { value: "person", label: "People", icon: User, color: "#f472b6" },
  { value: "concept", label: "Concepts", icon: Lightbulb, color: "#a78bfa" },
  { value: "technology", label: "Technologies", icon: Cpu, color: "#34d399" },
  { value: "project", label: "Projects", icon: FolderKanban, color: "#60a5fa" },
  { value: "organization", label: "Organizations", icon: Building2, color: "#fbbf24" },
  { value: "code", label: "Code", icon: Code2, color: "#f97316" },
  { value: "external", label: "External", icon: ExternalLink, color: "#94a3b8" },
];

export function KnowledgeGraphToolbar({
  filters,
  onFilterChange,
  onSearch,
  searchQuery,
  searchResults,
  searchLoading,
  onTriggerExtraction,
  extractionLoading,
  statistics,
}: KnowledgeGraphToolbarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const toggleEntityType = (type: string) => {
    const current = filters.entityTypes;
    if (current.includes(type)) {
      onFilterChange({ entityTypes: current.filter((t) => t !== type) });
    } else {
      onFilterChange({ entityTypes: [...current, type] });
    }
  };

  const activeFiltersCount =
    filters.entityTypes.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.minConfidence > 0.5 ? 1 : 0) +
    (!filters.includeDocuments || !filters.includeEntities ? 1 : 0);

  return (
    <div className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
      <div className="px-4 py-3 flex items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              onFocus={() => setShowSearch(true)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
            {searchLoading && (
              <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
            )}
          </div>

          {/* Search results dropdown */}
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-[300px] overflow-auto">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-700/50 text-left"
                  onClick={() => {
                    // TODO: Focus on node in graph
                    setShowSearch(false);
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor:
                        ENTITY_TYPES.find((t) => t.value === result.type)?.color + "20" ||
                        "#94a3b820",
                    }}
                  >
                    {(() => {
                      const IconComponent = ENTITY_TYPES.find((t) => t.value === result.type)?.icon || Lightbulb;
                      return (
                        <IconComponent
                          className="h-4 w-4"
                          style={{
                            color:
                              ENTITY_TYPES.find((t) => t.value === result.type)?.color ||
                              "#94a3b8",
                          }}
                        />
                      );
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {result.name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {result.type} - {result.occurrence_count} mentions
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter button */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm
            ${showFilters || activeFiltersCount > 0
              ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-400"
              : "bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700"
            }
          `}
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFiltersCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-indigo-500 text-white text-xs rounded-full">
              {activeFiltersCount}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
        </button>

        {/* Statistics */}
        {statistics && (
          <div className="hidden md:flex items-center gap-4 text-sm text-slate-400">
            <span>{statistics.total_entities} entities</span>
            <span className="text-slate-600">|</span>
            <span>{statistics.total_documents} documents</span>
            <span className="text-slate-600">|</span>
            <span>{statistics.total_relationships} relationships</span>
          </div>
        )}

        {/* Extraction button */}
        <button
          onClick={onTriggerExtraction}
          disabled={extractionLoading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg transition-colors text-sm font-medium"
        >
          {extractionLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Run Extraction
        </button>
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/30">
          <div className="flex flex-wrap gap-6">
            {/* Entity type filters */}
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">Entity Types</p>
              <div className="flex flex-wrap gap-2">
                {ENTITY_TYPES.map((type) => {
                  const isActive = filters.entityTypes.includes(type.value);
                  const count = statistics?.entity_type_counts?.[type.value] || 0;
                  const IconComponent = type.icon;
                  return (
                    <button
                      key={type.value}
                      onClick={() => toggleEntityType(type.value)}
                      className={`
                        flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors
                        ${isActive
                          ? "border-transparent"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                        }
                      `}
                      style={isActive ? {
                        backgroundColor: `${type.color}20`,
                        borderColor: `${type.color}50`,
                        color: type.color,
                      } : undefined}
                    >
                      <IconComponent className="h-3.5 w-3.5" />
                      {type.label}
                      {count > 0 && (
                        <span className="text-[10px] opacity-70">({count})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Include toggles */}
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">Show</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.includeEntities}
                    onChange={(e) => onFilterChange({ includeEntities: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-800"
                  />
                  <span className="text-sm text-slate-300">Entities</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.includeDocuments}
                    onChange={(e) => onFilterChange({ includeDocuments: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-800"
                  />
                  <span className="text-sm text-slate-300">Documents</span>
                </label>
              </div>
            </div>

            {/* Confidence slider */}
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">
                Min Confidence: {Math.round(filters.minConfidence * 100)}%
              </p>
              <input
                type="range"
                min="0"
                max="100"
                value={filters.minConfidence * 100}
                onChange={(e) => onFilterChange({ minConfidence: parseInt(e.target.value) / 100 })}
                className="w-32 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Max nodes */}
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">
                Max Nodes: {filters.maxNodes}
              </p>
              <input
                type="range"
                min="50"
                max="500"
                step="50"
                value={filters.maxNodes}
                onChange={(e) => onFilterChange({ maxNodes: parseInt(e.target.value) })}
                className="w-32 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Clear filters */}
            {activeFiltersCount > 0 && (
              <button
                onClick={() =>
                  onFilterChange({
                    entityTypes: [],
                    relationshipTypes: [],
                    spaceIds: [],
                    dateFrom: null,
                    dateTo: null,
                    minConfidence: 0.5,
                    includeDocuments: true,
                    includeEntities: true,
                    maxNodes: 200,
                  })
                }
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
              >
                <X className="h-3 w-3" />
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
