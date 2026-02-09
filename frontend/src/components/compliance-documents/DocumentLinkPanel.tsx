"use client";

import { useState } from "react";
import { Link2, Plus, X, Loader2, FileText, ExternalLink } from "lucide-react";
import { ComplianceDocumentLink, ComplianceEntityType, ComplianceLinkType } from "@/lib/api";

interface DocumentLinkPanelProps {
  links: ComplianceDocumentLink[];
  isLoading: boolean;
  onLink?: (data: {
    entity_type: ComplianceEntityType;
    entity_id: string;
    link_type?: ComplianceLinkType;
    notes?: string;
  }) => Promise<unknown>;
  onUnlink?: (linkId: string) => Promise<unknown>;
}

const ENTITY_TYPE_LABELS: Record<ComplianceEntityType, string> = {
  reminder: "Reminder",
  reminder_instance: "Reminder Instance",
  certification: "Certification",
  training: "Training",
  control: "Control",
};

const LINK_TYPE_LABELS: Record<ComplianceLinkType, string> = {
  evidence: "Evidence",
  reference: "Reference",
  attachment: "Attachment",
};

export function DocumentLinkPanel({ links, isLoading, onLink, onUnlink }: DocumentLinkPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [entityType, setEntityType] = useState<ComplianceEntityType>("reminder");
  const [entityId, setEntityId] = useState("");
  const [linkType, setLinkType] = useState<ComplianceLinkType>("evidence");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityId.trim() || !onLink) return;

    setSubmitting(true);
    try {
      await onLink({
        entity_type: entityType,
        entity_id: entityId.trim(),
        link_type: linkType,
        notes: notes.trim() || undefined,
      });
      setShowForm(false);
      setEntityId("");
      setNotes("");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Linked Entities ({links.length})
        </h3>
        {onLink && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Link
          </button>
        )}
      </div>

      {/* Existing Links */}
      {links.length === 0 && !showForm && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No linked entities yet.</p>
      )}

      {links.map((link) => (
        <div
          key={link.id}
          className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm"
        >
          <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {ENTITY_TYPE_LABELS[link.entity_type as ComplianceEntityType] || link.entity_type}
            </span>
            <span className="ml-2 text-gray-500 dark:text-gray-400 truncate">
              {link.entity_id}
            </span>
            <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              {LINK_TYPE_LABELS[link.link_type as ComplianceLinkType] || link.link_type}
            </span>
            {link.notes && (
              <p className="text-xs text-gray-400 mt-0.5">{link.notes}</p>
            )}
          </div>
          {onUnlink && (
            <button
              onClick={() => onUnlink(link.id)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          )}
        </div>
      ))}

      {/* Link Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Entity Type
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as ComplianceEntityType)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Link Type
              </label>
              <select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as ComplianceLinkType)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {Object.entries(LINK_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Entity ID
            </label>
            <input
              type="text"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Enter entity ID"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Add a note..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!entityId.trim() || submitting}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              Link
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
