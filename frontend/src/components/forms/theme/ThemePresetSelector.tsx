"use client";

import { Check } from "lucide-react";
import { THEME_PRESETS, getPresetList } from "@/lib/formThemePresets";
import type { ThemePreset } from "@/lib/formThemeTypes";

interface ThemePresetSelectorProps {
  selectedPreset: ThemePreset | null | undefined;
  onSelect: (preset: ThemePreset) => void;
}

export function ThemePresetSelector({ selectedPreset, onSelect }: ThemePresetSelectorProps) {
  const presets = getPresetList();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">Theme Presets</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {presets.map((preset) => {
          const isSelected = selectedPreset === preset.id;
          const theme = preset.theme;
          const globalColors = theme.global;

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset.id)}
              className={`relative p-3 rounded-xl border-2 transition-all text-left ${
                isSelected
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-border hover:border-border bg-muted/50"
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-foreground" />
                </div>
              )}

              {/* Theme preview */}
              <div
                className="w-full h-20 rounded-lg mb-2 p-2 flex flex-col gap-1"
                style={{ backgroundColor: globalColors?.background_color }}
              >
                <div
                  className="flex-1 rounded p-1.5"
                  style={{ backgroundColor: globalColors?.surface_color }}
                >
                  <div
                    className="h-1.5 w-3/4 rounded mb-1"
                    style={{ backgroundColor: globalColors?.text_color, opacity: 0.3 }}
                  />
                  <div
                    className="h-1 w-1/2 rounded"
                    style={{ backgroundColor: globalColors?.text_secondary_color, opacity: 0.3 }}
                  />
                </div>
                <div
                  className="h-4 w-12 rounded self-end"
                  style={{ backgroundColor: globalColors?.primary_color }}
                />
              </div>

              {/* Color swatches */}
              <div className="flex gap-1 mb-2">
                {[
                  globalColors?.primary_color,
                  globalColors?.secondary_color,
                  globalColors?.background_color,
                  globalColors?.text_color,
                ].map((color, i) => (
                  <div
                    key={i}
                    className="w-4 h-4 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              <div className="text-sm font-medium text-foreground">{preset.name}</div>
              <div className="text-xs text-muted-foreground line-clamp-1">{preset.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
