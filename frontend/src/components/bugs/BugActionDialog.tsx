"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface BugActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: Record<string, string>) => void;
  title: string;
  description?: string;
  fields: {
    name: string;
    label: string;
    type: "text" | "textarea" | "select";
    placeholder?: string;
    required?: boolean;
    options?: { value: string; label: string }[];
    defaultValue?: string;
  }[];
  confirmLabel?: string;
  confirmVariant?: "default" | "danger" | "success";
  isLoading?: boolean;
}

export function BugActionDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  fields,
  confirmLabel = "Confirm",
  confirmVariant = "default",
  isLoading = false,
}: BugActionDialogProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);

  // Initialize form data when fields change or dialog opens
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      fields.forEach((field) => {
        initial[field.name] = field.defaultValue || "";
      });
      setFormData(initial);
    }
  }, [isOpen, fields]);

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(formData);
  };

  const getButtonStyles = () => {
    switch (confirmVariant) {
      case "danger":
        return "bg-red-600 hover:bg-red-500";
      case "success":
        return "bg-green-600 hover:bg-green-500";
      default:
        return "bg-blue-600 hover:bg-blue-500";
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl w-full max-w-md m-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}

          {fields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-foreground mb-1">
                {field.label}
                {field.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              {field.type === "select" ? (
                <select
                  value={formData[field.name]}
                  onChange={(e) =>
                    setFormData({ ...formData, [field.name]: e.target.value })
                  }
                  required={field.required}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  value={formData[field.name]}
                  onChange={(e) =>
                    setFormData({ ...formData, [field.name]: e.target.value })
                  }
                  placeholder={field.placeholder}
                  required={field.required}
                  rows={3}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={formData[field.name]}
                  onChange={(e) =>
                    setFormData({ ...formData, [field.name]: e.target.value })
                  }
                  placeholder={field.placeholder}
                  required={field.required}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              )}
            </div>
          ))}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={`px-4 py-2 text-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${getButtonStyles()}`}
            >
              {isLoading ? "..." : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
