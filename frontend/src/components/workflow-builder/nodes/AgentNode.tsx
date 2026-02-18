"use client";

import { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { Bot, Target, Mail, Database, Sparkles } from "lucide-react";
import { useExecutionState, ExecutionStatus } from "./useExecutionState";

const agentIcons: Record<string, React.ElementType> = {
  sales_outreach: Target,
  lead_scoring: Sparkles,
  email_drafter: Mail,
  data_enrichment: Database,
  custom: Bot,
};

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  agent_type?: string;
  agent_id?: string;
  hasError?: boolean;
  errorMessage?: string;
  isHighlighted?: boolean;
  executionStatus?: ExecutionStatus;
  executionDurationMs?: number;
}

type AgentNodeType = Node<AgentNodeData>;

export const AgentNode = memo(({ data, selected }: NodeProps<AgentNodeType>) => {
  const Icon = agentIcons[data.agent_type as string] || Bot;
  const isHighlighted = data.isHighlighted;
  const { isRunning, isSuccess, isFailed, isSkipped, StatusIndicator, DurationBadge } = useExecutionState(data);

  const getStyles = () => {
    if (isRunning) return "border-blue-400 shadow-blue-500/30 animate-pulse";
    if (isSuccess) return "border-pink-400 shadow-pink-500/30";
    if (isFailed) return "border-red-500 shadow-red-500/30";
    if (isSkipped) return "border-muted-foreground shadow-muted-foreground/20 opacity-60";
    if (data.hasError) return "border-red-500 shadow-red-500/20";
    if (selected) return "border-pink-400 shadow-pink-500/20";
    return "border-pink-500/50";
  };

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[180px] relative
        bg-gradient-to-br from-pink-500/20 to-pink-600/10
        border-2 transition-all
        ${getStyles()}
        ${isHighlighted ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background" : ""}
      `}
    >
      {StatusIndicator}
      {DurationBadge}

      <Handle
        type="target"
        position={Position.Top}
        className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-pink-400 !border-pink-600"}`}
      />

      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg relative ${data.hasError ? "bg-red-500/30" : "bg-pink-500/30"}`}>
          <Icon className={`h-5 w-5 ${data.hasError ? "text-red-400" : "text-pink-400"}`} />
          {!data.hasError && <Sparkles className="h-3 w-3 text-pink-300 absolute -top-1 -right-1" />}
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-wider font-medium ${data.hasError ? "text-red-400/70" : "text-pink-400/70"}`}>
            AI Agent
          </div>
          <div className="text-foreground font-medium text-sm">
            {data.label as string}
          </div>
        </div>
      </div>

      {data.hasError && data.errorMessage && !isRunning && !isSuccess && !isFailed && (
        <div className="mt-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
          {data.errorMessage}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-pink-400 !border-pink-600"}`}
      />
    </div>
  );
});

AgentNode.displayName = "AgentNode";
