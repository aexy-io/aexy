"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentToolInfo, TOOL_CATEGORIES, ToolCategory } from "@/lib/api";

interface ToolSelectorProps {
  tools: AgentToolInfo[];
  selectedTools: string[];
  onChange: (tools: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function ToolSelector({
  tools,
  selectedTools,
  onChange,
  disabled = false,
  className,
}: ToolSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(Object.keys(TOOL_CATEGORIES))
  );

  const toggleCategory = (category: string) => {
    const next = new Set(expandedCategories);
    if (next.has(category)) {
      next.delete(category);
    } else {
      next.add(category);
    }
    setExpandedCategories(next);
  };

  const toggleTool = (toolName: string) => {
    if (disabled) return;

    if (selectedTools.includes(toolName)) {
      onChange(selectedTools.filter((t) => t !== toolName));
    } else {
      onChange([...selectedTools, toolName]);
    }
  };

  const toggleCategoryTools = (categoryTools: string[]) => {
    if (disabled) return;

    const allSelected = categoryTools.every((t) => selectedTools.includes(t));
    if (allSelected) {
      onChange(selectedTools.filter((t) => !categoryTools.includes(t)));
    } else {
      const newTools = new Set([...selectedTools, ...categoryTools]);
      onChange(Array.from(newTools));
    }
  };

  // Group tools by category
  const toolsByCategory = new Map<string, AgentToolInfo[]>();
  tools.forEach((tool) => {
    const existing = toolsByCategory.get(tool.category) || [];
    toolsByCategory.set(tool.category, [...existing, tool]);
  });

  // Filter tools by search
  const filteredTools = searchQuery
    ? tools.filter(
        (t) =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tools..."
          disabled={disabled}
          className="w-full pl-10 pr-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
        />
      </div>

      {/* Selected count */}
      <div className="text-sm text-muted-foreground">
        {selectedTools.length} tool{selectedTools.length !== 1 ? "s" : ""} selected
      </div>

      {/* Search results */}
      {filteredTools ? (
        <div className="space-y-1">
          {filteredTools.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No tools found matching "{searchQuery}"
            </div>
          ) : (
            filteredTools.map((tool) => (
              <ToolItem
                key={tool.name}
                tool={tool}
                isSelected={selectedTools.includes(tool.name)}
                onToggle={() => toggleTool(tool.name)}
                disabled={disabled}
              />
            ))
          )}
        </div>
      ) : (
        /* Categories */
        <div className="space-y-2">
          {Object.entries(TOOL_CATEGORIES).map(([key, category]) => {
            const categoryTools = toolsByCategory.get(key) || [];
            if (categoryTools.length === 0) return null;

            const isExpanded = expandedCategories.has(key);
            const selectedCount = categoryTools.filter((t) =>
              selectedTools.includes(t.name)
            ).length;
            const allSelected = selectedCount === categoryTools.length;

            return (
              <div
                key={key}
                className="border border-border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleCategory(key)}
                  className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="text-left">
                      <div className="font-medium text-foreground">{category.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {category.description}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {selectedCount}/{categoryTools.length}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategoryTools(categoryTools.map((t) => t.name));
                      }}
                      disabled={disabled}
                      className={cn(
                        "px-2 py-1 text-xs rounded transition",
                        allSelected
                          ? "bg-purple-500/20 text-purple-400"
                          : "bg-muted text-foreground hover:bg-accent"
                      )}
                    >
                      {allSelected ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border p-2 space-y-1">
                    {categoryTools.map((tool) => (
                      <ToolItem
                        key={tool.name}
                        tool={tool}
                        isSelected={selectedTools.includes(tool.name)}
                        onToggle={() => toggleTool(tool.name)}
                        disabled={disabled}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ToolItemProps {
  tool: AgentToolInfo;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function ToolItem({ tool, isSelected, onToggle, disabled }: ToolItemProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-lg transition text-left",
        isSelected
          ? "bg-purple-500/10 border border-purple-500/30"
          : "bg-accent/30 border border-transparent hover:border-border",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5",
          isSelected
            ? "bg-purple-500 border-purple-500"
            : "border-muted-foreground bg-transparent"
        )}
      >
        {isSelected && <Check className="h-3 w-3 text-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{tool.name}</span>
          {tool.is_dangerous && (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          )}
          {tool.requires_approval && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
              Needs approval
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{tool.description}</p>
      </div>
    </button>
  );
}

// Simple inline tool badges for display
interface ToolBadgesProps {
  tools: string[];
  max?: number;
  size?: "sm" | "md";
  className?: string;
}

export function ToolBadges({ tools, max = 3, size = "sm", className }: ToolBadgesProps) {
  const displayTools = tools.slice(0, max);
  const remaining = tools.length - max;

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
  };

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {displayTools.map((tool) => (
        <span
          key={tool}
          className={cn(
            "bg-accent text-foreground rounded",
            sizeClasses[size]
          )}
        >
          {tool}
        </span>
      ))}
      {remaining > 0 && (
        <span
          className={cn(
            "bg-muted text-muted-foreground rounded",
            sizeClasses[size]
          )}
        >
          +{remaining} more
        </span>
      )}
    </div>
  );
}
