"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Plus,
  Bot,
  Play,
  Pause,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Sparkles,
  Target,
  Mail,
  Database,
  Settings,
  Zap,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAgents } from "@/hooks/useAgents";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/layout/AppHeader";
import { CRMAgent } from "@/lib/api";

const agentTypeLabels: Record<string, { label: string; icon: typeof Bot; color: string }> = {
  sales_outreach: { label: "Sales Outreach", icon: Target, color: "text-green-400 bg-green-500/20" },
  lead_scoring: { label: "Lead Scoring", icon: Sparkles, color: "text-yellow-400 bg-yellow-500/20" },
  email_drafter: { label: "Email Drafter", icon: Mail, color: "text-blue-400 bg-blue-500/20" },
  data_enrichment: { label: "Data Enrichment", icon: Database, color: "text-purple-400 bg-purple-500/20" },
  custom: { label: "Custom Agent", icon: Settings, color: "text-slate-400 bg-slate-500/20" },
};

function AgentCard({
  agent,
  onToggle,
  onDelete,
  onExecute,
  onClick,
}: {
  agent: CRMAgent;
  onToggle: () => void;
  onDelete: () => void;
  onExecute: () => void;
  onClick: () => void;
}) {
  const typeInfo = agentTypeLabels[agent.agent_type] || agentTypeLabels.custom;
  const Icon = typeInfo.icon;
  const successRate = agent.total_executions > 0
    ? Math.round((agent.successful_executions / agent.total_executions) * 100)
    : 0;

  return (
    <div
      onClick={onClick}
      className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-blue-500/50 transition-colors cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${agent.is_active ? typeInfo.color : "bg-slate-700 text-slate-400"}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white font-medium group-hover:text-blue-400 transition-colors">
                {agent.name}
              </h3>
              {agent.is_system && (
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                  System
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">{typeInfo.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onExecute}
            className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-green-500/20 hover:text-green-400 transition-colors"
            title="Run agent"
          >
            <Zap className="h-4 w-4" />
          </button>
          <button
            onClick={onToggle}
            className={`p-2 rounded-lg transition-colors ${
              agent.is_active
                ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                : "bg-slate-700 text-slate-400 hover:bg-slate-600"
            }`}
            title={agent.is_active ? "Pause agent" : "Activate agent"}
          >
            {agent.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          {!agent.is_system && (
            <button
              onClick={onDelete}
              className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {agent.description && (
        <p className="text-sm text-slate-400 mb-3 line-clamp-2">{agent.description}</p>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {agent.tools.slice(0, 5).map((tool) => (
          <span key={tool} className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
            {tool.replace(/_/g, " ")}
          </span>
        ))}
        {agent.tools.length > 5 && (
          <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400">
            +{agent.tools.length - 5} more
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Play className="h-3 w-3" />
          {agent.total_executions} runs
        </span>
        <span className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-green-400" />
          {successRate}% success
        </span>
        {agent.avg_duration_ms > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {(agent.avg_duration_ms / 1000).toFixed(1)}s avg
          </span>
        )}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { user, logout } = useAuth();

  const {
    agents,
    isLoading,
    toggleAgent,
    deleteAgent,
    executeAgent,
  } = useAgents(workspaceId);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);

  const filteredAgents = agents.filter((a) => {
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !filterType || a.agent_type === filterType;
    return matchesSearch && matchesType;
  });

  const systemAgents = filteredAgents.filter((a) => a.is_system);
  const customAgents = filteredAgents.filter((a) => !a.is_system);

  const handleDeleteAgent = async (id: string) => {
    if (confirm("Delete this agent?")) {
      await deleteAgent(id);
    }
  };

  const handleExecuteAgent = async (id: string) => {
    try {
      await executeAgent({ agentId: id, data: {} });
      router.push(`/crm/agents/${id}`);
    } catch (error) {
      console.error("Failed to execute agent:", error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader user={user} logout={logout} />
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push("/crm")}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">AI Agents</h1>
            <p className="text-sm text-slate-400">Automate tasks with intelligent AI agents</p>
          </div>
          <button
            onClick={() => router.push("/crm/agents/new")}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            <Plus className="h-4 w-4" />
            Create Agent
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-800/50 border border-slate-700 rounded-xl mb-6 w-fit">
          <button
            onClick={() => setFilterType(null)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterType === null ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            All ({agents.length})
          </button>
          {Object.entries(agentTypeLabels).map(([type, info]) => {
            const count = agents.filter((a) => a.agent_type === type).length;
            if (count === 0) return null;
            const Icon = info.icon;
            return (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterType === type ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {info.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search agents..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-slate-800/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-16">
            <Bot className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No agents yet</h3>
            <p className="text-slate-400 mb-4">Create your first AI agent to automate CRM tasks</p>
            <button
              onClick={() => router.push("/crm/agents/new")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              <Plus className="h-4 w-4" />
              Create Agent
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* System Agents */}
            {systemAgents.length > 0 && (
              <div>
                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-400" />
                  Pre-built Agents
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {systemAgents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onToggle={() => toggleAgent(agent.id)}
                      onDelete={() => handleDeleteAgent(agent.id)}
                      onExecute={() => handleExecuteAgent(agent.id)}
                      onClick={() => router.push(`/crm/agents/${agent.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Custom Agents */}
            {customAgents.length > 0 && (
              <div>
                <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-slate-400" />
                  Custom Agents
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customAgents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onToggle={() => toggleAgent(agent.id)}
                      onDelete={() => handleDeleteAgent(agent.id)}
                      onExecute={() => handleExecuteAgent(agent.id)}
                      onClick={() => router.push(`/crm/agents/${agent.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
