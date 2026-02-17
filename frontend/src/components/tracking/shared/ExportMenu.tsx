"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, FileText, FileJson, ChevronDown, Loader2 } from "lucide-react";

export type ExportFormat = "csv" | "pdf" | "json";

interface ExportOption {
  format: ExportFormat;
  label: string;
  icon: typeof FileSpreadsheet;
  description?: string;
}

const defaultExportOptions: ExportOption[] = [
  { format: "csv", label: "CSV", icon: FileSpreadsheet, description: "Excel compatible" },
  { format: "pdf", label: "PDF", icon: FileText, description: "Print ready" },
  { format: "json", label: "JSON", icon: FileJson, description: "Raw data" },
];

interface ExportMenuProps {
  onExport: (format: ExportFormat) => Promise<void>;
  options?: ExportFormat[];
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  className?: string;
}

export function ExportMenu({
  onExport,
  options = ["csv", "pdf", "json"],
  disabled = false,
  loading = false,
  label = "Export",
  className = "",
}: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExport = async (format: ExportFormat) => {
    setExportingFormat(format);
    try {
      await onExport(format);
    } finally {
      setExportingFormat(null);
      setIsOpen(false);
    }
  };

  const availableOptions = defaultExportOptions.filter((opt) => options.includes(opt.format));

  // If only one option, render as simple button
  if (availableOptions.length === 1) {
    const option = availableOptions[0];
    const Icon = option.icon;
    return (
      <button
        onClick={() => handleExport(option.format)}
        disabled={disabled || loading}
        className={`flex items-center gap-2 px-3 py-2 bg-accent border border-border rounded-lg text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
      >
        {exportingFormat === option.format ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
        <span>Export {option.label}</span>
      </button>
    );
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || loading}
        className="flex items-center gap-2 px-3 py-2 bg-accent border border-border rounded-lg text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span>{label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 z-50 bg-muted border border-border rounded-lg shadow-lg min-w-[180px] overflow-hidden">
          {availableOptions.map((option) => {
            const Icon = option.icon;
            const isExporting = exportingFormat === option.format;
            return (
              <button
                key={option.format}
                onClick={() => handleExport(option.format)}
                disabled={isExporting}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent transition-colors disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm text-foreground">{option.label}</p>
                  {option.description && (
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Utility functions for client-side export
export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          // Handle values that contain commas, quotes, or newlines
          const stringValue = String(value ?? "");
          if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        })
        .join(",")
    ),
  ].join("\n");

  downloadFile(csvContent, `${filename}.csv`, "text/csv");
}

export function exportToJSON(data: unknown, filename: string) {
  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile(jsonContent, `${filename}.json`, "application/json");
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
