/**
 * Dashboard Types
 * TypeScript types for dashboard customization
 */

import { PresetType } from '@/config/dashboardPresets';
import { WidgetSize } from '@/config/dashboardWidgets';

export interface DashboardPreferences {
  id: string;
  developer_id: string;
  preset_type: PresetType;
  visible_widgets: string[];
  widget_order: string[];
  widget_sizes: Record<string, WidgetSize>;
  layout: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DashboardPreferencesUpdate {
  preset_type?: PresetType;
  visible_widgets?: string[];
  widget_order?: string[];
  widget_sizes?: Record<string, WidgetSize>;
  layout?: Record<string, unknown>;
}

export interface DashboardPresetInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  widgets: string[];
}

export interface DashboardPresetsResponse {
  presets: DashboardPresetInfo[];
}

export interface WidgetInfo {
  id: string;
  name: string;
  category: string;
  personas: string[];
  default_size: WidgetSize;
  icon: string;
}

export interface WidgetCategoryInfo {
  id: string;
  name: string;
  icon: string;
}

export interface WidgetRegistryResponse {
  widgets: WidgetInfo[];
  categories: WidgetCategoryInfo[];
}
