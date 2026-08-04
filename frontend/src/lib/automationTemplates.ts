/**
 * Shared definitions for automation modules, default trigger types, and
 * the catalog of ready-made templates. Used by:
 *
 * - automations/page.tsx (module filter pills, badges on the list).
 * - automations/new/page.tsx (template-driven canvas pre-fill).
 * - components/automations/TemplateGallery.tsx (first-run picker).
 *
 * Keep this module presentational + data-only. Anything that touches
 * the API belongs in lib/api.ts.
 */

import {
  Activity,
  Building2,
  CalendarCheck,
  Calendar,
  FileText,
  Mail,
  MonitorCheck,
  ShieldCheck,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Node, Edge } from "@xyflow/react";

import { AutomationModule } from "@/lib/api";

// ---------------------------------------------------------------------------
// Module presentation
// ---------------------------------------------------------------------------

export const moduleLabels: Record<AutomationModule, string> = {
  crm: "CRM",
  tickets: "Tickets",
  hiring: "Hiring",
  email_marketing: "Email Marketing",
  uptime: "Uptime",
  sprints: "Sprints",
  forms: "Forms",
  booking: "Booking",
  tracking: "Tracking",
  compliance: "Compliance",
};

export const moduleIcons: Record<AutomationModule, LucideIcon> = {
  crm: Building2,
  tickets: Ticket,
  hiring: Users,
  email_marketing: Mail,
  uptime: MonitorCheck,
  sprints: Calendar,
  forms: FileText,
  booking: CalendarCheck,
  tracking: Activity,
  compliance: ShieldCheck,
};

/**
 * Tailwind class pair (bg + text) for the module accent. Pick saturated
 * 500-level brand colors so the gallery cards feel distinctive instead of
 * "every automation is purple."
 */
export const moduleColors: Record<AutomationModule, string> = {
  crm: "bg-blue-500/20 text-blue-500 dark:text-blue-400",
  tickets: "bg-orange-500/20 text-orange-500 dark:text-orange-400",
  hiring: "bg-purple-500/20 text-purple-500 dark:text-purple-400",
  email_marketing: "bg-pink-500/20 text-pink-500 dark:text-pink-400",
  uptime: "bg-green-500/20 text-green-500 dark:text-green-400",
  sprints: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
  forms: "bg-cyan-500/20 text-cyan-500 dark:text-cyan-400",
  booking: "bg-indigo-500/20 text-indigo-500 dark:text-indigo-400",
  tracking: "bg-teal-500/20 text-teal-500 dark:text-teal-400",
  compliance: "bg-red-500/20 text-red-500 dark:text-red-400",
};

/** Plain (non-Tailwind) hex used for the workflow canvas trace accent. */
export const moduleAccentHex: Record<AutomationModule, string> = {
  crm: "#3b82f6",
  tickets: "#f97316",
  hiring: "#a855f7",
  email_marketing: "#ec4899",
  uptime: "#22c55e",
  sprints: "#eab308",
  forms: "#06b6d4",
  booking: "#6366f1",
  tracking: "#14b8a6",
  compliance: "#ef4444",
};

export const ALL_MODULES: AutomationModule[] = [
  "crm",
  "tickets",
  "hiring",
  "email_marketing",
  "uptime",
  "sprints",
  "forms",
  "booking",
  "tracking",
  "compliance",
];

// ---------------------------------------------------------------------------
// Default trigger per module — used when an automation is created without a
// template (the canvas drops in a blank trigger node that matches the
// module's most common event source).
// ---------------------------------------------------------------------------

export const defaultTriggerTypes: Record<
  string,
  { type: string; label: string }
> = {
  crm: { type: "record.created", label: "Record Created" },
  tickets: { type: "ticket.created", label: "Ticket Created" },
  hiring: { type: "candidate.created", label: "Candidate Created" },
  email_marketing: { type: "campaign.sent", label: "Campaign Sent" },
  uptime: { type: "monitor.created", label: "Monitor Created" },
  sprints: { type: "task.created", label: "Task Created" },
  forms: { type: "form.submitted", label: "Form Submitted" },
  booking: { type: "booking.created", label: "Booking Created" },
  tracking: { type: "standup.submitted", label: "Standup Submitted" },
  compliance: { type: "training.assigned", label: "Training Assigned" },
};

// ---------------------------------------------------------------------------
// Template catalog
// ---------------------------------------------------------------------------

export interface AutomationTemplateAction {
  type: string;
  label: string;
  config: Record<string, unknown>;
}

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  module: AutomationModule;
  triggerType: string;
  triggerLabel: string;
  actions: AutomationTemplateAction[];
}

