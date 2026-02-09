"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  BellRing,
  Plus,
  Trash2,
  Check,
  Play,
  Zap,
  X,
  AlertTriangle,
  Info,
  ShieldAlert,
} from "lucide-react";
import { useAlertRules, useAlertHistory } from "@/hooks/useInsights";
import { AlertRuleData } from "@/lib/api";

const SEVERITY_CONFIG: Record<string, { icon: typeof Info; color: string; bg: string }> = {
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10" },
  warning: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  critical: { icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/10" },
};

const METRIC_CATEGORIES = [
  { value: "velocity", label: "Velocity" },
  { value: "efficiency", label: "Efficiency" },
  { value: "quality", label: "Quality" },
  { value: "sustainability", label: "Sustainability" },
  { value: "collaboration", label: "Collaboration" },
];

const METRIC_NAMES: Record<string, { value: string; label: string }[]> = {
  velocity: [
    { value: "commits_count", label: "Commits Count" },
    { value: "prs_merged", label: "PRs Merged" },
    { value: "commit_frequency", label: "Commit Frequency" },
    { value: "pr_throughput", label: "PR Throughput" },
  ],
  efficiency: [
    { value: "avg_pr_cycle_time", label: "Avg PR Cycle Time (hours)" },
    { value: "avg_time_to_first_review", label: "Time to First Review (hours)" },
    { value: "pr_merge_rate", label: "PR Merge Rate" },
    { value: "rework_ratio", label: "Rework Ratio" },
  ],
  quality: [
    { value: "review_participation_rate", label: "Review Participation Rate" },
    { value: "avg_review_depth", label: "Avg Review Depth" },
    { value: "review_turnaround_hours", label: "Review Turnaround (hours)" },
    { value: "self_merge_rate", label: "Self-Merge Rate" },
  ],
  sustainability: [
    { value: "weekend_commit_ratio", label: "Weekend Commit Ratio" },
    { value: "late_night_commit_ratio", label: "Late Night Commit Ratio" },
    { value: "longest_streak_days", label: "Longest Streak (days)" },
    { value: "focus_score", label: "Focus Score" },
  ],
  collaboration: [
    { value: "unique_collaborators", label: "Unique Collaborators" },
    { value: "review_given_count", label: "Reviews Given" },
    { value: "knowledge_sharing_score", label: "Knowledge Sharing Score" },
  ],
};

const OPERATORS = [
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "eq", label: "=" },
];

