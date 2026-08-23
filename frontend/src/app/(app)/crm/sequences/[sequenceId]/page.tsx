"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Play,
  Pause,
  Trash2,
  UserPlus,
  UserMinus,
  X,
  Mail,
  CheckSquare,
  Clock,
  GitBranch,
  Zap,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useCRMObjects,
  useCRMRecords,
  useCRMSequences,
  useCRMSequenceEnrollments,
  useCRMSequenceSteps,
} from "@/hooks/useCRM";
import {
  CRMSequenceDelayUnit,
  CRMSequenceEnrollment,
  CRMSequenceEnrollmentStatus,
  CRMSequenceStepType,
} from "@/lib/api";
import { formatAbsolute, formatRelative } from "@/lib/datetime";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const STEP_TYPES: { value: CRMSequenceStepType; label: string; icon: typeof Mail }[] = [
  { value: "email", label: "Send email", icon: Mail },
  { value: "task", label: "Create task", icon: CheckSquare },
  { value: "wait", label: "Wait", icon: Clock },
  { value: "condition", label: "Condition", icon: GitBranch },
  { value: "action", label: "Action", icon: Zap },
];

const STATUS_STYLES: Record<CRMSequenceEnrollmentStatus, string> = {
  active: "bg-green-500/20 text-green-700 dark:text-green-400",
  paused: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  completed: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  exited: "bg-muted-foreground/20 text-muted-foreground",
  failed: "bg-red-500/20 text-red-700 dark:text-red-400",
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "exited", label: "Exited" },
  { value: "failed", label: "Failed" },
];

