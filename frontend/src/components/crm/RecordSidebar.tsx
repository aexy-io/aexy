"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  User,
  Calendar,
  Clock,
  Tag,
  List,
  MessageSquare,
  Info,
  Edit2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMRecord, CRMAttribute } from "@/lib/api";
import { StatusBadge } from "./CRMBadge";

type SidebarTab = "details" | "comments" | "lists";

interface RecordSidebarProps {
  record: CRMRecord;
  attributes: CRMAttribute[];
  // Edit mode
  isEditing?: boolean;
  editedValues?: Record<string, unknown>;
  onValueChange?: (slug: string, value: unknown) => void;
  // Sidebar state
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  // Comments
  comments?: { id: string; content: string; author: string; createdAt: string }[];
  // Lists the record belongs to
  lists?: { id: string; name: string; color?: string }[];
  className?: string;
}

// Attribute value editor
function AttributeInput({
  attribute,
  value,
  onChange,
}: {
  attribute: CRMAttribute;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (attribute.attribute_type) {
    case "text":
    case "email":
    case "phone":
    case "url":
      return (
        <input
          type={attribute.attribute_type === "email" ? "email" : attribute.attribute_type === "url" ? "url" : "text"}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      );
    case "number":
    case "currency":
      return (
        <input
          type="number"
          value={(value as number) || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      );
    case "checkbox":
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
        />
      );
    case "select":
    case "status": {
      const config = attribute.config as { options?: { value: string; label: string }[] } | undefined;
      return (
        <select
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          <option value="">Select...</option>
          {(config?.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }
    case "date":
    case "datetime":
      return (
        <input
          type={attribute.attribute_type === "datetime" ? "datetime-local" : "date"}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      );
    default:
      return (
        <input
          type="text"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      );
  }
}

// Attribute value display
function AttributeValue({ attribute, value }: { attribute: CRMAttribute; value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-500">—</span>;
  }

  switch (attribute.attribute_type) {
    case "checkbox":
      return <span className={value ? "text-green-400" : "text-slate-500"}>{value ? "Yes" : "No"}</span>;
    case "currency":
      return <span className="text-green-400">${(value as number).toLocaleString()}</span>;
    case "status":
    case "select": {
      const config = attribute.config as { options?: { value: string; label: string; color?: string }[] } | undefined;
      const option = config?.options?.find((o) => o.value === value);
      if (option) {
        return <StatusBadge label={option.label} color={option.color || "#6366f1"} size="sm" />;
      }
      return <span>{String(value)}</span>;
    }
    case "email":
      return (
        <a href={`mailto:${value}`} className="text-blue-400 hover:underline text-sm">
          {String(value)}
        </a>
      );
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-sm truncate block">
          {String(value)}
        </a>
      );
    case "date":
    case "datetime":
      return <span className="text-sm">{new Date(String(value)).toLocaleDateString()}</span>;
    default:
      return <span className="text-sm truncate block">{String(value)}</span>;
  }
}

export function RecordSidebar({
  record,
  attributes,
  isEditing = false,
  editedValues = {},
  onValueChange,
  isCollapsed = false,
  onToggleCollapse,
  comments = [],
  lists = [],
  className,
}: RecordSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("details");

  const editableAttributes = attributes.filter((a) => !a.is_system);

  // Collapsed state - just show toggle button
  if (isCollapsed) {
    return (
      <div className={cn("flex flex-col items-center py-4 bg-slate-800/30 border-l border-slate-700", className)}>
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
          title="Expand sidebar"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="mt-4 space-y-3">
          <button
            onClick={() => {
              setActiveTab("details");
              onToggleCollapse?.();
            }}
            className={cn(
              "p-2 rounded-lg transition-colors",
              activeTab === "details" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
            title="Details"
          >
            <Info className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              setActiveTab("comments");
              onToggleCollapse?.();
            }}
            className={cn(
              "p-2 rounded-lg transition-colors",
              activeTab === "comments" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
            title="Comments"
          >
            <MessageSquare className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              setActiveTab("lists");
              onToggleCollapse?.();
            }}
            className={cn(
              "p-2 rounded-lg transition-colors",
              activeTab === "lists" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
            title="Lists"
          >
            <List className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-80 flex flex-col bg-slate-800/30 border-l border-slate-700", className)}>
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("details")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeTab === "details"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("comments")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeTab === "comments"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
          >
            Comments
          </button>
          <button
            onClick={() => setActiveTab("lists")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeTab === "lists"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
          >
            Lists
          </button>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
          title="Collapse sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "details" && (
          <div className="p-4 space-y-4">
            {/* Record metadata */}
            <div className="space-y-3 pb-4 border-b border-slate-700">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-slate-500" />
                <span className="text-slate-400">Owner:</span>
                <span className="text-white">{record.owner?.name || "Unassigned"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-slate-500" />
                <span className="text-slate-400">Created:</span>
                <span className="text-white">{new Date(record.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-slate-500" />
                <span className="text-slate-400">Updated:</span>
                <span className="text-white">{new Date(record.updated_at).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Attributes */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Attributes</h3>
              {editableAttributes.map((attr) => (
                <div key={attr.id} className="space-y-1">
                  <label className="text-xs text-slate-400">{attr.name}</label>
                  {isEditing ? (
                    <AttributeInput
                      attribute={attr}
                      value={editedValues[attr.slug] ?? record.values[attr.slug]}
                      onChange={(val) => onValueChange?.(attr.slug, val)}
                    />
                  ) : (
                    <div className="text-white">
                      <AttributeValue attribute={attr} value={record.values[attr.slug]} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "comments" && (
          <div className="p-4">
            {comments.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No comments yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                      <span className="font-medium text-white">{comment.author}</span>
                      <span>•</span>
                      <span>{new Date(comment.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-slate-300">{comment.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "lists" && (
          <div className="p-4">
            {lists.length === 0 ? (
              <div className="text-center py-8">
                <List className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Not in any lists</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lists.map((list) => (
                  <div
                    key={list.id}
                    className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg"
                  >
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: list.color || "#6366f1" }}
                    />
                    <span className="text-sm text-white">{list.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
