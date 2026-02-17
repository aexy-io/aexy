"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  AlertTriangle,
  Bell,
  Clock,
  Users,
  Zap,
  Mail,
  MessageSquare,
  UserCircle,
} from "lucide-react";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useTicketForms } from "@/hooks/useTicketing";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  escalationApi,
  EscalationMatrix,
  EscalationRule,
  TicketSeverity,
  EscalationLevel,
  NotificationChannel,
} from "@/lib/api";

const SEVERITY_OPTIONS: { value: TicketSeverity; label: string; color: string }[] = [
  { value: "critical", label: "Critical", color: "bg-red-500" },
  { value: "high", label: "High", color: "bg-orange-500" },
  { value: "medium", label: "Medium", color: "bg-blue-500" },
  { value: "low", label: "Low", color: "bg-slate-500" },
];

const LEVEL_OPTIONS: { value: EscalationLevel; label: string; description: string }[] = [
  { value: "level_1", label: "Level 1", description: "First escalation" },
  { value: "level_2", label: "Level 2", description: "Second escalation" },
  { value: "level_3", label: "Level 3", description: "Third escalation" },
  { value: "level_4", label: "Level 4", description: "Final escalation" },
];

const CHANNEL_OPTIONS: { value: NotificationChannel; label: string; icon: React.ReactNode }[] = [
  { value: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  { value: "slack", label: "Slack", icon: <MessageSquare className="h-4 w-4" /> },
  { value: "in_app", label: "In-App", icon: <Bell className="h-4 w-4" /> },
];

interface RuleEditorProps {
  rule: Partial<EscalationRule>;
  onChange: (rule: Partial<EscalationRule>) => void;
  onRemove: () => void;
  members: Array<{ id: string; name?: string; email: string }>;
  teams: Array<{ id: string; name: string }>;
}

function RuleEditor({ rule, onChange, onRemove, members, teams }: RuleEditorProps) {
  return (
    <div className="bg-muted rounded-lg p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <select
            value={rule.level || "level_1"}
            onChange={(e) => onChange({ ...rule, level: e.target.value as EscalationLevel })}
            className="px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-sm">after</span>
          <input
            type="number"
            value={rule.delay_minutes || 0}
            onChange={(e) => onChange({ ...rule, delay_minutes: parseInt(e.target.value) || 0 })}
            min={0}
            className="w-20 px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <span className="text-muted-foreground text-sm">minutes</span>
        </div>
        <button
          onClick={onRemove}
          className="p-2 text-muted-foreground hover:text-red-400 transition"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">Notification Channels</label>
        <div className="flex flex-wrap gap-2">
          {CHANNEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                const channels = rule.channels || [];
                const newChannels = channels.includes(opt.value)
                  ? channels.filter((c) => c !== opt.value)
                  : [...channels, opt.value];
                onChange({ ...rule, channels: newChannels });
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${
                (rule.channels || []).includes(opt.value)
                  ? "bg-purple-600 border-purple-500 text-white"
                  : "bg-card border-border text-muted-foreground hover:border-purple-500"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Notify Users</label>
          <select
            multiple
            value={rule.notify_users || []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
              onChange({ ...rule, notify_users: selected });
            }}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[100px]"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name || member.email}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Notify Teams</label>
          <select
            multiple
            value={rule.notify_teams || []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
              onChange({ ...rule, notify_teams: selected });
            }}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[100px]"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`oncall-${rule.level}`}
          checked={rule.notify_oncall || false}
          onChange={(e) => onChange({ ...rule, notify_oncall: e.target.checked })}
          className="rounded border-border bg-muted text-purple-500 focus:ring-purple-500"
        />
        <label htmlFor={`oncall-${rule.level}`} className="text-sm text-foreground flex items-center gap-2">
          <UserCircle className="h-4 w-4" />
          Also notify on-call person
        </label>
      </div>
    </div>
  );
}

export default function EscalationSettingsPage() {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { members } = useWorkspaceMembers(workspaceId);
  const { teams } = useTeams(workspaceId);
  const { forms } = useTicketForms(workspaceId);

  const [isCreating, setIsCreating] = useState(false);
  const [editingMatrix, setEditingMatrix] = useState<EscalationMatrix | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    severity_levels: [] as TicketSeverity[],
    rules: [
      { level: "level_1" as EscalationLevel, delay_minutes: 0, channels: ["email", "in_app"] as NotificationChannel[] },
    ] as Partial<EscalationRule>[],
    form_ids: [] as string[],
    team_ids: [] as string[],
  });

  const { data: matrices = [], isLoading } = useQuery({
    queryKey: ["escalationMatrices", workspaceId],
    queryFn: () => escalationApi.list(workspaceId!, false),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      escalationApi.create(workspaceId!, {
        ...data,
        rules: data.rules
          .filter((r): r is EscalationRule => !!(r.level && r.channels?.length && r.delay_minutes !== undefined))
          .map(r => ({
            level: r.level,
            delay_minutes: r.delay_minutes,
            channels: r.channels,
            notify_users: r.notify_users,
            notify_teams: r.notify_teams,
            notify_oncall: r.notify_oncall,
          })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalationMatrices", workspaceId] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ matrixId, data }: { matrixId: string; data: Partial<EscalationMatrix> }) =>
      escalationApi.update(workspaceId!, matrixId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalationMatrices", workspaceId] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (matrixId: string) => escalationApi.delete(workspaceId!, matrixId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalationMatrices", workspaceId] });
    },
  });

  const resetForm = () => {
    setIsCreating(false);
    setEditingMatrix(null);
    setFormData({
      name: "",
      description: "",
      severity_levels: [],
      rules: [{ level: "level_1", delay_minutes: 0, channels: ["email", "in_app"] }],
      form_ids: [],
      team_ids: [],
    });
  };

  const startEditing = (matrix: EscalationMatrix) => {
    setEditingMatrix(matrix);
    setIsCreating(true);
    setFormData({
      name: matrix.name,
      description: matrix.description || "",
      severity_levels: matrix.severity_levels,
      rules: matrix.rules,
      form_ids: matrix.form_ids || [],
      team_ids: matrix.team_ids || [],
    });
  };

  const handleSubmit = () => {
    if (editingMatrix) {
      updateMutation.mutate({
        matrixId: editingMatrix.id,
        data: {
          ...formData,
          rules: formData.rules.filter((r) => r.level && r.channels?.length) as EscalationRule[],
        },
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const addRule = () => {
    const nextLevel = `level_${formData.rules.length + 1}` as EscalationLevel;
    setFormData({
      ...formData,
      rules: [
        ...formData.rules,
        { level: nextLevel, delay_minutes: 30, channels: ["email", "in_app"] },
      ],
    });
  };

  const updateRule = (index: number, rule: Partial<EscalationRule>) => {
    const newRules = [...formData.rules];
    newRules[index] = rule;
    setFormData({ ...formData, rules: newRules });
  };

  const removeRule = (index: number) => {
    setFormData({
      ...formData,
      rules: formData.rules.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Escalation Matrix</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure automatic escalation rules based on ticket severity</p>
        </div>
        <div className="flex items-center gap-3">
          {!isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition"
            >
              <Plus className="h-4 w-4" />
              Add Escalation Matrix
            </button>
          )}
        </div>
      </div>

      <div>

        {/* Create/Edit Form */}
        {isCreating && (
          <div className="bg-card rounded-xl border border-border p-6 mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-6">
              {editingMatrix ? "Edit Escalation Matrix" : "Create Escalation Matrix"}
            </h2>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Critical Issue Escalation"
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description"
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Apply to Severity Levels
                </label>
                <div className="flex flex-wrap gap-2">
                  {SEVERITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        const levels = formData.severity_levels;
                        const newLevels = levels.includes(opt.value)
                          ? levels.filter((l) => l !== opt.value)
                          : [...levels, opt.value];
                        setFormData({ ...formData, severity_levels: newLevels });
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition ${
                        formData.severity_levels.includes(opt.value)
                          ? `${opt.color} border-transparent text-white`
                          : "bg-card border-border text-muted-foreground hover:border-purple-500"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Scope (Optional - leave empty to apply to all)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Forms</label>
                    <select
                      multiple
                      value={formData.form_ids}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                        setFormData({ ...formData, form_ids: selected });
                      }}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[80px]"
                    >
                      {forms.map((form) => (
                        <option key={form.id} value={form.id}>
                          {form.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Teams</label>
                    <select
                      multiple
                      value={formData.team_ids}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                        setFormData({ ...formData, team_ids: selected });
                      }}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[80px]"
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Escalation Rules
                  </label>
                  {formData.rules.length < 4 && (
                    <button
                      onClick={addRule}
                      className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
                    >
                      <Plus className="h-4 w-4" />
                      Add Rule
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  {formData.rules.map((rule, index) => (
                    <RuleEditor
                      key={index}
                      rule={rule}
                      onChange={(newRule) => updateRule(index, newRule)}
                      onRemove={() => removeRule(index)}
                      members={members.map(m => ({ id: m.developer_id, name: m.developer_name || undefined, email: m.developer_email || "" }))}
                      teams={teams}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-muted-foreground hover:text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={
                    !formData.name ||
                    formData.severity_levels.length === 0 ||
                    formData.rules.length === 0 ||
                    createMutation.isPending ||
                    updateMutation.isPending
                  }
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingMatrix
                    ? "Update"
                    : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Existing Matrices */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">Loading...</div>
        ) : matrices.length === 0 && !isCreating ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <AlertTriangle className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No escalation matrices</h3>
            <p className="text-muted-foreground mb-6">
              Create an escalation matrix to automatically notify people based on ticket severity
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition"
            >
              <Plus className="h-4 w-4" />
              Create Your First Matrix
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {matrices.map((matrix) => (
              <div
                key={matrix.id}
                className={`bg-card rounded-xl border p-6 ${
                  matrix.is_active ? "border-border" : "border-border/50 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      {matrix.name}
                      {!matrix.is_active && (
                        <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded">
                          Inactive
                        </span>
                      )}
                    </h3>
                    {matrix.description && (
                      <p className="text-muted-foreground text-sm mt-1">{matrix.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEditing(matrix)}
                      className="p-2 text-muted-foreground hover:text-foreground transition"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this escalation matrix?")) {
                          deleteMutation.mutate(matrix.id);
                        }
                      }}
                      className="p-2 text-muted-foreground hover:text-red-400 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {matrix.severity_levels.map((sev) => {
                    const opt = SEVERITY_OPTIONS.find((o) => o.value === sev);
                    return (
                      <span
                        key={sev}
                        className={`px-3 py-1 rounded-full text-sm text-white ${opt?.color || "bg-slate-600"}`}
                      >
                        {opt?.label || sev}
                      </span>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  {matrix.rules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-4 text-sm text-foreground bg-muted/50 rounded-lg px-4 py-2"
                    >
                      <span className="font-medium text-purple-400">
                        {LEVEL_OPTIONS.find((l) => l.value === rule.level)?.label}
                      </span>
                      <span className="text-muted-foreground">after {rule.delay_minutes} min</span>
                      <div className="flex items-center gap-2">
                        {rule.channels?.map((ch) => {
                          const opt = CHANNEL_OPTIONS.find((c) => c.value === ch);
                          return (
                            <span key={ch} className="text-muted-foreground">
                              {opt?.icon}
                            </span>
                          );
                        })}
                      </div>
                      {rule.notify_oncall && (
                        <span className="text-green-400 flex items-center gap-1">
                          <UserCircle className="h-4 w-4" /> On-call
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
