"use client";

import { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import {
  Zap,
  Clock,
  Webhook,
  Mail,
  FileText,
  MousePointer,
  FilePlus,
  FileEdit,
  Trash2,
  GitBranch,
  ListPlus,
  ListMinus,
  RefreshCw,
  Calendar,
  AlertTriangle,
  Ticket,
  UserCheck,
  UserPlus,
  UserX,
  CheckSquare,
  Send,
  MousePointerClick,
  Bell,
  Play,
  ClipboardCheck,
  Timer,
  TrendingDown,
  ShieldAlert,
  Users,
  BarChart3,
  GraduationCap,
  BookOpen,
  Award,
  ScrollText,
  ShieldCheck,
  Heart,
  FileInput,
  Activity,
  MessageSquare,
} from "lucide-react";
import { useExecutionState, ExecutionStatus } from "./useExecutionState";

const triggerIcons: Record<string, React.ElementType> = {
  // CRM triggers (legacy underscore format)
  record_created: FilePlus,
  record_updated: FileEdit,
  record_deleted: Trash2,
  field_changed: FileText,
  stage_changed: GitBranch,
  // CRM triggers (dot notation)
  "record.created": FilePlus,
  "record.updated": FileEdit,
  "record.deleted": Trash2,
  "field.changed": FileText,
  "list_entry.added": ListPlus,
  "list_entry.removed": ListMinus,
  "status.changed": RefreshCw,
  "stage.changed": GitBranch,
  "schedule.daily": Calendar,
  "schedule.weekly": Calendar,
  "date.approaching": Clock,
  "date.passed": AlertTriangle,
  "webhook.received": Webhook,
  "form.submitted": FileText,
  "email.opened": Mail,
  "email.clicked": MousePointerClick,
  "email.replied": Mail,
  // Ticket triggers
  "ticket.created": Ticket,
  "ticket.updated": FileEdit,
  "ticket.status_changed": RefreshCw,
  "ticket.assigned": UserCheck,
  "ticket.priority_changed": AlertTriangle,
  "ticket.escalated": AlertTriangle,
  "sla.breached": AlertTriangle,
  "sla.warning": Bell,
  "response.received": MessageSquare,
  "response.sent": Send,
  // Hiring triggers
  "candidate.created": UserPlus,
  "candidate.updated": FileEdit,
  "candidate.stage_changed": GitBranch,
  "candidate.rejected": UserX,
  "candidate.hired": UserCheck,
  "assessment.completed": CheckSquare,
  "assessment.score_above": TrendingDown,
  "assessment.score_below": TrendingDown,
  "requirement.created": FilePlus,
  "requirement.status_changed": RefreshCw,
  "interview.scheduled": Calendar,
  "interview.completed": CheckSquare,
  "offer.sent": Send,
  "offer.accepted": CheckSquare,
  "offer.rejected": Trash2,
  "offer.declined": Trash2,
  // Email marketing triggers
  "campaign.sent": Send,
  "campaign.scheduled": Calendar,
  "email.bounced": AlertTriangle,
  "email.unsubscribed": UserX,
  "email.complained": AlertTriangle,
  "list.member_added": ListPlus,
  "recipient.added": UserPlus,
  "recipient.removed": UserX,
  // Uptime triggers
  "monitor.created": Activity,
  "monitor.down": AlertTriangle,
  "monitor.up": CheckSquare,
  "monitor.degraded": Activity,
  "incident.created": AlertTriangle,
  "incident.resolved": CheckSquare,
  "incident.acknowledged": UserCheck,
  "ssl.expiring": AlertTriangle,
  // Sprint triggers
  "task.created": Zap,
  "task.status_changed": RefreshCw,
  "task.assigned": UserCheck,
  "task.completed": CheckSquare,
  "sprint.started": Play,
  "sprint.completed": CheckSquare,
  "epic.completed": CheckSquare,
  "blocker.created": ShieldAlert,
  "blocker.resolved": CheckSquare,
  // Form triggers
  "form.started": Play,
  "form.abandoned": UserX,
  // Booking triggers
  "booking.created": Calendar,
  "booking.confirmed": CheckSquare,
  "booking.cancelled": Trash2,
  "booking.rescheduled": RefreshCw,
  "booking.completed": CheckSquare,
  "booking.no_show": UserX,
  "booking.reminder": Bell,
  "event_type.created": Calendar,
  // Tracking triggers
  "standup.submitted": ClipboardCheck,
  "standup.missed": AlertTriangle,
  "standup.streak": Award,
  "time_entry.created": Timer,
  "time_entry.threshold": TrendingDown,
  "time_entry.anomaly": AlertTriangle,
  "blocker.escalated": AlertTriangle,
  "blocker.stale": Clock,
  "blocker.pattern_detected": BarChart3,
  "work_log.submitted": FileEdit,
  "sentiment.negative": Heart,
  "participation.low": Users,
  // Compliance triggers
  "training.created": GraduationCap,
  "training.assigned": BookOpen,
  "training.started": Play,
  "training.completed": CheckSquare,
  "training.waived": UserX,
  "training.bulk_overdue": AlertTriangle,
  "assignment.approaching_due": Clock,
  "assignment.overdue": AlertTriangle,
  "certification.added": Award,
  "certification.expiring": Clock,
  "certification.expired": AlertTriangle,
  "certification.renewed": RefreshCw,
  "certification.revoked": Trash2,
  "certification.prerequisite_unmet": ShieldAlert,
  "compliance.status_changed": ShieldCheck,
  "audit.logged": ScrollText,
  // Common triggers
  scheduled: Clock,
  webhook_received: Webhook,
  form_submitted: FileInput,
  email_received: Mail,
  manual: MousePointer,
};

interface TriggerNodeData extends Record<string, unknown> {
  label: string;
  trigger_type?: string;
  hasError?: boolean;
  errorMessage?: string;
  isHighlighted?: boolean;
  executionStatus?: ExecutionStatus;
  executionDurationMs?: number;
}

type TriggerNodeType = Node<TriggerNodeData>;

export const TriggerNode = memo(({ data, selected }: NodeProps<TriggerNodeType>) => {
  const Icon = triggerIcons[data.trigger_type as string] || Zap;
  const isHighlighted = data.isHighlighted;
  const { isRunning, isSuccess, isFailed, isSkipped, StatusIndicator, DurationBadge } = useExecutionState(data);

  const getStyles = () => {
    if (isRunning) return "border-blue-400 shadow-blue-500/30 animate-pulse";
    if (isSuccess) return "border-emerald-400 shadow-emerald-500/30";
    if (isFailed) return "border-red-500 shadow-red-500/30";
    if (isSkipped) return "border-muted-foreground shadow-muted-foreground/20 opacity-60";
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
        ${isHighlighted ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background" : ""}
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
        className={`!w-3 !h-3 !border-2 ${data.hasError ? "!bg-red-400 !border-red-600" : "!bg-emerald-400 !border-emerald-600"}`}
      />
    </div>
  );
});

TriggerNode.displayName = "TriggerNode";
