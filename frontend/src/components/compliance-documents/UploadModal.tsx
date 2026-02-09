"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, X, FileText, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useDocumentUpload } from "@/hooks/useComplianceDocuments";

interface UploadModalProps {
  workspaceId: string;
  folderId?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function UploadModal({ workspaceId, folderId, onClose, onSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { upload, uploading, progress, error } = useDocumentUpload(workspaceId);

  const validateFile = useCallback((f: File): string | null => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      return "File type not allowed. Supported: PDF, DOCX, XLSX, CSV, TXT, PNG, JPEG, GIF, WEBP, SVG";
    }
    if (f.size > MAX_FILE_SIZE) {
      return "File size exceeds 50MB limit";
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (f: File) => {
      const err = validateFile(f);
      if (err) {
        setValidationError(err);
        return;
      }
      setValidationError(null);
      setFile(f);
      if (!name) setName(f.name);
    },
    [validateFile, name]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  const handleSubmit = async () => {
    if (!file) return;

    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const result = await upload(file, {
      name: name || file.name,
      description: description || undefined,
      folder_id: folderId || undefined,
      tags: tagList.length > 0 ? tagList : undefined,
    });

    if (result) {
      onSuccess?.();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upload Document</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Drop Zone */}
          {!file ? (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-300 dark:border-gray-600 hover:border-gray-400"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium text-blue-600 dark:text-blue-400">Click to upload</span>{" "}
                or drag and drop
              </p>
              <p className="text-xs text-gray-400 mt-1">
                PDF, DOCX, XLSX, CSV, TXT, PNG, JPEG (max 50MB)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ALLOWED_TYPES.join(",")}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <FileText className="h-8 w-8 text-gray-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {file.name}
                </p>
                <p className="text-xs text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={() => { setFile(null); setName(""); }}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          )}

          {validationError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              {validationError}
            </div>
          )}

          {/* Metadata Fields */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Document name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Brief description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags <span className="text-gray-400">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., policy, SOC2, evidence"
            />
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || uploading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