export default function AlertsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [tab, setTab] = useState<"rules" | "history">("rules");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string | undefined>(undefined);

  const {
    rules,
    isLoading: rulesLoading,
    createRule,
    deleteRule,
    seedTemplates,
    isSeeding,
  } = useAlertRules(currentWorkspaceId, false);

  const {
    history,
    isLoading: historyLoading,
    acknowledgeAlert,
    evaluateAlerts,
    isEvaluating,
  } = useAlertHistory(currentWorkspaceId, { status: historyFilter, limit: 100 });

  // Create form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    metric_category: "velocity",
    metric_name: "commits_count",
    condition_operator: "lt",
    condition_value: 5,
    severity: "warning",
    is_active: true,
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const handleCreateRule = async () => {
    try {
      await createRule({
        ...formData,
        scope_type: "workspace",
        notification_channels: null,
      });
      setShowCreateForm(false);
      setFormData({
        name: "",
        description: "",
        metric_category: "velocity",
        metric_name: "commits_count",
        condition_operator: "lt",
        condition_value: 5,
        severity: "warning",
        is_active: true,
      });
    } catch (err) {
      console.error("Failed to create rule:", err);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await deleteRule(ruleId);
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  };

  const handleSeedTemplates = async () => {
    try {
      await seedTemplates();
    } catch (err) {
      console.error("Failed to seed templates:", err);
    }
  };

  const handleEvaluate = async () => {
    try {
      await evaluateAlerts({});
    } catch (err) {
      console.error("Failed to evaluate alerts:", err);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      await acknowledgeAlert(alertId);
    } catch (err) {
      console.error("Failed to acknowledge:", err);
    }
  };

  const activeRules = rules.filter((r) => r.is_active);
  const inactiveRules = rules.filter((r) => !r.is_active);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/insights"
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Alert Management</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Configure rules to detect anomalies and review triggered alerts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedTemplates}
            disabled={isSeeding}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            <Zap className="w-4 h-4" />
            {isSeeding ? "Seeding..." : "Load Defaults"}
          </button>
          <button
            onClick={handleEvaluate}
            disabled={isEvaluating}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            <Play className="w-4 h-4" />
            {isEvaluating ? "Evaluating..." : "Run Evaluation"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab("rules")}
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors ${
            tab === "rules"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Bell className="w-4 h-4" />
          Rules ({rules.length})
        </button>
        <button
          onClick={() => setTab("history")}
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors ${
            tab === "history"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <BellRing className="w-4 h-4" />
          History ({history.length})
        </button>
      </div>

      {/* Rules Tab */}
      {tab === "rules" && (
        <div className="space-y-4">
          {/* Create button */}
          {!showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Rule
            </button>
          )}

          {/* Create form */}
          {showCreateForm && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">New Alert Rule</h3>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="p-1 rounded hover:bg-zinc-800"
                >
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="e.g. Low Velocity Alert"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Optional description"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Category</label>
                  <select
                    value={formData.metric_category}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        metric_category: e.target.value,
                        metric_name: METRIC_NAMES[e.target.value]?.[0]?.value || "",
                      })
                    }
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {METRIC_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Metric</label>
                  <select
                    value={formData.metric_name}
                    onChange={(e) => setFormData({ ...formData, metric_name: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {(METRIC_NAMES[formData.metric_category] || []).map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Condition</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.condition_operator}
                      onChange={(e) => setFormData({ ...formData, condition_operator: e.target.value })}
                      className="w-20 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {OPERATORS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="any"
                      value={formData.condition_value}
                      onChange={(e) => setFormData({ ...formData, condition_value: parseFloat(e.target.value) || 0 })}
                      className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Severity</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateRule}
                  disabled={!formData.name}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  Create Rule
                </button>
              </div>
            </div>
          )}

          {/* Loading */}
          {rulesLoading && (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500" />
            </div>
          )}

          {/* Empty state */}
          {!rulesLoading && rules.length === 0 && (
            <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
              <Bell className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 mb-2">No alert rules configured</p>
              <p className="text-sm text-zinc-500 mb-4">
                Click &quot;Load Defaults&quot; to seed recommended templates
              </p>
            </div>
          )}

          {/* Active rules */}
          {activeRules.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Active Rules ({activeRules.length})
              </h3>
              {activeRules.map((rule) => (
                <RuleCard key={rule.id} rule={rule} onDelete={handleDeleteRule} />
              ))}
            </div>
          )}

          {/* Inactive rules */}
          {inactiveRules.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Inactive Rules ({inactiveRules.length})
              </h3>
              {inactiveRules.map((rule) => (
                <RuleCard key={rule.id} rule={rule} onDelete={handleDeleteRule} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div className="space-y-4">
          {/* History filters */}
          <div className="flex gap-2">
            {[
              { value: undefined, label: "All" },
              { value: "triggered", label: "Triggered" },
              { value: "acknowledged", label: "Acknowledged" },
            ].map((f) => (
              <button
                key={f.label}
                onClick={() => setHistoryFilter(f.value)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  historyFilter === f.value
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {historyLoading && (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500" />
            </div>
          )}

          {!historyLoading && history.length === 0 && (
            <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
              <BellRing className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">No alerts triggered yet</p>
              <p className="text-sm text-zinc-500 mt-1">
                Run an evaluation to check your rules against current metrics
              </p>
            </div>
          )}

          {history.length > 0 && (
            <div className="space-y-2">
              {history.map((alert) => {
                const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
                const SevIcon = sev.icon;
                return (
                  <div
                    key={alert.id}
                    className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl"
                  >
                    <div className={`p-2 rounded-lg ${sev.bg}`}>
                      <SevIcon className={`w-4 h-4 ${sev.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {alert.message || `Alert triggered`}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Value: {alert.metric_value.toFixed(2)} | Threshold:{" "}
                        {alert.threshold_value.toFixed(2)}
                        {alert.triggered_at &&
                          ` | ${new Date(alert.triggered_at).toLocaleString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          alert.status === "acknowledged"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-yellow-500/10 text-yellow-400"
                        }`}
                      >
                        {alert.status}
                      </span>
                      {alert.status !== "acknowledged" && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-green-400 transition-colors"
                          title="Acknowledge"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  onDelete,
}: {
  rule: AlertRuleData;
  onDelete: (id: string) => void;
}) {
  const sev = SEVERITY_CONFIG[rule.severity] || SEVERITY_CONFIG.info;
  const SevIcon = sev.icon;
  const operator = OPERATORS.find((o) => o.value === rule.condition_operator)?.label || rule.condition_operator;

  return (
    <div className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
      <div className={`p-2 rounded-lg ${sev.bg}`}>
        <SevIcon className={`w-4 h-4 ${sev.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">{rule.name}</p>
          {!rule.is_active && (
            <span className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-500 rounded">
              Inactive
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">
          {rule.metric_category}.{rule.metric_name} {operator} {rule.condition_value}
          {rule.description && ` — ${rule.description}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 text-xs rounded-full ${sev.bg} ${sev.color}`}>
          {rule.severity}
        </span>
        <button
          onClick={() => onDelete(rule.id)}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
          title="Delete rule"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
