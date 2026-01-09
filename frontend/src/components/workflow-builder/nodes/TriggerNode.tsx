"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Zap, Clock, Webhook, Mail, FileText, MousePointer } from "lucide-react";

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

export const TriggerNode = memo(({ data, selected }: NodeProps) => {
  const Icon = triggerIcons[data.trigger_type as string] || Zap;

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[180px]
        bg-gradient-to-br from-emerald-500/20 to-emerald-600/10
        border-2 transition-all
        ${selected ? "border-emerald-400 shadow-emerald-500/20" : "border-emerald-500/50"}
      `}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/30">
          <Icon className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-emerald-400/70 font-medium">
            Trigger
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
        className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-emerald-600"
      />
    </div>
  );
});

TriggerNode.displayName = "TriggerNode";
