"use client";

import { useState, useEffect } from "react";
import {
  Slack,
  RefreshCw,
  Download,
  Users,
  Hash,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Settings,
  MessageSquare,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { slackSyncApi, SlackChannel, SlackConfiguredChannel, SlackUserMappingStats } from "@/lib/api";

interface SlackSyncSettingsProps {
  integrationId: string;
  teamId: string;
  slackTeamId?: string;
  isConnected: boolean;
}

export function SlackSyncSettings({ integrationId, teamId, slackTeamId = "", isConnected }: SlackSyncSettingsProps) {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [configuredChannels, setConfiguredChannels] = useState<SlackConfiguredChannel[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMappingUsers, setIsMappingUsers] = useState(false);
  const [mappingStats, setMappingStats] = useState<SlackUserMappingStats | null>(null);
  const [importDays, setImportDays] = useState(30);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Channel config options
  const [autoParseStandups, setAutoParseStandups] = useState(true);
  const [autoParseTaskRefs, setAutoParseTaskRefs] = useState(true);
  const [autoParseBlockers, setAutoParseBlockers] = useState(true);
  const [channelType, setChannelType] = useState<"team" | "standup" | "project">("team");

  useEffect(() => {
    if (isConnected && integrationId) {
      loadConfiguredChannels();
    }
  }, [integrationId, isConnected]);

  const loadChannels = async () => {
    setIsLoadingChannels(true);
    try {
      const data = await slackSyncApi.getChannels(integrationId);
      setChannels(data.channels);
    } catch (error) {
      console.error("Failed to load channels:", error);
      setMessage({ type: "error", text: "Failed to load Slack channels" });
    } finally {
      setIsLoadingChannels(false);
    }
  };

  const loadConfiguredChannels = async () => {
    try {
      const data = await slackSyncApi.getConfiguredChannels(integrationId);
      setConfiguredChannels(data.channels);
    } catch (error) {
      console.error("Failed to load configured channels:", error);
    }
  };

  const handleAddChannel = async () => {
    if (!selectedChannel) return;

    const channel = channels.find((c) => c.id === selectedChannel);
    if (!channel) return;

    try {
      await slackSyncApi.configureChannel(integrationId, {
        channel_id: channel.id,
        channel_name: channel.name,
        slack_team_id: slackTeamId,
        team_id: teamId,
        channel_type: channelType,
        auto_parse_standups: autoParseStandups,
        auto_parse_task_refs: autoParseTaskRefs,
        auto_parse_blockers: autoParseBlockers,
      });
      setMessage({ type: "success", text: `Channel #${channel.name} configured for monitoring` });
      setShowAddChannel(false);
      setSelectedChannel("");
      loadConfiguredChannels();
    } catch (error) {
      console.error("Failed to configure channel:", error);
      setMessage({ type: "error", text: "Failed to configure channel" });
    }
  };

  const handleRemoveChannel = async (configId: string) => {
    try {
      await slackSyncApi.removeChannelConfig(integrationId, configId);
      setMessage({ type: "success", text: "Channel removed from monitoring" });
      loadConfiguredChannels();
    } catch (error) {
      console.error("Failed to remove channel:", error);
      setMessage({ type: "error", text: "Failed to remove channel" });
    }
  };

  const handleImportHistory = async () => {
    setIsImporting(true);
    setMessage(null);
    try {
      const result = await slackSyncApi.importHistory(integrationId, {
        days_back: importDays,
        team_id: teamId,
      });
      setMessage({ type: "success", text: result.message });
    } catch (error) {
      console.error("Failed to import history:", error);
      setMessage({ type: "error", text: "Failed to start history import" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setMessage(null);
    try {
      const result = await slackSyncApi.syncChannels(integrationId);
      setMessage({ type: "success", text: result.message });
    } catch (error) {
      console.error("Failed to sync channels:", error);
      setMessage({ type: "error", text: "Failed to start sync" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAutoMapUsers = async () => {
    setIsMappingUsers(true);
    setMessage(null);
    try {
      const stats = await slackSyncApi.autoMapUsers(integrationId);
      setMappingStats(stats);
      setMessage({ type: "success", text: `Mapped ${stats.newly_mapped} new users` });
    } catch (error) {
      console.error("Failed to map users:", error);
      setMessage({ type: "error", text: "Failed to map users" });
    } finally {
      setIsMappingUsers(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="bg-muted rounded-xl p-6 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <Slack className="h-6 w-6 text-purple-400" />
          <h3 className="text-lg font-semibold text-foreground">Slack Sync</h3>
        </div>
        <p className="text-muted-foreground">
          Connect your Slack workspace to enable message sync and tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-muted rounded-xl p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Slack className="h-6 w-6 text-purple-400" />
            <h3 className="text-lg font-semibold text-foreground">Slack Sync Settings</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Connected
            </span>
          </div>
        </div>

        {message && (
          <div
            className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
              message.type === "success"
                ? "bg-green-900/30 border border-green-700 text-green-400"
                : "bg-red-900/30 border border-red-700 text-red-400"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <p className="text-muted-foreground mb-4">
          Configure which Slack channels to monitor for standups, task updates, and blockers.
          Messages will be automatically parsed and synced to tracking.
        </p>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>
          <button
            onClick={handleAutoMapUsers}
            disabled={isMappingUsers}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-foreground rounded-lg hover:bg-muted transition disabled:opacity-50"
          >
            <Users className={`h-4 w-4 ${isMappingUsers ? "animate-pulse" : ""}`} />
            {isMappingUsers ? "Mapping..." : "Auto-Map Users"}
          </button>
        </div>

        {/* User Mapping Stats */}
        {mappingStats && (
          <div className="mt-4 p-4 bg-accent/50 rounded-lg">
            <h4 className="text-sm font-medium text-foreground mb-2">User Mapping Results</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Slack Users:</span>
                <span className="ml-2 text-foreground">{mappingStats.total_slack_users}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Developers:</span>
                <span className="ml-2 text-foreground">{mappingStats.total_developers}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Newly Mapped:</span>
                <span className="ml-2 text-green-400">{mappingStats.newly_mapped}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Already Mapped:</span>
                <span className="ml-2 text-foreground">{mappingStats.already_mapped}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Unmapped:</span>
                <span className="ml-2 text-yellow-400">{mappingStats.unmapped}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Configured Channels */}
      <div className="bg-muted rounded-xl p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Hash className="h-5 w-5 text-muted-foreground" />
            Monitored Channels
          </h4>
          <button
            onClick={() => {
              loadChannels();
              setShowAddChannel(true);
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Channel
          </button>
        </div>

        {configuredChannels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Hash className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No channels configured for monitoring</p>
            <p className="text-sm mt-1">Add channels to start syncing Slack messages</p>
          </div>
        ) : (
          <div className="space-y-3">
            {configuredChannels.map((config) => (
              <div
                key={config.id}
                className="flex items-center justify-between p-4 bg-accent/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Hash className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">{config.channel_name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="capitalize">{config.channel_type}</span>
                      {config.auto_parse_standups && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          Standups
                        </span>
                      )}
                      {config.auto_parse_task_refs && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Tasks
                        </span>
                      )}
                      {config.auto_parse_blockers && (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Blockers
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveChannel(config.id)}
                  className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-900/20 rounded-lg transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import History */}
      <div className="bg-muted rounded-xl p-6 border border-border">
        <h4 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
          <Download className="h-5 w-5 text-muted-foreground" />
          Import History
        </h4>
        <p className="text-muted-foreground mb-4">
          Import existing Slack messages from configured channels. This is a one-time operation
          to backfill historical data.
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Days to import:</label>
            <select
              value={importDays}
              onChange={(e) => setImportDays(Number(e.target.value))}
              className="px-3 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          <button
            onClick={handleImportHistory}
            disabled={isImporting || configuredChannels.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            <Download className={`h-4 w-4 ${isImporting ? "animate-bounce" : ""}`} />
            {isImporting ? "Importing..." : "Import History"}
          </button>
        </div>
        {configuredChannels.length === 0 && (
          <p className="text-sm text-yellow-400 mt-2">
            Configure channels above before importing history.
          </p>
        )}
      </div>

      {/* Add Channel Modal */}
      {showAddChannel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-muted rounded-xl p-6 w-full max-w-md mx-4 border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">Add Channel to Monitor</h3>

            <div className="space-y-4">
              {/* Channel Select */}
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Select Channel</label>
                {isLoadingChannels ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading channels...
                  </div>
                ) : (
                  <select
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a channel...</option>
                    {channels
                      .filter((c) => !configuredChannels.some((cc) => cc.channel_id === c.id))
                      .map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          #{channel.name} ({channel.num_members} members)
                        </option>
                      ))}
                  </select>
                )}
              </div>

              {/* Channel Type */}
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Channel Type</label>
                <div className="flex gap-2">
                  {(["team", "standup", "project"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setChannelType(type)}
                      className={`px-3 py-1.5 rounded-lg text-sm capitalize transition ${
                        channelType === type
                          ? "bg-blue-600 text-white"
                          : "bg-accent text-foreground hover:bg-muted"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto Parse Options */}
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Auto-Parse Options</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoParseStandups}
                      onChange={(e) => setAutoParseStandups(e.target.checked)}
                      className="rounded bg-accent border-border text-blue-500 focus:ring-blue-500"
                    />
                    Parse standups automatically
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoParseTaskRefs}
                      onChange={(e) => setAutoParseTaskRefs(e.target.checked)}
                      className="rounded bg-accent border-border text-blue-500 focus:ring-blue-500"
                    />
                    Parse task references (TASK-123, etc.)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoParseBlockers}
                      onChange={(e) => setAutoParseBlockers(e.target.checked)}
                      className="rounded bg-accent border-border text-blue-500 focus:ring-blue-500"
                    />
                    Detect blockers and impediments
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowAddChannel(false);
                  setSelectedChannel("");
                }}
                className="px-4 py-2 bg-accent text-foreground rounded-lg hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddChannel}
                disabled={!selectedChannel}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                Add Channel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
