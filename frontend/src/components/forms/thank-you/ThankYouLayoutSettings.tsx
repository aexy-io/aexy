"use client";

import type { ThankYouLayout, AnimationType } from "@/lib/formThemeTypes";

interface ThankYouLayoutSettingsProps {
  layout: ThankYouLayout | undefined;
  onChange: (layout: ThankYouLayout) => void;
}

const ANIMATION_OPTIONS: { value: AnimationType; label: string; description: string }[] = [
  { value: "fade", label: "Fade In", description: "Smooth fade-in animation" },
  { value: "slide", label: "Slide Up", description: "Slide up from bottom" },
  { value: "none", label: "None", description: "No animation" },
];

export function ThankYouLayoutSettings({ layout = {}, onChange }: ThankYouLayoutSettingsProps) {
  const updateLayout = <K extends keyof ThankYouLayout>(
    key: K,
    value: ThankYouLayout[K]
  ) => {
    onChange({ ...layout, [key]: value });
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-foreground">
        Layout & Animation
      </label>

      <div className="grid grid-cols-2 gap-4">
        {/* Alignment */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Alignment</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updateLayout("alignment", "center")}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border ${
                (layout.alignment || "center") === "center"
                  ? "border-purple-500 bg-purple-500/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-border"
              }`}
            >
              Center
            </button>
            <button
              type="button"
              onClick={() => updateLayout("alignment", "left")}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border ${
                layout.alignment === "left"
                  ? "border-purple-500 bg-purple-500/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-border"
              }`}
            >
              Left
            </button>
          </div>
        </div>

        {/* Max Width */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Max Width</label>
          <select
            value={layout.max_width || "480px"}
            onChange={(e) => updateLayout("max_width", e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
          >
            <option value="320px">Small (320px)</option>
            <option value="480px">Medium (480px)</option>
            <option value="640px">Large (640px)</option>
            <option value="100%">Full Width</option>
          </select>
        </div>
      </div>

      {/* Animation */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Animation</label>
        <div className="grid grid-cols-3 gap-2">
          {ANIMATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateLayout("animation", opt.value)}
              className={`px-3 py-2 text-sm rounded-lg border text-center ${
                (layout.animation || "fade") === opt.value
                  ? "border-purple-500 bg-purple-500/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-border"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Padding */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Padding</label>
        <input
          type="text"
          value={layout.padding || ""}
          onChange={(e) => updateLayout("padding", e.target.value || undefined)}
          placeholder="48px 24px"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
        />
      </div>
    </div>
  );
}
