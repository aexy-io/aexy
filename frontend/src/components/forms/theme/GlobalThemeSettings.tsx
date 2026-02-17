"use client";

import { ColorPickerField } from "./ColorPickerField";
import type { GlobalThemeSettings as GlobalThemeSettingsType, SpacingOption } from "@/lib/formThemeTypes";

interface GlobalThemeSettingsProps {
  settings: GlobalThemeSettingsType | undefined;
  onChange: (settings: GlobalThemeSettingsType) => void;
}

const FONT_OPTIONS = [
  { value: "Inter, system-ui, sans-serif", label: "Inter" },
  { value: "'Plus Jakarta Sans', Inter, system-ui, sans-serif", label: "Plus Jakarta Sans" },
  { value: "'Source Sans Pro', Inter, system-ui, sans-serif", label: "Source Sans Pro" },
  { value: "'Nunito', Inter, system-ui, sans-serif", label: "Nunito" },
  { value: "'Poppins', Inter, system-ui, sans-serif", label: "Poppins" },
  { value: "system-ui, sans-serif", label: "System Default" },
];

const SPACING_OPTIONS: { value: SpacingOption; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
];

const BORDER_RADIUS_OPTIONS = [
  { value: "0px", label: "None" },
  { value: "4px", label: "Small" },
  { value: "8px", label: "Medium" },
  { value: "12px", label: "Large" },
  { value: "16px", label: "Extra Large" },
];

export function GlobalThemeSettings({ settings = {}, onChange }: GlobalThemeSettingsProps) {
  const updateSetting = <K extends keyof GlobalThemeSettingsType>(
    key: K,
    value: GlobalThemeSettingsType[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        Global Colors & Typography
      </h3>

      {/* Primary Colors */}
      <div className="grid grid-cols-2 gap-4">
        <ColorPickerField
          label="Primary Color"
          value={settings.primary_color}
          onChange={(v) => updateSetting("primary_color", v)}
          placeholder="#6366f1"
        />
        <ColorPickerField
          label="Secondary Color"
          value={settings.secondary_color}
          onChange={(v) => updateSetting("secondary_color", v)}
          placeholder="#8b5cf6"
        />
      </div>

      {/* Background Colors */}
      <div className="grid grid-cols-2 gap-4">
        <ColorPickerField
          label="Background Color"
          value={settings.background_color}
          onChange={(v) => updateSetting("background_color", v)}
          placeholder="#f8fafc"
        />
        <ColorPickerField
          label="Surface Color"
          value={settings.surface_color}
          onChange={(v) => updateSetting("surface_color", v)}
          placeholder="#ffffff"
        />
      </div>

      {/* Text Colors */}
      <div className="grid grid-cols-2 gap-4">
        <ColorPickerField
          label="Text Color"
          value={settings.text_color}
          onChange={(v) => updateSetting("text_color", v)}
          placeholder="#1e293b"
        />
        <ColorPickerField
          label="Secondary Text"
          value={settings.text_secondary_color}
          onChange={(v) => updateSetting("text_secondary_color", v)}
          placeholder="#64748b"
        />
      </div>

      {/* Border & Status Colors */}
      <div className="grid grid-cols-3 gap-4">
        <ColorPickerField
          label="Border Color"
          value={settings.border_color}
          onChange={(v) => updateSetting("border_color", v)}
          placeholder="#e2e8f0"
        />
        <ColorPickerField
          label="Error Color"
          value={settings.error_color}
          onChange={(v) => updateSetting("error_color", v)}
          placeholder="#ef4444"
        />
        <ColorPickerField
          label="Success Color"
          value={settings.success_color}
          onChange={(v) => updateSetting("success_color", v)}
          placeholder="#22c55e"
        />
      </div>

      {/* Typography & Spacing */}
      <div className="grid grid-cols-3 gap-4">
        {/* Font Family */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Font Family
          </label>
          <select
            value={settings.font_family || ""}
            onChange={(e) => updateSetting("font_family", e.target.value || undefined)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">Default</option>
            {FONT_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </div>

        {/* Border Radius */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Border Radius
          </label>
          <select
            value={settings.border_radius || ""}
            onChange={(e) => updateSetting("border_radius", e.target.value || undefined)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">Default</option>
            {BORDER_RADIUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Spacing */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Spacing
          </label>
          <select
            value={settings.spacing || ""}
            onChange={(e) => updateSetting("spacing", (e.target.value || undefined) as SpacingOption | undefined)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">Default</option>
            {SPACING_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
