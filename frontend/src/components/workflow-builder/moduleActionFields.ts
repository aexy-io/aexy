/**
 * Config fields for module-specific action steps.
 *
 * Every module action had an executor and no panel: the builder fell through to
 * "Configuration for this action type will be applied when the workflow runs"
 * with nothing to fill in, so a step could be added but never configured — and
 * then failed at run time on the id or value it needed.
 *
 * These are declarations rather than 38 hand-written JSX blocks, and each `key`
 * is the key the executor actually reads (verified against
 * CRMAutomationService._action_* and services/automation_module_actions.py).
 * Renaming one here silently disconnects the field, which is the exact bug this
 * file exists to fix — so keep them in step with the executor.
 */

export interface ModuleActionField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "number";
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Shown under the field. */
  help?: string;
  /** Renders a required marker; the executor is the one that enforces it. */
  required?: boolean;
  /** Field accepts {{record.values.x}} / {{trigger.x}} templating. */
  supportsVariables?: boolean;
}

export interface ModuleActionSpec {
  /** One line about what the step does, above the fields. */
  summary: string;
  fields: ModuleActionField[];
}

const TICKET_STATUSES = [
  { value: "new", label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_on_submitter", label: "Waiting on submitter" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const TICKET_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const RECIPIENT_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "opened", label: "Opened" },
  { value: "clicked", label: "Clicked" },
  { value: "bounced", label: "Bounced" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "failed", label: "Failed" },
];

/** Every entity-id field carries this: the executor falls back to the trigger. */
const fromTrigger = (entity: string) =>
  `Leave empty to use the ${entity} that triggered this run.`;

const ticketId: ModuleActionField = {
  key: "ticket_id",
  label: "Ticket",
  type: "text",
  placeholder: "{{trigger.ticket_id}}",
  help: fromTrigger("ticket"),
  supportsVariables: true,
};

const candidateId: ModuleActionField = {
  key: "candidate_id",
  label: "Candidate",
  type: "text",
  placeholder: "{{trigger.candidate_id}}",
  help: fromTrigger("candidate"),
  supportsVariables: true,
};

const taskId: ModuleActionField = {
  key: "task_id",
  label: "Task",
  type: "text",
  placeholder: "{{trigger.task_id}}",
  help: fromTrigger("task"),
  supportsVariables: true,
};

const monitorId: ModuleActionField = {
  key: "monitor_id",
  label: "Monitor",
  type: "text",
  placeholder: "{{trigger.monitor_id}}",
  help: fromTrigger("monitor"),
  supportsVariables: true,
};

const bookingId: ModuleActionField = {
  key: "booking_id",
  label: "Booking",
  type: "text",
  placeholder: "{{trigger.booking_id}}",
  help: fromTrigger("booking"),
  supportsVariables: true,
};

const campaignId: ModuleActionField = {
  key: "campaign_id",
  label: "Campaign",
  type: "text",
  placeholder: "{{trigger.campaign_id}}",
  help: fromTrigger("campaign"),
  required: true,
  supportsVariables: true,
};

const recipientEmail: ModuleActionField = {
  key: "email",
  label: "Recipient email",
  type: "text",
  placeholder: "{{record.values.email}}",
  required: true,
  supportsVariables: true,
};

export const MODULE_ACTION_FIELDS: Record<string, ModuleActionSpec> = {
  // ---- Tickets ----------------------------------------------------------
  assign_ticket: {
    summary: "Assign the ticket to an agent or a team.",
    fields: [
      ticketId,
      { key: "assignee_id", label: "Assignee (developer ID)", type: "text", supportsVariables: true },
      { key: "team_id", label: "Team ID", type: "text", help: "Used when no assignee is given.", supportsVariables: true },
    ],
  },
  change_status: {
    summary: "Move the ticket to a different status.",
    fields: [
      ticketId,
      { key: "status", label: "New status", type: "select", options: TICKET_STATUSES, required: true },
    ],
  },
  change_priority: {
    summary: "Change the ticket's priority.",
    fields: [
      ticketId,
      { key: "priority", label: "New priority", type: "select", options: TICKET_PRIORITIES, required: true },
    ],
  },
  update_ticket: {
    summary: "Update several ticket fields at once. Empty fields are left alone.",
    fields: [
      ticketId,
      { key: "status", label: "Status", type: "select", options: TICKET_STATUSES },
      { key: "priority", label: "Priority", type: "select", options: TICKET_PRIORITIES },
      { key: "severity", label: "Severity", type: "text", placeholder: "sev1 / sev2 / sev3" },
    ],
  },
  escalate: {
    summary: "Escalate the ticket through the escalation matrix.",
    fields: [
      ticketId,
      { key: "level", label: "Escalation level", type: "text", placeholder: "level_1" },
    ],
  },
  add_response: {
    summary: "Post a reply on the ticket.",
    fields: [
      ticketId,
      {
        key: "message",
        label: "Message",
        type: "textarea",
        required: true,
        supportsVariables: true,
        placeholder: "Thanks {{trigger.submitter_name}} — we're on it.",
      },
      {
        key: "is_internal",
        label: "Internal note (not sent to the submitter)",
        type: "checkbox",
        help:
          "Internal notes dispatch no events. A customer-visible reply needs an author below — without one it is recorded as the submitter's reply and can retrigger this automation.",
      },
      { key: "author_id", label: "Reply as (developer ID)", type: "text", help: "Required for customer-visible replies." },
    ],
  },
  add_tag: {
    summary: "Add a tag to the ticket.",
    fields: [ticketId, { key: "tag", label: "Tag", type: "text", required: true, supportsVariables: true }],
  },
  remove_tag: {
    summary: "Remove a tag from the ticket.",
    fields: [ticketId, { key: "tag", label: "Tag", type: "text", required: true, supportsVariables: true }],
  },
  merge_tickets: {
    summary: "Close this ticket and link it into another one.",
    fields: [
      ticketId,
      {
        key: "into_ticket_id",
        label: "Merge into ticket",
        type: "text",
        required: true,
        supportsVariables: true,
        help: "The surviving ticket. Replies are not moved; the closed ticket stays linked from it.",
      },
    ],
  },

  // ---- Hiring -----------------------------------------------------------
  move_stage: {
    summary: "Move the candidate to a different hiring stage.",
    fields: [
      candidateId,
      { key: "stage", label: "Stage", type: "text", required: true, placeholder: "screening / interview / offer" },
    ],
  },
  reject_candidate: {
    summary: "Mark the candidate rejected, with the reason recorded.",
    fields: [
      candidateId,
      { key: "reason", label: "Reason", type: "textarea", supportsVariables: true },
    ],
  },
  send_assessment: {
    summary: "Assign an assessment to the candidate.",
    fields: [
      candidateId,
      { key: "assessment_id", label: "Assessment ID", type: "text", required: true },
    ],
  },
  add_note: {
    summary: "Append an internal note to the candidate.",
    fields: [
      candidateId,
      { key: "note", label: "Note", type: "textarea", required: true, supportsVariables: true },
    ],
  },
  create_offer: {
    summary: "Record an offer and move the candidate to the offer stage.",
    fields: [
      candidateId,
      { key: "position", label: "Position", type: "text", supportsVariables: true },
      { key: "salary", label: "Salary", type: "text", supportsVariables: true },
      { key: "start_date", label: "Start date", type: "text", placeholder: "2026-09-01" },
      { key: "notes", label: "Notes", type: "textarea", supportsVariables: true },
    ],
  },
  update_candidate: {
    summary: "Update the candidate's status, rating or notes.",
    fields: [
      candidateId,
      { key: "status", label: "Status", type: "text" },
      { key: "rating", label: "Rating", type: "number" },
      { key: "notes", label: "Notes", type: "textarea", supportsVariables: true },
    ],
  },
  schedule_interview: {
    summary: "Schedule an interview with the candidate.",
    fields: [
      candidateId,
      { key: "interviewer_id", label: "Interviewer (developer ID)", type: "text" },
      { key: "interview_type", label: "Interview type", type: "text", placeholder: "screening / technical / final" },
      { key: "scheduled_at", label: "Scheduled at", type: "text", placeholder: "2026-09-01T10:00:00Z", supportsVariables: true },
      { key: "duration_minutes", label: "Duration (minutes)", type: "number" },
      { key: "notes", label: "Notes", type: "textarea", supportsVariables: true },
    ],
  },

  // ---- Uptime -----------------------------------------------------------
  create_incident: {
    summary: "Open an incident for a monitor.",
    fields: [
      monitorId,
      { key: "error_message", label: "Error message", type: "textarea", supportsVariables: true },
      { key: "error_type", label: "Error type", type: "text", placeholder: "manual / timeout / connection" },
    ],
  },
  resolve_incident: {
    summary: "Resolve an open incident.",
    fields: [
      { key: "incident_id", label: "Incident", type: "text", placeholder: "{{trigger.incident_id}}", help: fromTrigger("incident"), supportsVariables: true },
      monitorId,
      { key: "resolution_notes", label: "Resolution notes", type: "textarea", supportsVariables: true },
      { key: "root_cause", label: "Root cause", type: "text", supportsVariables: true },
    ],
  },
  acknowledge_incident: {
    summary: "Acknowledge an open incident.",
    fields: [
      { key: "incident_id", label: "Incident", type: "text", placeholder: "{{trigger.incident_id}}", help: fromTrigger("incident"), supportsVariables: true },
      {
        key: "acknowledged_by_id",
        label: "Acknowledged by (developer ID)",
        type: "text",
        required: true,
        help: "An acknowledgement has to name a responder.",
      },
    ],
  },
  pause_monitor: { summary: "Pause the monitor's checks.", fields: [monitorId] },
  resume_monitor: { summary: "Resume the monitor's checks.", fields: [monitorId] },

  // ---- Sprints ----------------------------------------------------------
  move_task: {
    summary: "Move the task to another status column.",
    fields: [
      taskId,
      { key: "status", label: "Status", type: "text", required: true, placeholder: "backlog / todo / in_progress / review / done" },
      { key: "sprint_id", label: "Sprint ID", type: "text", help: "Optional: also move it into this sprint." },
    ],
  },
  assign_task: {
    summary: "Assign the task to a team member.",
    fields: [
      taskId,
      { key: "assignee_id", label: "Assignee (developer ID)", type: "text", supportsVariables: true },
      { key: "reason", label: "Reason", type: "text", supportsVariables: true },
    ],
  },
  add_to_sprint: {
    summary: "Move the task into a sprint.",
    fields: [
      taskId,
      { key: "sprint_id", label: "Sprint ID", type: "text", required: true, supportsVariables: true },
    ],
  },
  remove_from_sprint: {
    summary: "Take the task out of its sprint, back to the backlog.",
    fields: [taskId],
  },
  update_task: {
    summary: "Update task fields. Empty fields are left alone.",
    fields: [
      taskId,
      { key: "title", label: "Title", type: "text", supportsVariables: true },
      { key: "description", label: "Description", type: "textarea", supportsVariables: true },
      { key: "status", label: "Status", type: "text" },
      { key: "priority", label: "Priority", type: "text", placeholder: "critical / high / medium / low" },
      { key: "story_points", label: "Story points", type: "number" },
    ],
  },
  create_subtask: {
    summary: "Create a subtask under a parent task.",
    fields: [
      { key: "parent_task_id", label: "Parent task", type: "text", placeholder: "{{trigger.task_id}}", help: fromTrigger("task"), supportsVariables: true },
      { key: "title", label: "Title", type: "text", required: true, supportsVariables: true },
      { key: "description", label: "Description", type: "textarea", supportsVariables: true },
      { key: "priority", label: "Priority", type: "text" },
      { key: "assignee_id", label: "Assignee (developer ID)", type: "text" },
    ],
  },

  // ---- Email marketing --------------------------------------------------
  add_to_campaign: {
    summary: "Add a recipient to a campaign. Re-running does not duplicate them.",
    fields: [
      campaignId,
      recipientEmail,
      { key: "recipient_name", label: "Recipient name", type: "text", supportsVariables: true },
    ],
  },
  remove_from_campaign: {
    summary: "Remove a recipient from a campaign before it sends.",
    fields: [campaignId, recipientEmail],
  },
  update_recipient: {
    summary: "Update a campaign recipient.",
    fields: [
      campaignId,
      recipientEmail,
      { key: "status", label: "Status", type: "select", options: RECIPIENT_STATUSES },
      { key: "recipient_name", label: "Recipient name", type: "text", supportsVariables: true },
    ],
  },
  pause_campaign: { summary: "Pause a sending campaign.", fields: [campaignId] },
  resume_campaign: { summary: "Resume a paused campaign.", fields: [campaignId] },

  // ---- Booking ----------------------------------------------------------
  confirm_booking: { summary: "Confirm a pending booking.", fields: [bookingId] },
  cancel_booking: {
    summary: "Cancel a booking.",
    fields: [bookingId, { key: "reason", label: "Reason", type: "textarea", supportsVariables: true }],
  },
  reschedule_booking: {
    summary: "Move a booking to a new time.",
    fields: [
      bookingId,
      { key: "new_start_time", label: "New start time", type: "text", required: true, placeholder: "2026-09-01T10:00:00Z", supportsVariables: true },
      { key: "new_end_time", label: "New end time", type: "text", placeholder: "2026-09-01T10:30:00Z", supportsVariables: true },
      { key: "reason", label: "Reason", type: "text", supportsVariables: true },
    ],
  },
  send_reminder: {
    summary: "Send a booking reminder by email or Slack.",
    fields: [
      {
        key: "channel",
        label: "Channel",
        type: "select",
        options: [
          { value: "email", label: "Email" },
          { value: "slack", label: "Slack" },
        ],
      },
      { key: "to", label: "Email to", type: "text", placeholder: "{{trigger.email}}", help: "Email channel. Falls back to the record's email, then the booking's attendee.", supportsVariables: true },
      { key: "subject", label: "Subject", type: "text", supportsVariables: true },
      { key: "channel_id", label: "Slack channel ID", type: "text", help: "Slack channel only." },
      { key: "message", label: "Message", type: "textarea", supportsVariables: true },
    ],
  },

  // ---- Forms ------------------------------------------------------------
  create_crm_record: {
    summary: "Create a CRM record from the submission.",
    fields: [
      { key: "object_id", label: "CRM object ID", type: "text", required: true, help: "Which object to create the record on." },
    ],
  },
  create_ticket: {
    summary: "Open a support ticket from the submission.",
    fields: [
      { key: "ticket_form_id", label: "Ticket form ID", type: "text", required: true, help: "The Service Desk form the ticket is filed against." },
      { key: "submitter_email", label: "Submitter email", type: "text", placeholder: "{{trigger.data.email}}", supportsVariables: true },
      { key: "submitter_name", label: "Submitter name", type: "text", placeholder: "{{trigger.data.name}}", supportsVariables: true },
    ],
  },

  // ---- Tracking ---------------------------------------------------------
  escalate_blocker: {
    summary: "Escalate a blocker.",
    fields: [
      { key: "blocker_id", label: "Blocker", type: "text", placeholder: "{{trigger.blocker_id}}", help: fromTrigger("blocker"), supportsVariables: true },
      { key: "escalate_to_id", label: "Escalate to (developer ID)", type: "text" },
    ],
  },
  flag_anomaly: {
    summary: "Flag a time entry for review.",
    fields: [
      { key: "time_entry_id", label: "Time entry", type: "text", placeholder: "{{trigger.time_entry_id}}", help: fromTrigger("time entry"), supportsVariables: true },
      { key: "reason", label: "Reason", type: "textarea", supportsVariables: true },
    ],
  },

  // ---- Compliance -------------------------------------------------------
  waive_training: {
    summary: "Waive a training assignment.",
    fields: [
      { key: "assignment_id", label: "Assignment", type: "text", placeholder: "{{trigger.assignment_id}}", help: fromTrigger("assignment"), supportsVariables: true },
      { key: "waived_by_id", label: "Approved by (developer ID)", type: "text", required: true, help: "A waiver has to name an approver." },
      {
        key: "reason",
        label: "Reason",
        type: "textarea",
        required: true,
        supportsVariables: true,
        help: "At least 10 characters — a waived compliance requirement has to say why.",
      },
    ],
  },
};

/** Action types that have their own panel section above the generic fallback. */
export const MODULE_ACTION_TYPES = new Set(Object.keys(MODULE_ACTION_FIELDS));
