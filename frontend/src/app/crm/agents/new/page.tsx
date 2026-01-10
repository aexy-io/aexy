"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Bot,
  Save,
  Plus,
  X,
  Target,
  Mail,
  Database,
  Sparkles,
  Settings,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAgents, useAgentTools } from "@/hooks/useAgents";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/layout/AppHeader";

const agentTypes = [
  { value: "custom", label: "Custom Agent", icon: Settings, description: "Build your own agent with custom goal and tools" },
  { value: "sales_outreach", label: "Sales Outreach", icon: Target, description: "Research prospects and craft personalized outreach" },
  { value: "lead_scoring", label: "Lead Scoring", icon: Sparkles, description: "Score leads based on fit and engagement" },
  { value: "email_drafter", label: "Email Drafter", icon: Mail, description: "Generate emails matching your writing style" },
  { value: "data_enrichment", label: "Data Enrichment", icon: Database, description: "Fill missing CRM fields from external sources" },
];

const models = [
  { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet (Recommended)" },
  { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (Fast)" },
  { value: "claude-3-opus-20240229", label: "Claude 3 Opus (Advanced)" },
];

export default function NewAgentPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { user, logout } = useAuth();

  const { createAgent, isCreating } = useAgents(workspaceId);
  const { tools: availableTools, isLoading: isLoadingTools } = useAgentTools(workspaceId);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    agent_type: "custom",
    goal: "",
    system_prompt: "",
    tools: [] as string[],
    max_iterations: 10,
    timeout_seconds: 300,
    model: "claude-3-sonnet-20240229",
  });

  const toolsByCategory = availableTools.reduce((acc, tool) => {
    if (!acc[tool.category]) {
      acc[tool.category] = [];
    }
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, typeof availableTools>);

  const toggleTool = (toolName: string) => {
    setFormData((prev) => ({
      ...prev,
      tools: prev.tools.includes(toolName)
        ? prev.tools.filter((t) => t !== toolName)
        : [...prev.tools, toolName],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const agent = await createAgent(formData);
      router.push(`/crm/agents/${agent.id}`);
    } catch (error) {
      console.error("Failed to create agent:", error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader user={user} logout={logout} />
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push("/crm/agents")}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Create AI Agent</h1>
            <p className="text-sm text-slate-400">Configure a new AI agent to automate tasks</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Agent Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Agent Type
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {agentTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, agent_type: type.value }))}
                    className={`flex flex-col items-start p-4 rounded-xl border transition-colors text-left ${
                      formData.agent_type === type.value
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                    }`}
                  >
                    <Icon className={`h-6 w-6 mb-2 ${
                      formData.agent_type === type.value ? "text-blue-400" : "text-slate-400"
                    }`} />
                    <div className="font-medium text-white">{type.label}</div>
                    <div className="text-xs text-slate-400 mt-1">{type.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Agent Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="My Custom Agent"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Model
              </label>
              <select
                value={formData.model}
                onChange={(e) => setFormData((prev) => ({ ...prev, model: e.target.value }))}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {models.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="What does this agent do?"
              rows={2}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Goal */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Goal
            </label>
            <textarea
              value={formData.goal}
              onChange={(e) => setFormData((prev) => ({ ...prev, goal: e.target.value }))}
              placeholder="What should the agent accomplish? e.g., Research the prospect and draft a personalized outreach email"
              rows={3}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              System Prompt (Advanced)
            </label>
            <textarea
              value={formData.system_prompt}
              onChange={(e) => setFormData((prev) => ({ ...prev, system_prompt: e.target.value }))}
              placeholder="Custom instructions for the agent. Leave blank to use defaults."
              rows={4}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
          </div>

          {/* Tools */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Available Tools ({formData.tools.length} selected)
            </label>
            {isLoadingTools ? (
              <div className="text-slate-400">Loading tools...</div>
            ) : (
              <div className="space-y-4">
                {Object.entries(toolsByCategory).map(([category, tools]) => (
                  <div key={category}>
                    <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                      {category}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {tools.map((tool) => (
                        <button
                          key={tool.name}
                          type="button"
                          onClick={() => toggleTool(tool.name)}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                            formData.tools.includes(tool.name)
                              ? "bg-blue-500 text-white"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          }`}
                          title={tool.description}
                        >
                          {tool.name.replace(/_/g, " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Max Iterations
              </label>
              <input
                type="number"
                value={formData.max_iterations}
                onChange={(e) => setFormData((prev) => ({ ...prev, max_iterations: parseInt(e.target.value) }))}
                min={1}
                max={50}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Maximum number of tool calls before stopping</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Timeout (seconds)
              </label>
              <input
                type="number"
                value={formData.timeout_seconds}
                onChange={(e) => setFormData((prev) => ({ ...prev, timeout_seconds: parseInt(e.target.value) }))}
                min={30}
                max={1800}
                step={30}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Maximum execution time</p>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => router.push("/crm/agents")}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !formData.name}
              className="flex items-center gap-2 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              {isCreating ? "Creating..." : "Create Agent"}
            </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
