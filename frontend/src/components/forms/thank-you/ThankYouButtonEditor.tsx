"use client";

import { Plus, Trash2, GripVertical } from "lucide-react";
import type { ThankYouButton, ButtonAction, ButtonStyle } from "@/lib/formThemeTypes";

interface ThankYouButtonEditorProps {
  buttons: ThankYouButton[];
  onChange: (buttons: ThankYouButton[]) => void;
}

const ACTION_OPTIONS: { value: ButtonAction; label: string; description: string }[] = [
  { value: "reload", label: "Submit Another", description: "Reload form for another submission" },
  { value: "redirect", label: "Redirect", description: "Go to external URL" },
  { value: "close", label: "Close", description: "Close the form window" },
];

const STYLE_OPTIONS: { value: ButtonStyle; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "link", label: "Link" },
];

export function ThankYouButtonEditor({ buttons, onChange }: ThankYouButtonEditorProps) {
  const addButton = () => {
    onChange([
      ...buttons,
      {
        id: crypto.randomUUID(),
        text: "Submit Another Response",
        action: "reload",
        style: "secondary",
      },
    ]);
  };

  const updateButton = (index: number, updates: Partial<ThankYouButton>) => {
    const newButtons = [...buttons];
    newButtons[index] = { ...newButtons[index], ...updates };
    onChange(newButtons);
  };

  const removeButton = (index: number) => {
    onChange(buttons.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-300">
          Call-to-Action Buttons
        </label>
        <button
          type="button"
          onClick={addButton}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-400 hover:text-purple-300"
        >
          <Plus className="w-4 h-4" />
          Add Button
        </button>
      </div>

      {buttons.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg">
          No buttons added. Add a button to give users an action after submission.
        </div>
      ) : (
        <div className="space-y-3">
          {buttons.map((button, index) => (
            <div
              key={button.id || index}
              className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg space-y-3"
            >
              <div className="flex items-center gap-3">
                <GripVertical className="w-4 h-4 text-slate-500 cursor-grab" />
                <div className="flex-1">
                  <input
                    type="text"
                    value={button.text}
                    onChange={(e) => updateButton(index, { text: e.target.value })}
                    placeholder="Button Text"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeButton(index)}
                  className="p-2 text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Action</label>
                  <select
                    value={button.action}
                    onChange={(e) => updateButton(index, { action: e.target.value as ButtonAction })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                  >
                    {ACTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Style</label>
                  <select
                    value={button.style || "primary"}
                    onChange={(e) => updateButton(index, { style: e.target.value as ButtonStyle })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                  >
                    {STYLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {button.action === "redirect" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Redirect URL</label>
                  <input
                    type="url"
                    value={button.url || ""}
                    onChange={(e) => updateButton(index, { url: e.target.value })}
                    placeholder="https://example.com/thank-you"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
