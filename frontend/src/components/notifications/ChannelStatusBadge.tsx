"use client";

import { Mail, Bell, MessageSquare, Globe, Check, Eye, MousePointerClick, X, AlertTriangle, Clock } from "lucide-react";

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  in_app: Bell,
  slack: MessageSquare,
  web_push: Globe,
};

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  in_app: "In-App",
  slack: "Slack",
  web_push: "Web Push",
};

const STATUS_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  queued: { icon: Clock, color: "text-gray-400", label: "Queued" },
  sent: { icon: Check, color: "text-blue-500", label: "Sent" },
  delivered: { icon: Check, color: "text-green-500", label: "Delivered" },
  opened: { icon: Eye, color: "text-emerald-600", label: "Opened" },
  clicked: { icon: MousePointerClick, color: "text-purple-500", label: "Clicked" },
  failed: { icon: X, color: "text-red-500", label: "Failed" },
  bounced: { icon: AlertTriangle, color: "text-orange-500", label: "Bounced" },
};

interface ChannelStatusBadgeProps {
  channel: string;
  status: string;
  showLabel?: boolean;
}

export function ChannelStatusBadge({ channel, status, showLabel = false }: ChannelStatusBadgeProps) {
  const ChannelIcon = CHANNEL_ICONS[channel] || Globe;
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
  const StatusIcon = statusConfig.icon;

  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 dark:border-zinc-700 px-2 py-1"
      title={`${CHANNEL_LABELS[channel] || channel}: ${statusConfig.label}`}
    >
      <ChannelIcon className="h-3.5 w-3.5 text-zinc-500" />
      <StatusIcon className={`h-3.5 w-3.5 ${statusConfig.color}`} />
      {showLabel && (
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {statusConfig.label}
        </span>
      )}
    </div>
  );
}

interface ChannelStatusGroupProps {
  channels: Record<string, string>;
}

export function ChannelStatusGroup({ channels }: ChannelStatusGroupProps) {
  if (!channels || Object.keys(channels).length === 0) {
    return <span className="text-xs text-zinc-400">No delivery data</span>;
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Object.entries(channels).map(([channel, status]) => (
        <ChannelStatusBadge key={channel} channel={channel} status={status} />
      ))}
    </div>
  );
}
