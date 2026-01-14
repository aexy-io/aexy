"use client";

import { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import {
  FileEdit,
  FilePlus,
  Trash2,
  Mail,
  MessageSquare,
  Phone,
  CheckSquare,
  ListPlus,
  ListMinus,
  GitBranch,
  Webhook,
  UserPlus,
  Zap,
  Bell,
  Link,
  Sparkles,
  Target,
  FileText,
} from "lucide-react";
import { useExecutionState, ExecutionStatus } from "./useExecutionState";

const actionIcons: Record<string, React.ElementType> = {
  update_record: FileEdit,
  create_record: FilePlus,
  delete_record: Trash2,
  send_email: Mail,
  send_slack: MessageSquare,
  send_sms: Phone,
  create_task: CheckSquare,
  add_to_list: ListPlus,
  remove_from_list: ListMinus,
  enroll_sequence: GitBranch,
  unenroll_sequence: GitBranch,
  enroll_in_sequence: GitBranch,
  remove_from_sequence: GitBranch,
  webhook_call: Webhook,
  api_request: Webhook,
  assign_owner: UserPlus,
  notify_user: Bell,
  notify_team: Bell,
  link_records: Link,
  enrich_record: Sparkles,
  classify_record: Target,
  generate_summary: FileText,
};

interface ActionNodeData extends Record<string, unknown> {
  label: string;
  action_type?: string;
  hasError?: boolean;
  errorMessage?: string;
  isHighlighted?: boolean;
  executionStatus?: ExecutionStatus;
  executionDurationMs?: number;
}

type ActionNodeType = Node<ActionNodeData>;

export const ActionNode = memo(({ data, selected }: NodeProps<ActionNodeType>) => {
  const Icon = actionIcons[data.action_type as string] || Zap;
  const isHighlighted = data.isHighlighted;
  const { isRunning, isSuccess, isFailed, isSkipped, StatusIndicator, DurationBadge } = useExecutionState(data);

  const getStyles = () => {
    if (isRunning) return "border-blue-400 shadow-blue-500/30 animate-pulse";
    if (isSuccess) return "border-blue-400 shadow-blue-500/30";
    if (isFailed) return "border-red-500 shadow-red-500/30";
    if (isSkipped) return "border-slate-500 shadow-slate-500/20 opacity-60";
    if (data.hasError) return "border-red-500 shadow-red-500/20";
    if (selected) return "border-blue-400 shadow-blue-500/20";
    return "border-blue-500/50";
  };

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[180px] relative
        bg-gradient-to-br from-blue-500/20 to-blue-600/10
        border-2 transition-all
        ${getStyles()}
        ${isHighlighted ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900" : ""}
      `}
    >
      {StatusIndicator}
      {DurationBadge}

      <Handle
        type="target"
        position={Position.Top}
        className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-blue-400 !border-blue-600"}`}
      />

      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${data.hasError ? "bg-red-500/30" : "bg-blue-500/30"}`}>
          <Icon className={`h-5 w-5 ${data.hasError ? "text-red-400" : "text-blue-400"}`} />
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-wider font-medium ${data.hasError ? "text-red-400/70" : "text-blue-400/70"}`}>
            Action
          </div>
          <div className="text-white font-medium text-sm">
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
        className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-blue-400 !border-blue-600"}`}
      />
    </div>
  );
});

ActionNode.displayName = "ActionNode";
