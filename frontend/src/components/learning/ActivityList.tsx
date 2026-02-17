"use client";

import { useState } from "react";
import {
  Plus,
  Filter,
  Search,
  BookOpen,
  Video,
  Code2,
  Users,
  FileText,
  Briefcase,
} from "lucide-react";
import { LearningActivityLog, ActivityType, ActivityStatus, CreateActivityData, ActivitySource } from "@/lib/api";
import { ActivityCard } from "./ActivityCard";

interface ActivityListProps {
  activities: LearningActivityLog[];
  isLoading: boolean;
  onCreateActivity?: (data: CreateActivityData) => Promise<unknown>;
  onStartActivity?: (activityId: string) => Promise<unknown>;
  onCompleteActivity?: (activityId: string, data?: { rating?: number; notes?: string }) => Promise<unknown>;
  onDeleteActivity?: (activityId: string) => Promise<unknown>;
  onStartSession?: (activityId: string) => Promise<unknown>;
  onEndSession?: (activityId: string) => Promise<unknown>;
  activeSessionId?: string;
  showFilters?: boolean;
  showCreateButton?: boolean;
  emptyMessage?: string;
}

const activityTypeOptions: { value: ActivityType; label: string; icon: typeof BookOpen }[] = [
  { value: "course", label: "Course", icon: BookOpen },
  { value: "video", label: "Video", icon: Video },
  { value: "task", label: "Task", icon: Code2 },
  { value: "project", label: "Project", icon: Briefcase },
  { value: "pairing", label: "Pairing", icon: Users },
  { value: "reading", label: "Reading", icon: FileText },
];

const statusOptions: { value: ActivityStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

export function ActivityList({
  activities,
  isLoading,
  onCreateActivity,
  onStartActivity,
  onCompleteActivity,
  onDeleteActivity,
  onStartSession,
  onEndSession,
  activeSessionId,
  showFilters = true,
  showCreateButton = true,
  emptyMessage = "No activities found",
}: ActivityListProps) {
  const [filterType, setFilterType] = useState<ActivityType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<ActivityStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newActivity, setNewActivity] = useState<Partial<CreateActivityData>>({
    activity_type: "video",
    source: "manual",
    title: "",
  });
  const [isCreating, setIsCreating] = useState(false);

  const filteredActivities = activities.filter((activity) => {
    if (filterType !== "all" && activity.activity_type !== filterType) return false;
    if (filterStatus !== "all" && activity.status !== filterStatus) return false;
    if (searchQuery && !activity.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleCreate = async () => {
    if (!onCreateActivity || !newActivity.title || !newActivity.activity_type) return;
    setIsCreating(true);
    try {
      await onCreateActivity(newActivity as CreateActivityData);
      setShowCreateModal(false);
      setNewActivity({ activity_type: "video", source: "manual", title: "" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      {(showFilters || showCreateButton) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {showFilters && (
            <>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search activities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as ActivityType | "all")}
                  className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Types</option>
                  {activityTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as ActivityStatus | "all")}
                  className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {showCreateButton && onCreateActivity && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Add Activity
            </button>
          )}
        </div>
      )}

      {/* Activity list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <p>{emptyMessage}</p>
          {showCreateButton && onCreateActivity && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-3 text-blue-400 hover:text-blue-300 text-sm"
            >
              Add your first activity
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredActivities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              onStart={onStartActivity ? () => onStartActivity(activity.id) : undefined}
              onComplete={onCompleteActivity ? (data) => onCompleteActivity(activity.id, data) : undefined}
              onDelete={onDeleteActivity ? () => onDeleteActivity(activity.id) : undefined}
              onStartSession={onStartSession ? () => onStartSession(activity.id) : undefined}
              onEndSession={onEndSession ? () => onEndSession(activity.id) : undefined}
              isActiveSession={activeSessionId === activity.id}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-muted rounded-xl p-6 max-w-md w-full mx-4 border border-border">
            <h3 className="text-lg font-medium text-foreground mb-4">Add New Activity</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Activity Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {activityTypeOptions.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setNewActivity({ ...newActivity, activity_type: opt.value })}
                        className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition ${
                          newActivity.activity_type === opt.value
                            ? "border-blue-500 bg-blue-900/30"
                            : "border-border hover:border-border"
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${newActivity.activity_type === opt.value ? "text-blue-400" : "text-muted-foreground"}`} />
                        <span className="text-xs text-foreground">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">Title</label>
                <input
                  type="text"
                  value={newActivity.title || ""}
                  onChange={(e) => setNewActivity({ ...newActivity, title: e.target.value })}
                  placeholder="Enter activity title..."
                  className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">Description (optional)</label>
                <textarea
                  value={newActivity.description || ""}
                  onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                  placeholder="Describe the activity..."
                  rows={2}
                  className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">External URL (optional)</label>
                <input
                  type="url"
                  value={newActivity.external_url || ""}
                  onChange={(e) => setNewActivity({ ...newActivity, external_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">Estimated Duration (minutes)</label>
                <input
                  type="number"
                  value={newActivity.estimated_duration_minutes || ""}
                  onChange={(e) => setNewActivity({ ...newActivity, estimated_duration_minutes: parseInt(e.target.value) || undefined })}
                  placeholder="30"
                  className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">Skill Tags (comma separated)</label>
                <input
                  type="text"
                  value={newActivity.skill_tags?.join(", ") || ""}
                  onChange={(e) => setNewActivity({ ...newActivity, skill_tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="React, TypeScript, Testing"
                  className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || !newActivity.title}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {isCreating ? "Adding..." : "Add Activity"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
