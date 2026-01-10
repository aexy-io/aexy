"use client";

import { useState } from "react";
import {
  Code,
  Users,
  Target,
  Heart,
  Ticket,
  Building2,
  Settings,
  Sliders,
  Check,
  Search,
} from "lucide-react";
import { DASHBOARD_PRESETS, PresetType } from "@/config/dashboardPresets";

interface PresetSelectorProps {
  currentPreset: PresetType;
  onSelectPreset: (preset: PresetType) => void;
  isLoading?: boolean;
}

const PRESET_ICONS: Record<string, React.ElementType> = {
  Code,
  Users,
  Target,
  Heart,
  Ticket,
  Building2,
  Settings,
  Sliders,
};

export function PresetSelector({
  currentPreset,
  onSelectPreset,
  isLoading,
}: PresetSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const presets = Object.values(DASHBOARD_PRESETS);
  const filteredPresets = presets.filter(
    (preset) =>
      preset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      preset.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search presets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
        />
      </div>

      {/* Preset List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {filteredPresets.map((preset) => {
          const Icon = PRESET_ICONS[preset.icon] || Settings;
          const isSelected = currentPreset === preset.id;

          return (
            <button
              key={preset.id}
              onClick={() => onSelectPreset(preset.id)}
              disabled={isLoading}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group ${
                isSelected
                  ? "bg-primary-500/20 border border-primary-500/50"
                  : "bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-600"
              } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {/* Icon */}
              <div
                className={`w-10 h-10 rounded-lg bg-gradient-to-br ${preset.color} flex items-center justify-center flex-shrink-0`}
              >
                <Icon className="h-5 w-5 text-white" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-medium ${
                      isSelected ? "text-white" : "text-slate-200"
                    }`}
                  >
                    {preset.name}
                  </span>
                  {preset.id === "developer" && !isSelected && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-primary-500/20 text-primary-400 rounded font-medium">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 truncate">
                  {preset.description}
                </p>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {filteredPresets.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm">
          No presets found matching &ldquo;{searchQuery}&rdquo;
        </div>
      )}
    </div>
  );
}
