"use client";

import { ReactNode } from "react";
import { DASHBOARD_WIDGETS, WidgetSize } from "@/config/dashboardWidgets";

interface WidgetRendererProps {
  widgetId: string;
  children: ReactNode;
  size?: WidgetSize;
  className?: string;
}

/**
 * WidgetRenderer wraps widget content with visibility checks and size classes.
 * Use this to conditionally render widgets based on user preferences.
 */
export function WidgetRenderer({
  widgetId,
  children,
  size,
  className = "",
}: WidgetRendererProps) {
  const widget = DASHBOARD_WIDGETS[widgetId];
  const effectiveSize = size || widget?.defaultSize || "medium";

  // Size-based grid classes
  const sizeClasses: Record<WidgetSize, string> = {
    small: "col-span-1",
    medium: "col-span-1 lg:col-span-1",
    large: "col-span-1 lg:col-span-2",
    full: "col-span-full",
  };

  return (
    <div
      className={`${sizeClasses[effectiveSize]} ${className}`}
      data-widget-id={widgetId}
    >
      {children}
    </div>
  );
}

interface WidgetVisibilityProps {
  widgetId: string;
  visibleWidgets: string[];
  children: ReactNode;
}

/**
 * Conditionally renders children based on widget visibility preferences.
 */
export function WidgetVisibility({
  widgetId,
  visibleWidgets,
  children,
}: WidgetVisibilityProps) {
  if (!visibleWidgets.includes(widgetId)) {
    return null;
  }
  return <>{children}</>;
}

/**
 * Hook to check if a widget should be visible
 */
export function useWidgetVisibility(
  widgetId: string,
  visibleWidgets: string[]
): boolean {
  return visibleWidgets.includes(widgetId);
}

/**
 * Get size class for a widget based on preferences or defaults
 */
export function getWidgetSizeClass(
  widgetId: string,
  widgetSizes: Record<string, WidgetSize> = {},
  gridCols: number = 2
): string {
  const widget = DASHBOARD_WIDGETS[widgetId];
  const size = widgetSizes[widgetId] || widget?.defaultSize || "medium";

  // For a 2-column grid
  if (gridCols === 2) {
    switch (size) {
      case "small":
        return "col-span-1";
      case "medium":
        return "col-span-1";
      case "large":
        return "col-span-2";
      case "full":
        return "col-span-full";
      default:
        return "col-span-1";
    }
  }

  // For a 3-column grid (lg)
  switch (size) {
    case "small":
      return "lg:col-span-1";
    case "medium":
      return "lg:col-span-1";
    case "large":
      return "lg:col-span-2";
    case "full":
      return "col-span-full";
    default:
      return "lg:col-span-1";
  }
}
