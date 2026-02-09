"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  User,
  Calendar,
  Clock,
  Pin,
  Trash2,
  FileText,
  LayoutList,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMRecord, CRMAttribute, CRMNote } from "@/lib/api";
import { StatusBadge } from "./CRMBadge";

type SidebarTab = "details" | "notes" | "lists";

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
  // Notes
  notes?: CRMNote[];
  onTogglePin?: (noteId: string, isPinned: boolean) => void;
  onDeleteNote?: (noteId: string) => void;
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
          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
        />
      );
    case "number":
    case "currency":
      return (
        <input
          type="number"
          value={(value as number) || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
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
          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
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
          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
        />
      );
    default:
      return (
        <input
          type="text"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
        />
      );
  }
}

// Attribute value display
function AttributeValue({ attribute, value }: { attribute: CRMAttribute; value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-500 text-sm">—</span>;
  }

  switch (attribute.attribute_type) {
    case "checkbox":
      return <span className={value ? "text-green-400" : "text-slate-500"}>{value ? "Yes" : "No"}</span>;
    case "currency":
      return <span className="text-emerald-400 font-medium">${(value as number).toLocaleString()}</span>;
    case "status":
    case "select": {
      const config = attribute.config as { options?: { value: string; label: string; color?: string }[] } | undefined;
      const option = config?.options?.find((o) => o.value === value);
      if (option) {
        return <StatusBadge label={option.label} color={option.color || "#6366f1"} size="sm" />;
      }
      return <span className="text-sm">{String(value)}</span>;
    }
    case "email":
      return (
        <a href={`mailto:${value}`} className="text-blue-400 hover:text-blue-300 hover:underline text-sm transition-colors">
          {String(value)}
        </a>
      );
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline text-sm truncate block transition-colors">
          {String(value).replace(/^https?:\/\//, "")}
        </a>
      );
    case "date":
    case "datetime":
      return <span className="text-sm text-slate-300">{new Date(String(value)).toLocaleDateString()}</span>;
    default:
      return <span className="text-sm text-slate-300 truncate block">{String(value)}</span>;
  }
}

// Collapsed sidebar button with badge
function CollapsedTabButton({
  icon: Icon,
  isActive,
  count,
  onClick,
  title,
}: {
  icon: React.ElementType;
  isActive: boolean;
  count?: number;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative p-2.5 rounded-xl transition-all duration-200",
        isActive
          ? "bg-purple-500/20 text-purple-400 shadow-lg shadow-purple-500/10"
          : "text-slate-400 hover:text-white hover:bg-slate-700/50"
      )}
      title={title}
    >
      <Icon className="h-5 w-5" />
      {count !== undefined && count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-purple-500 text-white rounded-full">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

export function RecordSidebar({
  record,
  attributes,
  isEditing = false,
  editedValues = {},
  onValueChange,
  isCollapsed = false,
  onToggleCollapse,
  notes = [],
  onTogglePin,
  onDeleteNote,
  lists = [],
  className,
}: RecordSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("details");

  const editableAttributes = attributes.filter((a) => !a.is_system);
  const pinnedNotesCount = notes.filter((n) => n.is_pinned).length;

  // Collapsed state
  if (isCollapsed) {
    return (
      <div className={cn(
        "w-16 flex flex-col items-center py-4 bg-gradient-to-b from-slate-800/50 to-slate-900/50 border-l border-slate-700/50 backdrop-blur-sm",
        className
      )}>
        {/* Expand button */}
        <button
          onClick={onToggleCollapse}
          className="p-2 mb-6 hover:bg-slate-700/50 rounded-xl text-slate-400 hover:text-white transition-all duration-200 group"
          title="Expand sidebar"
        >
          <ChevronLeft className="h-5 w-5 group-hover:-translate-x-0.5 transition-transform" />
        </button>

        {/* Navigation icons */}
        <div className="flex flex-col gap-2">
          <CollapsedTabButton
            icon={FileText}
            isActive={activeTab === "details"}
            onClick={() => {
              setActiveTab("details");
              onToggleCollapse?.();
            }}
            title="Details"
          />
          <CollapsedTabButton
            icon={StickyNote}
            isActive={activeTab === "notes"}
            count={notes.length}
            onClick={() => {
              setActiveTab("notes");
              onToggleCollapse?.();
            }}
            title={`Notes (${notes.length})`}
          />
          <CollapsedTabButton
            icon={LayoutList}
            isActive={activeTab === "lists"}
            count={lists.length}
            onClick={() => {
              setActiveTab("lists");
              onToggleCollapse?.();
            }}
            title={`Lists (${lists.length})`}
          />
        </div>

        {/* Quick info at bottom */}
        <div className="mt-auto pt-4 border-t border-slate-700/50 w-full flex flex-col items-center gap-3">
          <div className="group relative">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">
              <User className="h-4 w-4" />
            </div>
            <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-800 rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {record.owner?.name || "Unassigned"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "w-80 flex flex-col bg-gradient-to-b from-slate-800/30 to-slate-900/30 border-l border-slate-700/50 backdrop-blur-sm",
      className
    )}>
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
          <button
            onClick={() => setActiveTab("details")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
              activeTab === "details"
                ? "bg-slate-700 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            )}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-1.5",
              activeTab === "notes"
                ? "bg-slate-700 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            )}
          >
            Notes
            {notes.length > 0 && (
              <span className={cn(
                "min-w-[20px] h-5 flex items-center justify-center px-1.5 text-xs rounded-full",
                activeTab === "notes" ? "bg-purple-500 text-white" : "bg-slate-600 text-slate-300"
              )}>
                {notes.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("lists")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
              activeTab === "lists"
                ? "bg-slate-700 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            )}
          >
            Lists
          </button>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-all duration-200 group"
          title="Collapse sidebar"
        >
          <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {activeTab === "details" && (
          <div className="p-4 space-y-5">
            {/* Record metadata */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Info</h3>
              <div className="space-y-2.5 bg-slate-800/30 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <User className="h-4 w-4" />
                    <span>Owner</span>
                  </div>
                  <span className="text-sm text-white font-medium">{record.owner?.name || "Unassigned"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Calendar className="h-4 w-4" />
                    <span>Created</span>
                  </div>
                  <span className="text-sm text-slate-300">{new Date(record.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Clock className="h-4 w-4" />
                    <span>Updated</span>
                  </div>
                  <span className="text-sm text-slate-300">{new Date(record.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {/* Attributes */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Attributes</h3>
              <div className="space-y-3">
                {editableAttributes.map((attr) => (
                  <div key={attr.id} className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">{attr.name}</label>
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
                {editableAttributes.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">No attributes</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "notes" && (
          <div className="p-4">
            {notes.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800/50 flex items-center justify-center">
                  <StickyNote className="h-6 w-6 text-slate-500" />
                </div>
                <p className="text-sm text-slate-400 mb-1">No notes yet</p>
                <p className="text-xs text-slate-500">Add notes from the Notes tab</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Pinned notes first */}
                {pinnedNotesCount > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Pin className="h-3 w-3" />
                      Pinned ({pinnedNotesCount})
                    </h4>
                    <div className="space-y-2">
                      {notes.filter(n => n.is_pinned).map((note) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          onTogglePin={onTogglePin}
                          onDelete={onDeleteNote}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {/* Other notes */}
                {notes.filter(n => !n.is_pinned).length > 0 && (
                  <div>
                    {pinnedNotesCount > 0 && (
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Other Notes
                      </h4>
                    )}
                    <div className="space-y-2">
                      {notes.filter(n => !n.is_pinned).map((note) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          onTogglePin={onTogglePin}
                          onDelete={onDeleteNote}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "lists" && (
          <div className="p-4">
            {lists.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800/50 flex items-center justify-center">
                  <LayoutList className="h-6 w-6 text-slate-500" />
                </div>
                <p className="text-sm text-slate-400 mb-1">Not in any lists</p>
                <p className="text-xs text-slate-500">Add to lists to organize records</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lists.map((list) => (
                  <div
                    key={list.id}
                    className="flex items-center gap-3 p-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer group"
                  >
                    <div
                      className="w-3 h-3 rounded-full ring-2 ring-offset-2 ring-offset-slate-900"
                      style={{ backgroundColor: list.color || "#6366f1", ["--tw-ring-color" as string]: list.color || "#6366f1" }}
                    />
                    <span className="text-sm text-white group-hover:text-purple-300 transition-colors">{list.name}</span>
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

// Note card component
function NoteCard({
  note,
  onTogglePin,
  onDelete,
}: {
  note: CRMNote;
  onTogglePin?: (noteId: string, isPinned: boolean) => void;
  onDelete?: (noteId: string) => void;
}) {
  return (
    <div className={cn(
      "group relative bg-slate-800/40 hover:bg-slate-800/60 rounded-xl p-3 transition-all duration-200",
      note.is_pinned && "ring-1 ring-amber-500/30 bg-amber-500/5"
    )}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs text-slate-500">
          {new Date(note.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onTogglePin?.(note.id, note.is_pinned)}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              note.is_pinned
                ? "text-amber-400 hover:bg-amber-500/20"
                : "text-slate-400 hover:text-amber-400 hover:bg-slate-700"
            )}
            title={note.is_pinned ? "Unpin" : "Pin"}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete?.(note.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{note.content}</p>
    </div>
  );
}