export default function CRMSequenceDetailPage() {
  const { sequenceId } = useParams<{ sequenceId: string }>();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { sequences, toggleSequence } = useCRMSequences(workspaceId);
  const sequence = sequences.find((s) => s.id === sequenceId);

  const { objects } = useCRMObjects(workspaceId);
  const object = objects.find((o) => o.id === sequence?.object_id);

  const { steps, addStep, deleteStep, isAdding } = useCRMSequenceSteps(workspaceId, sequenceId);

  const [statusFilter, setStatusFilter] = useState("");
  const {
    enrollments,
    isLoading: enrollmentsLoading,
    enroll,
    pause,
    resume,
    unenroll,
    isEnrolling,
  } = useCRMSequenceEnrollments(
    workspaceId,
    sequenceId,
    statusFilter ? { status: statusFilter } : undefined
  );

  // Records of the sequence's object, used to name enrollments and to pick who to enrol.
  const { records } = useCRMRecords(workspaceId, sequence?.object_id ?? null, { limit: 100 });
  const recordName = (recordId: string) =>
    records.find((r) => r.id === recordId)?.display_name || recordId;

  const [showEnrol, setShowEnrol] = useState(false);
  const [recordSearch, setRecordSearch] = useState("");
  const [showAddStep, setShowAddStep] = useState(false);
  const [stepType, setStepType] = useState<CRMSequenceStepType>("email");
  const [delayValue, setDelayValue] = useState(0);
  const [delayUnit, setDelayUnit] = useState<CRMSequenceDelayUnit>("days");
  const [pendingUnenrol, setPendingUnenrol] = useState<CRMSequenceEnrollment | null>(null);

  const enrolledIds = useMemo(
    () => new Set(enrollments.filter((e) => e.status === "active").map((e) => e.record_id)),
    [enrollments]
  );

  const pickableRecords = useMemo(() => {
    const term = recordSearch.trim().toLowerCase();
    return records
      .filter((r) => !enrolledIds.has(r.id))
      .filter((r) => !term || (r.display_name || "").toLowerCase().includes(term))
      .slice(0, 50);
  }, [records, enrolledIds, recordSearch]);

  if (!sequence) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto text-muted-foreground text-sm">Loading sequence…</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/crm/sequences"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          All sequences
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">{sequence.name}</h1>
            <p className="text-sm text-muted-foreground">
              {object?.name || "Unknown object"} · {sequence.active_enrollments} active ·{" "}
              {sequence.total_enrollments} all-time
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleSequence(sequence.id)}
              className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-accent border border-border text-foreground rounded-lg transition-colors text-sm"
            >
              {sequence.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {sequence.is_active ? "Active" : "Paused"}
            </button>
            <button
              onClick={() => setShowEnrol(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
            >
              <UserPlus className="h-4 w-4" />
              Enroll record
            </button>
          </div>
        </div>

        {/* Steps */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Steps</h2>
            <button
              onClick={() => setShowAddStep((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent border border-border text-foreground rounded-lg transition-colors text-sm"
            >
              <Plus className="h-4 w-4" />
              Add step
            </button>
          </div>

          {showAddStep && (
            <div className="bg-muted/50 border border-border rounded-xl p-4 mb-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Type</label>
                <select
                  value={stepType}
                  onChange={(e) => setStepType(e.target.value as CRMSequenceStepType)}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                >
                  {STEP_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Wait before</label>
                <input
                  type="number"
                  min={0}
                  value={delayValue}
                  onChange={(e) => setDelayValue(Number(e.target.value))}
                  className="w-24 bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Unit</label>
                <select
                  value={delayUnit}
                  onChange={(e) => setDelayUnit(e.target.value as CRMSequenceDelayUnit)}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
              <button
                onClick={async () => {
                  await addStep({
                    step_type: stepType,
                    config: {},
                    delay_value: delayValue,
                    delay_unit: delayUnit,
                  });
                  setShowAddStep(false);
                  setDelayValue(0);
                }}
                disabled={isAdding}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm"
              >
                {isAdding ? "Adding…" : "Add"}
              </button>
            </div>
          )}

          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No steps yet. A sequence with no steps can still be enrolled into, but nothing will be
              sent.
            </p>
          ) : (
            <div className="space-y-2">
              {steps
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((step) => {
                  const meta = STEP_TYPES.find((s) => s.value === step.step_type);
                  const Icon = meta?.icon || Zap;
                  return (
                    <div
                      key={step.id}
                      className="bg-muted/50 border border-border rounded-xl p-4 flex items-center gap-3"
                    >
                      <div className="p-2 rounded-lg bg-accent text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground font-medium">
                          {meta?.label || step.step_type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {step.delay_value > 0
                            ? `Waits ${step.delay_value} ${step.delay_unit} first`
                            : "Runs immediately"}
                          {" · "}
                          {step.total_executions} runs
                        </p>
                      </div>
                      <button
                        onClick={() => deleteStep(step.id)}
                        className="p-2 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-accent transition-colors"
                        title="Delete step"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </section>

        {/* Enrollments */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Enrollments</h2>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-foreground text-sm"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {enrollmentsLoading ? (
            <p className="text-sm text-muted-foreground">Loading enrollments…</p>
          ) : enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody is enrolled yet. Use Enroll record above, or an automation&apos;s enrol action.
            </p>
          ) : (
            <div className="space-y-2">
              {enrollments.map((enrollment) => (
                <div
                  key={enrollment.id}
                  className="bg-muted/50 border border-border rounded-xl p-4 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground font-medium truncate">
                      {recordName(enrollment.record_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Enrolled {formatRelative(enrollment.enrolled_at)}
                      {enrollment.enrolled_by_automation_id ? " by an automation" : " manually"}
                      {enrollment.next_step_scheduled_at
                        ? ` · next step ${formatAbsolute(enrollment.next_step_scheduled_at)}`
                        : ""}
                      {enrollment.exit_reason ? ` · exited: ${enrollment.exit_reason}` : ""}
                    </p>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_STYLES[enrollment.status] || STATUS_STYLES.exited
                    }`}
                  >
                    {enrollment.status}
                  </span>

                  {enrollment.status === "active" && (
                    <button
                      onClick={() => pause(enrollment.id)}
                      className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
                      title="Pause"
                    >
                      <Pause className="h-4 w-4" />
                    </button>
                  )}
                  {enrollment.status === "paused" && (
                    <button
                      onClick={() => resume(enrollment.id)}
                      className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
                      title="Resume"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                  )}
                  {(enrollment.status === "active" || enrollment.status === "paused") && (
                    <button
                      onClick={() => setPendingUnenrol(enrollment)}
                      className="p-2 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-accent transition-colors"
                      title="Unenroll"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showEnrol && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Enroll a record</h2>
              <button
                onClick={() => setShowEnrol(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              value={recordSearch}
              onChange={(e) => setRecordSearch(e.target.value)}
              placeholder={`Search ${object?.name || "record"}s…`}
              className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 mb-3 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />

            <div className="max-h-72 overflow-y-auto space-y-1">
              {pickableRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No matching records that aren&apos;t already enrolled.
                </p>
              ) : (
                pickableRecords.map((record) => (
                  <button
                    key={record.id}
                    onClick={async () => {
                      await enroll(record.id);
                      setShowEnrol(false);
                      setRecordSearch("");
                    }}
                    disabled={isEnrolling}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
                  >
                    {record.display_name || record.id}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingUnenrol !== null}
        onOpenChange={(open) => !open && setPendingUnenrol(null)}
        title="Unenroll record"
        description={`Remove ${
          pendingUnenrol ? recordName(pendingUnenrol.record_id) : ""
        } from this sequence? Remaining steps will not run.`}
        confirmLabel="Unenroll"
        tone="danger"
        onConfirm={async () => {
          if (pendingUnenrol) await unenroll(pendingUnenrol.id);
          setPendingUnenrol(null);
        }}
      />
    </div>
  );
}
