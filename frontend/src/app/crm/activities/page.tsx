"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  ChevronLeft,
  Mail,
  Calendar,
  Phone,
  MessageSquare,
  FileText,
  Users,
  Building2,
  Filter,
  Search,
  RefreshCw,
  Loader2,
  Edit,
  Plus,
  Trash,
  Link2,
  Eye,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { crmApi, CRMActivity } from "@/lib/api";

type ActivityType = "all" | "email" | "meeting" | "call" | "note" | "task" | "record_created" | "record_updated" | "record_deleted";

const activityTypeConfig: Record<string, { icon: React.ElementType; label: string; color: string; bgColor: string }> = {
  all: { icon: Clock, label: "All", color: "text-slate-400", bgColor: "bg-slate-500/20" },
  email: { icon: Mail, label: "Emails", color: "text-blue-400", bgColor: "bg-blue-500/20" },
  meeting: { icon: Calendar, label: "Meetings", color: "text-green-400", bgColor: "bg-green-500/20" },
  call: { icon: Phone, label: "Calls", color: "text-amber-400", bgColor: "bg-amber-500/20" },
  note: { icon: FileText, label: "Notes", color: "text-purple-400", bgColor: "bg-purple-500/20" },
  task: { icon: MessageSquare, label: "Tasks", color: "text-pink-400", bgColor: "bg-pink-500/20" },
  record_created: { icon: Plus, label: "Created", color: "text-emerald-400", bgColor: "bg-emerald-500/20" },
  record_updated: { icon: Edit, label: "Updated", color: "text-sky-400", bgColor: "bg-sky-500/20" },
  record_deleted: { icon: Trash, label: "Deleted", color: "text-red-400", bgColor: "bg-red-500/20" },
  record_viewed: { icon: Eye, label: "Viewed", color: "text-slate-400", bgColor: "bg-slate-500/20" },
  link_created: { icon: Link2, label: "Linked", color: "text-indigo-400", bgColor: "bg-indigo-500/20" },
};

function getActivityConfig(type: string) {
  return activityTypeConfig[type] || { icon: Clock, label: type, color: "text-slate-400", bgColor: "bg-slate-500/20" };
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function ActivityItem({ activity }: { activity: CRMActivity }) {
  const router = useRouter();
  const config = getActivityConfig(activity.activity_type);
  const Icon = config.icon;

  const handleClick = () => {
    if (activity.record_id) {
      // Navigate to the record - we'd need to know the object slug
      // For now, we can't navigate without knowing the object type
    }
  };

  return (
    <div
      className="flex items-start gap-4 p-4 bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50 rounded-xl transition-colors cursor-pointer"
      onClick={handleClick}
    >
      <div className={`p-2.5 rounded-lg ${config.bgColor}`}>
        <Icon className={`w-5 h-5 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-white">
              {activity.title || config.label}
            </h3>
            {activity.description && (
              <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">
                {activity.description}
              </p>
            )}
          </div>
          <span className="text-xs text-slate-500 flex-shrink-0">
            {formatRelativeTime(activity.created_at)}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
          {activity.actor_id && (
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {activity.actor?.name || "User"}
            </span>
          )}
          <span className="px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">
            {config.label}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ActivitiesPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedType, setSelectedType] = useState<ActivityType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    if (!workspaceId) return;

    const loadActivities = async () => {
      setIsLoading(true);
      try {
        const response = await crmApi.activities.listWorkspace(workspaceId, {
          activity_type: selectedType === "all" ? undefined : selectedType,
          limit,
          offset,
        });
        setActivities(response.activities);
        setTotal(response.total);
      } catch (err) {
        console.error("Failed to load activities:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadActivities();
  }, [workspaceId, selectedType, offset]);

  const handleRefresh = async () => {
    if (!workspaceId) return;
    setIsRefreshing(true);
    try {
      const response = await crmApi.activities.listWorkspace(workspaceId, {
        activity_type: selectedType === "all" ? undefined : selectedType,
        limit,
        offset: 0,
      });
      setActivities(response.activities);
      setTotal(response.total);
      setOffset(0);
    } catch (err) {
      console.error("Failed to refresh activities:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredActivities = activities.filter((activity) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      activity.title?.toLowerCase().includes(query) ||
      activity.description?.toLowerCase().includes(query)
    );
  });

  const filterTypes: ActivityType[] = ["all", "record_created", "record_updated", "email", "meeting", "call", "note", "task"];

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading workspace...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/crm")}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              CRM
            </button>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              Activities
            </h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <div className="flex-1 relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search activities..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 overflow-x-auto">
            {filterTypes.map((type) => {
              const config = getActivityConfig(type);
              const Icon = config.icon;
              return (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedType(type);
                    setOffset(0);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
                    selectedType === type
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${selectedType === type ? config.color : ""}`} />
                  <span className="hidden sm:inline">{config.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Activity Count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-400">
            {total} {total === 1 ? "activity" : "activities"}
            {selectedType !== "all" && ` (${getActivityConfig(selectedType).label})`}
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="bg-slate-800/50 rounded-full p-6 mb-6">
              <Clock className="h-12 w-12 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              {searchQuery ? "No matching activities" : "No activities yet"}
            </h2>
            <p className="text-slate-400 text-center max-w-md mb-6">
              {searchQuery
                ? "Try adjusting your search or filters."
                : "Activities will appear here as you interact with your contacts, schedule meetings, and track tasks."}
            </p>
            {!searchQuery && (
              <div className="flex flex-wrap justify-center gap-4">
                <button
                  onClick={() => router.push("/crm/inbox")}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  View Inbox
                </button>
                <button
                  onClick={() => router.push("/crm/calendar")}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  <Calendar className="w-4 h-4" />
                  View Calendar
                </button>
                <button
                  onClick={() => router.push("/crm/person")}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  <Users className="w-4 h-4" />
                  View People
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Activities List */}
            <div className="space-y-3">
              {filteredActivities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>

            {/* Pagination */}
            {total > limit && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-400">
                  {offset + 1} - {Math.min(offset + limit, total)} of {total}
                </span>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
