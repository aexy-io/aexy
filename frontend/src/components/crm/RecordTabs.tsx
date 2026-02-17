"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  Activity,
  MessageSquare,
  Link2,
  Plus,
  User,
  Pin,
  Trash2,
  Calendar,
  ArrowRight,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMRecord, CRMAttribute, CRMNote } from "@/lib/api";

export type RecordTabId = "overview" | "activity" | "notes" | "related";

interface Tab {
  id: RecordTabId;
  label: string;
  icon: React.ReactNode;
  count?: number;
}

interface RecordTabsProps {
  activeTab: RecordTabId;
  onTabChange: (tab: RecordTabId) => void;
  notesCount?: number;
  activitiesCount?: number;
  relatedCount?: number;
  className?: string;
}

export function RecordTabs({
  activeTab,
  onTabChange,
  notesCount = 0,
  activitiesCount = 0,
  relatedCount = 0,
  className,
}: RecordTabsProps) {
  const tabs: Tab[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: "activity", label: "Activity", icon: <Activity className="h-4 w-4" />, count: activitiesCount },
    { id: "notes", label: "Notes", icon: <MessageSquare className="h-4 w-4" />, count: notesCount },
    { id: "related", label: "Related", icon: <Link2 className="h-4 w-4" />, count: relatedCount },
  ];

  return (
    <div className={cn("border-b border-border", className)}>
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "text-foreground border-purple-500"
                : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="px-1.5 py-0.5 bg-accent rounded text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// Note Card Component
interface NoteCardProps {
  note: CRMNote;
  onDelete: () => void;
  onTogglePin: () => void;
}

export function NoteCard({ note, onDelete, onTogglePin }: NoteCardProps) {
  return (
    <div
      className={cn(
        "bg-muted/50 border rounded-lg p-4",
        note.is_pinned ? "border-yellow-500/30" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-3 w-3" />
          <span>{note.created_by?.name || "Unknown"}</span>
          <span>•</span>
          <span>{new Date(note.created_at).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onTogglePin}
            className={cn(
              "p-1 rounded hover:bg-accent",
              note.is_pinned ? "text-yellow-400" : "text-muted-foreground hover:text-foreground"
            )}
            title={note.is_pinned ? "Unpin note" : "Pin note"}
          >
            <Pin className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
            title="Delete note"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="text-foreground whitespace-pre-wrap">{note.content}</p>
    </div>
  );
}

// Activity Item Component
interface ActivityItemProps {
  activity: {
    id: string;
    activity_type: string;
    title: string;
    description?: string | null;
    actor_name?: string | null;
    created_at: string;
  };
}

export function ActivityItem({ activity }: ActivityItemProps) {
  // Get icon based on activity type
  const getActivityIcon = () => {
    switch (activity.activity_type) {
      case "created":
        return <Plus className="h-4 w-4" />;
      case "updated":
        return <FileText className="h-4 w-4" />;
      case "status_changed":
        return <ArrowRight className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex gap-3 py-3 border-b border-border/50 last:border-0">
      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-muted-foreground">
        {getActivityIcon()}
      </div>
      <div className="flex-1">
        <p className="text-sm text-foreground">{activity.title}</p>
        {activity.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{activity.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {activity.actor_name || "System"} • {new Date(activity.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// Notes Tab Content
interface NotesTabContentProps {
  notes: CRMNote[];
  isLoading?: boolean;
  newNote: string;
  onNewNoteChange: (value: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: string) => void;
  onTogglePin: (noteId: string, isPinned: boolean) => void;
  isCreating?: boolean;
}

export function NotesTabContent({
  notes,
  isLoading = false,
  newNote,
  onNewNoteChange,
  onCreateNote,
  onDeleteNote,
  onTogglePin,
  isCreating = false,
}: NotesTabContentProps) {
  const pinnedNotes = notes.filter((n) => n.is_pinned);
  const regularNotes = notes.filter((n) => !n.is_pinned);

  return (
    <div className="space-y-4">
      {/* New Note */}
      <div className="space-y-2">
        <textarea
          value={newNote}
          onChange={(e) => onNewNoteChange(e.target.value)}
          placeholder="Add a note..."
          rows={3}
          className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={onCreateNote}
            disabled={!newNote.trim() || isCreating}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-foreground rounded-lg text-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            {isCreating ? "Adding..." : "Add Note"}
          </button>
        </div>
      </div>

      {/* Pinned Notes */}
      {pinnedNotes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Pinned</h3>
          {pinnedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={() => onDeleteNote(note.id)}
              onTogglePin={() => onTogglePin(note.id, note.is_pinned)}
            />
          ))}
        </div>
      )}

      {/* Regular Notes */}
      {regularNotes.length > 0 && (
        <div className="space-y-2">
          {pinnedNotes.length > 0 && (
            <h3 className="text-sm font-medium text-muted-foreground">All Notes</h3>
          )}
          {regularNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={() => onDeleteNote(note.id)}
              onTogglePin={() => onTogglePin(note.id, note.is_pinned)}
            />
          ))}
        </div>
      )}

      {notes.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No notes yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add your first note above</p>
        </div>
      )}
    </div>
  );
}

// Activity Tab Content
interface ActivityTabContentProps {
  activities: {
    id: string;
    activity_type: string;
    title: string;
    description?: string | null;
    actor_name?: string | null;
    created_at: string;
  }[];
  isLoading?: boolean;
}

export function ActivityTabContent({ activities, isLoading = false }: ActivityTabContentProps) {
  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading activity...</div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No activity yet</p>
        <p className="text-sm text-muted-foreground mt-1">Activity will appear here as changes are made</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {activities.map((activity) => (
        <ActivityItem key={activity.id} activity={activity} />
      ))}
    </div>
  );
}

// Related Records Tab Content
interface RelatedRecord {
  id: string;
  display_name: string;
  object_name: string;
  object_slug: string;
}

interface RelatedTabContentProps {
  relatedRecords: RelatedRecord[];
  isLoading?: boolean;
  onRecordClick?: (record: RelatedRecord) => void;
}

export function RelatedTabContent({
  relatedRecords,
  isLoading = false,
  onRecordClick,
}: RelatedTabContentProps) {
  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading related records...</div>
    );
  }

  if (relatedRecords.length === 0) {
    return (
      <div className="text-center py-12">
        <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No related records</p>
        <p className="text-sm text-muted-foreground mt-1">Related records will appear here</p>
      </div>
    );
  }

  // Group by object type
  const groupedRecords = relatedRecords.reduce((acc, record) => {
    if (!acc[record.object_name]) {
      acc[record.object_name] = [];
    }
    acc[record.object_name].push(record);
    return acc;
  }, {} as Record<string, RelatedRecord[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedRecords).map(([objectName, records]) => (
        <div key={objectName}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">{objectName}</h3>
          <div className="space-y-2">
            {records.map((record) => (
              <button
                key={record.id}
                onClick={() => onRecordClick?.(record)}
                className="w-full flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-lg hover:border-border transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                  <Link2 className="h-4 w-4" />
                </div>
                <span className="text-foreground font-medium">{record.display_name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Overview Tab Content (combines key info and recent activity)
interface OverviewTabContentProps {
  record: CRMRecord;
  attributes: CRMAttribute[];
  recentActivities: {
    id: string;
    activity_type: string;
    title: string;
    description?: string | null;
    actor_name?: string | null;
    created_at: string;
  }[];
  pinnedNotes: CRMNote[];
  onNoteTogglePin?: (noteId: string, isPinned: boolean) => void;
  onNoteDelete?: (noteId: string) => void;
  onViewAllActivity?: () => void;
  onViewAllNotes?: () => void;
}

export function OverviewTabContent({
  record,
  attributes,
  recentActivities,
  pinnedNotes,
  onNoteTogglePin,
  onNoteDelete,
  onViewAllActivity,
  onViewAllNotes,
}: OverviewTabContentProps) {
  return (
    <div className="space-y-6">
      {/* Pinned Notes */}
      {pinnedNotes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Pinned Notes</h3>
            {onViewAllNotes && (
              <button
                onClick={onViewAllNotes}
                className="text-xs text-purple-400 hover:text-purple-300"
              >
                View all notes
              </button>
            )}
          </div>
          <div className="space-y-2">
            {pinnedNotes.slice(0, 2).map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onDelete={() => onNoteDelete?.(note.id)}
                onTogglePin={() => onNoteTogglePin?.(note.id, note.is_pinned)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentActivities.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Recent Activity</h3>
            {onViewAllActivity && (
              <button
                onClick={onViewAllActivity}
                className="text-xs text-purple-400 hover:text-purple-300"
              >
                View all activity
              </button>
            )}
          </div>
          <div className="bg-muted/50 border border-border rounded-lg p-3">
            {recentActivities.slice(0, 5).map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {pinnedNotes.length === 0 && recentActivities.length === 0 && (
        <div className="text-center py-12">
          <LayoutDashboard className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No overview content yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Pin notes or add activity to see them here
          </p>
        </div>
      )}
    </div>
  );
}
