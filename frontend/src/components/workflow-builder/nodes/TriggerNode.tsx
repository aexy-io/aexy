"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Zap, Clock, Webhook, Mail, FileText, MousePointer } from "lucide-react";
import { useExecutionState, ExecutionStatus } from "./useExecutionState";

const triggerIcons: Record<string, React.ElementType> = {
  record_created: FileText,
  record_updated: FileText,
  record_deleted: FileText,
  field_changed: FileText,
  stage_changed: FileText,
  scheduled: Clock,
  webhook_received: Webhook,
  form_submitted: FileText,
  email_received: Mail,
  manual: MousePointer,
};

interface TriggerNodeData {
  label: string;
  trigger_type?: string;
  hasError?: boolean;
  errorMessage?: string;
  isHighlighted?: boolean;
  executionStatus?: ExecutionStatus;
  executionDurationMs?: number;
}

export const TriggerNode = memo(({ data, selected }: NodeProps<TriggerNodeData>) => {
  const Icon = triggerIcons[data.trigger_type as string] || Zap;
  const isHighlighted = data.isHighlighted;
  const { isRunning, isSuccess, isFailed, isSkipped, StatusIndicator, DurationBadge } = useExecutionState(data);

  const getStyles = () => {
    if (isRunning) return "border-blue-400 shadow-blue-500/30 animate-pulse";
    if (isSuccess) return "border-emerald-400 shadow-emerald-500/30";
    if (isFailed) return "border-red-500 shadow-red-500/30";
    if (isSkipped) return "border-slate-500 shadow-slate-500/20 opacity-60";
    if (data.hasError) return "border-red-500 shadow-red-500/20";
    if (selected) return "border-emerald-400 shadow-emerald-500/20";
    return "border-emerald-500/50";
  };

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[180px] relative
        bg-gradient-to-br from-emerald-500/20 to-emerald-600/10
        border-2 transition-all
        ${getStyles()}
        ${isHighlighted ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900" : ""}
      `}
    >
      {StatusIndicator}
      {DurationBadge}

      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${data.hasError ? "bg-red-500/30" : "bg-emerald-500/30"}`}>
          <Icon className={`h-5 w-5 ${data.hasError ? "text-red-400" : "text-emerald-400"}`} />
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-wider font-medium ${data.hasError ? "text-red-400/70" : "text-emerald-400/70"}`}>
            Trigger
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
        className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-emerald-400 !border-emerald-600"}`}
      />
    </div>
  );
});

TriggerNode.displayName = "TriggerNode";
