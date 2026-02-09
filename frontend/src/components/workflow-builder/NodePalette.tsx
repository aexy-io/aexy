"use client";

import { useState, useMemo } from "react";
import {
  Zap,
  Play,
  GitBranch,
  Clock,
  Bot,
  Merge,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  FileText,
  Webhook,
  Mail,
  Calendar,
  MousePointer,
  FileEdit,
  FilePlus,
  Trash2,
  MessageSquare,
  Phone,
  CheckSquare,
  ListPlus,
  ListMinus,
  UserPlus,
  Target,
  Sparkles,
  Database,
  Bell,
  Ticket,
  AlertTriangle,
  Users,
  UserCheck,
  Briefcase,
  Send,
  MousePointerClick,
  BarChart3,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useModuleTriggers, useModuleActions } from "@/hooks/useAutomations";

interface NodePaletteProps {
  workspaceId: string;
  module: string;
  onAddNode: (type: string, subtype?: string) => void;
  onDragStart?: (event: React.DragEvent, type: string, subtype?: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NodeCategory {
  type: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  subtypes: { value: string; label: string; icon: React.ElementType }[];
}

// Trigger labels by module - maps trigger type to human-readable label
const TRIGGER_LABELS: Record<string, Record<string, string>> = {
  crm: {
    "record.created": "Record Created",
    "record.updated": "Record Updated",
    "record.deleted": "Record Deleted",
    "field.changed": "Field Changed",
    "stage.changed": "Stage Changed",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    form_submitted: "Form Submitted",
    email_received: "Email Received",
    manual: "Manual",
    // Legacy format support
    record_created: "Record Created",
    record_updated: "Record Updated",
    record_deleted: "Record Deleted",
    field_changed: "Field Changed",
    stage_changed: "Stage Changed",
  },
  tickets: {
    "ticket.created": "Ticket Created",
    "ticket.updated": "Ticket Updated",
    "ticket.status_changed": "Status Changed",
    "ticket.assigned": "Ticket Assigned",
    "ticket.priority_changed": "Priority Changed",
    "sla.breached": "SLA Breached",
    "sla.warning": "SLA Warning",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
  hiring: {
    "candidate.created": "Candidate Added",
    "candidate.updated": "Candidate Updated",
    "candidate.stage_changed": "Stage Changed",
    "assessment.completed": "Assessment Completed",
    "interview.scheduled": "Interview Scheduled",
    "interview.completed": "Interview Completed",
    "offer.sent": "Offer Sent",
    "offer.accepted": "Offer Accepted",
    "offer.rejected": "Offer Rejected",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
  email_marketing: {
    "campaign.sent": "Campaign Sent",
    "campaign.scheduled": "Campaign Scheduled",
    "email.opened": "Email Opened",
    "email.clicked": "Link Clicked",
    "email.bounced": "Email Bounced",
    "email.unsubscribed": "Unsubscribed",
    "list.member_added": "Added to List",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
  uptime: {
    "monitor.created": "Monitor Created",
    "monitor.down": "Monitor Down",
    "monitor.up": "Monitor Up",
    "monitor.degraded": "Monitor Degraded",
    "incident.created": "Incident Created",
    "incident.resolved": "Incident Resolved",
    "incident.acknowledged": "Incident Acknowledged",
    "ssl.expiring": "SSL Expiring",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
  sprints: {
    "task.created": "Task Created",
    "task.status_changed": "Task Status Changed",
    "task.assigned": "Task Assigned",
    "sprint.started": "Sprint Started",
    "sprint.completed": "Sprint Completed",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
  forms: {
    "form.submitted": "Form Submitted",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
  booking: {
    "booking.created": "Booking Created",
    "booking.confirmed": "Booking Confirmed",
    "booking.cancelled": "Booking Cancelled",
    "booking.rescheduled": "Booking Rescheduled",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
};

// Action labels by module
const ACTION_LABELS: Record<string, Record<string, string>> = {
  common: {
    send_email: "Send Email",
    send_slack: "Send Slack",
    send_sms: "Send SMS",
    webhook_call: "Webhook Call",
    api_request: "API Request",
    notify_user: "Notify User",
    notify_team: "Notify Team",
    run_agent: "Run AI Agent",
  },
  crm: {
    update_record: "Update Record",
    create_record: "Create Record",
    delete_record: "Delete Record",
    create_task: "Create Task",
    add_to_list: "Add to List",
    remove_from_list: "Remove from List",
    enroll_sequence: "Enroll in Sequence",
    unenroll_sequence: "Unenroll from Sequence",
    assign_owner: "Assign Owner",
    link_records: "Link Records",
    enrich_record: "Enrich Record",
    classify_record: "Classify Record",
    generate_summary: "Generate Summary",
  },
  tickets: {
    update_ticket: "Update Ticket",
    assign_ticket: "Assign Ticket",
    add_response: "Add Response",
    escalate: "Escalate",
    change_priority: "Change Priority",
    add_tag: "Add Tag",
    remove_tag: "Remove Tag",
    create_task: "Create Task",
  },
  hiring: {
    update_candidate: "Update Candidate",
    move_stage: "Move Stage",
    schedule_interview: "Schedule Interview",
    send_rejection: "Send Rejection",
    create_offer: "Create Offer",
    add_note: "Add Note",
    assign_recruiter: "Assign Recruiter",
  },
  email_marketing: {
    add_to_list: "Add to List",
    remove_from_list: "Remove from List",
    send_campaign: "Send Campaign",
    update_contact: "Update Contact",
    add_tag: "Add Tag",
  },
  uptime: {
    create_incident: "Create Incident",
    resolve_incident: "Resolve Incident",
    pause_monitor: "Pause Monitor",
    resume_monitor: "Resume Monitor",
  },
  sprints: {
    update_task: "Update Task",
    assign_task: "Assign Task",
    move_task: "Move Task",
    create_subtask: "Create Subtask",
    add_comment: "Add Comment",
  },
  forms: {
    create_record: "Create CRM Record",
    send_response: "Send Response",
    add_to_list: "Add to List",
  },
  booking: {
    confirm_booking: "Confirm Booking",
    cancel_booking: "Cancel Booking",
    reschedule_booking: "Reschedule",
    send_reminder: "Send Reminder",
  },
};

// Icons for trigger types
const TRIGGER_ICONS: Record<string, React.ElementType> = {
  // CRM triggers
  "record.created": FilePlus,
  "record.updated": FileEdit,
  "record.deleted": Trash2,
  "field.changed": FileText,
  "stage.changed": GitBranch,
  record_created: FilePlus,
  record_updated: FileEdit,
  record_deleted: Trash2,
  field_changed: FileText,
  stage_changed: GitBranch,
  // Ticket triggers
  "ticket.created": Ticket,
  "ticket.updated": FileEdit,
  "ticket.status_changed": RefreshCw,
  "ticket.assigned": UserCheck,
  "ticket.priority_changed": AlertTriangle,
  "sla.breached": AlertTriangle,
  "sla.warning": Bell,
  // Hiring triggers
  "candidate.created": UserPlus,
  "candidate.updated": FileEdit,
  "candidate.stage_changed": GitBranch,
  "assessment.completed": CheckSquare,
  "interview.scheduled": Calendar,
  "interview.completed": CheckSquare,
  "offer.sent": Send,
  "offer.accepted": CheckSquare,
  "offer.rejected": Trash2,
  // Email marketing triggers
  "campaign.sent": Send,
  "campaign.scheduled": Calendar,
  "email.opened": Mail,
  "email.clicked": MousePointerClick,
  "email.bounced": AlertTriangle,
  "email.unsubscribed": UserPlus,
  "list.member_added": ListPlus,
  // Uptime triggers
  "monitor.created": FilePlus,
  "monitor.down": AlertTriangle,
  "monitor.up": CheckSquare,
  "monitor.degraded": AlertTriangle,
  "incident.created": AlertTriangle,
  "incident.resolved": CheckSquare,
  "incident.acknowledged": UserCheck,
  "ssl.expiring": AlertTriangle,
  // Sprint triggers
  "task.created": FilePlus,
  "task.status_changed": RefreshCw,
  "task.assigned": UserCheck,
  "sprint.started": Play,
  "sprint.completed": CheckSquare,
  // Form triggers
  "form.submitted": FileText,
  // Booking triggers
  "booking.created": Calendar,
  "booking.confirmed": CheckSquare,
  "booking.cancelled": Trash2,
  "booking.rescheduled": RefreshCw,
  // Common triggers
  scheduled: Calendar,
  webhook_received: Webhook,
  form_submitted: FileText,
  email_received: Mail,
  manual: MousePointer,
};

// Icons for action types
const ACTION_ICONS: Record<string, React.ElementType> = {
  // Common actions
  send_email: Mail,
  send_slack: MessageSquare,
  send_sms: Phone,
  webhook_call: Webhook,
  api_request: Webhook,
  notify_user: Bell,
  notify_team: Users,
  run_agent: Bot,
  // CRM actions
  update_record: FileEdit,
  create_record: FilePlus,
  delete_record: Trash2,
  create_task: CheckSquare,
  add_to_list: ListPlus,
  remove_from_list: ListMinus,
  enroll_sequence: GitBranch,
  unenroll_sequence: GitBranch,
  assign_owner: UserPlus,
  link_records: Database,
  enrich_record: Sparkles,
  classify_record: Target,
  generate_summary: FileText,
  // Ticket actions
  update_ticket: FileEdit,
  assign_ticket: UserCheck,
  add_response: MessageSquare,
  escalate: AlertTriangle,
  change_priority: AlertTriangle,
  add_tag: Target,
  remove_tag: Trash2,
  // Hiring actions
  update_candidate: FileEdit,
  move_stage: GitBranch,
  schedule_interview: Calendar,
  send_rejection: Mail,
  create_offer: Briefcase,
  add_note: FileText,
  assign_recruiter: UserCheck,
  // Email marketing actions
  send_campaign: Send,
  update_contact: FileEdit,
  // Uptime actions
  create_incident: AlertTriangle,
  resolve_incident: CheckSquare,
  pause_monitor: Clock,
  resume_monitor: Play,
  // Sprint actions
  update_task: FileEdit,
  assign_task: UserCheck,
  move_task: GitBranch,
  create_subtask: FilePlus,
  add_comment: MessageSquare,
  // Form actions
  send_response: Mail,
  // Booking actions
  confirm_booking: CheckSquare,
  cancel_booking: Trash2,
  reschedule_booking: RefreshCw,
  send_reminder: Bell,
};

// Fixed categories that don't change by module
const FIXED_CATEGORIES: Omit<NodeCategory, "subtypes">[] = [
  {
    type: "condition",
    label: "Conditions",
    icon: GitBranch,
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
  },
  {
    type: "wait",
    label: "Wait",
    icon: Clock,
    color: "text-violet-400",
    bgColor: "bg-violet-500/20",
  },
  {
    type: "agent",
    label: "AI Agents",
    icon: Bot,
    color: "text-pink-400",
    bgColor: "bg-pink-500/20",
  },
  {
    type: "branch",
    label: "Branch",
    icon: Merge,
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/20",
  },
  {
    type: "join",
    label: "Join",
    icon: GitBranch,
    color: "text-teal-400",
    bgColor: "bg-teal-500/20",
  },
];

// Fixed subtypes for non-dynamic categories
const FIXED_SUBTYPES: Record<string, { value: string; label: string; icon: React.ElementType }[]> = {
  condition: [],
  wait: [
    { value: "duration", label: "Wait Duration", icon: Clock },
    { value: "datetime", label: "Wait Until Date", icon: Calendar },
    { value: "event", label: "Wait for Event", icon: Bell },
  ],
  agent: [
    { value: "sales_outreach", label: "Sales Outreach", icon: Target },
    { value: "lead_scoring", label: "Lead Scoring", icon: Sparkles },
    { value: "email_drafter", label: "Email Drafter", icon: Mail },
    { value: "data_enrichment", label: "Data Enrichment", icon: Database },
    { value: "custom", label: "Custom Agent", icon: Bot },
  ],
  branch: [],
  join: [
    { value: "all", label: "Wait for All", icon: Merge },
    { value: "any", label: "Wait for Any", icon: Merge },
    { value: "count", label: "Wait for Count", icon: Merge },
  ],
};

// Fallback triggers for when API fails or during loading
const FALLBACK_TRIGGERS: Record<string, string[]> = {
  crm: [
    "record_created",
    "record_updated",
    "record_deleted",
    "field_changed",
    "stage_changed",
    "scheduled",
    "webhook_received",
    "form_submitted",
    "email_received",
    "manual",
  ],
  tickets: [
    "ticket.created",
    "ticket.updated",
    "ticket.status_changed",
    "ticket.assigned",
    "sla.breached",
    "scheduled",
    "webhook_received",
    "manual",
  ],
  hiring: [
    "candidate.created",
    "candidate.stage_changed",
    "assessment.completed",
    "interview.scheduled",
    "offer.accepted",
    "scheduled",
    "webhook_received",
    "manual",
  ],
  email_marketing: [
    "campaign.sent",
    "email.opened",
    "email.clicked",
    "email.bounced",
    "scheduled",
    "webhook_received",
    "manual",
  ],
  uptime: ["monitor.created", "monitor.down", "monitor.up", "monitor.degraded", "incident.created", "incident.resolved", "incident.acknowledged", "scheduled", "webhook_received", "manual"],
  sprints: ["task.created", "task.status_changed", "sprint.completed", "scheduled", "webhook_received", "manual"],
  forms: ["form.submitted", "scheduled", "webhook_received", "manual"],
  booking: ["booking.created", "booking.confirmed", "booking.cancelled", "scheduled", "webhook_received", "manual"],
};

// Fallback actions for when API fails or during loading
const FALLBACK_ACTIONS: Record<string, string[]> = {
  crm: [
    "update_record",
    "create_record",
    "delete_record",
    "send_email",
    "send_slack",
    "send_sms",
    "create_task",
    "add_to_list",
    "remove_from_list",
    "enroll_sequence",
    "unenroll_sequence",
    "webhook_call",
    "assign_owner",
    "notify_user",
    "notify_team",
    "run_agent",
  ],
  tickets: [
    "update_ticket",
    "assign_ticket",
    "add_response",
    "escalate",
    "change_priority",
    "send_email",
    "send_slack",
    "webhook_call",
    "notify_user",
    "run_agent",
  ],
  hiring: [
    "update_candidate",
    "move_stage",
    "schedule_interview",
    "send_rejection",
    "send_email",
    "send_slack",
    "webhook_call",
    "notify_user",
    "run_agent",
  ],
  email_marketing: [
    "add_to_list",
    "remove_from_list",
    "send_campaign",
    "update_contact",
    "send_email",
    "webhook_call",
    "run_agent",
  ],
  uptime: [
    "create_incident",
    "resolve_incident",
    "pause_monitor",
    "send_email",
    "send_slack",
    "webhook_call",
    "notify_team",
  ],
  sprints: [
    "update_task",
    "assign_task",
    "move_task",
    "create_subtask",
    "send_slack",
    "webhook_call",
    "notify_user",
    "run_agent",
  ],
  forms: ["create_record", "send_response", "add_to_list", "send_email", "webhook_call", "run_agent"],
  booking: [
    "confirm_booking",
    "cancel_booking",
    "reschedule_booking",
    "send_reminder",
    "send_email",
    "send_slack",
    "webhook_call",
  ],
};

function getTriggerLabel(module: string, triggerType: string): string {
  // Check module-specific labels first
  const moduleLabels = TRIGGER_LABELS[module];
  if (moduleLabels && moduleLabels[triggerType]) {
    return moduleLabels[triggerType];
  }

  // Fallback: convert trigger type to label
  return triggerType
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function getActionLabel(module: string, actionType: string): string {
  // Check module-specific labels first
  const moduleLabels = ACTION_LABELS[module];
  if (moduleLabels && moduleLabels[actionType]) {
    return moduleLabels[actionType];
  }

  // Check common labels
  const commonLabels = ACTION_LABELS.common;
  if (commonLabels && commonLabels[actionType]) {
    return commonLabels[actionType];
  }

  // Fallback: convert action type to label
  return actionType
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function getTriggerIcon(triggerType: string): React.ElementType {
  return TRIGGER_ICONS[triggerType] || FileText;
}

function getActionIcon(actionType: string): React.ElementType {
  return ACTION_ICONS[actionType] || Play;
}

export function NodePalette({
  workspaceId,
  module,
  onAddNode,
  onDragStart,
  isCollapsed,
  onToggleCollapse,
}: NodePaletteProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["trigger"]));

  // Fetch triggers and actions from the registry
  const { triggers: registryTriggers, isLoading: triggersLoading } = useModuleTriggers(workspaceId, module);
  const { actions: registryActions, isLoading: actionsLoading } = useModuleActions(workspaceId, module);

  // Build dynamic categories based on registry data
  const nodeCategories = useMemo(() => {
    // Use registry data if available, otherwise fallback
    const triggers = registryTriggers.length > 0 ? registryTriggers : (FALLBACK_TRIGGERS[module] || []);
    const actions = registryActions.length > 0 ? registryActions : (FALLBACK_ACTIONS[module] || []);

    // Build trigger subtypes
    const triggerSubtypes = triggers.map((t) => ({
      value: t,
      label: getTriggerLabel(module, t),
      icon: getTriggerIcon(t),
    }));

    // Build action subtypes
    const actionSubtypes = actions.map((a) => ({
      value: a,
      label: getActionLabel(module, a),
      icon: getActionIcon(a),
    }));

    // Build categories
    const categories: NodeCategory[] = [
      {
        type: "trigger",
        label: "Triggers",
        icon: Zap,
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/20",
        subtypes: triggerSubtypes,
      },
      {
        type: "action",
        label: "Actions",
        icon: Play,
        color: "text-blue-400",
        bgColor: "bg-blue-500/20",
        subtypes: actionSubtypes,
      },
      // Add fixed categories with their subtypes
      ...FIXED_CATEGORIES.map((cat) => ({
        ...cat,
        subtypes: FIXED_SUBTYPES[cat.type] || [],
      })),
    ];

    return categories;
  }, [module, registryTriggers, registryActions]);

  const toggleCategory = (type: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleAddNode = (category: NodeCategory, subtype?: string) => {
    onAddNode(category.type, subtype);
  };

  const handleDragStart = (
    event: React.DragEvent,
    category: NodeCategory,
    subtype?: string
  ) => {
    // Set drag data for React Flow
    const nodeData = {
      type: category.type,
      subtype: subtype,
    };
    event.dataTransfer.setData("application/reactflow", JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = "move";

    // Call parent handler if provided
    if (onDragStart) {
      onDragStart(event, category.type, subtype);
    }
  };

  const isLoading = triggersLoading || actionsLoading;

  // Collapsed mode for mobile - just show icons
  if (isCollapsed) {
    return (
      <div className="w-14 bg-slate-800/50 border-r border-slate-700 flex flex-col">
        <button
          onClick={onToggleCollapse}
          className="p-3 border-b border-slate-700 hover:bg-slate-700/50"
          title="Expand palette"
        >
          <ChevronRight className="h-5 w-5 text-slate-400" />
        </button>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {nodeCategories.map((category) => (
            <button
              key={category.type}
              onClick={() => onAddNode(category.type)}
              className={`w-full p-2 rounded-lg hover:bg-slate-700/50 flex items-center justify-center ${category.bgColor}`}
              title={category.label}
            >
              <category.icon className={`h-5 w-5 ${category.color}`} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-slate-800/50 border-r border-slate-700 overflow-y-auto hidden md:block">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold">Node Palette</h3>
          <p className="text-xs text-slate-400 mt-1">
            Drag nodes to canvas or click to add
          </p>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white lg:hidden"
            title="Collapse palette"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-4 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm">Loading...</span>
        </div>
      )}

      <div className="p-2">
        {nodeCategories.map((category) => {
          const isExpanded = expandedCategories.has(category.type);
          const hasSubtypes = category.subtypes.length > 0;

          return (
            <div key={category.type} className="mb-1">
              <button
                onClick={() => {
                  if (hasSubtypes) {
                    toggleCategory(category.type);
                  } else {
                    handleAddNode(category);
                  }
                }}
                draggable={!hasSubtypes}
                onDragStart={(e) => {
                  if (!hasSubtypes) {
                    handleDragStart(e, category);
                  }
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                  hover:bg-slate-700/50 transition-colors group
                  ${hasSubtypes ? "" : "cursor-grab active:cursor-grabbing"}
                `}
              >
                <div className={`p-1.5 rounded-lg ${category.bgColor}`}>
                  <category.icon className={`h-4 w-4 ${category.color}`} />
                </div>
                <span className="text-slate-200 font-medium text-sm flex-1 text-left">
                  {category.label}
                </span>
                {hasSubtypes && (
                  <span className="text-slate-400">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                )}
              </button>

              {hasSubtypes && isExpanded && (
                <div className="ml-4 mt-1 space-y-0.5">
                  {category.subtypes.map((subtype) => (
                    <button
                      key={subtype.value}
                      onClick={() => handleAddNode(category, subtype.value)}
                      draggable
                      onDragStart={(e) => handleDragStart(e, category, subtype.value)}
                      className={`
                        w-full flex items-center gap-2 px-3 py-2 rounded-lg
                        hover:bg-slate-700/50 transition-colors
                        cursor-grab active:cursor-grabbing
                      `}
                    >
                      <subtype.icon className={`h-3.5 w-3.5 ${category.color}`} />
                      <span className="text-slate-300 text-sm">
                        {subtype.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
