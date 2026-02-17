"use client";

import { useState } from "react";
import { Eye, Image, Ticket, RotateCcw } from "lucide-react";
import { ThankYouContentEditor } from "./ThankYouContentEditor";
import { ThankYouButtonEditor } from "./ThankYouButtonEditor";
import { ThankYouLayoutSettings } from "./ThankYouLayoutSettings";
import { ThankYouPreview } from "./ThankYouPreview";
import { getDefaultThankYouPage } from "@/lib/formThemeTypes";
import type { ThankYouPageConfig, FormTheme, TipTapDocument, ThankYouButton, ThankYouLayout, ThankYouImage } from "@/lib/formThemeTypes";

interface ThankYouPageEditorProps {
  config: ThankYouPageConfig;
  formTheme: FormTheme;
  onSave: (config: ThankYouPageConfig) => void;
  isSaving?: boolean;
}

export function ThankYouPageEditor({
  config,
  formTheme,
  onSave,
  isSaving,
}: ThankYouPageEditorProps) {
  const [localConfig, setLocalConfig] = useState<ThankYouPageConfig>(config);
  const [showPreview, setShowPreview] = useState(true);

  const updateContent = <K extends keyof NonNullable<ThankYouPageConfig["content"]>>(
    key: K,
    value: NonNullable<ThankYouPageConfig["content"]>[K]
  ) => {
    setLocalConfig((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        [key]: value,
      },
    }));
  };

  const handleReset = () => {
    setLocalConfig(getDefaultThankYouPage());
  };

  const handleSave = () => {
    onSave(localConfig);
  };

  // Get the effective theme for the thank you page
  const effectiveTheme = localConfig.use_form_theme !== false
    ? formTheme
    : localConfig.theme || formTheme;

  return (
    <div className="flex gap-6 h-full">
      {/* Editor Panel */}
      <div className="flex-1 overflow-y-auto pr-4 space-y-6 pb-24">
        {/* Theme Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border">
          <div>
            <h3 className="text-sm font-medium text-foreground">Use Form Theme</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Apply the same theme as your form, or customize separately
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLocalConfig((prev) => ({
              ...prev,
              use_form_theme: !prev.use_form_theme,
            }))}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              localConfig.use_form_theme !== false ? "bg-purple-600" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                localConfig.use_form_theme !== false ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>

        {/* Content Editor */}
        <ThankYouContentEditor
          content={localConfig.content?.message}
          onChange={(message) => updateContent("message", message)}
        />

        {/* Ticket Number Display */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Ticket className="w-4 h-4 text-muted-foreground" />
            <label className="text-sm font-medium text-foreground">
              Ticket Number Display
            </label>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={localConfig.content?.show_ticket_number !== false}
                onChange={(e) => updateContent("show_ticket_number", e.target.checked)}
                className="w-4 h-4 rounded border-border bg-muted text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm text-foreground">Show ticket number</span>
            </label>
          </div>

          {localConfig.content?.show_ticket_number !== false && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Label</label>
              <input
                type="text"
                value={localConfig.content?.ticket_number_label || ""}
                onChange={(e) => updateContent("ticket_number_label", e.target.value)}
                placeholder="Your Reference Number"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
              />
            </div>
          )}
        </div>

        {/* Image Settings */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Image className="w-4 h-4 text-muted-foreground" />
            <label className="text-sm font-medium text-foreground">
              Image (Optional)
            </label>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Image URL</label>
            <input
              type="url"
              value={localConfig.content?.image?.url || ""}
              onChange={(e) => updateContent("image", {
                ...localConfig.content?.image,
                url: e.target.value || undefined,
              })}
              placeholder="https://example.com/success.png"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            />
          </div>

          {localConfig.content?.image?.url && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Alt Text</label>
                <input
                  type="text"
                  value={localConfig.content?.image?.alt || ""}
                  onChange={(e) => updateContent("image", {
                    ...localConfig.content?.image,
                    alt: e.target.value,
                  })}
                  placeholder="Success"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Position</label>
                <select
                  value={localConfig.content?.image?.position || "top"}
                  onChange={(e) => updateContent("image", {
                    ...localConfig.content?.image,
                    position: e.target.value as ThankYouImage["position"],
                  })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                >
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <ThankYouButtonEditor
          buttons={localConfig.content?.buttons || []}
          onChange={(buttons) => updateContent("buttons", buttons)}
        />

        {/* Layout Settings */}
        <div className="pt-4 border-t border-border">
          <ThankYouLayoutSettings
            layout={localConfig.layout}
            onChange={(layout) => setLocalConfig((prev) => ({ ...prev, layout }))}
          />
        </div>
      </div>

      {/* Preview Panel */}
      {showPreview && (
        <div className="w-[400px] flex-shrink-0 border-l border-border pl-6">
          <div className="sticky top-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground">Preview</h3>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground"
                title="Hide Preview"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
            <ThankYouPreview
              config={localConfig}
              theme={effectiveTheme}
              ticketNumber={12345}
            />
          </div>
        </div>
      )}

      {/* Fixed Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:text-foreground"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </button>
          {!showPreview && (
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:text-foreground"
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
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
