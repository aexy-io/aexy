"use client";

import { useState } from "react";
import { Plus, Trash2, X, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConditionalFormatRule, FieldDisplayConfig } from "./types";

const OPERATORS: { value: ConditionalFormatRule["operator"]; label: string; needsValue: boolean }[] = [
  { value: "equals", label: "equals", needsValue: true },
  { value: "not_equals", label: "does not equal", needsValue: true },
  { value: "gt", label: "greater than", needsValue: true },
  { value: "lt", label: "less than", needsValue: true },
  { value: "gte", label: "greater or equal", needsValue: true },
  { value: "lte", label: "less or equal", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "is_empty", label: "is empty", needsValue: false },
  { value: "is_not_empty", label: "is not empty", needsValue: false },
];

const PRESET_COLORS = [
  { label: "Green", bg: "#22c55e22", text: "#22c55e" },
  { label: "Red", bg: "#ef444422", text: "#ef4444" },
  { label: "Yellow", bg: "#eab30822", text: "#eab308" },
  { label: "Blue", bg: "#3b82f622", text: "#3b82f6" },
  { label: "Purple", bg: "#a855f722", text: "#a855f7" },
  { label: "Orange", bg: "#f9731622", text: "#f97316" },
];

interface FieldDisplayConfigPanelProps {
  fieldName: string;
  displayConfig?: FieldDisplayConfig;
  onChange: (config: FieldDisplayConfig) => void;
  onClose: () => void;
}

export function FieldDisplayConfigPanel({
  fieldName,
  displayConfig,
  onChange,
  onClose,
}: FieldDisplayConfigPanelProps) {
  const [rules, setRules] = useState<ConditionalFormatRule[]>(
    displayConfig?.conditionalFormat || []
  );

  const addRule = () => {
    setRules([
      ...rules,
      {
        operator: "gt",
        value: "",
        style: { bgColor: PRESET_COLORS[0].bg, textColor: PRESET_COLORS[0].text },
      },
    ]);
  };

  const updateRule = (index: number, update: Partial<ConditionalFormatRule>) => {
    const next = [...rules];
    next[index] = { ...next[index], ...update };
    setRules(next);
  };

  const updateRuleStyle = (index: number, style: Partial<ConditionalFormatRule["style"]>) => {
    const next = [...rules];
    next[index] = { ...next[index], style: { ...next[index].style, ...style } };
    setRules(next);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onChange({
      ...displayConfig,
      conditionalFormat: rules.length > 0 ? rules : undefined,
    });
    onClose();
  };

  return (
    <div className="w-[380px] bg-muted border border-border rounded-xl shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-purple-400" />
          <h3 className="font-semibold text-foreground text-sm">
            Conditional Formatting
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-accent rounded text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-3 text-xs text-muted-foreground border-b border-border">
        Configure rules for <span className="font-medium text-foreground">{fieldName}</span>. First matching rule wins.
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {rules.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No rules yet. Add a rule to highlight cells based on their value.
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {rules.map((rule, i) => {
              const opDef = OPERATORS.find((o) => o.value === rule.operator);
              return (
                <div
                  key={i}
                  className="p-3 bg-accent/50 border border-border rounded-lg space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium w-8">
                      #{i + 1}
                    </span>
                    <select
                      value={rule.operator}
                      onChange={(e) =>
                        updateRule(i, {
                          operator: e.target.value as ConditionalFormatRule["operator"],
                        })
                      }
                      className="flex-1 px-2 py-1 text-xs bg-accent border border-border rounded text-foreground"
                    >
                      {OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeRule(i)}
                      className="p-1 text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {opDef?.needsValue && (
                    <input
                      type="text"
                      value={String(rule.value ?? "")}
                      onChange={(e) => {
                        const v = e.target.value;
                        const numV = Number(v);
                        updateRule(i, { value: !isNaN(numV) && v !== "" ? numV : v });
                      }}
                      placeholder="Value..."
                      className="w-full px-2 py-1 text-xs bg-accent border border-border rounded text-foreground placeholder-muted-foreground"
                    />
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">Style:</span>
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color.label}
                        onClick={() =>
                          updateRuleStyle(i, {
                            bgColor: color.bg,
                            textColor: color.text,
                          })
                        }
                        className={cn(
                          "w-5 h-5 rounded-full border-2 transition-transform",
                          rule.style.textColor === color.text
                            ? "border-foreground scale-110"
                            : "border-transparent hover:scale-105"
                        )}
                        style={{ backgroundColor: color.text }}
                        title={color.label}
                      />
                    ))}
                    <button
                      onClick={() =>
                        updateRuleStyle(i, {
                          fontWeight:
                            rule.style.fontWeight === "bold" ? "normal" : "bold",
                        })
                      }
                      className={cn(
                        "px-1.5 py-0.5 text-xs rounded border transition-colors",
                        rule.style.fontWeight === "bold"
                          ? "bg-foreground text-background border-foreground font-bold"
                          : "bg-accent text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      B
                    </button>
                  </div>

                  {/* Preview */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Preview:</span>
                    <span
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor: rule.style.bgColor,
                        color: rule.style.textColor,
                        fontWeight: rule.style.fontWeight,
                      }}
                    >
                      Sample value
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border flex items-center gap-2">
        <button
          onClick={addRule}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add rule
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
