"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FolderKanban,
  Save,
  Trash2,
  RefreshCw,
  Shield,
  Users,
  Globe,
  Lock,
  Check,
  Layers,
  LayoutGrid,
  Bug,
  Target,
  Rocket,
  Map,
  BookOpen,
  ExternalLink,
  Calendar,
  Vote,
} from "lucide-react";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useProject } from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";
import { ProjectStatus, projectTabsApi } from "@/lib/api";

const STATUS_OPTIONS = [
  { value: "active", label: "Active", color: "bg-green-500" },
  { value: "on_hold", label: "On Hold", color: "bg-amber-500" },
  { value: "completed", label: "Completed", color: "bg-blue-500" },
  { value: "archived", label: "Archived", color: "bg-slate-500" },
];

const COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
];

const PUBLIC_TABS = [
  { id: "overview", label: "Overview", icon: FolderKanban, description: "Basic project information", alwaysEnabled: true },
  { id: "backlog", label: "Backlog", icon: Layers, description: "Tasks in the backlog" },
  { id: "board", label: "Board", icon: LayoutGrid, description: "Kanban board view" },
  { id: "stories", label: "Stories", icon: BookOpen, description: "User stories" },
  { id: "bugs", label: "Bugs", icon: Bug, description: "Bug tracker" },
  { id: "goals", label: "Goals", icon: Target, description: "OKRs and goals" },
  { id: "releases", label: "Releases", icon: Rocket, description: "Release schedule" },
  { id: "timeline", label: "Timeline", icon: Calendar, description: "Sprint timeline view" },
  { id: "roadmap", label: "Roadmap", icon: Vote, description: "Feature requests and voting" },
  { id: "sprints", label: "Sprints", icon: Map, description: "Sprint list and progress" },
];

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const { user } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();
  const { members: workspaceMembers } = useWorkspaceMembers(currentWorkspaceId);
  const { project, isLoading, updateProject, isUpdating, toggleVisibility, isTogglingVisibility } = useProject(
    currentWorkspaceId,
    projectId
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Public tabs state
  const [enabledTabs, setEnabledTabs] = useState<string[]>(["overview"]);
  const [isLoadingTabs, setIsLoadingTabs] = useState(false);
  const [isSavingTabs, setIsSavingTabs] = useState(false);
  const [tabsSuccess, setTabsSuccess] = useState(false);

  // Load public tabs config when project is public
  useEffect(() => {
    const loadPublicTabs = async () => {
      if (!currentWorkspaceId || !projectId || !project?.is_public) return;

      setIsLoadingTabs(true);
      try {
        const config = await projectTabsApi.getPublicTabs(currentWorkspaceId, projectId);
        setEnabledTabs(config.enabled_tabs);
      } catch (err) {
        console.error("Failed to load public tabs:", err);
      } finally {
        setIsLoadingTabs(false);
      }
    };

    loadPublicTabs();
  }, [currentWorkspaceId, projectId, project?.is_public]);

  const handleTabToggle = (tabId: string) => {
    if (tabId === "overview") return; // Overview is always enabled

    setEnabledTabs((prev) =>
      prev.includes(tabId)
        ? prev.filter((t) => t !== tabId)
        : [...prev, tabId]
    );
  };

  const handleSaveTabs = async () => {
    if (!currentWorkspaceId || !projectId) return;

    setIsSavingTabs(true);
    try {
      await projectTabsApi.updatePublicTabs(currentWorkspaceId, projectId, enabledTabs);
      setTabsSuccess(true);
      setTimeout(() => setTabsSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save public tabs:", err);
    } finally {
      setIsSavingTabs(false);
    }
  };

  // Initialize form when project loads or changes
  useEffect(() => {
    if (project && !hasChanges) {
      setName(project.name);
      setDescription(project.description || "");
      setColor(project.color);
      setStatus(project.status);
    }
  }, [project, hasChanges]);

  const currentMember = workspaceMembers.find((m) => m.developer_id === user?.id);
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";

  const handleChange = (field: string, value: string) => {
    setHasChanges(true);
    setSuccess(false);
    switch (field) {
      case "name":
        setName(value);
        break;
      case "description":
        setDescription(value);
        break;
      case "color":
        setColor(value);
        break;
      case "status":
        setStatus(value as ProjectStatus);
        break;
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }

    setError(null);
    try {
      await updateProject({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        status,
      });
      setHasChanges(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project");
    }
  };

  if (currentWorkspaceLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <FolderKanban className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-white mb-2">Project Not Found</h3>
          <p className="text-slate-400 mb-6">
            The project you're looking for doesn't exist.
          </p>
          <Link
            href="/settings/projects"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/settings/projects"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3 flex-1">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: project.color + "20" }}
              >
                <FolderKanban className="h-5 w-5" style={{ color: project.color }} />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">{project.name}</h1>
                <p className="text-slate-400 text-sm">Project Settings</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-8">
          <Link
            href={`/settings/projects/${projectId}`}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium"
          >
            General
          </Link>
          <Link
            href={`/settings/projects/${projectId}/permissions`}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <Shield className="h-4 w-4" />
            Permissions
          </Link>
        </div>

        {/* Settings Form */}
        <div className="bg-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-slate-400" />
              General Settings
            </h2>
            {isAdmin && (
              <button
                onClick={() => toggleVisibility()}
                disabled={isTogglingVisibility}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  project.is_public
                    ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {isTogglingVisibility ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : project.is_public ? (
                  <Globe className="h-4 w-4" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                {project.is_public ? "Public" : "Private"}
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Project Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleChange("name", e.target.value)}
                disabled={!isAdmin}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => handleChange("description", e.target.value)}
                disabled={!isAdmin}
                rows={3}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500 disabled:opacity-50"
                placeholder="What is this project about?"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => isAdmin && handleChange("color", c)}
                    disabled={!isAdmin}
                    className={`w-8 h-8 rounded-lg transition disabled:opacity-50 ${
                      color === c ? "ring-2 ring-white ring-offset-2 ring-offset-slate-800" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Status</label>
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => isAdmin && handleChange("status", opt.value)}
                    disabled={!isAdmin}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 disabled:opacity-50 ${
                      status === opt.value
                        ? "bg-slate-600 text-white ring-2 ring-primary-500"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {success && (
            <p className="text-green-400 text-sm">Project updated successfully!</p>
          )}

          {isAdmin && (
            <div className="flex justify-end pt-4 border-t border-slate-700">
              <button
                onClick={handleSave}
                disabled={!hasChanges || isUpdating}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50"
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Public Page Configuration - Only shown when project is public */}
        {project.is_public && isAdmin && (
          <div className="bg-slate-800 rounded-xl p-6 mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-medium text-white flex items-center gap-2">
                  <Globe className="h-5 w-5 text-green-400" />
                  Public Page Configuration
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  Choose which tabs to show on your public project page
                </p>
              </div>
              {project.public_slug && (
                <Link
                  href={`/p/${project.public_slug}`}
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Public Page
                </Link>
              )}
            </div>

            {isLoadingTabs ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PUBLIC_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isEnabled = enabledTabs.includes(tab.id);
                    const isDisabled = tab.alwaysEnabled;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => !isDisabled && handleTabToggle(tab.id)}
                        disabled={isDisabled}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-left transition ${
                          isEnabled
                            ? "bg-primary-600/10 border-primary-500/50"
                            : "bg-slate-700/50 border-slate-600 hover:border-slate-500"
                        } ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <div
                          className={`p-2 rounded-lg ${
                            isEnabled ? "bg-primary-600/20" : "bg-slate-600"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 ${
                              isEnabled ? "text-primary-400" : "text-slate-400"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-medium ${
                                isEnabled ? "text-white" : "text-slate-300"
                              }`}
                            >
                              {tab.label}
                            </span>
                            {isEnabled && (
                              <Check className="h-4 w-4 text-green-400" />
                            )}
                            {isDisabled && (
                              <span className="text-xs text-slate-500">(Required)</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {tab.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {tabsSuccess && (
                  <p className="text-green-400 text-sm mt-4">Public tabs updated successfully!</p>
                )}

                <div className="flex justify-end pt-4 mt-4 border-t border-slate-700">
                  <button
                    onClick={handleSaveTabs}
                    disabled={isSavingTabs}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50"
                  >
                    {isSavingTabs ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save Tab Settings
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Project Info */}
        <div className="bg-slate-800 rounded-xl p-6 mt-6">
          <h2 className="text-lg font-medium text-white mb-4">Project Info</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Project ID</dt>
              <dd className="text-white font-mono">{project.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Slug</dt>
              <dd className="text-white">{project.slug}</dd>
            </div>
            {project.public_slug && (
              <div className="flex justify-between">
                <dt className="text-slate-400">Public Slug</dt>
                <dd className="text-white font-mono">{project.public_slug}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-400">Visibility</dt>
              <dd className={`flex items-center gap-1.5 ${project.is_public ? "text-green-400" : "text-slate-300"}`}>
                {project.is_public ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {project.is_public ? "Public" : "Private"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Members</dt>
              <dd className="text-white">{project.member_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Teams</dt>
              <dd className="text-white">{project.team_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Created</dt>
              <dd className="text-white">
                {new Date(project.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  );
}