export const AUTOMATION_TEMPLATES: Record<string, AutomationTemplate> = {
  "missed-standup": {
    id: "missed-standup",
    name: "Missed Standup Follow-up",
    description:
      "When a team member misses their standup, create a follow-up task and send a reminder.",
    module: "tracking",
    triggerType: "standup.missed",
    triggerLabel: "Standup Missed",
    // Action types are registry ids, not descriptions: `send_notification` was
    // not one, so this template produced a workflow that failed validation on
    // save ("action is unavailable; choose a capability from the server
    // registry"). notify_user is the registry's in-app notification.
    actions: [
      {
        type: "create_task",
        label: "Create Follow-up Task",
        config: { task_title: "Missed standup follow-up", priority: "medium" },
      },
      {
        type: "notify_user",
        label: "Send Reminder",
        config: {
          notify_message:
            "You missed standup on {{trigger.date}} — please post an update.",
        },
      },
    ],
  },
  "blocker-escalation": {
    id: "blocker-escalation",
    name: "Blocker Auto-Escalation",
    description:
      "Escalate blockers that remain unresolved for more than 2 days to the engineering manager.",
    module: "tracking",
    // blocker.stale is the trigger the tracking runner actually dispatches for
    // a blocker left unresolved past its threshold; blocker.unresolved was
    // never emitted by anything.
    triggerType: "blocker.stale",
    triggerLabel: "Blocker Stale",
    actions: [
      {
        type: "escalate_blocker",
        label: "Escalate Blocker",
        config: {},
      },
      {
        type: "notify_team",
        label: "Notify Team",
        config: {
          team_notify_title: "Blocker escalated",
          team_notify_message:
            "{{trigger.description}} has been blocked for {{trigger.days_stale}} days.",
        },
      },
    ],
  },
  "velocity-alert": {
    id: "velocity-alert",
    name: "Sprint Velocity Alert",
    description:
      "Notify when sprint burndown deviates more than 20% from the ideal trajectory.",
    module: "sprints",
    // The burndown snapshot runner dispatches sprint.burndown_off_track and
    // carries the deviation on the payload; sprint.velocity_deviation was not a
    // trigger anything emitted.
    triggerType: "sprint.burndown_off_track",
    triggerLabel: "Burndown Off Track",
    actions: [
      {
        type: "notify_team",
        label: "Alert Team",
        config: {
          team_notify_title: "Sprint burndown off track",
          team_notify_message:
            "{{trigger.sprint_name}} is {{trigger.deviation_pct}}% off the ideal burndown.",
        },
      },
    ],
  },
  "lead-followup": {
    id: "lead-followup",
    name: "Lead Follow-up Sequence",
    description:
      "Send follow-up emails to new CRM leads after 1, 3, and 7 days.",
    module: "crm",
    triggerType: "record.created",
    triggerLabel: "Lead Created",
    // Each send_email action must ship with at least subject + body
    // placeholders; backend `validate_workflow` rejects email actions
    // without `body` (or `template`) and the canvas would silently
    // fail to save. The user is expected to edit these before
    // publishing — they're starting-point copy, not finished emails.
    actions: [
      {
        type: "send_email",
        label: "Day 1 Follow-up",
        config: {
          delay_days: 1,
          email_subject: "Following up on {{record.values.name}}",
          email_body:
            "Hi {{record.values.first_name}},\n\nQuick follow-up on our conversation — happy to answer any questions.",
        },
      },
      {
        type: "send_email",
        label: "Day 3 Follow-up",
        config: {
          delay_days: 3,
          email_subject: "Anything I can help with?",
          email_body:
            "Hi {{record.values.first_name}},\n\nJust checking in — let me know if you'd like to chat this week.",
        },
      },
      {
        type: "send_email",
        label: "Day 7 Follow-up",
        config: {
          delay_days: 7,
          email_subject: "One last check-in",
          email_body:
            "Hi {{record.values.first_name}},\n\nIf the timing isn't right, no worries — happy to revisit later in the quarter.",
        },
      },
    ],
  },
  "welcome-sequence": {
    id: "welcome-sequence",
    name: "Welcome Email Sequence",
    description: "Send onboarding emails when a new contact is added to CRM.",
    module: "crm",
    triggerType: "record.created",
    triggerLabel: "Contact Created",
    actions: [
      {
        type: "send_email",
        label: "Welcome Email",
        config: {
          delay_days: 0,
          email_subject: "Welcome to {{workspace.name}}",
          email_body:
            "Hi {{record.values.first_name}},\n\nThanks for signing up — we're excited to have you. Reach out anytime.",
        },
      },
      {
        type: "send_email",
        label: "Getting Started",
        config: {
          delay_days: 2,
          email_subject: "Getting started with {{workspace.name}}",
          email_body:
            "Hi {{record.values.first_name}},\n\nHere are three quick wins to get the most out of the product on day one.",
        },
      },
      {
        type: "send_email",
        label: "Tips & Resources",
        config: {
          delay_days: 5,
          email_subject: "Power-user tips for {{workspace.name}}",
          email_body:
            "Hi {{record.values.first_name}},\n\nA round-up of patterns our most successful teams use after their first week.",
        },
      },
    ],
  },
  "compliance-alert": {
    id: "compliance-alert",
    name: "Compliance Due Date Alert",
    description:
      "Alert team members 7 days before compliance deadlines and escalate overdue items.",
    module: "compliance",
    // assignment.approaching_due is what compliance_service dispatches, and it
    // already carries days_until_due; compliance.deadline_approaching was not a
    // trigger anything emitted, and send_notification was not an action id — so
    // this template could not be saved, let alone run.
    triggerType: "assignment.approaching_due",
    triggerLabel: "Assignment Due Soon",
    actions: [
      {
        type: "notify_user",
        label: "Warn the assignee",
        config: {
          notify_message:
            "Your training is due in {{trigger.days_until_due}} days ({{trigger.due_date}}).",
        },
      },
    ],
  },
  "ai-triage": {
    id: "ai-triage",
    name: "AI Ticket Triage",
    description:
      "Use AI to classify and route incoming tickets by priority and department.",
    module: "tickets",
    triggerType: "ticket.created",
    triggerLabel: "Ticket Created",
    // run_agent is the registry's AI capability; `ai_classify` was not an
    // action id, and assign_ticket reads assignee_id/team_id rather than a
    // "based_on" hint, so the routing step had nothing to act on.
    actions: [
      {
        type: "run_agent",
        label: "Classify with an agent",
        config: { output_variable: "triage" },
      },
      {
        type: "add_tag",
        label: "Tag with the classification",
        config: { tag: "{{variables.triage}}" },
      },
    ],
  },
  "deal-stage-alert": {
    id: "deal-stage-alert",
    name: "Deal Stage Notification",
    description:
      "Notify the sales team when a deal moves to a new pipeline stage.",
    module: "crm",
    // Must match the id the backend registry/emitter uses ("stage.changed").
    // "deal.stage_changed" is emitted by nothing, so the automation never fired.
    triggerType: "stage.changed",
    triggerLabel: "Stage Changed",
    actions: [
      {
        type: "notify_user",
        label: "Notify Workspace Admins",
        config: {
          channel: "email",
          notify_type: "workspace_admin",
          notify_title: "Deal stage changed",
          notify_message:
            "{{record.values.name}} moved to stage {{trigger.new_stage}}.",
        },
      },
    ],
  },
};

