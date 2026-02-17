"use client";

import { Loader2 } from "lucide-react";
import { ToolSelector } from "@/components/agents/shared";
import { useAgentTools } from "@/hooks/useAgents";
import { getAgentTypeConfig, AgentType } from "@/lib/api";

interface ToolSelectionStepProps {
  workspaceId: string;
  agentType: AgentType;
  selectedTools: string[];
  onToolsChange: (tools: string[]) => void;
}

export function ToolSelectionStep({
  workspaceId,
  agentType,
  selectedTools,
  onToolsChange,
}: ToolSelectionStepProps) {
  const { tools, isLoading, error } = useAgentTools(workspaceId);

  const defaultTools = getAgentTypeConfig(agentType).defaultTools;

  // Initialize with defaults if empty
  const handleApplyDefaults = () => {
    onToolsChange(defaultTools);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading available tools...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
        <p className="text-red-400">Failed to load tools. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Select Tools
        </h2>
        <p className="text-muted-foreground">
          Choose which capabilities your agent should have. Tools determine what
          actions the agent can take.
        </p>
      </div>

      {/* Apply defaults button */}
      {defaultTools.length > 0 && selectedTools.length === 0 && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-purple-400 font-medium">
              Start with recommended tools?
            </p>
            <p className="text-sm text-muted-foreground">
              {defaultTools.length} tools pre-selected for{" "}
              {getAgentTypeConfig(agentType).label}
            </p>
          </div>
          <button
            onClick={handleApplyDefaults}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition text-sm font-medium"
          >
            Apply Defaults
          </button>
        </div>
      )}

      {/* Tool selector */}
      <ToolSelector
        tools={tools}
        selectedTools={selectedTools}
        onChange={onToolsChange}
      />
    </div>
  );
}
