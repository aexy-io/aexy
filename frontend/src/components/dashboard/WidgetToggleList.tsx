"use client";

import { useState, useMemo } from "react";
import {
  User,
  BarChart3,
  Target,
  Code,
  Activity,
  Layers,
  Wrench,
  Sparkles,
  Heart,
  TrendingUp,
  Users,
  Shuffle,
  CheckCircle,
  AlertTriangle,
  Clock,
  Calendar,
  TrendingDown,
  Ticket,
  AlertCircle,
  List,
  Flag,
  FormInput,
  FileText,
  ClipboardCheck,
  RefreshCw,
  GraduationCap,
  Briefcase,
  Building2,
  DollarSign,
  Eye,
  Settings,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  DASHBOARD_WIDGETS,
  WIDGET_CATEGORIES,
  WidgetDefinition,
} from "@/config/dashboardWidgets";

interface WidgetToggleListProps {
  visibleWidgets: string[];
  onToggleWidget: (widgetId: string) => void;
  isLoading?: boolean;
}

const ICON_MAP: Record<string, React.ElementType> = {
  User,
  BarChart3,
  Target,
  Code,
  Activity,
  Layers,
  Wrench,
  Sparkles,
  Heart,
  TrendingUp,
  Users,
  Shuffle,
  CheckCircle,
  AlertTriangle,
  Clock,
  Calendar,
  TrendingDown,
  Ticket,
  AlertCircle,
  List,
  Flag,
  FormInput,
  FileText,
  ClipboardCheck,
  RefreshCw,
  GraduationCap,
  Briefcase,
  Building2,
  DollarSign,
  Eye,
  Settings,
};

export function WidgetToggleList({
  visibleWidgets,
  onToggleWidget,
  isLoading,
}: WidgetToggleListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(Object.keys(WIDGET_CATEGORIES))
  );

  // Group widgets by category
  const widgetsByCategory = useMemo(() => {
    const grouped: Record<string, WidgetDefinition[]> = {};

    Object.values(DASHBOARD_WIDGETS).forEach((widget) => {
      if (!grouped[widget.category]) {
        grouped[widget.category] = [];
      }
      grouped[widget.category].push(widget);
    });

    return grouped;
  }, []);

  // Filter widgets by search
  const filteredWidgetsByCategory = useMemo(() => {
    if (!searchQuery) return widgetsByCategory;

    const filtered: Record<string, WidgetDefinition[]> = {};
    const query = searchQuery.toLowerCase();

    Object.entries(widgetsByCategory).forEach(([category, widgets]) => {
      const matchingWidgets = widgets.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          w.description?.toLowerCase().includes(query) ||
          category.toLowerCase().includes(query)
      );
      if (matchingWidgets.length > 0) {
        filtered[category] = matchingWidgets;
      }
    });

    return filtered;
  }, [widgetsByCategory, searchQuery]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const visibleCount = visibleWidgets.length;
  const totalCount = Object.keys(DASHBOARD_WIDGETS).length;

  return (
    <div className="space-y-4">
      {/* Search and count */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search widgets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {visibleCount} of {totalCount} widgets visible
          </span>
          <button
            onClick={() => {
              // Toggle all expanded/collapsed
              if (expandedCategories.size === Object.keys(WIDGET_CATEGORIES).length) {
                setExpandedCategories(new Set());
              } else {
                setExpandedCategories(new Set(Object.keys(WIDGET_CATEGORIES)));
              }
            }}
            className="text-primary-400 hover:text-primary-300 transition"
          >
            {expandedCategories.size === Object.keys(WIDGET_CATEGORIES).length
              ? "Collapse All"
              : "Expand All"}
          </button>
        </div>
      </div>

      {/* Categories and widgets */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {Object.entries(filteredWidgetsByCategory).map(([categoryId, widgets]) => {
          const category = WIDGET_CATEGORIES[categoryId];
          if (!category) return null;

          const CategoryIcon = ICON_MAP[category.icon] || Settings;
          const isExpanded = expandedCategories.has(categoryId);
          const visibleInCategory = widgets.filter((w) =>
            visibleWidgets.includes(w.id)
          ).length;

          return (
            <div
              key={categoryId}
              className="border border-border/50 rounded-lg overflow-hidden"
            >
              {/* Category header */}
              <button
                onClick={() => toggleCategory(categoryId)}
                className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition"
              >
                <div className="flex items-center gap-2">
                  <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-foreground text-sm">
                    {category.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({visibleInCategory}/{widgets.length})
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {/* Widgets */}
              {isExpanded && (
                <div className="p-2 space-y-1 bg-background/30">
                  {widgets.map((widget) => {
                    const WidgetIcon = ICON_MAP[widget.icon] || Settings;
                    const isVisible = visibleWidgets.includes(widget.id);

                    return (
                      <button
                        key={widget.id}
                        onClick={() => onToggleWidget(widget.id)}
                        disabled={isLoading}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition text-left ${
                          isLoading ? "opacity-50 cursor-not-allowed" : ""
                        } ${
                          isVisible
                            ? "bg-primary-500/10 hover:bg-primary-500/20"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition ${
                            isVisible
                              ? "bg-primary-500 border-primary-500"
                              : "border-border bg-muted"
                          }`}
                        >
                          {isVisible && (
                            <CheckCircle className="h-3 w-3 text-foreground" />
                          )}
                        </div>

                        {/* Icon */}
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isVisible
                              ? "bg-primary-500/20"
                              : "bg-muted"
                          }`}
                        >
                          <WidgetIcon
                            className={`h-4 w-4 ${
                              isVisible ? "text-primary-400" : "text-muted-foreground"
                            }`}
                          />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <span
                            className={`text-sm ${
                              isVisible ? "text-foreground" : "text-foreground"
                            }`}
                          >
                            {widget.name}
                          </span>
                          {widget.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {widget.description}
                            </p>
                          )}
                        </div>

                        {/* Size badge */}
                        <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded flex-shrink-0">
                          {widget.defaultSize}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(filteredWidgetsByCategory).length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No widgets found matching &ldquo;{searchQuery}&rdquo;
        </div>
      )}
    </div>
  );
}
