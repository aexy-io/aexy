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
  ClipboardCheck,
  Timer,
  TrendingDown,
  ShieldAlert,
  GraduationCap,
  Award,
  ScrollText,
  UserX,
  ShieldCheck,
  BookOpen,
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

interface NodeSubtype {
  value: string;
  label: string;
  icon: React.ElementType;
  description?: string;
}

interface NodeCategory {
  type: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  subtypes: NodeSubtype[];
}

// Trigger labels by module - maps trigger type to human-readable label
const TRIGGER_LABELS: Record<string, Record<string, string>> = {
  crm: {
    "record.created": "Record Created",
    "record.updated": "Record Updated",
    "record.deleted": "Record Deleted",
    "field.changed": "Field Changed",
    "list_entry.added": "Added to List",
    "list_entry.removed": "Removed from List",
    "status.changed": "Status Changed",
    "stage.changed": "Stage Changed",
    "schedule.daily": "Daily Schedule",
    "schedule.weekly": "Weekly Schedule",
    "date.approaching": "Date Approaching",
    "date.passed": "Date Passed",
    "webhook.received": "Webhook Received",
    "form.submitted": "Form Submitted",
    "email.opened": "Email Opened",
    "email.clicked": "Email Clicked",
    "email.replied": "Email Replied",
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
    "ticket.escalated": "Ticket Escalated",
    "sla.breached": "SLA Breached",
    "sla.warning": "SLA Warning",
    "response.received": "Response Received",
    "response.sent": "Response Sent",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
  hiring: {
    "candidate.created": "Candidate Added",
    "candidate.updated": "Candidate Updated",
    "candidate.stage_changed": "Stage Changed",
    "candidate.rejected": "Candidate Rejected",
    "candidate.hired": "Candidate Hired",
    "assessment.completed": "Assessment Completed",
    "assessment.score_above": "Score Above Threshold",
    "assessment.score_below": "Score Below Threshold",
    "requirement.created": "Requirement Created",
    "requirement.status_changed": "Requirement Status Changed",
    "interview.scheduled": "Interview Scheduled",
    "interview.completed": "Interview Completed",
    "offer.sent": "Offer Sent",
    "offer.accepted": "Offer Accepted",
    "offer.rejected": "Offer Rejected",
    "offer.declined": "Offer Declined",
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
    "email.complained": "Spam Complaint",
    "list.member_added": "Added to List",
    "recipient.added": "Recipient Added",
    "recipient.removed": "Recipient Removed",
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
    "task.completed": "Task Completed",
    "sprint.started": "Sprint Started",
    "sprint.completed": "Sprint Completed",
    "epic.completed": "Epic Completed",
    "blocker.created": "Blocker Created",
    "blocker.resolved": "Blocker Resolved",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
  forms: {
    "form.submitted": "Form Submitted",
    "form.started": "Form Started",
    "form.abandoned": "Form Abandoned",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
  booking: {
    "booking.created": "Booking Created",
    "booking.confirmed": "Booking Confirmed",
    "booking.cancelled": "Booking Cancelled",
    "booking.rescheduled": "Booking Rescheduled",
    "booking.completed": "Booking Completed",
    "booking.no_show": "No Show",
    "booking.reminder": "Booking Reminder",
    "event_type.created": "Event Type Created",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
  tracking: {
    "standup.submitted": "Standup Submitted",
    "standup.missed": "Standup Missed",
    "standup.streak": "Standup Streak",
    "time_entry.created": "Time Entry Created",
    "time_entry.threshold": "Time Threshold Crossed",
    "time_entry.anomaly": "Time Entry Anomaly",
    "blocker.created": "Blocker Created",
    "blocker.escalated": "Blocker Escalated",
    "blocker.resolved": "Blocker Resolved",
    "blocker.stale": "Blocker Stale",
    "blocker.pattern_detected": "Blocker Pattern Detected",
    "work_log.submitted": "Work Log Submitted",
    "sentiment.negative": "Negative Sentiment",
    "participation.low": "Low Participation",
    scheduled: "Scheduled",
    webhook_received: "Webhook Received",
    manual: "Manual",
  },
  compliance: {
    "training.created": "Training Created",
    "training.assigned": "Training Assigned",
    "training.started": "Training Started",
    "training.completed": "Training Completed",
    "training.waived": "Training Waived",
    "training.bulk_overdue": "Bulk Training Overdue",
    "assignment.approaching_due": "Assignment Due Soon",
    "assignment.overdue": "Assignment Overdue",
    "certification.added": "Certification Added",
    "certification.expiring": "Certification Expiring",
    "certification.expired": "Certification Expired",
    "certification.renewed": "Certification Renewed",
    "certification.revoked": "Certification Revoked",
    "certification.prerequisite_unmet": "Prerequisite Unmet",
    "compliance.status_changed": "Compliance Status Changed",
    "audit.logged": "Audit Event Logged",
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
    run_agent: "Run AI Agent",
    create_task: "Create Task",
    notify_user: "Notify User",
    notify_team: "Notify Team",
    wait: "Wait",
    condition: "Condition",
  },
  crm: {
    create_record: "Create Record",
    update_record: "Update Record",
    delete_record: "Delete Record",
    link_records: "Link Records",
    add_to_list: "Add to List",
    remove_from_list: "Remove from List",
    enroll_in_sequence: "Enroll in Sequence",
    enroll_sequence: "Enroll in Sequence",
    remove_from_sequence: "Remove from Sequence",
    unenroll_sequence: "Unenroll from Sequence",
    enrich_record: "Enrich Record",
    classify_record: "Classify Record",
    generate_summary: "Generate Summary",
    assign_owner: "Assign Owner",
  },
  tickets: {
    assign_ticket: "Assign Ticket",
    change_status: "Change Status",
    change_priority: "Change Priority",
    add_response: "Add Response",
    escalate: "Escalate",
    add_tag: "Add Tag",
    remove_tag: "Remove Tag",
    merge_tickets: "Merge Tickets",
    update_ticket: "Update Ticket",
  },
  hiring: {
    move_stage: "Move Stage",
    reject_candidate: "Reject Candidate",
    schedule_interview: "Schedule Interview",
    send_assessment: "Send Assessment",
    create_offer: "Create Offer",
    add_note: "Add Note",
    update_candidate: "Update Candidate",
    send_rejection: "Send Rejection",
    assign_recruiter: "Assign Recruiter",
  },
  email_marketing: {
    add_to_campaign: "Add to Campaign",
    remove_from_campaign: "Remove from Campaign",
    update_recipient: "Update Recipient",
    pause_campaign: "Pause Campaign",
    resume_campaign: "Resume Campaign",
    add_to_list: "Add to List",
    remove_from_list: "Remove from List",
    send_campaign: "Send Campaign",
    update_contact: "Update Contact",
    add_tag: "Add Tag",
  },
  uptime: {
    create_incident: "Create Incident",
    resolve_incident: "Resolve Incident",
    acknowledge_incident: "Acknowledge Incident",
    page_on_call: "Page On-Call",
    pause_monitor: "Pause Monitor",
    resume_monitor: "Resume Monitor",
  },
  sprints: {
    create_task: "Create Task",
    move_task: "Move Task",
    assign_task: "Assign Task",
    add_to_sprint: "Add to Sprint",
    remove_from_sprint: "Remove from Sprint",
    update_task: "Update Task",
    create_subtask: "Create Subtask",
    add_comment: "Add Comment",
  },
  forms: {
    create_crm_record: "Create CRM Record",
    create_record: "Create CRM Record",
    create_ticket: "Create Ticket",
    send_confirmation: "Send Confirmation",
    send_response: "Send Response",
    add_to_list: "Add to List",
  },
  booking: {
    confirm_booking: "Confirm Booking",
    cancel_booking: "Cancel Booking",
    reschedule_booking: "Reschedule",
    send_reminder: "Send Reminder",
  },
  tracking: {
    update_activity_pattern: "Update Activity Pattern",
    send_standup_reminder: "Send Standup Reminder",
    celebrate_streak: "Celebrate Streak",
    escalate_blocker: "Escalate Blocker",
    flag_anomaly: "Flag Anomaly",
  },
  compliance: {
    send_training_reminder: "Send Training Reminder",
    update_compliance_status: "Update Compliance Status",
    restrict_permissions: "Restrict Permissions",
    send_compliance_digest: "Send Compliance Digest",
  },
};

// Trigger descriptions by module - maps trigger type to a short description
// Used as fallback when API doesn't return descriptions (starts with "When...")
const TRIGGER_DESCRIPTIONS: Record<string, Record<string, string>> = {
  crm: {
    "record.created": "When a new CRM record is created",
    "record.updated": "When any field on a CRM record changes",
    "record.deleted": "When a CRM record is deleted",
    "field.changed": "When a specific field value changes on a record",
    "list_entry.added": "When a record is added to a CRM list",
    "list_entry.removed": "When a record is removed from a CRM list",
    "status.changed": "When a record's status transitions to a new value",
    "stage.changed": "When a record moves to a different pipeline stage",
    "schedule.daily": "When the daily schedule fires at a set time",
    "schedule.weekly": "When the weekly schedule fires on a set day",
    "date.approaching": "When a date field is approaching within a threshold",
    "date.passed": "When a date field has passed without action",
    "webhook.received": "When an external webhook payload is received",
    "form.submitted": "When a linked form is submitted",
    "email.opened": "When a tracked email is opened by a contact",
    "email.clicked": "When a link in a tracked email is clicked",
    "email.replied": "When a contact replies to a tracked email",
    // Legacy format support
    record_created: "When a new CRM record is created",
    record_updated: "When any field on a CRM record changes",
    record_deleted: "When a CRM record is deleted",
    field_changed: "When a specific field value changes on a record",
    stage_changed: "When a record moves to a different pipeline stage",
    scheduled: "When a scheduled time interval elapses",
    webhook_received: "When an external webhook payload is received",
    form_submitted: "When a linked form is submitted",
    email_received: "When an inbound email is received for a record",
    manual: "When manually triggered by a user",
  },
  tickets: {
    "ticket.created": "When a new support ticket is created",
    "ticket.updated": "When a ticket's details are modified",
    "ticket.status_changed": "When a ticket's status changes",
    "ticket.assigned": "When a ticket is assigned to an agent",
    "ticket.priority_changed": "When a ticket's priority level changes",
    "ticket.escalated": "When a ticket is escalated to a higher tier",
    "sla.warning": "When a ticket is approaching its SLA deadline",
    "sla.breached": "When a ticket exceeds its SLA response time",
    "response.received": "When a customer responds to a ticket",
    "response.sent": "When an agent sends a response on a ticket",
    scheduled: "When a scheduled time interval elapses",
    webhook_received: "When an external webhook payload is received",
    manual: "When manually triggered by a user",
  },
  hiring: {
    "candidate.created": "When a new candidate is added to the pipeline",
    "candidate.updated": "When a candidate's profile is updated",
    "candidate.stage_changed": "When a candidate moves to a new hiring stage",
    "candidate.rejected": "When a candidate is rejected from the pipeline",
    "candidate.hired": "When a candidate is marked as hired",
    "assessment.completed": "When a candidate completes an assessment",
    "assessment.score_above": "When an assessment score exceeds a threshold",
    "assessment.score_below": "When an assessment score falls below a threshold",
    "requirement.created": "When a new job requirement is created",
    "requirement.status_changed": "When a requirement's status changes",
    "interview.scheduled": "When an interview is scheduled with a candidate",
    "interview.completed": "When a scheduled interview is completed",
    "offer.sent": "When a job offer is sent to a candidate",
    "offer.accepted": "When a candidate accepts a job offer",
    "offer.rejected": "When a candidate declines a job offer",
    "offer.declined": "When a candidate declines a job offer",
    scheduled: "When a scheduled time interval elapses",
    webhook_received: "When an external webhook payload is received",
    manual: "When manually triggered by a user",
  },
  email_marketing: {
    "campaign.sent": "When an email campaign is sent to recipients",
    "campaign.scheduled": "When an email campaign is scheduled for sending",
    "email.opened": "When a recipient opens a campaign email",
    "email.clicked": "When a recipient clicks a link in a campaign",
    "email.bounced": "When a campaign email bounces back",
    "email.unsubscribed": "When a recipient unsubscribes from emails",
    "email.complained": "When a recipient marks a campaign as spam",
    "list.member_added": "When a contact is added to a mailing list",
    "recipient.added": "When a new recipient is added to a campaign",
    "recipient.removed": "When a recipient is removed from a campaign",
    scheduled: "When a scheduled time interval elapses",
    webhook_received: "When an external webhook payload is received",
    manual: "When manually triggered by a user",
  },
  uptime: {
    "monitor.created": "When a new uptime monitor is created",
    "monitor.down": "When a monitor detects a service is down",
    "monitor.up": "When a monitored service comes back online",
    "monitor.degraded": "When a monitor detects degraded performance",
    "incident.created": "When a new incident is created from a monitor",
    "incident.resolved": "When an open incident is resolved",
    "incident.acknowledged": "When a team member acknowledges an incident",
    "ssl.expiring": "When an SSL certificate is approaching expiration",
    scheduled: "When a scheduled time interval elapses",
    webhook_received: "When an external webhook payload is received",
    manual: "When manually triggered by a user",
  },
  sprints: {
    "task.created": "When a new task is created in a sprint or backlog",
    "task.status_changed": "When a task's status changes",
    "task.assigned": "When a task is assigned to a team member",
    "task.completed": "When a task is marked as completed",
    "sprint.started": "When a sprint is started",
    "sprint.completed": "When a sprint is completed",
    "epic.completed": "When all tasks in an epic are completed",
    "blocker.created": "When a blocker is reported on a task",
    "blocker.resolved": "When a task blocker is resolved",
    scheduled: "When a scheduled time interval elapses",
    webhook_received: "When an external webhook payload is received",
    manual: "When manually triggered by a user",
  },
  forms: {
    "form.submitted": "When a form submission is received",
    "form.started": "When a user begins filling out a form",
    "form.abandoned": "When a user abandons a partially filled form",
    scheduled: "When a scheduled time interval elapses",
    webhook_received: "When an external webhook payload is received",
    manual: "When manually triggered by a user",
  },
  booking: {
    "booking.created": "When a new booking is made",
    "booking.confirmed": "When a pending booking is confirmed",
    "booking.cancelled": "When a booking is cancelled",
    "booking.rescheduled": "When a booking is rescheduled to a new time",
    "booking.completed": "When a booked session is completed",
    "booking.no_show": "When a participant does not show up for a booking",
    "booking.reminder": "When a booking reminder is due to be sent",
    "event_type.created": "When a new bookable event type is created",
    scheduled: "When a scheduled time interval elapses",
    webhook_received: "When an external webhook payload is received",
    manual: "When manually triggered by a user",
  },
  tracking: {
    "standup.submitted": "When a team member submits their daily standup",
    "standup.missed": "When a team member misses their standup deadline",
    "standup.streak": "When a team member reaches a standup streak milestone",
    "time_entry.created": "When a new time entry is logged",
    "time_entry.threshold": "When logged hours cross a defined threshold",
    "time_entry.anomaly": "When an unusual time entry pattern is detected",
    "blocker.created": "When a new blocker is reported",
    "blocker.escalated": "When a blocker is escalated for attention",
    "blocker.resolved": "When a reported blocker is resolved",
    "blocker.stale": "When a blocker remains unresolved past its deadline",
    "blocker.pattern_detected": "When recurring blocker patterns are identified",
    "work_log.submitted": "When a work log entry is submitted",
    "sentiment.negative": "When negative sentiment is detected in standups",
    "participation.low": "When team participation drops below threshold",
    scheduled: "When a scheduled time interval elapses",
    webhook_received: "When an external webhook payload is received",
    manual: "When manually triggered by a user",
  },
  compliance: {
    "training.created": "When a new training program is created",
    "training.assigned": "When training is assigned to team members",
    "training.started": "When a team member starts a training module",
    "training.completed": "When a team member completes training",
    "training.waived": "When a training requirement is waived",
    "training.bulk_overdue": "When multiple training assignments become overdue",
    "assignment.approaching_due": "When a training assignment deadline is approaching",
    "assignment.overdue": "When a training assignment passes its due date",
    "certification.added": "When a new certification is added to a profile",
    "certification.expiring": "When a certification is approaching expiration",
    "certification.expired": "When a certification has expired",
    "certification.renewed": "When an expired certification is renewed",
    "certification.revoked": "When a certification is revoked",
    "certification.prerequisite_unmet": "When a certification prerequisite is not met",
    "compliance.status_changed": "When a member's compliance status changes",
    "audit.logged": "When a compliance audit event is logged",
    scheduled: "When a scheduled time interval elapses",
    webhook_received: "When an external webhook payload is received",
    manual: "When manually triggered by a user",
  },
};

// Action descriptions by module - maps action type to a short description
// Used as fallback when API doesn't return descriptions (starts with action verb)
const ACTION_DESCRIPTIONS: Record<string, Record<string, string>> = {
  common: {
    send_email: "Send an email to a specified recipient",
    send_slack: "Send a message to a Slack channel or user",
    send_sms: "Send an SMS text message to a phone number",
    webhook_call: "Make an HTTP request to an external webhook URL",
    api_request: "Send a custom API request to any endpoint",
    run_agent: "Execute an AI agent to process and respond",
    create_task: "Create a new task in a sprint project",
    notify_user: "Send an in-app notification to a specific user",
    notify_team: "Send a notification to an entire team",
    wait: "Pause the workflow for a specified duration",
    condition: "Evaluate a condition to branch the workflow",
  },
  crm: {
    create_record: "Create a new CRM record with specified values",
    update_record: "Update field values on an existing CRM record",
    delete_record: "Permanently delete a CRM record",
    link_records: "Create a relationship link between two records",
    add_to_list: "Add the record to a specified CRM list",
    remove_from_list: "Remove the record from a specified CRM list",
    enroll_in_sequence: "Enroll a contact into an email sequence",
    enroll_sequence: "Enroll a contact into an email sequence",
    remove_from_sequence: "Remove a contact from an active email sequence",
    unenroll_sequence: "Remove a contact from an active email sequence",
    enrich_record: "Enrich the record with data from external sources",
    classify_record: "Classify a record using AI scoring or categorization",
    generate_summary: "Generate an AI summary of the record's activity",
    assign_owner: "Assign an owner to the record",
  },
  tickets: {
    assign_ticket: "Assign the ticket to a specific agent or team",
    change_status: "Change the ticket's status to a new value",
    change_priority: "Update the ticket's priority level",
    add_response: "Add a response or internal note to the ticket",
    escalate: "Escalate the ticket to a higher support tier",
    add_tag: "Add a tag to the ticket for categorization",
    remove_tag: "Remove a tag from the ticket",
    merge_tickets: "Merge duplicate tickets into one",
    update_ticket: "Update ticket fields with new values",
  },
  hiring: {
    move_stage: "Move the candidate to a different hiring stage",
    reject_candidate: "Reject the candidate from the pipeline",
    schedule_interview: "Schedule an interview with the candidate",
    send_assessment: "Send an assessment to the candidate",
    create_offer: "Create a job offer for the candidate",
    add_note: "Add an internal note to the candidate's profile",
    update_candidate: "Update candidate profile information",
    send_rejection: "Send a rejection notification to the candidate",
    assign_recruiter: "Assign a recruiter to the candidate",
  },
  email_marketing: {
    add_to_campaign: "Add a contact to a marketing campaign",
    remove_from_campaign: "Remove a contact from a campaign",
    update_recipient: "Update a recipient's details in a campaign",
    pause_campaign: "Pause an active email campaign",
    resume_campaign: "Resume a paused email campaign",
    add_to_list: "Add a contact to a mailing list",
    remove_from_list: "Remove a contact from a mailing list",
    send_campaign: "Send an email campaign to its recipients",
    update_contact: "Update a marketing contact's information",
    add_tag: "Add a tag to a marketing contact",
  },
  uptime: {
    create_incident: "Create a new incident from a monitor alert",
    resolve_incident: "Mark an open incident as resolved",
    acknowledge_incident: "Acknowledge an incident to stop alerts",
    page_on_call: "Page the on-call responder for an incident",
    pause_monitor: "Pause an active uptime monitor",
    resume_monitor: "Resume a paused uptime monitor",
  },
  sprints: {
    create_task: "Create a new task in the sprint or backlog",
    move_task: "Move a task to a different status or sprint",
    assign_task: "Assign a task to a team member",
    add_to_sprint: "Add a backlog task to the current sprint",
    remove_from_sprint: "Remove a task from the current sprint",
    update_task: "Update task details or status",
    create_subtask: "Create a subtask under an existing task",
    add_comment: "Add a comment to a task",
  },
  forms: {
    create_crm_record: "Create a CRM record from form submission data",
    create_record: "Create a CRM record from form submission data",
    create_ticket: "Create a support ticket from the form submission",
    send_confirmation: "Send a confirmation email to the form submitter",
    send_response: "Send a response to the form submitter",
    add_to_list: "Add the submitter to a CRM or mailing list",
  },
  booking: {
    confirm_booking: "Confirm a pending booking automatically",
    cancel_booking: "Cancel a booking and notify the attendee",
    reschedule_booking: "Reschedule a booking to a new time slot",
    send_reminder: "Send a reminder notification before the booking",
  },
  tracking: {
    update_activity_pattern: "Update the team member's activity pattern analysis",
    send_standup_reminder: "Send a reminder to submit a daily standup",
    celebrate_streak: "Send a celebration for a standup streak milestone",
    escalate_blocker: "Escalate an unresolved blocker to management",
    flag_anomaly: "Flag an anomalous time entry for review",
  },
  compliance: {
    send_training_reminder: "Send a reminder for pending training assignments",
    update_compliance_status: "Update a member's compliance status",
    restrict_permissions: "Restrict permissions until compliance is met",
    send_compliance_digest: "Send a compliance status digest to stakeholders",
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
  // Tracking triggers
  "standup.submitted": ClipboardCheck,
  "standup.missed": AlertTriangle,
  "standup.streak": Award,
  "time_entry.created": Timer,
  "time_entry.threshold": TrendingDown,
  "time_entry.anomaly": AlertTriangle,
  "blocker.created": ShieldAlert,
  "blocker.escalated": AlertTriangle,
  "blocker.resolved": CheckSquare,
  "blocker.stale": Clock,
  "blocker.pattern_detected": BarChart3,
  "work_log.submitted": FileEdit,
  "sentiment.negative": TrendingDown,
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
  // CRM new triggers
  "list_entry.added": ListPlus,
  "list_entry.removed": ListMinus,
  "status.changed": RefreshCw,
  "schedule.daily": Calendar,
  "schedule.weekly": Calendar,
  "date.approaching": Clock,
  "date.passed": AlertTriangle,
  "webhook.received": Webhook,
  "email.replied": Mail,
  // Ticket new triggers
  "ticket.escalated": AlertTriangle,
  "response.received": MessageSquare,
  "response.sent": Send,
  // Hiring new triggers
  "candidate.rejected": UserX,
  "candidate.hired": UserCheck,
  "assessment.score_above": TrendingDown,
  "assessment.score_below": TrendingDown,
  "requirement.created": FilePlus,
  "requirement.status_changed": RefreshCw,
  "offer.declined": Trash2,
  // Email marketing new triggers
  "email.complained": AlertTriangle,
  "recipient.added": UserPlus,
  "recipient.removed": UserX,
  // Sprint new triggers
  "task.completed": CheckSquare,
  "epic.completed": CheckSquare,
  // Form new triggers
  "form.started": Play,
  "form.abandoned": UserX,
  // Booking new triggers
  "booking.completed": CheckSquare,
  "booking.no_show": UserX,
  "booking.reminder": Bell,
  "event_type.created": FilePlus,
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
  // Ticket new actions
  change_status: RefreshCw,
  merge_tickets: Merge,
  // Hiring new actions
  reject_candidate: UserX,
  send_assessment: Send,
  // Email marketing new actions
  add_to_campaign: ListPlus,
  remove_from_campaign: ListMinus,
  update_recipient: FileEdit,
  pause_campaign: Clock,
  resume_campaign: Play,
  // Uptime new actions
  acknowledge_incident: UserCheck,
  page_on_call: Bell,
  // Sprint new actions
  add_to_sprint: ListPlus,
  remove_from_sprint: ListMinus,
  // Form new actions
  create_crm_record: FilePlus,
  create_ticket: Ticket,
  send_confirmation: Mail,
  // Tracking actions
  update_activity_pattern: BarChart3,
  send_standup_reminder: Bell,
  celebrate_streak: Award,
  escalate_blocker: AlertTriangle,
  flag_anomaly: AlertTriangle,
  // Compliance actions
  send_training_reminder: Bell,
  update_compliance_status: ShieldCheck,
  restrict_permissions: ShieldAlert,
  send_compliance_digest: Mail,
};

// Fixed categories that don't change by module
const FIXED_CATEGORIES: Omit<NodeCategory, "subtypes">[] = [
  {
    type: "condition",
    label: "Conditions",
    icon: GitBranch,
    color: "text-amber-600 dark:text-amber-400",
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
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-500/20",
  },
  {
    type: "branch",
    label: "Branch",
    icon: Merge,
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-500/20",
  },
  {
    type: "join",
    label: "Join",
    icon: GitBranch,
    color: "text-teal-600 dark:text-teal-400",
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
    "record.created",
    "record.updated",
    "record.deleted",
    "field.changed",
    "list_entry.added",
    "list_entry.removed",
    "status.changed",
    "stage.changed",
    "schedule.daily",
    "schedule.weekly",
    "date.approaching",
    "date.passed",
    "webhook.received",
    "form.submitted",
    "email.opened",
    "email.clicked",
    "email.replied",
  ],
  tickets: [
    "ticket.created",
    "ticket.updated",
    "ticket.status_changed",
    "ticket.assigned",
    "ticket.priority_changed",
    "ticket.escalated",
    "sla.warning",
    "sla.breached",
    "response.received",
    "response.sent",
  ],
  hiring: [
    "candidate.created",
    "candidate.updated",
    "candidate.stage_changed",
    "candidate.rejected",
    "candidate.hired",
    "assessment.completed",
    "assessment.score_above",
    "assessment.score_below",
    "requirement.created",
    "requirement.status_changed",
    "offer.sent",
    "offer.accepted",
    "offer.declined",
  ],
  email_marketing: [
    "campaign.sent",
    "campaign.scheduled",
    "email.opened",
    "email.clicked",
    "email.bounced",
    "email.unsubscribed",
    "email.complained",
    "recipient.added",
    "recipient.removed",
  ],
  uptime: [
    "monitor.created",
    "monitor.down",
    "monitor.up",
    "monitor.degraded",
    "incident.created",
    "incident.resolved",
    "incident.acknowledged",
  ],
  sprints: [
    "task.created",
    "task.status_changed",
    "task.assigned",
    "task.completed",
    "sprint.started",
    "sprint.completed",
    "epic.completed",
    "blocker.created",
    "blocker.resolved",
  ],
  forms: [
    "form.submitted",
    "form.started",
    "form.abandoned",
  ],
  booking: [
    "booking.created",
    "booking.confirmed",
    "booking.cancelled",
    "booking.rescheduled",
    "booking.completed",
    "booking.no_show",
    "booking.reminder",
    "event_type.created",
  ],
  tracking: [
    "standup.submitted",
    "standup.missed",
    "standup.streak",
    "time_entry.created",
    "time_entry.threshold",
    "time_entry.anomaly",
    "blocker.created",
    "blocker.escalated",
    "blocker.resolved",
    "blocker.stale",
    "blocker.pattern_detected",
    "work_log.submitted",
    "sentiment.negative",
    "participation.low",
  ],
  compliance: [
    "training.created",
    "training.assigned",
    "training.started",
    "training.completed",
    "training.waived",
    "training.bulk_overdue",
    "assignment.approaching_due",
    "assignment.overdue",
    "certification.added",
    "certification.expiring",
    "certification.expired",
    "certification.renewed",
    "certification.revoked",
    "certification.prerequisite_unmet",
    "compliance.status_changed",
    "audit.logged",
  ],
};

// Fallback actions for when API fails or during loading
// These match the backend ACTION_REGISTRY: common actions + module-specific
const FALLBACK_ACTIONS: Record<string, string[]> = {
  crm: [
    "send_email",
    "send_slack",
    "send_sms",
    "webhook_call",
    "api_request",
    "run_agent",
    "create_task",
    "notify_user",
    "notify_team",
    "create_record",
    "update_record",
    "delete_record",
    "link_records",
    "add_to_list",
    "remove_from_list",
    "enroll_in_sequence",
    "remove_from_sequence",
    "enrich_record",
    "classify_record",
    "generate_summary",
  ],
  tickets: [
    "send_email",
    "send_slack",
    "send_sms",
    "webhook_call",
    "api_request",
    "run_agent",
    "create_task",
    "notify_user",
    "notify_team",
    "assign_ticket",
    "change_status",
    "change_priority",
    "add_response",
    "escalate",
    "add_tag",
    "remove_tag",
    "merge_tickets",
  ],
  hiring: [
    "send_email",
    "send_slack",
    "send_sms",
    "webhook_call",
    "api_request",
    "run_agent",
    "create_task",
    "notify_user",
    "notify_team",
    "move_stage",
    "reject_candidate",
    "schedule_interview",
    "send_assessment",
    "create_offer",
    "add_note",
  ],
  email_marketing: [
    "send_email",
    "send_slack",
    "send_sms",
    "webhook_call",
    "api_request",
    "run_agent",
    "create_task",
    "notify_user",
    "notify_team",
    "add_to_campaign",
    "remove_from_campaign",
    "update_recipient",
    "pause_campaign",
    "resume_campaign",
  ],
  uptime: [
    "send_email",
    "send_slack",
    "send_sms",
    "webhook_call",
    "api_request",
    "run_agent",
    "create_task",
    "notify_user",
    "notify_team",
    "create_incident",
    "resolve_incident",
    "acknowledge_incident",
    "page_on_call",
  ],
  sprints: [
    "send_email",
    "send_slack",
    "send_sms",
    "webhook_call",
    "api_request",
    "run_agent",
    "create_task",
    "notify_user",
    "notify_team",
    "move_task",
    "assign_task",
    "add_to_sprint",
    "remove_from_sprint",
  ],
  forms: [
    "send_email",
    "send_slack",
    "send_sms",
    "webhook_call",
    "api_request",
    "run_agent",
    "create_task",
    "notify_user",
    "notify_team",
    "create_crm_record",
    "create_ticket",
    "send_confirmation",
  ],
  booking: [
    "send_email",
    "send_slack",
    "send_sms",
    "webhook_call",
    "api_request",
    "run_agent",
    "create_task",
    "notify_user",
    "notify_team",
    "confirm_booking",
    "cancel_booking",
    "reschedule_booking",
    "send_reminder",
  ],
  tracking: [
    "send_email",
    "send_slack",
    "send_sms",
    "webhook_call",
    "api_request",
    "run_agent",
    "create_task",
    "notify_user",
    "notify_team",
    "update_activity_pattern",
    "send_standup_reminder",
    "celebrate_streak",
    "escalate_blocker",
    "flag_anomaly",
  ],
  compliance: [
    "send_email",
    "send_slack",
    "send_sms",
    "webhook_call",
    "api_request",
    "run_agent",
    "create_task",
    "notify_user",
    "notify_team",
    "send_training_reminder",
    "update_compliance_status",
    "restrict_permissions",
    "send_compliance_digest",
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

function getTriggerDescription(module: string, triggerType: string, apiDescriptions?: Record<string, string>): string | undefined {
  // API descriptions take priority
  if (apiDescriptions && apiDescriptions[triggerType]) {
    return apiDescriptions[triggerType];
  }
  // Check module-specific fallback descriptions
  const moduleDescs = TRIGGER_DESCRIPTIONS[module];
  if (moduleDescs && moduleDescs[triggerType]) {
    return moduleDescs[triggerType];
  }
  return undefined;
}

function getActionDescription(module: string, actionType: string, apiDescriptions?: Record<string, string>): string | undefined {
  // API descriptions take priority
  if (apiDescriptions && apiDescriptions[actionType]) {
    return apiDescriptions[actionType];
  }
  // Check module-specific fallback descriptions
  const moduleDescs = ACTION_DESCRIPTIONS[module];
  if (moduleDescs && moduleDescs[actionType]) {
    return moduleDescs[actionType];
  }
  // Check common descriptions
  const commonDescs = ACTION_DESCRIPTIONS.common;
  if (commonDescs && commonDescs[actionType]) {
    return commonDescs[actionType];
  }
  return undefined;
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
  const { triggers: registryTriggers, descriptions: triggerApiDescs, isLoading: triggersLoading } = useModuleTriggers(workspaceId, module);
  const { actions: registryActions, descriptions: actionApiDescs, isLoading: actionsLoading } = useModuleActions(workspaceId, module);

  // Build dynamic categories based on registry data
  const nodeCategories = useMemo(() => {
    // Use registry data if available, otherwise fallback
    const triggers = registryTriggers.length > 0 ? registryTriggers : (FALLBACK_TRIGGERS[module] || []);
    const actions = registryActions.length > 0 ? registryActions : (FALLBACK_ACTIONS[module] || []);

    // Build trigger subtypes
    const triggerSubtypes: NodeSubtype[] = triggers.map((t) => ({
      value: t,
      label: getTriggerLabel(module, t),
      icon: getTriggerIcon(t),
      description: getTriggerDescription(module, t, triggerApiDescs),
    }));

    // Build action subtypes
    const actionSubtypes: NodeSubtype[] = actions.map((a) => ({
      value: a,
      label: getActionLabel(module, a),
      icon: getActionIcon(a),
      description: getActionDescription(module, a, actionApiDescs),
    }));

    // Build categories
    const categories: NodeCategory[] = [
      {
        type: "trigger",
        label: "Triggers",
        icon: Zap,
        color: "text-emerald-600 dark:text-emerald-400",
        bgColor: "bg-emerald-500/20",
        subtypes: triggerSubtypes,
      },
      {
        type: "action",
        label: "Actions",
        icon: Play,
        color: "text-blue-600 dark:text-blue-400",
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
  }, [module, registryTriggers, registryActions, triggerApiDescs, actionApiDescs]);

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
      <div className="w-14 bg-muted/50 border-r border-border flex flex-col">
        <button
          onClick={onToggleCollapse}
          className="p-3 border-b border-border hover:bg-accent/50"
          title="Expand palette"
        >
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {nodeCategories.map((category) => (
            <button
              key={category.type}
              onClick={() => onAddNode(category.type)}
              className={`w-full p-2 rounded-lg hover:bg-accent/50 flex items-center justify-center ${category.bgColor}`}
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
    <div className="w-64 bg-muted/50 border-r border-border overflow-y-auto hidden md:block">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-foreground font-semibold">Node Palette</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Drag nodes to canvas or click to add
          </p>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground lg:hidden"
            title="Collapse palette"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
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
                  hover:bg-accent/50 transition-colors group
                  ${hasSubtypes ? "" : "cursor-grab active:cursor-grabbing"}
                `}
              >
                <div className={`p-1.5 rounded-lg ${category.bgColor}`}>
                  <category.icon className={`h-4 w-4 ${category.color}`} />
                </div>
                <span className="text-foreground font-medium text-sm flex-1 text-left">
                  {category.label}
                </span>
                {hasSubtypes && (
                  <span className="text-muted-foreground">
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
                      title={subtype.description || subtype.label}
                      className={`
                        w-full flex items-center gap-2 px-3 py-1.5 rounded-lg
                        hover:bg-accent/50 transition-colors
                        cursor-grab active:cursor-grabbing
                      `}
                    >
                      <subtype.icon className={`h-3.5 w-3.5 shrink-0 ${category.color}`} />
                      <span className="text-foreground text-sm truncate">
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
