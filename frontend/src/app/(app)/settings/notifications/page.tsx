"use client";

import { useState } from "react";
import {
  Bell,
  BellRing,
  Mail,
  MessageSquare,
  Monitor,
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Hash,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationPreferences } from "@/hooks/useNotifications";
import { useWebPush } from "@/hooks/useWebPush";
import { toast } from "sonner";

// Complete event type labels covering all 37+ event types
const EVENT_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  // Reviews & Goals
  peer_review_requested: { label: "Peer review requested", description: "When someone requests your review" },
  peer_review_received: { label: "Peer review received", description: "When someone submits a review for you" },
  review_cycle_phase_changed: { label: "Review cycle phase changed", description: "When a review cycle moves to a new phase" },
  manager_review_completed: { label: "Manager review completed", description: "When your manager completes your review" },
  review_acknowledged: { label: "Review acknowledged", description: "When a team member acknowledges their review" },
  goal_auto_linked: { label: "Goal auto-linked", description: "When contributions are automatically linked to your goal" },
  goal_at_risk: { label: "Goal at risk", description: "When one of your goals is flagged as at risk" },
  goal_completed: { label: "Goal completed", description: "When you complete a goal" },
  // Reminders
  deadline_reminder_1_day: { label: "Deadline reminder (1 day)", description: "Reminder 1 day before a deadline" },
  deadline_reminder_day_of: { label: "Deadline reminder (same day)", description: "Reminder on the day of a deadline" },
  reminder_due: { label: "Reminder due", description: "When a reminder reaches its due time" },
  reminder_acknowledged: { label: "Reminder acknowledged", description: "When someone acknowledges a reminder" },
  reminder_completed: { label: "Reminder completed", description: "When a reminder is marked as completed" },
  reminder_escalated: { label: "Reminder escalated", description: "When a reminder is escalated" },
  reminder_overdue: { label: "Reminder overdue", description: "When a reminder passes its due time" },
  reminder_assigned: { label: "Reminder assigned", description: "When a reminder is assigned to you" },
  // On-call
  oncall_shift_starting: { label: "Shift starting soon", description: "Reminder before your on-call shift begins" },
  oncall_shift_started: { label: "Shift started", description: "When your on-call shift begins" },
  oncall_shift_ending: { label: "Shift ending soon", description: "Reminder before your on-call shift ends" },
  oncall_swap_requested: { label: "Swap requested", description: "When someone requests to swap shifts with you" },
  oncall_swap_accepted: { label: "Swap accepted", description: "When your swap request is accepted" },
  oncall_swap_declined: { label: "Swap declined", description: "When your swap request is declined" },
  // Workspace
  workspace_invite: { label: "Workspace invitation", description: "When you're invited to a workspace" },
  team_added: { label: "Added to team", description: "When you're added to a new team" },
  // Mentions
  task_mentioned: { label: "Mentioned in task", description: "When you're @mentioned in a task description" },
  mention: { label: "Mentioned in comment", description: "When you're @mentioned in a comment or note" },
  // Billing & Usage
  usage_alert_80: { label: "Usage at 80%", description: "When you've used 80% of a resource limit" },
  usage_alert_90: { label: "Usage at 90%", description: "When you've used 90% of a resource limit (critical)" },
  usage_alert_100: { label: "Limit reached", description: "When you've reached a resource limit" },
  // Insights
  insight_alert_warning: { label: "Insight warning", description: "When an insight metric triggers a warning" },
  insight_alert_critical: { label: "Insight critical alert", description: "When an insight metric triggers a critical alert" },
  // Leave
  leave_request_submitted: { label: "Leave request submitted", description: "When a team member submits a leave request" },
  leave_request_approved: { label: "Leave request approved", description: "When your leave request is approved" },
  leave_request_rejected: { label: "Leave request rejected", description: "When your leave request is rejected" },
  leave_request_cancelled: { label: "Leave request cancelled", description: "When a leave request is cancelled" },
  // App Access
  app_access_requested: { label: "Access requested", description: "When someone requests access to an app" },
  app_access_approved: { label: "Access approved", description: "When your access request is approved" },
  app_access_rejected: { label: "Access rejected", description: "When your access request is declined" },
  // Agents
  agent_invoked: { label: "Agent working", description: "When an AI agent starts processing your request" },
  agent_tool_blocked: { label: "Agent tool blocked", description: "When an agent's tool call is blocked by a policy" },
  agent_approval_required: { label: "Agent action needs approval", description: "When an agent action requires admin approval before proceeding" },
  agent_config_changed: { label: "Agent config changed", description: "When an agent's configuration is modified" },
  // Blocker escalation
  blocker_escalated: { label: "Blocker escalated", description: "When a blocker is escalated due to being active too long" },
  // Uptime
  uptime_incident_created: { label: "Service down", description: "When a monitored service goes down" },
  uptime_incident_resolved: { label: "Service recovered", description: "When a monitored service comes back up" },
  // Learning
  learning_approval_requested: { label: "Approval requested", description: "When someone requests learning approval" },
  learning_approval_decided: { label: "Approval decided", description: "When your learning request is approved or rejected" },
  learning_goal_assigned: { label: "Goal assigned", description: "When a learning goal is assigned to you" },
  learning_goal_overdue: { label: "Goal overdue", description: "When a learning goal passes its due date" },
  learning_activity_completed: { label: "Activity completed", description: "When you complete a learning activity" },
  // Forms
  form_submission_received: { label: "Submission received", description: "When a new form submission comes in" },
  form_submission_failed: { label: "Submission failed", description: "When a form submission fails to process" },
  // Campaigns
  campaign_completed: { label: "Campaign completed", description: "When an email campaign finishes sending" },
  campaign_scheduled: { label: "Campaign scheduled", description: "When a campaign is scheduled for sending" },
  // Automations
  automation_run_failed: { label: "Automation failed", description: "When an automation run encounters an error" },
  automation_run_completed: { label: "Automation completed", description: "When an automation run completes successfully" },
  // Hiring / Assessments
  assessment_invitation_sent: { label: "Assessment published", description: "When an assessment is published with invitations" },
  assessment_completed: { label: "Assessment completed", description: "When a candidate completes an assessment" },
  candidate_stage_changed: { label: "Candidate stage changed", description: "When a candidate moves to a new hiring stage" },
  // GTM
  gtm_alert_triggered: { label: "GTM alert triggered", description: "When a go-to-market alert condition is met" },
  // Documents
  document_shared: { label: "Document shared", description: "When someone shares a document with you" },
  document_mentioned: { label: "Mentioned in document", description: "When you're @mentioned in a document" },
  document_commented: { label: "Document comment", description: "When someone comments on your document" },
  // Chat
  chat_mention: { label: "Chat mention", description: "When you're @mentioned in a chat message" },
  ai_conversation_shared: { label: "AI conversation shared", description: "When someone shares an AI conversation with you" },
};

const CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
  reviews_and_goals: { label: "Reviews & Goals", description: "Performance reviews, peer feedback, and goal tracking" },
  reminders: { label: "Reminders", description: "Deadlines, due dates, and task reminders" },
  on_call: { label: "On-Call", description: "Shift schedules, swaps, and on-call alerts" },
  workspace: { label: "Workspace", description: "Workspace invitations and team membership" },
  mentions: { label: "Mentions", description: "When you're @mentioned in tasks or comments" },
  billing_and_usage: { label: "Billing & Usage", description: "Resource usage alerts and limits" },
  insights: { label: "Insights", description: "Metric warnings and critical alerts" },
  leave: { label: "Leave", description: "Leave requests and approvals" },
  app_access: { label: "App Access", description: "Application access requests and approvals" },
  agents: { label: "Agents", description: "AI agent invocations and status updates" },
  uptime: { label: "Uptime", description: "Service monitoring incidents and recovery alerts" },
  learning: { label: "Learning", description: "Learning goals, approvals, and activity completion" },
  forms: { label: "Forms", description: "Form submissions and processing status" },
  campaigns: { label: "Campaigns", description: "Email campaign scheduling and delivery" },
  automations: { label: "Automations", description: "Automation run status and failures" },
  hiring: { label: "Hiring", description: "Assessments, invitations, and candidate updates" },
  gtm: { label: "GTM", description: "Go-to-market alerts and pipeline events" },
  documents: { label: "Documents", description: "Document sharing, mentions, and comments" },
  chat: { label: "Chat", description: "Chat mentions and AI conversation sharing" },
};

type ChannelKey = "in_app_enabled" | "email_enabled" | "slack_enabled" | "web_push_enabled";

