"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
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
} from "lucide-react";

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
  webhook_call: Webhook,
  assign_owner: UserPlus,
};

export const ActionNode = memo(({ data, selected }: NodeProps) => {
  const Icon = actionIcons[data.action_type as string] || Zap;

  return (
    <div
      className={`
        px-4 py-3 rounded-xl shadow-lg min-w-[180px]
        bg-gradient-to-br from-blue-500/20 to-blue-600/10
        border-2 transition-all
        ${selected ? "border-blue-400 shadow-blue-500/20" : "border-blue-500/50"}
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-600"
      />

      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/30">
          <Icon className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-blue-400/70 font-medium">
            Action
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
        className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-600"
      />
    </div>
  );
});

ActionNode.displayName = "ActionNode";
