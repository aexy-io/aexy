/**
 * Dashboard Components
 * Export all dashboard customization components
 */

export { DashboardCustomizeModal } from "./DashboardCustomizeModal";
export { PresetSelector } from "./PresetSelector";
export { WidgetToggleList } from "./WidgetToggleList";
export { CustomizeButton } from "./CustomizeButton";
export {
  WidgetRenderer,
  WidgetVisibility,
  useWidgetVisibility,
  getWidgetSizeClass,
} from "./WidgetRenderer";
export {
  SortableWidgetGrid,
  SortableGridItem,
  useSortableGrid,
} from "./SortableWidgetGrid";

// Widget components
export {
  TicketStatsWidget,
  SprintOverviewWidget,
  TrackingSummaryWidget,
  CRMPipelineWidget,
} from "./widgets";
