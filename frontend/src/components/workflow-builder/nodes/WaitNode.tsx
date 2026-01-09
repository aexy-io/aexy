"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Clock, Calendar, Bell } from "lucide-react";

const waitIcons: Record<string, React.ElementType> = {
  duration: Clock,
  datetime: Calendar,
  event: Bell,
};

export const WaitNode = memo(({ data, selected }: NodeProps) => {
  const Icon = waitIcons[data.wait_type as string] || Clock;
  const waitType = data.wait_type as string || "duration";

  const getWaitDescription = () => {
    if (waitType === "duration") {
      const value = data.duration_value as number || 1;
      const unit = data.duration_unit as string || "days";
      return `${value} ${unit}`;
    } else if (waitType === "datetime") {
      return data.wait_until ? new Date(data.wait_until as string).toLocaleDateString() : "Set date";
    } else if (waitType === "event") {
      return data.wait_for_event as string || "Set event";
    }
    return "";
  };

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[180px]
        bg-gradient-to-br from-violet-500/20 to-violet-600/10
        border-2 transition-all
        ${selected ? "border-violet-400 shadow-violet-500/20" : "border-violet-500/50"}
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-violet-400 !border-2 !border-violet-600"
      />

      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-violet-500/30">
          <Icon className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-violet-400/70 font-medium">
            Wait
          </div>
          <div className="text-white font-medium text-sm">
            {data.label as string}
          </div>
          <div className="text-xs text-violet-300/70">
            {getWaitDescription()}
          </div>
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-violet-400 !border-2 !border-violet-600"
      />
    </div>
  );
});

WaitNode.displayName = "WaitNode";