export const TEMPLATE_LIST = Object.values(AUTOMATION_TEMPLATES);

// Templates the builder may offer. Every entry's trigger and action ids are
// registry ids now — the non-CRM ones referenced triggers nothing emitted
// (blocker.unresolved, sprint.velocity_deviation,
// compliance.deadline_approaching) and actions that were not action types
// (send_notification, update_priority, ai_classify), so picking one produced a
// workflow that failed validation on save. That is why the list was pinned to
// CRM; it no longer needs to be.
//
// The names are kept for the existing imports.
export const CRM_AUTOMATION_MODULES: AutomationModule[] = ALL_MODULES;
export const CRM_TEMPLATE_LIST = TEMPLATE_LIST;

// ---------------------------------------------------------------------------
// React Flow scaffolding helpers
// ---------------------------------------------------------------------------

export function getDefaultNodes(
  module: string,
  tmpl?: AutomationTemplate | null,
): Node[] {
  const trigger = tmpl
    ? { type: tmpl.triggerType, label: tmpl.triggerLabel }
    : defaultTriggerTypes[module] || defaultTriggerTypes.crm;

  const nodes: Node[] = [
    {
      id: "trigger-1",
      type: "trigger",
      position: { x: 250, y: 50 },
      data: {
        label: trigger.label,
        trigger_type: trigger.type,
      },
    },
  ];

  if (tmpl?.actions) {
    tmpl.actions.forEach((action, i) => {
      nodes.push({
        id: `action-${i + 1}`,
        type: "action",
        position: { x: 250, y: 200 + i * 150 },
        // Spread `action.config` into `data` rather than nesting it
        // under `data.config`. NodeConfigPanel writes action fields
        // flat (e.g. `data.email_body`, `data.duration_value`) and the
        // backend's `WorkflowService.validate_workflow` reads them
        // flat — nesting under `data.config` made templates with
        // validated actions (send_email needs email_body) silently
        // fail the save with 400 and the user saw an empty canvas
        // after "saving."
        data: {
          label: action.label,
          action_type: action.type,
          ...action.config,
        },
      });
    });
  }

  return nodes;
}

export function getDefaultEdges(tmpl?: AutomationTemplate | null): Edge[] {
  if (!tmpl?.actions?.length) return [];
  const edges: Edge[] = [
    { id: "e-trigger-action-1", source: "trigger-1", target: "action-1" },
  ];
  for (let i = 1; i < tmpl.actions.length; i++) {
    edges.push({
      id: `e-action-${i}-action-${i + 1}`,
      source: `action-${i}`,
      target: `action-${i + 1}`,
    });
  }
  return edges;
}
