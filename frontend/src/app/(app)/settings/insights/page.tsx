"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  Clock,
  Users,
  Building2,
  Save,
  RotateCcw,
  Sun,
  Moon,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { insightsApi } from "@/lib/api";

interface WorkingHoursConfig {
  start_hour: number;
  end_hour: number;
  timezone: string;
  weekend_days: number[];
}

interface MetricWeights {
  velocity: number;
  efficiency: number;
  quality: number;
  sustainability: number;
  collaboration: number;
}

interface InsightsSettings {
  working_hours: WorkingHoursConfig;
  metric_weights: MetricWeights;
  late_night_threshold_hour: number;
  bottleneck_multiplier: number;
  snapshot_auto_generate: boolean;
  snapshot_frequency: "daily" | "weekly";
}

const DEFAULT_SETTINGS: InsightsSettings = {
  working_hours: {
    start_hour: 9,
    end_hour: 18,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    weekend_days: [0, 6], // Sunday, Saturday
  },
  metric_weights: {
    velocity: 25,
    efficiency: 25,
    quality: 25,
    sustainability: 15,
    collaboration: 10,
  },
  late_night_threshold_hour: 22,
  bottleneck_multiplier: 2.0,
  snapshot_auto_generate: true,
  snapshot_frequency: "weekly",
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

export default function InsightsSettingsPage() {
  const { isAuthenticated } = useAuth();
  const { currentWorkspaceId, currentWorkspace } = useWorkspace();
  const { teams } = useTeams(currentWorkspaceId);

  const [activeTab, setActiveTab] = useState<"org" | "team">("org");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [settings, setSettings] = useState<InsightsSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    try {
      const teamId = activeTab === "team" && selectedTeamId ? selectedTeamId : undefined;
      const data = await insightsApi.getSettings(currentWorkspaceId, teamId);
      if (data.id) {
        setSettings({
          working_hours: {
            start_hour: data.working_hours?.start_hour ?? 9,
            end_hour: data.working_hours?.end_hour ?? 18,
            timezone: data.working_hours?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
            weekend_days: [0, 6],
          },
          metric_weights: {
            velocity: (data.health_score_weights?.velocity ?? 0.25) * 100,
            efficiency: (data.health_score_weights?.efficiency ?? 0.25) * 100,
            quality: (data.health_score_weights?.quality ?? 0.25) * 100,
            sustainability: (data.health_score_weights?.sustainability ?? 0.15) * 100,
            collaboration: (data.health_score_weights?.collaboration ?? 0.10) * 100,
          },
          late_night_threshold_hour: data.working_hours?.late_night_threshold_hour ?? 22,
          bottleneck_multiplier: data.bottleneck_multiplier ?? 2.0,
          snapshot_auto_generate: data.auto_generate_snapshots ?? false,
          snapshot_frequency: (data.snapshot_frequency as "daily" | "weekly") ?? "daily",
        });
      }
    } catch {
      toast.error("Failed to load settings. Using defaults.");
    } finally {
      setLoading(false);
    }
  }, [currentWorkspaceId, activeTab, selectedTeamId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateWorkingHours = (field: keyof WorkingHoursConfig, value: any) => {
    setSettings((prev) => ({
      ...prev,
      working_hours: { ...prev.working_hours, [field]: value },
    }));
    setSaved(false);
  };

  const updateWeights = (field: keyof MetricWeights, value: number) => {
    setSettings((prev) => ({
      ...prev,
      metric_weights: { ...prev.metric_weights, [field]: value },
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!currentWorkspaceId) return;
    setIsSaving(true);
    try {
      await insightsApi.saveSettings(currentWorkspaceId, {
        team_id: activeTab === "team" && selectedTeamId ? selectedTeamId : null,
        working_hours: {
          start_hour: settings.working_hours.start_hour,
          end_hour: settings.working_hours.end_hour,
          timezone: settings.working_hours.timezone,
          late_night_threshold_hour: settings.late_night_threshold_hour,
        },
        health_score_weights: {
          velocity: settings.metric_weights.velocity / 100,
          efficiency: settings.metric_weights.efficiency / 100,
          quality: settings.metric_weights.quality / 100,
          sustainability: settings.metric_weights.sustainability / 100,
          collaboration: settings.metric_weights.collaboration / 100,
        },
        bottleneck_multiplier: settings.bottleneck_multiplier,
        auto_generate_snapshots: settings.snapshot_auto_generate,
        snapshot_frequency: settings.snapshot_frequency,
      });
      setSaved(true);
    } catch {
      toast.error("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const totalWeight = Object.values(settings.metric_weights).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-700 rounded-lg">
                <TrendingUp className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">
                  Insights Settings
                </h1>
                <p className="text-slate-400 text-sm">
                  Configure metrics, working hours, and team overrides
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Tab Selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("org")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "org"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
            }`}
          >
            <Building2 className="h-4 w-4" />
            Organization Defaults
          </button>
          <button
            onClick={() => setActiveTab("team")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "team"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
            }`}
          >
            <Users className="h-4 w-4" />
            Team Overrides
          </button>
        </div>

        {/* Team Selector (when team tab active) */}
        {activeTab === "team" && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <label className="text-sm text-slate-400 block mb-2">
              Select Team
            </label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Choose a team...</option>
              {(teams || []).map((team: any) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            {selectedTeamId && (
              <p className="text-xs text-slate-500 mt-2">
                Team overrides take precedence over organization defaults
              </p>
            )}
          </div>
        )}

        {/* Working Hours */}
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Working Hours</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-400 block mb-1">
                  <Sun className="h-3.5 w-3.5 inline mr-1" />
                  Start Hour
                </label>
                <select
                  value={settings.working_hours.start_hour}
                  onChange={(e) =>
                    updateWorkingHours("start_hour", Number(e.target.value))
                  }
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i.toString().padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-1">
                  <Moon className="h-3.5 w-3.5 inline mr-1" />
                  End Hour
                </label>
                <select
                  value={settings.working_hours.end_hour}
                  onChange={(e) =>
                    updateWorkingHours("end_hour", Number(e.target.value))
                  }
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i.toString().padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">
                Timezone
              </label>
              <select
                value={settings.working_hours.timezone}
                onChange={(e) =>
                  updateWorkingHours("timezone", e.target.value)
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">
                <Moon className="h-3.5 w-3.5 inline mr-1" />
                Late Night Threshold
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={settings.late_night_threshold_hour}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      late_night_threshold_hour: Number(e.target.value),
                    }));
                    setSaved(false);
                  }}
                  className="w-40 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i.toString().padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-500">
                  Commits after this hour are flagged as late-night
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Health Score Weights */}
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">
                Health Score Weights
              </h2>
            </div>
            {totalWeight !== 100 && (
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Total: {totalWeight}% (should be 100%)
              </span>
            )}
          </div>
          <div className="p-6 space-y-4">
            {(
              Object.entries(settings.metric_weights) as [
                keyof MetricWeights,
                number,
              ][]
            ).map(([key, value]) => (
              <div key={key} className="flex items-center gap-4">
                <label className="text-sm text-slate-300 w-32 capitalize">
                  {key}
                </label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={value}
                  onChange={(e) => updateWeights(key, Number(e.target.value))}
                  className="flex-1 accent-indigo-500"
                />
                <span className="text-sm text-white w-12 text-right font-mono">
                  {value}%
                </span>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              These weights determine the composite health score for each
              developer. Adjust based on what matters most for your team.
            </p>
          </div>
        </section>

        {/* Bottleneck Detection */}
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-white">
              Bottleneck Detection
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-sm text-slate-400 block mb-1">
                Bottleneck Multiplier
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="1.0"
                  max="5.0"
                  value={settings.bottleneck_multiplier}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      bottleneck_multiplier: Number(e.target.value),
                    }));
                    setSaved(false);
                  }}
                  className="w-24 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs text-slate-500">
                  Developers with {settings.bottleneck_multiplier}x the average
                  workload are flagged as bottlenecks
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Snapshot Generation */}
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-400" />
            <h2 className="text-lg font-semibold text-white">
              Snapshot Generation
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white">Auto-generate snapshots</p>
                <p className="text-xs text-slate-500">
                  Automatically compute metrics on a schedule
                </p>
              </div>
              <button
                onClick={() => {
                  setSettings((prev) => ({
                    ...prev,
                    snapshot_auto_generate: !prev.snapshot_auto_generate,
                  }));
                  setSaved(false);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  settings.snapshot_auto_generate
                    ? "bg-indigo-600"
                    : "bg-slate-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    settings.snapshot_auto_generate
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {settings.snapshot_auto_generate && (
              <div>
                <label className="text-sm text-slate-400 block mb-1">
                  Frequency
                </label>
                <div className="flex gap-2">
                  {(["daily", "weekly"] as const).map((freq) => (
                    <button
                      key={freq}
                      onClick={() => {
                        setSettings((prev) => ({
                          ...prev,
                          snapshot_frequency: freq,
                        }));
                        setSaved(false);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        settings.snapshot_frequency === freq
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-700 text-slate-400 hover:text-white"
                      }`}
                    >
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
          <button
            onClick={() => {
              setSettings(DEFAULT_SETTINGS);
              setSaved(false);
            }}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition text-sm"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Defaults
          </button>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-green-400">Settings saved</span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition text-sm font-medium"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
