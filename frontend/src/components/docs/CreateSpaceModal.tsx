"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";

interface CreateSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; description?: string; icon?: string; color?: string }) => Promise<void>;
  isCreating?: boolean;
}

// Common emoji icons for spaces
const ICONS = ["📁", "📄", "📚", "🔧", "💡", "🚀", "🎯", "📊", "🔬", "🎨", "📝", "💻"];

// Common colors for spaces
const COLORS = [
  "#6366F1", // Indigo
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#EF4444", // Red
  "#F97316", // Orange
  "#EAB308", // Yellow
  "#22C55E", // Green
  "#14B8A6", // Teal
  "#06B6D4", // Cyan
  "#3B82F6", // Blue
];

export function CreateSpaceModal({
  isOpen,
  onClose,
  onCreate,
  isCreating = false,
}: CreateSpaceModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("📁");
  const [color, setColor] = useState("#6366F1");
  const [error, setError] = useState("");

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName("");
      setDescription("");
      setIcon("📁");
      setColor("#6366F1");
      setError("");
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Space name is required");
      return;
    }

    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        icon,
        color,
      });
      onClose();
    } catch (err) {
      setError("Failed to create space. Please try again.");
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">Create Space</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-700 rounded-md transition-colors"
            >
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Icon & Color */}
            <div className="flex items-start gap-4">
              {/* Icon Preview */}
              <div
                className="h-14 w-14 rounded-lg flex items-center justify-center text-2xl flex-shrink-0"
                style={{ backgroundColor: color }}
              >
                {icon}
              </div>

              {/* Icon & Color Selectors */}
              <div className="flex-1 space-y-3">
                {/* Icons */}
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Icon</label>
                  <div className="flex flex-wrap gap-1">
                    {ICONS.map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setIcon(i)}
                        className={`h-7 w-7 rounded flex items-center justify-center text-sm hover:bg-slate-700 transition-colors ${
                          icon === i ? "bg-slate-700 ring-1 ring-primary-500" : ""
                        }`}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Colors */}
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Color</label>
                  <div className="flex flex-wrap gap-1">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`h-6 w-6 rounded-full transition-transform ${
                          color === c ? "ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110" : ""
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Name</label>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                placeholder="e.g., Engineering, Design, Marketing"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">
                Description <span className="text-slate-500">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this space for?"
                rows={2}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Space
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
