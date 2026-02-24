"use client";

import { useState } from "react";
import {
  Bell,
  Mail,
  MessageSquare,
  Monitor,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationPreferences } from "@/hooks/useNotifications";
import { toast } from "sonner";

const EVENT_TYPE_LABELS: Record<string, { label: string; description: string; category: string }> = {
  peer_review_requested: {
    label: "Peer review requested",
    description: "When someone requests your review",
    category: "Reviews & Goals",
  },
  peer_review_received: {
    label: "Peer review received",
    description: "When someone submits a review for you",
    category: "Reviews & Goals",
  },
  review_cycle_phase_changed: {
    label: "Review cycle phase changed",
    description: "When a review cycle moves to a new phase",
    category: "Reviews & Goals",
  },
  manager_review_completed: {
    label: "Manager review completed",
    description: "When your manager completes your review",
    category: "Reviews & Goals",
  },
  review_acknowledged: {
    label: "Review acknowledged",
    description: "When a team member acknowledges their review",
    category: "Reviews & Goals",
  },
  deadline_reminder_1_day: {
    label: "Deadline reminder (1 day)",
    description: "Reminder 1 day before a deadline",
    category: "Reminders",
  },
  deadline_reminder_day_of: {
    label: "Deadline reminder (same day)",
    description: "Reminder on the day of a deadline",
    category: "Reminders",
  },
  goal_auto_linked: {
    label: "Goal auto-linked",
    description: "When a goal is automatically linked to your work",
    category: "Reviews & Goals",
  },
  goal_at_risk: {
    label: "Goal at risk",
    description: "When one of your goals is flagged as at risk",
    category: "Reviews & Goals",
  },
  goal_completed: {
    label: "Goal completed",
    description: "When you complete a goal",
    category: "Reviews & Goals",
  },
  workspace_invite: {
    label: "Workspace invitation",
    description: "When you're invited to a workspace",
    category: "Workspace",
  },
  team_added: {
    label: "Added to team",
    description: "When you're added to a new team",
    category: "Workspace",
  },
};

const CHANNELS = [
  { key: "in_app_enabled" as const, label: "In-App", icon: Monitor },
  { key: "email_enabled" as const, label: "Email", icon: Mail },
  { key: "slack_enabled" as const, label: "Slack", icon: MessageSquare },
];

function ChannelToggle({
  enabled,
  onToggle,
  label,
  icon: Icon,
}: {
  enabled: boolean;
  onToggle: () => void;
  label: string;
  icon: React.ElementType;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition ${
        enabled
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/20"
      }`}
      title={`${enabled ? "Disable" : "Enable"} ${label} notifications`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export default function NotificationSettingsPage() {
  const { user } = useAuth();
  const developerId = user?.id;
  const {
    preferences,
    availableEventTypes,
    isLoading,
    updatePreference,
  } = useNotificationPreferences(developerId);

  const [updating, setUpdating] = useState<string | null>(null);

  const handleToggle = async (
    eventType: string,
    channel: "in_app_enabled" | "email_enabled" | "slack_enabled"
  ) => {
    const pref = preferences[eventType];
    const currentValue = pref ? pref[channel] : true;

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

  // Group event types by category
  const eventTypes = availableEventTypes.length > 0
    ? availableEventTypes
    : Object.keys(EVENT_TYPE_LABELS);

  const grouped = eventTypes.reduce<Record<string, string[]>>((acc, eventType) => {
    const category = EVENT_TYPE_LABELS[eventType]?.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(eventType);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

      {/* Channel Legend */}
      <div className="bg-muted rounded-xl border border-border p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Notification Channels</h3>
        <div className="flex items-center gap-6">
          {CHANNELS.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Preference Groups */}
      {Object.entries(grouped).map(([category, types]) => (
        <div key={category} className="bg-muted rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">{category}</h3>
          </div>
          <div className="divide-y divide-border">
            {types.map((eventType) => {
              const meta = EVENT_TYPE_LABELS[eventType];
              const pref = preferences[eventType];

              return (
                <div
                  key={eventType}
                  className="flex items-center justify-between px-5 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {meta?.label || eventType.replace(/_/g, " ")}
                    </p>
                    {meta?.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {meta.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {CHANNELS.map(({ key, label, icon }) => (
                      <ChannelToggle
                        key={key}
                        enabled={pref ? pref[key] : true}
                        onToggle={() => handleToggle(eventType, key)}
                        label={label}
                        icon={icon}
                      />
                    ))}
                    {updating?.startsWith(eventType) && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {eventTypes.length === 0 && (
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
