"use client";

import { MessageSquare, AlertTriangle, Clock, Slack, Globe, User } from "lucide-react";
import { Standup } from "@/lib/api";

interface StandupCardProps {
  standup: Standup;
  showAuthor?: boolean;
  compact?: boolean;
}

const sourceConfig = {
  slack_command: { icon: Slack, label: "Slack Command", color: "text-purple-400" },
  slack_channel: { icon: Slack, label: "Slack Channel", color: "text-purple-400" },
  web: { icon: Globe, label: "Web", color: "text-blue-400" },
};

export function StandupCard({ standup, showAuthor = false, compact = false }: StandupCardProps) {
  const source = sourceConfig[standup.source as keyof typeof sourceConfig] || sourceConfig.web;
  const SourceIcon = source.icon;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  if (compact) {
    return (
      <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            <span>{formatDate(standup.standup_date)}</span>
          </div>
          <SourceIcon className={`h-3 w-3 ${source.color}`} />
        </div>
        <p className="text-sm text-white line-clamp-2">
          {standup.today_plan || standup.yesterday_summary}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showAuthor && standup.developer && (
              <div className="flex items-center gap-2">
                {standup.developer.avatar_url ? (
                  <img
                    src={standup.developer.avatar_url}
                    alt={standup.developer.name || ""}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                )}
                <span className="font-medium text-white">
                  {standup.developer.name || standup.developer.email}
                </span>
              </div>
            )}
            {!showAuthor && (
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-400" />
                <span className="font-medium text-white">Daily Standup</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <SourceIcon className={`h-3.5 w-3.5 ${source.color}`} />
              <span>{source.label}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatDate(standup.standup_date)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Yesterday */}
        {standup.yesterday_summary && (
          <div>
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              Yesterday
            </h4>
            <p className="text-sm text-slate-200 whitespace-pre-wrap">{standup.yesterday_summary}</p>
          </div>
        )}

        {/* Today */}
        {standup.today_plan && (
          <div>
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              Today
            </h4>
            <p className="text-sm text-slate-200 whitespace-pre-wrap">{standup.today_plan}</p>
          </div>
        )}

        {/* Blockers */}
        {standup.blockers_summary && (
          <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3">
            <h4 className="text-xs font-medium text-amber-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Blockers
            </h4>
            <p className="text-sm text-amber-200 whitespace-pre-wrap">{standup.blockers_summary}</p>
          </div>
        )}
      </div>

      {/* Sentiment Score (if available) */}
      {standup.sentiment_score !== undefined && standup.sentiment_score !== null && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Sentiment:</span>
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  standup.sentiment_score > 0.6
                    ? "bg-green-500"
                    : standup.sentiment_score > 0.3
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${standup.sentiment_score * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-400">{Math.round(standup.sentiment_score * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
