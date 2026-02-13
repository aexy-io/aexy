"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Play,
  Pause,
  Trash2,
  Settings,
  Activity,
  Clock,
  TrendingUp,
  ChevronDown,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAgents } from "@/hooks/useAgents";
import { CRMAgent, AgentType, AGENT_TYPE_CONFIG, getAgentTypeConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AgentTypeBadge,
  AgentStatusBadge,
  ToolBadges,
} from "@/components/agents/shared";

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

interface AgentCardProps {
  agent: CRMAgent;
  workspaceId: string;
  onToggle: (agentId: string) => void;
  onDelete: (agentId: string) => void;
  isToggling: boolean;
}

function AgentCard({
  agent,
  workspaceId,
  onToggle,
  onDelete,
  isToggling,
}: AgentCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();

  const successRate =
    agent.total_executions > 0
      ? Math.round((agent.successful_executions / agent.total_executions) * 100)
      : 0;

  return (
    <div
      className={cn(
        "bg-slate-800 rounded-xl border transition-all cursor-pointer group",
        agent.is_active
          ? "border-slate-700 hover:border-slate-600"
          : "border-slate-700/50 opacity-75 hover:opacity-100"
      )}
      onClick={() => router.push(`/agents/${agent.id}`)}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: `${getAgentTypeConfig(agent.agent_type).color}20`,
              }}
            >
              <Bot
                className="h-5 w-5"
                style={{
                  color: getAgentTypeConfig(agent.agent_type).color,
                }}
              />
            </div>
            <div>
              <h3 className="text-white font-medium group-hover:text-purple-400 transition">
                {agent.name}
              </h3>
              {agent.mention_handle && (
                <span className="text-sm text-slate-400">@{agent.mention_handle}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AgentStatusBadge isActive={agent.is_active} size="sm" />
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                  />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-slate-700 rounded-lg shadow-xl z-20 py-1">
                    <Link
                      href={`/agents/${agent.id}/edit`}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-600 flex items-center gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      Edit Agent
                    </Link>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(agent.id);
                        setShowMenu(false);
                      }}
                      disabled={isToggling}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-600 flex items-center gap-2 disabled:opacity-50"
                    >
                      {agent.is_active ? (
                        <>
                          <Pause className="h-4 w-4" />
                          Pause Agent
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          Activate Agent
                        </>
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(agent.id);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-600 flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Agent
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Type & Description */}
        <div className="mb-4">
          <AgentTypeBadge type={agent.agent_type} size="sm" className="mb-2" />
          {agent.description && (
            <p className="text-sm text-slate-400 line-clamp-2">{agent.description}</p>
          )}
        </div>

        {/* Tools */}
        {agent.tools.length > 0 && (
          <div className="mb-4">
            <ToolBadges tools={agent.tools} max={4} />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-700">
          <div className="text-center">
            <div className="text-lg font-semibold text-white">
              {formatNumber(agent.total_executions)}
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
              <Activity className="h-3 w-3" />
              Total Runs
            </div>
          </div>
          <div className="text-center">
            <div
              className={cn(
                "text-lg font-semibold",
                successRate >= 90
                  ? "text-green-400"
                  : successRate >= 70
                  ? "text-amber-400"
                  : "text-red-400"
              )}
            >
              {successRate}%
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Success
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-white">
              {formatDuration(agent.avg_duration_ms || 0)}
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" />
              Avg Time
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentEmptyState() {
  return (
    <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700">
      <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
        <Bot className="h-8 w-8 text-purple-400" />
      </div>
      <h3 className="text-xl font-medium text-white mb-2">No Agents Yet</h3>
      <p className="text-slate-400 mb-6 max-w-md mx-auto">
        Create AI agents to automate email responses, schedule meetings, manage
        CRM data, and more.
      </p>
      <Link
        href="/agents/new"
        className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition font-medium"
      >
        <Plus className="h-4 w-4" />
        Create Your First Agent
      </Link>
    </div>
  );
}

export default function AgentsListPage() {
  const router = useRouter();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const {
    agents,
    isLoading,
    toggleAgent,
    deleteAgent,
    isDeleting,
  } = useAgents(currentWorkspaceId, {
    agentType: filterType !== "all" ? filterType : undefined,
    isActive: filterStatus === "active" ? true : filterStatus === "inactive" ? false : undefined,
  });

  const handleToggle = async (agentId: string) => {
    try {
      await toggleAgent(agentId);
    } catch (error) {
      console.error("Failed to toggle agent:", error);
    }
  };

  const handleDelete = async (agentId: string) => {
    if (!confirm("Are you sure you want to delete this agent? This action cannot be undone.")) {
      return;
    }
    try {
      await deleteAgent(agentId);
    } catch (error) {
      console.error("Failed to delete agent:", error);
    }
  };

  // Filter agents by search
  const filteredAgents = agents.filter((agent) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      agent.name.toLowerCase().includes(query) ||
      agent.description?.toLowerCase().includes(query) ||
      agent.mention_handle?.toLowerCase().includes(query)
    );
  });

  // Stats
  const activeCount = agents.filter((a) => a.is_active).length;
  const totalRuns = agents.reduce((sum, a) => sum + a.total_executions, 0);

  if (currentWorkspaceLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white">Loading agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3 flex-1">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Bot className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">AI Agents</h1>
                <p className="text-slate-400 text-sm">
                  Create and manage intelligent automation agents
                </p>
              </div>
            </div>
            <Link
              href="/agents/new"
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Create Agent
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-2xl font-bold text-white">{agents.length}</div>
            <div className="text-sm text-slate-400">Total Agents</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-2xl font-bold text-green-400">{activeCount}</div>
            <div className="text-sm text-slate-400">Active Agents</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-2xl font-bold text-white">{formatNumber(totalRuns)}</div>
            <div className="text-sm text-slate-400">Total Executions</div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search agents..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border rounded-lg transition",
              showFilters
                ? "bg-purple-500/20 border-purple-500 text-purple-400"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
            )}
          >
            <Filter className="h-4 w-4" />
            Filters
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", showFilters && "rotate-180")}
            />
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">All Types</option>
                  {Object.entries(AGENT_TYPE_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Agents Grid */}
        {agents.length === 0 ? (
          <AgentEmptyState />
        ) : filteredAgents.length === 0 ? (
          <div className="bg-slate-800 rounded-xl p-8 text-center border border-slate-700">
            <Search className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No agents found</h3>
            <p className="text-slate-400">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                workspaceId={currentWorkspaceId!}
                onToggle={handleToggle}
                onDelete={handleDelete}
                isToggling={false}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
