"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Pause,
  Plus,
  Trash2,
  Mail,
  Linkedin,
  MessageSquare,
  Clock,
  Loader2,
  Save,
  UserPlus,
  X,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ArrowDown,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useOutreachSequence,
  useSequenceEnrollments,
  useSequenceAnalytics,
  useSequenceMutations,
} from "@/hooks/useGTM";
import { gtmApi, SequenceStep, OutreachEnrollment } from "@/lib/api";

const CHANNEL_CONFIG = {
  email: { icon: Mail, label: "Email", color: "text-blue-400 bg-blue-500/20 border-blue-500/30" },
  linkedin: { icon: Linkedin, label: "LinkedIn", color: "text-sky-400 bg-sky-500/20 border-sky-500/30" },
  sms: { icon: MessageSquare, label: "SMS", color: "text-green-400 bg-green-500/20 border-green-500/30" },
  wait: { icon: Clock, label: "Wait", color: "text-amber-400 bg-amber-500/20 border-amber-500/30" },
};

const ACTION_OPTIONS: Record<string, { value: string; label: string }[]> = {
  email: [{ value: "send_email", label: "Send Email" }],
  linkedin: [
    { value: "linkedin_view", label: "View Profile" },
    { value: "linkedin_connect", label: "Connection Request" },
    { value: "linkedin_message", label: "Send Message" },
  ],
  sms: [{ value: "send_sms", label: "Send SMS" }],
  wait: [{ value: "wait", label: "Wait" }],
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-500/20 text-zinc-400",
  active: "bg-emerald-500/20 text-emerald-400",
  paused: "bg-amber-500/20 text-amber-400",
  archived: "bg-slate-500/20 text-slate-400",
};

const ENROLLMENT_STATUS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  paused: "bg-amber-500/20 text-amber-400",
  completed: "bg-blue-500/20 text-blue-400",
  replied: "bg-indigo-500/20 text-indigo-400",
  bounced: "bg-red-500/20 text-red-400",
  unsubscribed: "bg-zinc-500/20 text-zinc-400",
  exited: "bg-zinc-500/20 text-zinc-400",
  failed: "bg-red-500/20 text-red-400",
};

