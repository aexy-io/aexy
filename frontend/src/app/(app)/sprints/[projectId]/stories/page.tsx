"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Filter,
  Search,
  BookOpen,
  Grid3X3,
  List,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useStories } from "@/hooks/useStories";
import { StoryCard } from "@/components/stories/StoryCard";
import { StoryForm } from "@/components/stories/StoryForm";
import { UserStory, StoryStatus, StoryPriority, UserStoryCreate, UserStoryUpdate } from "@/lib/api";

const STATUS_OPTIONS: { value: StoryStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

const PRIORITY_OPTIONS: { value: StoryPriority | "all"; label: string }[] = [
  { value: "all", label: "All Priorities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export default function StoriesPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedStory, setSelectedStory] = useState<UserStory | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StoryStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<StoryPriority | "all">("all");

  const {
    stories,
    total,
    isLoading,
    createStory,
    deleteStory,
    isCreating,
  } = useStories(workspaceId, {
    project_id: projectId,
    status: statusFilter === "all" ? undefined : statusFilter,
    priority: priorityFilter === "all" ? undefined : priorityFilter,
  });

  const filteredStories = stories.filter((story) =>
    story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    story.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
    story.as_a.toLowerCase().includes(searchQuery.toLowerCase()) ||
    story.i_want.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateStory = async (data: UserStoryCreate | UserStoryUpdate) => {
    await createStory(data as UserStoryCreate);
    setShowCreateModal(false);
  };

  const handleStoryClick = (story: UserStory) => {
    setSelectedStory(story);
  };

  const handleDeleteStory = async (storyId: string) => {
    if (confirm("Are you sure you want to delete this story?")) {
      await deleteStory(storyId);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Please log in to view stories.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                href={`/sprints/${projectId}`}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-white flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-blue-400" />
                  User Stories
                </h1>
                <p className="text-xs text-slate-500">
                  {total} {total === 1 ? "story" : "stories"} in this project
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Story
            </button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stories..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StoryStatus | "all")}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Priority Filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as StoryPriority | "all")}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* View Toggle */}
        <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded ${viewMode === "grid" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded ${viewMode === "list" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stories Grid/List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : filteredStories.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <BookOpen className="h-12 w-12 text-slate-600 mb-4" />
          <p className="text-slate-400 mb-2">No stories found</p>
          <p className="text-slate-500 text-sm">
            {searchQuery || statusFilter !== "all" || priorityFilter !== "all"
              ? "Try adjusting your filters"
              : "Create your first user story to get started"}
          </p>
        </div>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              : "space-y-3"
          }
        >
          {filteredStories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              onClick={handleStoryClick}
              onDelete={handleDeleteStory}
            />
          ))}
        </div>
      )}

      {/* Create Story Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Create User Story</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <StoryForm
                onSubmit={handleCreateStory}
                onCancel={() => setShowCreateModal(false)}
                isLoading={isCreating}
                mode="create"
              />
            </div>
          </div>
        </div>
      )}

      {/* Story Detail Modal */}
      {selectedStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-slate-700">
              <div>
                <span className="text-sm font-mono text-slate-400">{selectedStory.key}</span>
                <h2 className="text-lg font-semibold text-white">{selectedStory.title}</h2>
              </div>
              <button
                onClick={() => setSelectedStory(null)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Story Format */}
              <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
                <p className="text-slate-300">
                  <span className="text-slate-500">As a</span>{" "}
                  <span className="font-medium">{selectedStory.as_a}</span>
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-500">I want</span>{" "}
                  <span className="font-medium">{selectedStory.i_want}</span>
                </p>
                {selectedStory.so_that && (
                  <p className="text-slate-300">
                    <span className="text-slate-500">So that</span>{" "}
                    <span className="font-medium">{selectedStory.so_that}</span>
                  </p>
                )}
              </div>

              {/* Description */}
              {selectedStory.description && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-2">Description</h4>
                  <p className="text-slate-400 text-sm">{selectedStory.description}</p>
                </div>
              )}

              {/* Acceptance Criteria */}
              {selectedStory.acceptance_criteria.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-2">
                    Acceptance Criteria ({selectedStory.acceptance_criteria.filter(c => c.completed).length}/{selectedStory.acceptance_criteria.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedStory.acceptance_criteria.map((criterion) => (
                      <div key={criterion.id} className="flex items-start gap-2 text-sm">
                        <span className={criterion.completed ? "text-green-400" : "text-slate-500"}>
                          {criterion.completed ? "✓" : "○"}
                        </span>
                        <span className={criterion.completed ? "text-slate-500 line-through" : "text-slate-300"}>
                          {criterion.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
                <div>
                  <span className="text-xs text-slate-500">Status</span>
                  <p className="text-sm text-white capitalize">{selectedStory.status.replace("_", " ")}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Priority</span>
                  <p className="text-sm text-white capitalize">{selectedStory.priority}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Story Points</span>
                  <p className="text-sm text-white">{selectedStory.story_points ?? "Not estimated"}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Created</span>
                  <p className="text-sm text-white">{new Date(selectedStory.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
