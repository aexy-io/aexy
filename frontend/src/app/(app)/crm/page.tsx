"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  DollarSign,
  Plus,
  Settings,
  Zap,
  ChevronRight,
  Search,
  LayoutGrid,
  List,
  Sparkles,
  Mail,
  Calendar,
  Inbox,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useCRMObjects } from "@/hooks/useCRM";
import { CRMObject, CRMObjectType, googleIntegrationApi, developerApi, GoogleIntegrationStatus } from "@/lib/api";
import { GettingStartedChecklist } from "@/components/crm/GettingStartedChecklist";

const objectTypeIcons: Record<CRMObjectType, React.ReactNode> = {
  company: <Building2 className="h-5 w-5" />,
  person: <Users className="h-5 w-5" />,
  deal: <DollarSign className="h-5 w-5" />,
  custom: <LayoutGrid className="h-5 w-5" />,
};

const objectTypeColors: Record<CRMObjectType, string> = {
  company: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  person: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  deal: "bg-green-500/20 text-green-400 border-green-500/30",
  custom: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function QuickAccessCard({
  title,
  description,
  icon,
  href,
  stats,
  color,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  stats?: { label: string; value: string | number }[];
  color: string;
  onClick?: () => void;
}) {
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (href) {
      router.push(href);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="group bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl p-5 text-left transition-all duration-200 w-full"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
        <ArrowUpRight className="h-4 w-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
      </div>
      <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-400 mb-3">{description}</p>
      {stats && stats.length > 0 && (
        <div className="flex items-center gap-4 text-xs">
          {stats.map((stat, i) => (
            <span key={i} className="text-slate-400">
              <span className="font-medium text-slate-300">{stat.value}</span> {stat.label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function GoogleIntegrationBanner({
  workspaceId,
  onConnect,
}: {
  workspaceId: string;
  onConnect: () => void;
}) {
  const [status, setStatus] = useState<Partial<GoogleIntegrationStatus> & { is_connected: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      // First check workspace-level Google integration
      try {
        const workspaceStatus = await googleIntegrationApi.getStatus(workspaceId);
        if (workspaceStatus.is_connected) {
          setStatus(workspaceStatus);
          setIsLoading(false);
          return;
        }
      } catch {
        // Continue to check developer level
      }

      // Check developer-level Google connection (from main onboarding)
      try {
        const developerStatus = await developerApi.getGoogleStatus();
        if (developerStatus.is_connected) {
          // Developer has Google connected, auto-link to workspace
          try {
            await googleIntegrationApi.connectFromDeveloper(workspaceId);
            // Fetch the newly created workspace status
            const workspaceStatus = await googleIntegrationApi.getStatus(workspaceId);
            setStatus(workspaceStatus);
          } catch {
            // Failed to link, show as connected but may have limited functionality
            setStatus({
              is_connected: true,
              google_email: developerStatus.google_email || undefined,
            });
          }
          setIsLoading(false);
          return;
        }
      } catch {
        // No developer connection
      }

      // Not connected at either level
      setStatus({ is_connected: false });
      setIsLoading(false);
    };
    loadStatus();
  }, [workspaceId]);

  if (isLoading) return null;

  if (!status?.is_connected) {
    return (
      <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <GoogleIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Connect Google</h3>
              <p className="text-xs text-slate-400">
                Sync emails and calendar events to enrich your CRM
              </p>
            </div>
          </div>
          <button
            onClick={onConnect}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Connect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/20 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              Google Connected
              <span className="text-xs text-slate-500">{status.google_email}</span>
            </h3>
            <div className="flex items-center gap-4 text-xs text-slate-400 mt-0.5">
              {status.gmail_sync_enabled && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  Gmail synced
                </span>
              )}
              {status.calendar_sync_enabled && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Calendar synced
                </span>
              )}
            </div>
          </div>
        </div>
        <a
          href="/crm/settings/integrations"
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          Manage
        </a>
      </div>
    </div>
  );
}

function ObjectCard({ object, onClick }: { object: CRMObject; onClick: () => void }) {
  const colorClass = objectTypeColors[object.object_type as CRMObjectType] || objectTypeColors.custom;
  const icon = objectTypeIcons[object.object_type as CRMObjectType] || objectTypeIcons.custom;

  return (
    <button
      onClick={onClick}
      className="group bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl p-6 text-left transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-lg border ${colorClass}`}>{icon}</div>
        <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-slate-300 transition-colors" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-1">{object.plural_name}</h3>
      <p className="text-sm text-slate-400 mb-3">{object.description || `Manage your ${object.plural_name.toLowerCase()}`}</p>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-slate-300">
          <span className="font-medium">{object.record_count}</span> records
        </span>
        <span className="text-slate-500">
          {object.attributes?.length || 0} attributes
        </span>
      </div>
    </button>
  );
}

function EmptyState({ onStartOnboarding }: { onStartOnboarding: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="bg-slate-800/50 rounded-full p-6 mb-6">
        <Sparkles className="h-12 w-12 text-purple-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Welcome to CRM</h2>
      <p className="text-slate-400 text-center max-w-md mb-8">
        Get started by setting up your CRM. Choose a template and configure your workspace.
      </p>
      <button
        onClick={onStartOnboarding}
        className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
      >
        <Sparkles className="h-4 w-4" />
        Start Setup
      </button>
    </div>
  );
}

function CreateObjectModal({
  isOpen,
  onClose,
  onCreate,
  isCreating,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; plural_name: string; description?: string }) => Promise<void>;
  isCreating: boolean;
}) {
  const [name, setName] = useState("");
  const [pluralName, setPluralName] = useState("");
  const [description, setDescription] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate({ name, plural_name: pluralName, description: description || undefined });
    setName("");
    setPluralName("");
    setDescription("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700">
        <h3 className="text-xl font-semibold text-white mb-4">Create Custom Object</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Name (singular)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!pluralName) setPluralName(e.target.value + "s");
              }}
              placeholder="e.g., Project"
              required
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Name (plural)</label>
            <input
              type="text"
              value={pluralName}
              onChange={(e) => setPluralName(e.target.value)}
              placeholder="e.g., Projects"
              required
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this object used for?"
              rows={2}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !name || !pluralName}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors"
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CRMPage() {
  const router = useRouter();
  const { user, logout, isLoading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const [showChecklist, setShowChecklist] = useState(false);
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false);

  const {
    objects,
    isLoading,
    createObject,
    isCreating,
    recalculateCounts,
    isRecalculating,
  } = useCRMObjects(workspaceId);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Check onboarding status on mount
  useEffect(() => {
    const onboardingComplete = localStorage.getItem("crm_onboarding_complete");
    const checklistDismissed = localStorage.getItem("crm_checklist_dismissed");

    if (onboardingComplete === "true" && checklistDismissed !== "true") {
      setShowChecklist(true);
    }

    setHasCheckedOnboarding(true);
  }, []);

  // Recalculate record counts if they seem stale (all zeros when objects exist)
  useEffect(() => {
    if (objects.length > 0 && !isLoading && !isRecalculating) {
      const allCountsZero = objects.every((obj) => obj.record_count === 0);
      const hasRecalculated = sessionStorage.getItem("crm_counts_recalculated");

      if (allCountsZero && !hasRecalculated) {
        sessionStorage.setItem("crm_counts_recalculated", "true");
        recalculateCounts().catch(console.error);
      }
    }
  }, [objects, isLoading, isRecalculating, recalculateCounts]);

  const filteredObjects = objects.filter(
    (obj) =>
      obj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      obj.plural_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const systemObjects = filteredObjects.filter((obj) => obj.is_system);
  const customObjects = filteredObjects.filter((obj) => !obj.is_system);

  const handleObjectClick = (object: CRMObject) => {
    router.push(`/crm/${object.slug}`);
  };

  const handleStartOnboarding = () => {
    router.push("/crm/onboarding");
  };

  const handleCreate = async (data: { name: string; plural_name: string; description?: string }) => {
    await createObject(data);
  };

  const handleConnectGoogle = async () => {
    if (!workspaceId) return;
    try {
      const { auth_url } = await googleIntegrationApi.getConnectUrl(workspaceId, window.location.href);
      window.location.href = auth_url;
    } catch (err) {
      console.error("Failed to get connect URL:", err);
    }
  };

  if (isLoading || authLoading || !hasCheckedOnboarding) {
    return (
      <div className="min-h-screen bg-slate-950">
<div className="p-8">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-8">
              <div className="h-8 w-48 bg-slate-800 rounded" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-48 bg-slate-800 rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show empty state if no objects and no onboarding completed
  const onboardingComplete = localStorage.getItem("crm_onboarding_complete") === "true";
  if (objects.length === 0 && !onboardingComplete) {
    return (
      <div className="min-h-screen bg-slate-950">
<div className="p-8">
          <div className="max-w-7xl mx-auto">
            <EmptyState onStartOnboarding={handleStartOnboarding} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
<div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex gap-8 md:flex-row flex-col-reverse">
            {/* Main content */}
            <div className="flex-1">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">CRM</h1>
                <p className="text-slate-400">Manage your contacts, companies, and deals</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    sessionStorage.removeItem("crm_counts_recalculated");
                    recalculateCounts().catch(console.error);
                  }}
                  disabled={isRecalculating}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors text-sm disabled:opacity-50"
                  title="Refresh record counts"
                >
                  <RefreshCw className={`h-4 w-4 ${isRecalculating ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => router.push("/crm/automations")}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors text-sm"
                >
                  <Zap className="h-4 w-4" />
                  Automations
                </button>
                <button
                  onClick={() => router.push("/crm/settings")}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors text-sm"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
                >
                  <Plus className="h-4 w-4" />
                  New Object
                </button>
              </div>
            </div>

            {/* Google Integration Banner */}
            {workspaceId && (
              <GoogleIntegrationBanner
                workspaceId={workspaceId}
                onConnect={handleConnectGoogle}
              />
            )}

            {/* Quick Access Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <QuickAccessCard
                title="Inbox"
                description="View synced emails and link to records"
                icon={<Mail className="h-5 w-5 text-blue-400" />}
                href="/crm/inbox"
                color="bg-blue-500/20"
              />
              <QuickAccessCard
                title="Calendar"
                description="View meetings and schedule events"
                icon={<Calendar className="h-5 w-5 text-green-400" />}
                href="/crm/calendar"
                color="bg-green-500/20"
              />
              <QuickAccessCard
                title="Activities"
                description="Track all interactions and tasks"
                icon={<Clock className="h-5 w-5 text-amber-400" />}
                href="/crm/activities"
                color="bg-amber-500/20"
              />
              <QuickAccessCard
                title="Integrations"
                description="Connect Google, Slack, and more"
                icon={<RefreshCw className="h-5 w-5 text-purple-400" />}
                href="/crm/settings/integrations"
                color="bg-purple-500/20"
              />
            </div>

            {objects.length === 0 ? (
              <EmptyState onStartOnboarding={handleStartOnboarding} />
            ) : (
              <>
                {/* Search and View Toggle */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search objects..."
                      className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-2 rounded ${viewMode === "grid" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-2 rounded ${viewMode === "list" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* System Objects */}
                {systemObjects.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Standard Objects</h2>
                    <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
                      {systemObjects.map((object) => (
                        <ObjectCard key={object.id} object={object} onClick={() => handleObjectClick(object)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Objects */}
                {customObjects.length > 0 && (
                  <div>
                    <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Custom Objects</h2>
                    <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
                      {customObjects.map((object) => (
                        <ObjectCard key={object.id} object={object} onClick={() => handleObjectClick(object)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sidebar with Getting Started Checklist */}
          {showChecklist && (
            <div className="w-full md:w-80 flex-shrink-0">
              <GettingStartedChecklist
                onDismiss={() => setShowChecklist(false)}
              />
            </div>
          )}
        </div>

          <CreateObjectModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreate}
            isCreating={isCreating}
          />
        </div>
      </div>
    </div>
  );
}
