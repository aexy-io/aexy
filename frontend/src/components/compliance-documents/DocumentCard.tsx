"use client";

import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  MoreVertical,
  Download,
  Pencil,
  Archive,
  Trash2,
  FolderInput,
  Tag,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { ComplianceDocument } from "@/lib/api";

const FILE_ICONS: Record<string, typeof FileText> = {
  "application/pdf": FileText,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": FileSpreadsheet,
  "application/vnd.ms-excel": FileSpreadsheet,
  "text/csv": FileSpreadsheet,
  "image/png": FileImage,
  "image/jpeg": FileImage,
  "image/gif": FileImage,
  "image/webp": FileImage,
  "image/svg+xml": FileImage,
};

function getFileIcon(mimeType: string) {
  return FILE_ICONS[mimeType] || File;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface DocumentCardProps {
  document: ComplianceDocument;
  onEdit?: (doc: ComplianceDocument) => void;
  onArchive?: (doc: ComplianceDocument) => void;
  onDelete?: (doc: ComplianceDocument) => void;
  onMove?: (doc: ComplianceDocument) => void;
  onTagManage?: (doc: ComplianceDocument) => void;
  onClick?: (doc: ComplianceDocument) => void;
}

export function DocumentCard({
  document: doc,
  onEdit,
  onArchive,
  onDelete,
  onMove,
  onTagManage,
  onClick,
}: DocumentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const Icon = getFileIcon(doc.mime_type);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      window.addEventListener("mousedown", handleClickOutside);
    }
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all cursor-pointer group relative"
      onClick={() => onClick?.(doc)}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <Icon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {doc.name}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{formatFileSize(doc.file_size)}</span>
            <span>&middot;</span>
            <span>{new Date(doc.created_at).toLocaleDateString()}</span>
          </div>
          {doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {doc.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                >
                  {tag}
                </span>
              ))}
              {doc.tags.length > 3 && (
                <span className="text-xs text-gray-400">+{doc.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* Actions Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <MoreVertical className="h-4 w-4 text-gray-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-10 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
              {doc.download_url && (
                <a
                  href={doc.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Download className="h-4 w-4" /> Download
                </a>
              )}
              {onEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(doc); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              )}
              {onTagManage && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onTagManage(doc); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Tag className="h-4 w-4" /> Manage Tags
                </button>
              )}
              {onMove && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onMove(doc); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <FolderInput className="h-4 w-4" /> Move
                </button>
              )}
              {onArchive && doc.status === "active" && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchive(doc); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Archive className="h-4 w-4" /> Archive
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(doc); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
