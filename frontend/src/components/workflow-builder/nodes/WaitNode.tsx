"use client";

import { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { Clock, Calendar, Bell } from "lucide-react";
import { useExecutionState, ExecutionStatus } from "./useExecutionState";

const waitIcons: Record<string, React.ElementType> = {
  duration: Clock,
  datetime: Calendar,
  event: Bell,
};

interface WaitNodeData extends Record<string, unknown> {
  label: string;
  wait_type?: string;
  duration_value?: number;
  duration_unit?: string;
  wait_until?: string;
  wait_for_event?: string;
  hasError?: boolean;
  errorMessage?: string;
  isHighlighted?: boolean;
  executionStatus?: ExecutionStatus;
  executionDurationMs?: number;
}

type WaitNodeType = Node<WaitNodeData>;

export const WaitNode = memo(({ data, selected }: NodeProps<WaitNodeType>) => {
  const Icon = waitIcons[data.wait_type as string] || Clock;
  const waitType = data.wait_type as string || "duration";
  const isHighlighted = data.isHighlighted;
  const { isRunning, isSuccess, isFailed, isSkipped, StatusIndicator, DurationBadge } = useExecutionState(data);

  const eventTypeLabels: Record<string, string> = {
    "email.opened": "Email Opened",
    "email.clicked": "Link Clicked",
    "email.replied": "Email Reply",
    "email.bounced": "Email Bounce",
    "form.submitted": "Form Submit",
    "meeting.scheduled": "Meeting Booked",
    "meeting.completed": "Meeting Done",
    "meeting.cancelled": "Meeting Cancelled",
    "webhook.received": "Webhook",
    "record.updated": "Record Update",
  };

  const getWaitDescription = () => {
    if (waitType === "duration") {
      const value = data.duration_value as number || 1;
      const unit = data.duration_unit as string || "days";
      return `${value} ${unit}`;
    } else if (waitType === "datetime") {
      return data.wait_until ? new Date(data.wait_until as string).toLocaleDateString() : "Set date";
    } else if (waitType === "event") {
      const eventType = data.wait_for_event as string;
      return eventTypeLabels[eventType] || eventType || "Set event";
    }
    return "";
  };

  const getStyles = () => {
    if (isRunning) return "border-blue-400 shadow-blue-500/30 animate-pulse";
    if (isSuccess) return "border-violet-400 shadow-violet-500/30";
    if (isFailed) return "border-red-500 shadow-red-500/30";
    if (isSkipped) return "border-muted-foreground shadow-muted-foreground/20 opacity-60";
    if (data.hasError) return "border-red-500 shadow-red-500/20";
    if (selected) return "border-violet-400 shadow-violet-500/20";
    return "border-violet-500/50";
  };

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[180px] relative
        bg-gradient-to-br from-violet-500/20 to-violet-600/10
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
        className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-violet-400 !border-violet-600"}`}
      />

      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${data.hasError ? "bg-red-500/30" : "bg-violet-500/30"}`}>
          <Icon className={`h-5 w-5 ${data.hasError ? "text-red-400" : "text-violet-400"}`} />
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-wider font-medium ${data.hasError ? "text-red-400/70" : "text-violet-400/70"}`}>
            Wait
          </div>
          <div className="text-foreground font-medium text-sm">
            {data.label as string}
          </div>
          {!data.hasError && (
            <div className="text-xs text-violet-300/70">
              {getWaitDescription()}
            </div>
          )}
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
        className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-violet-400 !border-violet-600"}`}
      />
    </div>
  );
});

WaitNode.displayName = "WaitNode";
