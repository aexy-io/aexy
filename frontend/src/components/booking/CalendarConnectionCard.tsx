"use client";

import { Calendar, Check, Trash2, RefreshCw, Star, Loader2 } from "lucide-react";
import { CalendarConnection } from "@/lib/booking-api";

interface CalendarConnectionCardProps {
  connection: CalendarConnection;
  onSync?: () => void;
  onDisconnect?: () => void;
  onSetPrimary?: () => void;
  syncing?: boolean;
  className?: string;
}

const PROVIDER_CONFIG = {
  google: {
    label: "Google Calendar",
    color: "#4285F4",
  },
  microsoft: {
    label: "Microsoft Outlook",
    color: "#0078D4",
  },
};

export function CalendarConnectionCard({
  connection,
  onSync,
  onDisconnect,
  onSetPrimary,
  syncing = false,
  className = "",
}: CalendarConnectionCardProps) {
  const provider = PROVIDER_CONFIG[connection.provider] || {
    label: connection.provider,
    color: "#6B7280",
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${provider.color}20` }}
          >
            <Calendar
              className="h-5 w-5"
              style={{ color: provider.color }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">
                {connection.calendar_name || provider.label}
              </span>
              {connection.is_primary && (
                <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  Primary
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {provider.label}
              {connection.account_email && (
                <span className="ml-1">({connection.account_email})</span>
              )}
              {connection.last_synced_at && (
                <span className="ml-2">
                  · Last synced {new Date(connection.last_synced_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!connection.is_primary && onSetPrimary && (
            <button
              onClick={onSetPrimary}
              className="p-2 text-gray-400 hover:text-yellow-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Set as primary"
            >
              <Star className="h-4 w-4" />
            </button>
          )}
          {onSync && (
            <button
              onClick={onSync}
              disabled={syncing}
              className="p-2 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              title="Sync now"
            >
              <RefreshCw
                className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
              />
            </button>
          )}
          {onDisconnect && (
            <button
              onClick={onDisconnect}
              className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Disconnect"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {connection.sync_enabled && (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <Check className="h-4 w-4" />
          <span>Automatic sync enabled</span>
        </div>
      )}
    </div>
  );
}
