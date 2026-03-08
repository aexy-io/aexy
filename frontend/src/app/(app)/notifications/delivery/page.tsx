"use client";

import { useState, useMemo } from "react";
import { useDeliveryStatus, useDeliveryStats, useDeliveryTimeline, DeliveryFilters } from "@/hooks/useNotificationDelivery";
import { ChannelStatusGroup } from "@/components/notifications/ChannelStatusBadge";
import { DeliveryTimeline } from "@/components/notifications/DeliveryTimeline";
import { ArrowLeft, Filter, TrendingUp } from "lucide-react";
import Link from "next/link";

const CHANNEL_OPTIONS = [
  { value: "", label: "All Channels" },
  { value: "email", label: "Email" },
  { value: "in_app", label: "In-App" },
  { value: "web_push", label: "Web Push" },
  { value: "slack", label: "Slack" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "queued", label: "Queued" },
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "opened", label: "Opened" },
  { value: "clicked", label: "Clicked" },
  { value: "failed", label: "Failed" },
  { value: "bounced", label: "Bounced" },
];

const DATE_RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

function StatCard({ label, value, subtitle }: { label: string; value: string | number; subtitle?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function RateBar({ label, rate }: { label: string; rate: number }) {
  const pct = Math.round(rate * 100);
  const color = pct >= 90 ? "bg-green-500" : pct >= 70 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-500 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function DeliveryStatusPage() {
  const [filters, setFilters] = useState<DeliveryFilters>({ page: 1, per_page: 20 });
  const [dateRange, setDateRange] = useState("30");
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);

  const dateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(dateRange));
    return d.toISOString();
  }, [dateRange]);

  const appliedFilters = useMemo(() => ({
    ...filters,
    date_from: dateFrom,
  }), [filters, dateFrom]);

  const { data: deliveryData, isLoading } = useDeliveryStatus(appliedFilters);
  const { data: stats } = useDeliveryStats(dateFrom);
  const { data: timeline } = useDeliveryTimeline(selectedNotificationId);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/notifications"
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-zinc-500" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Delivery Status
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Track notification delivery across all channels
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Notifications"
            value={stats.total_notifications}
            subtitle={`Last ${dateRange} days`}
          />
          <StatCard
            label="Overall Delivery Rate"
            value={`${Math.round(stats.overall_delivery_rate * 100)}%`}
          />
          {stats.channels.slice(0, 2).map((ch) => (
            <StatCard
              key={ch.channel}
              label={`${ch.channel === "email" ? "Email" : ch.channel === "in_app" ? "In-App" : ch.channel} Sent`}
              value={ch.total_sent}
              subtitle={`${Math.round(ch.delivery_rate * 100)}% delivered`}
            />
          ))}
        </div>
      )}

      {/* Per-channel rates */}
      {stats && stats.channels.length > 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-zinc-500" />
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Channel Rates</h2>
          </div>
          <div className="space-y-3">
            {stats.channels.map((ch) => (
              <div key={ch.channel} className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 capitalize">
                  {ch.channel.replace("_", " ")}
                </span>
                <RateBar label="Delivery" rate={ch.delivery_rate} />
                {ch.channel === "email" && (
                  <>
                    <RateBar label="Open" rate={ch.open_rate} />
                    <RateBar label="Click" rate={ch.click_rate} />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-zinc-400" />
        <select
          value={filters.channel || ""}
          onChange={(e) => setFilters({ ...filters, channel: e.target.value || undefined, page: 1 })}
          className="text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-zinc-700 dark:text-zinc-300"
        >
          {CHANNEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={filters.status || ""}
          onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined, page: 1 })}
          className="text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-zinc-700 dark:text-zinc-300"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={dateRange}
          onChange={(e) => { setDateRange(e.target.value); setFilters({ ...filters, page: 1 }); }}
          className="text-sm rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-zinc-700 dark:text-zinc-300"
        >
          {DATE_RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Notification list */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center text-sm text-zinc-500">Loading...</div>
        )}

        {!isLoading && deliveryData && deliveryData.items.length === 0 && (
          <div className="p-8 text-center text-sm text-zinc-500">
            No notifications found matching the filters.
          </div>
        )}

        {deliveryData && deliveryData.items.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Notification</th>
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Type</th>
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Delivery Status</th>
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {deliveryData.items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer transition-colors"
                  onClick={() => setSelectedNotificationId(item.id)}
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-xs">
                      {item.title}
                    </p>
                    <p className="text-xs text-zinc-500 truncate max-w-xs mt-0.5">
                      {item.body}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {item.event_type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ChannelStatusGroup channels={item.channels} />
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                    {new Date(item.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {deliveryData && deliveryData.total > deliveryData.per_page && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-700">
            <span className="text-xs text-zinc-500">
              Page {deliveryData.page} of {Math.ceil(deliveryData.total / deliveryData.per_page)}
              {" "}({deliveryData.total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}
                disabled={deliveryData.page <= 1}
                className="text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-600 disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}
                disabled={!deliveryData.has_next}
                className="text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-600 disabled:opacity-50 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Timeline drawer */}
      {selectedNotificationId && timeline && (
        <DeliveryTimeline
          data={timeline}
          onClose={() => setSelectedNotificationId(null)}
        />
      )}
    </div>
  );
}
