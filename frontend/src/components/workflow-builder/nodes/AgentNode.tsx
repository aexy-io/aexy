"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Bot, Target, Mail, Database, Sparkles } from "lucide-react";

const agentIcons: Record<string, React.ElementType> = {
  sales_outreach: Target,
  lead_scoring: Sparkles,
  email_drafter: Mail,
  data_enrichment: Database,
  custom: Bot,
};

export const AgentNode = memo(({ data, selected }: NodeProps) => {
  const Icon = agentIcons[data.agent_type as string] || Bot;

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[180px]
        bg-gradient-to-br from-pink-500/20 to-pink-600/10
        border-2 transition-all
        ${selected ? "border-pink-400 shadow-pink-500/20" : "border-pink-500/50"}
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-pink-400 !border-2 !border-pink-600"
      />

      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-pink-500/30 relative">
          <Icon className="h-5 w-5 text-pink-400" />
          <Sparkles className="h-3 w-3 text-pink-300 absolute -top-1 -right-1" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-pink-400/70 font-medium">
            AI Agent
          </div>
          <div className="text-white font-medium text-sm">
            {data.label as string}
          </div>
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-pink-400 !border-2 !border-pink-600"
      />
    </div>
  );
});

AgentNode.displayName = "AgentNode";
