"use client";

import { useState } from "react";
import { Eye, Code, RotateCcw } from "lucide-react";
import { ThemePresetSelector } from "./ThemePresetSelector";
import { GlobalThemeSettings } from "./GlobalThemeSettings";
import { ElementStyleEditor } from "./ElementStyleEditor";
import { ThemePreview } from "./ThemePreview";
import { getPresetTheme, getDefaultTheme } from "@/lib/formThemePresets";
import { mergeThemes } from "@/lib/formThemeUtils";
import type { FormTheme, ThemePreset, GlobalThemeSettings as GlobalSettings, ElementThemeSettings } from "@/lib/formThemeTypes";
import type { FormField } from "@/lib/formsApi";

interface ThemeBuilderTabProps {
  theme: FormTheme;
  formName: string;
  fields: FormField[];
  onSave: (theme: FormTheme) => void;
  isSaving?: boolean;
}

export function ThemeBuilderTab({ theme, formName, fields, onSave, isSaving }: ThemeBuilderTabProps) {
  const [localTheme, setLocalTheme] = useState<FormTheme>(theme);
  const [showPreview, setShowPreview] = useState(true);
  const [showCustomCSS, setShowCustomCSS] = useState(false);

  const handlePresetSelect = (preset: ThemePreset) => {
    const presetTheme = getPresetTheme(preset);
    setLocalTheme({
      ...presetTheme,
      preset,
      // Preserve any custom CSS
      custom_css: localTheme.custom_css,
    });
  };

  const handleGlobalChange = (global: GlobalSettings) => {
    setLocalTheme((prev) => ({
      ...prev,
      global,
      // When customizing, we're no longer using pure preset
      // but keep the preset reference for base styles
    }));
  };

  const handleElementsChange = (elements: ElementThemeSettings) => {
    setLocalTheme((prev) => ({
      ...prev,
      elements,
    }));
  };

  const handleCustomCSSChange = (css: string) => {
    setLocalTheme((prev) => ({
      ...prev,
      custom_css: css || undefined,
    }));
  };

  const handleReset = () => {
    setLocalTheme(getDefaultTheme());
  };

  const handleSave = () => {
    onSave(localTheme);
  };

  // Get effective theme (preset merged with overrides)
  const effectiveTheme = localTheme.preset
    ? mergeThemes(getPresetTheme(localTheme.preset), localTheme)
    : localTheme;

  return (
    <div className="flex gap-6 h-full">
      {/* Editor Panel */}
      <div className="flex-1 overflow-y-auto pr-4 space-y-6 pb-24">
        {/* Preset Selection */}
        <ThemePresetSelector
          selectedPreset={localTheme.preset}
          onSelect={handlePresetSelect}
        />

        {/* Global Settings */}
        <div className="pt-4 border-t border-slate-700">
          <GlobalThemeSettings
            settings={localTheme.global}
            onChange={handleGlobalChange}
          />
        </div>

        {/* Element-level Settings */}
        <div className="pt-4 border-t border-slate-700">
          <ElementStyleEditor
            settings={localTheme.elements}
            onChange={handleElementsChange}
          />
        </div>

        {/* Custom CSS */}
        <div className="pt-4 border-t border-slate-700">
          <button
            type="button"
            onClick={() => setShowCustomCSS(!showCustomCSS)}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            <Code className="w-4 h-4" />
            Custom CSS
          </button>
          {showCustomCSS && (
            <div className="mt-3">
              <textarea
                value={localTheme.custom_css || ""}
                onChange={(e) => handleCustomCSSChange(e.target.value)}
                placeholder="/* Add custom CSS rules here */"
                className="w-full h-40 px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-sm placeholder-slate-500 resize-none"
              />
              <p className="mt-1 text-xs text-slate-500">
                Custom CSS will be injected into the form page. Use CSS variables like var(--form-primary) to reference theme colors.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Preview Panel */}
      {showPreview && (
        <div className="w-[400px] flex-shrink-0 border-l border-slate-700 pl-6">
          <div className="sticky top-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-300">Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="p-1.5 text-slate-400 hover:text-white"
                  title="Hide Preview"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
            <ThemePreview
              theme={effectiveTheme}
              formName={formName}
              fields={fields}
            />
          </div>
        </div>
      )}

      {/* Fixed Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:text-white"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </button>
          {!showPreview && (
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:text-white"
            >
              <Eye className="w-4 h-4" />
              Show Preview
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Theme"}
        </button>
      </div>
    </div>
  );
}