const CHANNELS: { key: ChannelKey; label: string; icon: React.ElementType }[] = [
  { key: "in_app_enabled", label: "In-App", icon: Monitor },
  { key: "email_enabled", label: "Email", icon: Mail },
  { key: "slack_enabled", label: "Slack", icon: MessageSquare },
  { key: "web_push_enabled", label: "Push", icon: BellRing },
];

function ChannelToggle({
  enabled,
  onToggle,
  label,
  icon: Icon,
  isUpdating,
}: {
  enabled: boolean;
  onToggle: () => void;
  label: string;
  icon: React.ElementType;
  isUpdating?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={isUpdating}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition ${
        enabled
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/20"
      } ${isUpdating ? "opacity-50 cursor-not-allowed" : ""}`}
      title={`${enabled ? "Disable" : "Enable"} ${label} notifications`}
    >
      {isUpdating ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  );
}

function CategorySection({
  category,
  eventTypes,
  preferences,
  categoryPref,
  updating,
  onToggleEvent,
  onToggleCategory,
}: {
  category: string;
  eventTypes: string[];
  preferences: Record<string, { in_app_enabled: boolean; email_enabled: boolean; slack_enabled: boolean; web_push_enabled: boolean }>;
  categoryPref?: { in_app_enabled: boolean; email_enabled: boolean; slack_enabled: boolean; web_push_enabled: boolean; slack_channel_id: string | null; slack_channel_name: string | null };
  updating: string | null;
  onToggleEvent: (eventType: string, channel: ChannelKey) => void;
  onToggleCategory: (category: string, channel: ChannelKey) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const meta = CATEGORY_LABELS[category];

  return (
    <div className="bg-muted rounded-xl border border-border overflow-hidden">
      {/* Category Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-5 py-3 border-b border-border hover:bg-accent/50 transition"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="text-left">
            <h3 className="text-sm font-semibold text-foreground">
              {meta?.label || category.replace(/_/g, " ")}
            </h3>
            {meta?.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{eventTypes.length} events</span>
      </button>

      {isExpanded && (
        <div className="divide-y divide-border">
          {/* Master Toggle Row */}
          <div className="flex items-center justify-between px-5 py-3 bg-accent/30">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                All in category
              </p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              {CHANNELS.map(({ key, label, icon }) => (
                <ChannelToggle
                  key={key}
                  enabled={categoryPref ? categoryPref[key] : key === "in_app_enabled"}
                  onToggle={() => onToggleCategory(category, key)}
                  label={label}
                  icon={icon}
                  isUpdating={updating === `cat:${category}:${key}`}
                />
              ))}
            </div>
          </div>

          {/* Slack Channel Routing */}
          {categoryPref?.slack_channel_name && (
            <div className="flex items-center gap-2 px-5 py-2 bg-accent/20 text-xs text-muted-foreground">
              <Hash className="h-3 w-3" />
              <span>Slack channel: <span className="font-medium text-foreground">{categoryPref.slack_channel_name}</span></span>
            </div>
          )}

          {/* Individual Event Rows */}
          {eventTypes.map((eventType) => {
            const eventMeta = EVENT_TYPE_LABELS[eventType];
            const pref = preferences[eventType];

            return (
              <div
                key={eventType}
                className="flex items-center justify-between px-5 py-3 pl-10"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {eventMeta?.label || eventType.replace(/_/g, " ")}
                  </p>
                  {eventMeta?.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {eventMeta.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {CHANNELS.map(({ key, label, icon }) => (
                    <ChannelToggle
                      key={key}
                      enabled={pref ? pref[key] : key === "in_app_enabled"}
                      onToggle={() => onToggleEvent(eventType, key)}
                      label={label}
                      icon={icon}
                      isUpdating={updating === `${eventType}:${key}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function NotificationSettingsPage() {
  const { user } = useAuth();
  const developerId = user?.id;
  const {
    preferences,
    categoryPreferences,
    categoryMap,
    isLoading,
    updatePreference,
    updateCategoryPreference,
  } = useNotificationPreferences(developerId);

  const {
    isSupported: pushSupported,
    permission: pushPermission,
    isSubscribed: pushSubscribed,
    isLoading: pushLoading,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
  } = useWebPush(developerId);

  const [updating, setUpdating] = useState<string | null>(null);

  const handleToggleEvent = async (eventType: string, channel: ChannelKey) => {
    const pref = preferences[eventType];
    const currentValue = pref ? pref[channel] : channel === "in_app_enabled";

    setUpdating(`${eventType}:${channel}`);
    try {
      await updatePreference(eventType, { [channel]: !currentValue });
      toast.success("Preference updated");
    } catch {
      toast.error("Failed to update preference");
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleCategory = async (category: string, channel: ChannelKey) => {
    const catPref = categoryPreferences[category];
    const currentValue = catPref ? catPref[channel] : channel === "in_app_enabled";

    setUpdating(`cat:${category}:${channel}`);
    try {
      await updateCategoryPreference(category, { [channel]: !currentValue });
      toast.success("Category preference updated");
    } catch {
      toast.error("Failed to update category preference");
    } finally {
      setUpdating(null);
    }
  };

  const handlePushToggle = async () => {
    if (pushSubscribed) {
      const ok = await unsubscribePush();
      if (ok) toast.success("Web push disabled");
      else toast.error("Failed to disable web push");
    } else {
      const ok = await subscribePush();
      if (ok) toast.success("Web push enabled");
      else if (pushPermission === "denied") toast.error("Notifications are blocked in your browser settings");
      else toast.error("Failed to enable web push");
    }
  };

  // Use backend category_map for grouping
  const categories = Object.keys(categoryMap).length > 0
    ? categoryMap
    : {};

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div>
          <div className="h-6 w-36 bg-accent rounded mb-2" />
          <div className="h-4 w-64 bg-accent rounded" />
        </div>
        <div className="bg-muted rounded-xl border border-border p-4">
          <div className="h-4 w-40 bg-accent rounded mb-3" />
          <div className="flex items-center gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-28 bg-accent rounded-lg" />
            ))}
          </div>
        </div>
        {[1, 2, 3].map((g) => (
          <div key={g} className="bg-muted rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <div className="h-4 w-32 bg-accent rounded" />
            </div>
            <div className="divide-y divide-border">
              {[1, 2, 3].map((r) => (
                <div key={r} className="flex items-center justify-between px-5 py-3.5">
                  <div className="space-y-1.5">
                    <div className="h-4 w-40 bg-accent rounded" />
                    <div className="h-3 w-56 bg-accent rounded" />
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((c) => (
                      <div key={c} className="h-7 w-16 bg-accent rounded-lg" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Notifications</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Choose how and when you want to be notified
        </p>
      </div>

      {/* Provider Status */}
      <div className="bg-muted rounded-xl border border-border p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Notification Channels</h3>
        <div className="flex flex-wrap items-center gap-4">
          {/* In-App */}
          <div className="flex items-center gap-2 text-sm">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">In-App</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <span className="text-xs text-muted-foreground">Always on</span>
          </div>

          {/* Email */}
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">Email</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <span className="text-xs text-muted-foreground">Connected</span>
          </div>

          {/* Slack */}
          <div className="flex items-center gap-2 text-sm">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">Slack</span>
            <span className="text-xs text-muted-foreground">Via workspace integration</span>
          </div>

          {/* Web Push */}
          <div className="flex items-center gap-2 text-sm">
            <BellRing className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">Web Push</span>
            {!pushSupported ? (
              <>
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Not supported</span>
              </>
            ) : pushSubscribed ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                <button
                  onClick={handlePushToggle}
                  disabled={pushLoading}
                  className="text-xs text-primary hover:underline"
                >
                  {pushLoading ? "..." : "Disable"}
                </button>
              </>
            ) : pushPermission === "denied" ? (
              <>
                <XCircle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs text-muted-foreground">Blocked in browser</span>
              </>
            ) : (
              <button
                onClick={handlePushToggle}
                disabled={pushLoading}
                className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition disabled:opacity-50"
              >
                {pushLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Enable"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Category Sections */}
      {Object.entries(categories).map(([category, eventTypes]) => (
        <CategorySection
          key={category}
          category={category}
          eventTypes={eventTypes}
          preferences={preferences}
          categoryPref={categoryPreferences[category]}
          updating={updating}
          onToggleEvent={handleToggleEvent}
          onToggleCategory={handleToggleCategory}
        />
      ))}

      {Object.keys(categories).length === 0 && (
        <div className="bg-muted rounded-xl border border-border p-8 text-center">
          <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No notification types available yet. Notifications will appear here as you use more features.
          </p>
        </div>
      )}
    </div>
  );
}
