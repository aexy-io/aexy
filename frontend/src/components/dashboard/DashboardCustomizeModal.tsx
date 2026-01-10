"use client";

import { useState, useCallback } from "react";
import { X, RotateCcw, Info } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { PresetSelector } from "./PresetSelector";
import { WidgetToggleList } from "./WidgetToggleList";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { useDashboardStore } from "@/stores/dashboardStore";
import { PresetType } from "@/config/dashboardPresets";

interface DashboardCustomizeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabType = "presets" | "widgets";

export function DashboardCustomizeModal({
  open,
  onOpenChange,
}: DashboardCustomizeModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("presets");

  const {
    preferences,
    isLoading,
    isUpdating,
    setPreset,
    toggleWidget,
    resetToPreset,
  } = useDashboardPreferences();

  const handleSelectPreset = useCallback(
    async (preset: PresetType) => {
      await setPreset(preset);
    },
    [setPreset]
  );

  const handleToggleWidget = useCallback(
    async (widgetId: string) => {
      await toggleWidget(widgetId);
    },
    [toggleWidget]
  );

  const handleReset = useCallback(async () => {
    await resetToPreset("developer");
  }, [resetToPreset]);

  const currentPreset = (preferences?.preset_type as PresetType) || "developer";
  const visibleWidgets = preferences?.visible_widgets || [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[85vh] bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
            <div>
              <Dialog.Title className="text-lg font-semibold text-white">
                Customize Dashboard
              </Dialog.Title>
              <Dialog.Description className="text-sm text-slate-400 mt-0.5">
                Choose a preset or customize which widgets appear
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-700/50">
            <button
              onClick={() => setActiveTab("presets")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition relative ${
                activeTab === "presets"
                  ? "text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Choose Preset
              {activeTab === "presets" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("widgets")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition relative ${
                activeTab === "widgets"
                  ? "text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Customize Widgets
              {activeTab === "widgets" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500" />
              )}
            </button>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[calc(85vh-200px)]">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
              </div>
            ) : activeTab === "presets" ? (
              <div className="space-y-4">
                {/* Info box */}
                <div className="flex gap-3 p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                  <Info className="h-5 w-5 text-primary-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-300">
                    Select a preset based on your role. Each preset comes with
                    widgets tailored to your workflow.
                  </p>
                </div>

                <PresetSelector
                  currentPreset={currentPreset}
                  onSelectPreset={handleSelectPreset}
                  isLoading={isUpdating}
                />
              </div>
            ) : (
              <WidgetToggleList
                visibleWidgets={visibleWidgets}
                onToggleWidget={handleToggleWidget}
                isLoading={isUpdating}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-slate-700/50 bg-slate-900/50">
            <button
              onClick={handleReset}
              disabled={isUpdating}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white transition disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Default
            </button>

            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition">
                Done
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
