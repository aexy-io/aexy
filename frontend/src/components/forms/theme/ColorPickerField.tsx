"use client";

import { useState, useRef, useEffect } from "react";
import { Pipette } from "lucide-react";

interface ColorPickerFieldProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  showReset?: boolean;
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#1e293b", "#334155", "#64748b", "#94a3b8",
];

export function ColorPickerField({
  label,
  value,
  onChange,
  placeholder = "#000000",
  showReset = true,
}: ColorPickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || "");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (val === "" || /^#[0-9A-Fa-f]{6}$/.test(val) || /^#[0-9A-Fa-f]{3}$/.test(val)) {
      onChange(val || undefined);
    }
  };

  const handlePresetClick = (color: string) => {
    setInputValue(color);
    onChange(color);
    setIsOpen(false);
  };

  const handleReset = () => {
    setInputValue("");
    onChange(undefined);
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-sm font-medium text-foreground mb-1.5">
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder={placeholder}
            className="w-full px-3 py-2 pl-10 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded border border-border overflow-hidden"
            style={{ backgroundColor: value || "#1e293b" }}
          >
            {!value && <Pipette className="w-4 h-4 text-muted-foreground m-auto" />}
          </button>
        </div>
        {showReset && value && (
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground bg-muted rounded-lg"
          >
            Reset
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 p-3 bg-muted border border-border rounded-lg shadow-xl">
          <div className="grid grid-cols-5 gap-2 mb-3">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handlePresetClick(color)}
                className="w-7 h-7 rounded-md border-2 border-transparent hover:border-white transition-colors"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          <input
            type="color"
            value={value || "#6366f1"}
            onChange={(e) => {
              setInputValue(e.target.value);
              onChange(e.target.value);
            }}
            className="w-full h-8 rounded cursor-pointer"
          />
        </div>
      )}
    </div>
  );
}