function StepCard({
  step,
  index,
  onRemove,
  onUpdate,
}: {
  step: SequenceStep;
  index: number;
  onRemove: () => void;
  onUpdate: (updates: Partial<SequenceStep>) => void;
}) {
  const channelCfg = CHANNEL_CONFIG[step.channel as keyof typeof CHANNEL_CONFIG] || CHANNEL_CONFIG.email;
  const Icon = channelCfg.icon;

  return (
    <div className="relative">
      {/* Connector line */}
      {index > 0 && (
        <div className="absolute -top-4 left-6 w-px h-4 bg-white/10" />
      )}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg border ${channelCfg.color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">
                Step {index + 1}: {channelCfg.label}
              </span>
              <button
                onClick={onRemove}
                className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Action selector */}
              <div>
                <label className="block text-[10px] text-zinc-500 uppercase mb-1">
                  Action
                </label>
                <select
                  value={step.action}
                  onChange={(e) => onUpdate({ action: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                >
                  {(ACTION_OPTIONS[step.channel] || []).map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-zinc-900">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Delay */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-zinc-500 uppercase mb-1">
                    Delay (days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={step.delay_days}
                    onChange={(e) =>
                      onUpdate({ delay_days: parseInt(e.target.value) || 0 })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-zinc-500 uppercase mb-1">
                    Hours
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={step.delay_hours}
                    onChange={(e) =>
                      onUpdate({ delay_hours: parseInt(e.target.value) || 0 })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Config fields based on channel */}
            {step.channel === "email" && (
              <div>
                <label className="block text-[10px] text-zinc-500 uppercase mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={(step.config?.subject as string) || ""}
                  onChange={(e) =>
                    onUpdate({ config: { ...step.config, subject: e.target.value } })
                  }
                  placeholder="Email subject line..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                />
              </div>
            )}
            {(step.channel === "linkedin" || step.channel === "sms") &&
              step.action !== "linkedin_view" && (
                <div>
                  <label className="block text-[10px] text-zinc-500 uppercase mb-1">
                    Message
                  </label>
                  <textarea
                    value={(step.config?.message as string) || ""}
                    onChange={(e) =>
                      onUpdate({ config: { ...step.config, message: e.target.value } })
                    }
                    placeholder="Message content..."
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 resize-none"
                  />
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SequenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sequenceId = params.sequenceId as string;
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { sequence, isLoading, refetch } = useOutreachSequence(workspaceId, sequenceId);
  const { enrollments, total: enrollmentTotal, refetch: refetchEnrollments } =
    useSequenceEnrollments(workspaceId, sequenceId);
  const { analytics } = useSequenceAnalytics(workspaceId, sequenceId);
  const { activateSequence, pauseSequence } = useSequenceMutations(workspaceId);

  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [stepsInitialized, setStepsInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollEmail, setEnrollEmail] = useState("");
  const [enrollName, setEnrollName] = useState("");
  const [enrollRecordId, setEnrollRecordId] = useState("");
  const [activeTab, setActiveTab] = useState<"steps" | "enrollments" | "analytics">("steps");

  // Initialize steps from sequence data
  if (sequence && !stepsInitialized) {
    setSteps(sequence.steps as SequenceStep[]);
    setStepsInitialized(true);
  }

  const addStep = (channel: string) => {
    const actions = ACTION_OPTIONS[channel] || [];
    const newStep: SequenceStep = {
      step_index: steps.length,
      channel: channel as SequenceStep["channel"],
      action: actions[0]?.value || channel,
      delay_days: steps.length === 0 ? 0 : 1,
      delay_hours: 0,
      config: {},
      conditions: {},
    };
    setSteps([...steps, newStep]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_index: i })));
  };

  const updateStep = (index: number, updates: Partial<SequenceStep>) => {
    setSteps(steps.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  const saveSteps = async () => {
    if (!workspaceId || !sequenceId) return;
    setSaving(true);
    try {
      const channels = [...new Set(steps.map((s) => s.channel))];
      await gtmApi.sequences.update(workspaceId, sequenceId, { steps, channels });
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleEnroll = async () => {
    if (!workspaceId || !sequenceId || !enrollEmail) return;
    try {
      await gtmApi.sequences.enroll(workspaceId, sequenceId, {
        record_id: enrollRecordId,
        email: enrollEmail,
        contact_name: enrollName || undefined,
      });
      setShowEnrollModal(false);
      setEnrollEmail("");
      setEnrollName("");
      setEnrollRecordId("");
      refetchEnrollments();
    } catch {
      // Error handled by API layer
    }
  };

  if (isLoading || !sequence) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/gtm/sequences"
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{sequence.name}</h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[sequence.status]}`}
              >
                {sequence.status}
              </span>
            </div>
            {sequence.description && (
              <p className="text-sm text-zinc-400 mt-0.5">{sequence.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sequence.status === "active" && (
            <button
              onClick={() => setShowEnrollModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/5 text-zinc-300 hover:bg-white/10 rounded-lg text-sm transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Enroll
            </button>
          )}
          {(sequence.status === "draft" || sequence.status === "paused") && (
            <button
              onClick={() => activateSequence.mutate(sequenceId)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Play className="w-4 h-4" />
              Activate
            </button>
          )}
          {sequence.status === "active" && (
            <button
              onClick={() => pauseSequence.mutate(sequenceId)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Enrolled", value: sequence.enrolled_count, color: "text-white" },
          { label: "Active", value: sequence.active_count, color: "text-blue-400" },
          { label: "Completed", value: sequence.completed_count, color: "text-emerald-400" },
          { label: "Replied", value: sequence.replied_count, color: "text-indigo-400" },
          { label: "Bounced", value: sequence.bounced_count, color: "text-red-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <div className={`text-xl font-semibold ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10">
        {(["steps", "enrollments", "analytics"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "enrollments" && enrollmentTotal > 0 && (
              <span className="ml-1.5 text-xs text-zinc-500">({enrollmentTotal})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "steps" && (
        <div className="space-y-4">
          {/* Step list */}
          <div className="space-y-3">
            {steps.map((step, i) => (
              <StepCard
                key={i}
                step={step}
                index={i}
                onRemove={() => removeStep(i)}
                onUpdate={(updates) => updateStep(i, updates)}
              />
            ))}
          </div>

          {/* Add step buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 mr-2">Add step:</span>
            {Object.entries(CHANNEL_CONFIG).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button
                  key={key}
                  onClick={() => addStep(key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors hover:opacity-80 ${cfg.color}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={saveSteps}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Steps
            </button>
          </div>
        </div>
      )}

      {activeTab === "enrollments" && (
        <div className="space-y-4">
          {enrollments.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
              <p className="text-sm text-zinc-400">No contacts enrolled yet.</p>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Contact</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Status</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Step</th>
                    <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Enrolled</th>
                    <th className="text-right text-xs text-zinc-500 font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((enrollment: OutreachEnrollment) => (
                    <tr key={enrollment.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="text-sm text-white">{enrollment.contact_name || enrollment.email}</div>
                        <div className="text-xs text-zinc-500">{enrollment.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            ENROLLMENT_STATUS[enrollment.status] || ENROLLMENT_STATUS.active
                          }`}
                        >
                          {enrollment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-300">
                        {enrollment.current_step_index + 1} / {steps.length || "?"}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-400">
                        {new Date(enrollment.enrolled_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {enrollment.status === "active" && (
                          <button
                            onClick={async () => {
                              await gtmApi.sequences.pauseEnrollment(workspaceId!, enrollment.id);
                              refetchEnrollments();
                            }}
                            className="text-xs text-amber-400 hover:text-amber-300 mr-2"
                          >
                            Pause
                          </button>
                        )}
                        {enrollment.status === "paused" && (
                          <button
                            onClick={async () => {
                              await gtmApi.sequences.resumeEnrollment(workspaceId!, enrollment.id);
                              refetchEnrollments();
                            }}
                            className="text-xs text-emerald-400 hover:text-emerald-300 mr-2"
                          >
                            Resume
                          </button>
                        )}
                        {(enrollment.status === "active" || enrollment.status === "paused") && (
                          <button
                            onClick={async () => {
                              await gtmApi.sequences.unenroll(workspaceId!, enrollment.id);
                              refetchEnrollments();
                            }}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "analytics" && (
        <div className="space-y-4">
          {analytics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <div className="text-2xl font-semibold text-white">{analytics.total_enrolled}</div>
                <div className="text-xs text-zinc-500">Total Enrolled</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <div className="text-2xl font-semibold text-emerald-400">
                  {analytics.completion_rate.toFixed(1)}%
                </div>
                <div className="text-xs text-zinc-500">Completion Rate</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <div className="text-2xl font-semibold text-indigo-400">
                  {analytics.reply_rate.toFixed(1)}%
                </div>
                <div className="text-xs text-zinc-500">Reply Rate</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <div className="text-2xl font-semibold text-blue-400">{analytics.active}</div>
                <div className="text-xs text-zinc-500">Active Now</div>
              </div>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
              <p className="text-sm text-zinc-400">Analytics will appear once contacts are enrolled.</p>
            </div>
          )}
        </div>
      )}

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Enroll Contact</h2>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Email *</label>
                <input
                  type="email"
                  value={enrollEmail}
                  onChange={(e) => setEnrollEmail(e.target.value)}
                  placeholder="contact@company.com"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Name</label>
                <input
                  type="text"
                  value={enrollName}
                  onChange={(e) => setEnrollName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">CRM Record ID *</label>
                <input
                  type="text"
                  value={enrollRecordId}
                  onChange={(e) => setEnrollRecordId(e.target.value)}
                  placeholder="CRM record UUID"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowEnrollModal(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEnroll}
                  disabled={!enrollEmail || !enrollRecordId}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  Enroll
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
