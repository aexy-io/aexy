"use client";

import { Mail, Bell, MessageSquare, Globe, Check, Eye, MousePointerClick, X, AlertTriangle, Clock } from "lucide-react";
import { DeliveryTimelineResponse } from "@/hooks/useNotificationDelivery";

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  in_app: "In-App",
  slack: "Slack",
  web_push: "Web Push",
};

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  in_app: Bell,
  slack: MessageSquare,
  web_push: Globe,
};

const STATUS_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  queued: { icon: Clock, color: "text-gray-500", bg: "bg-gray-100 dark:bg-gray-800" },
  sent: { icon: Check, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20" },
  delivered: { icon: Check, color: "text-green-500", bg: "bg-green-50 dark:bg-green-900/20" },
  opened: { icon: Eye, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
  clicked: { icon: MousePointerClick, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20" },
  failed: { icon: X, color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20" },
  bounced: { icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-900/20" },
};

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface DeliveryTimelineProps {
  data: DeliveryTimelineResponse;
  onClose: () => void;
}

export function DeliveryTimeline({ data, onClose }: DeliveryTimelineProps) {
  const channelEntries = Object.entries(data.channels);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 shadow-xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Delivery Timeline
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {channelEntries.length === 0 && (
            <p className="text-sm text-zinc-500">No delivery events recorded.</p>
          )}

          {channelEntries.map(([channel, channelData]) => {
            const ChannelIcon = CHANNEL_ICONS[channel] || Globe;

            return (
              <div key={channel}>
                {/* Channel header */}
                <div className="flex items-center gap-2 mb-4">
                  <ChannelIcon className="h-4 w-4 text-zinc-500" />
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {CHANNEL_LABELS[channel] || channel}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {channelData.current_status}
                  </span>
                </div>

                {/* Timeline */}
                <div className="relative ml-2 pl-6 border-l-2 border-zinc-200 dark:border-zinc-700 space-y-4">
                  {channelData.events.map((event) => {
                    const statusConfig = STATUS_ICONS[event.status] || STATUS_ICONS.queued;
                    const StatusIcon = statusConfig.icon;

                    return (
                      <div key={event.id} className="relative">
                        {/* Dot on timeline */}
                        <div className={`absolute -left-[31px] top-1 w-5 h-5 rounded-full flex items-center justify-center ${statusConfig.bg}`}>
                          <StatusIcon className={`h-3 w-3 ${statusConfig.color}`} />
                        </div>

                        {/* Event content */}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                              {event.status}
                            </span>
                            {event.provider && (
                              <span className="text-xs text-zinc-400">
                                via {event.provider}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {formatTimestamp(event.event_timestamp)}
                          </p>
                          {event.event_metadata && Object.keys(event.event_metadata).length > 0 && (
                            <div className="mt-1 text-xs text-zinc-400 space-y-0.5">
                              {Object.entries(event.event_metadata).map(([k, v]) => (
                                <div key={k}>
                                  <span className="text-zinc-500">{k}:</span> {String(v)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
