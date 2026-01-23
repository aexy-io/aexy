"use client";

import { useState } from "react";
import {
  CheckCircle,
  AlertCircle,
  FileText,
  Users,
  Clock,
  Shield,
  Camera,
  Calendar,
  ChevronRight,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Assessment } from "@/lib/api";
import { useAssessmentPublish } from "@/hooks/useAssessments";

interface Step5Props {
  assessment: Assessment;
  assessmentId: string;
  organizationId: string;
  onSave: (data: { confirmed: boolean }) => Promise<Assessment>;
  onPublish: () => void;
  onPrev: () => void;
}

interface ReviewSection {
  title: string;
  icon: React.ElementType;
  status: "complete" | "incomplete" | "warning";
  items: { label: string; value: string | number | boolean | undefined }[];
}

export default function Step5ReviewConfirm({
  assessment,
  assessmentId,
  organizationId,
  onSave,
  onPublish,
  onPrev,
}: Step5Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  console.log("ASSESSMENT IN REVIEW",assessment);
  const { publishCheck, isChecking, publish, isPublishing } = useAssessmentPublish(
    assessmentId,
    organizationId
  );

  const handleConfirmAndPublish = async () => {
    setIsSaving(true);
    try {
      await onSave({ confirmed: true });
      await publish({ send_invitations: true });
      onPublish();
    } catch (error) {
      console.error("Failed to publish:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate total questions from question_types object
  const getQuestionCount = (qt: any) => {
    if (!qt) return 0;
    if (typeof qt === 'object') {
      return (qt.code || 0) + (qt.mcq || 0) + (qt.subjective || 0) + (qt.pseudo_code || 0);
    }
    return 0;
  };

  const totalQuestions = assessment.topics?.reduce(
    (sum, t) => sum + getQuestionCount(t.question_types),
    0
  ) || assessment.total_questions || 0;

  const totalDuration = assessment.topics?.reduce(
    (sum, t) => sum + (t.estimated_time_minutes || 0),
    0
  ) || assessment.total_duration_minutes || 0;

  const candidateCount = assessment.total_candidates || 0;

  const sections: ReviewSection[] = [
    {
      title: "Assessment Details",
      icon: FileText,
      status: assessment.title && assessment.job_designation ? "complete" : "incomplete",
      items: [
        { label: "Title", value: assessment.title },
        { label: "Job Designation", value: assessment.job_designation },
        { label: "Department", value: assessment.department ?? undefined },
        {
          label: "Experience",
          value: `${assessment.experience_min || 0} - ${assessment.experience_max || 10} years`,
        },
        {
          label: "Skills",
          value: assessment.skills?.map((s) => s.name).join(", ") || "None selected",
        },
      ],
    },
    {
      title: "Topics & Questions",
      icon: FileText,
      status: totalQuestions > 0 ? "complete" : "incomplete",
      items: [
        { label: "Total Topics", value: assessment.topics?.length || 0 },
        { label: "Total Questions", value: totalQuestions },
        { label: "Estimated Duration", value: `${totalDuration} minutes` },
        {
          label: "Question Types",
          value: (() => {
            const types = new Set<string>();
            assessment.topics?.forEach((t) => {
              const qt = t.question_types;
              if (qt) {
                if (qt.code > 0) types.add("Code");
                if (qt.mcq > 0) types.add("MCQ");
                if (qt.subjective > 0) types.add("Subjective");
                if (qt.pseudo_code > 0) types.add("Pseudo Code");
              }
            });
            return types.size > 0 ? Array.from(types).join(", ") : "Not configured";
          })(),
        },
      ],
    },
    {
      title: "Schedule",
      icon: Calendar,
      status: assessment.schedule?.start_date ? "complete" : "incomplete",
      items: [
        { label: "Type", value: assessment.schedule?.type === "fixed" ? "Fixed Time" : "Flexible Window" },
        {
          label: "Start Date",
          value: assessment.schedule?.start_date
            ? new Date(assessment.schedule.start_date).toLocaleDateString()
            : "Not set",
        },
        {
          label: "End Date",
          value: assessment.schedule?.end_date
            ? new Date(assessment.schedule.end_date).toLocaleDateString()
            : "Not set",
        },
        { label: "Timezone", value: assessment.schedule?.timezone || "Not set" },
        { label: "Grace Period", value: assessment.schedule?.grace_period_minutes ? `${assessment.schedule.grace_period_minutes} min` : "None" },
      ],
    },
    {
      title: "Proctoring",
      icon: Camera,
      status: assessment.proctoring_settings?.enabled === true ? "complete" : "warning",
      items: [
        { label: "Status", value: assessment.proctoring_settings?.enabled === true ? "Enabled" : "Off" },
        { label: "Webcam", value: assessment.proctoring_settings?.enable_webcam ? "Required" : "Not required" },
        { label: "Screen Recording", value: assessment.proctoring_settings?.enable_screen_recording ? "Enabled" : "Off" },
        { label: "Face Detection", value: assessment.proctoring_settings?.enable_face_detection ? "Enabled" : "Off" },
        { label: "Tab Tracking", value: assessment.proctoring_settings?.enable_tab_tracking ? "Enabled" : "Off" },
      ],
    },
    {
      title: "Security",
      icon: Shield,
      status: "complete",
      items: [
        { label: "Copy/Paste", value: assessment.security_settings?.disable_copy_paste ? "Disabled" : "Allowed" },
        { label: "Shuffle Questions", value: assessment.security_settings?.shuffle_questions ? "Yes" : "No" },
        { label: "Shuffle Options", value: assessment.security_settings?.shuffle_options ? "Yes" : "No" },
        { label: "Max Attempts", value: assessment.max_attempts || 1 },
        { label: "Passing Score", value: `${assessment.passing_score_percent || 60}%` },
      ],
    },
    {
      title: "Candidates",
      icon: Users,
      status: candidateCount > 0 ? "complete" : "incomplete",
      items: [
        { label: "Total Invited", value: candidateCount },
        { label: "Send Invitations", value: "On publish" },
      ],
    },
  ];

  const getStatusIcon = (status: ReviewSection["status"]) => {
    switch (status) {
      case "complete":
        return <CheckCircle className="w-5 h-5 text-success" />;
      case "incomplete":
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      case "warning":
        return <AlertCircle className="w-5 h-5 text-warning" />;
    }
  };

  const getStatusColor = (status: ReviewSection["status"]) => {
    switch (status) {
      case "complete":
        return "border-success/30 bg-success/10";
      case "incomplete":
        return "border-destructive/30 bg-destructive/10";
      case "warning":
        return "border-warning/30 bg-warning/10";
    }
  };

  const allComplete = sections.every((s) => s.status !== "incomplete");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">Review & Confirm</h2>
        <p className="text-muted-foreground">Review all settings before publishing the assessment</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-primary/10 rounded-lg p-4 text-center">
          <FileText className="w-6 h-6 text-primary mx-auto mb-2" />
          <p className="text-2xl font-bold text-foreground">{totalQuestions}</p>
          <p className="text-xs text-primary">Questions</p>
        </div>
        <div className="bg-purple-500/10 rounded-lg p-4 text-center">
          <Clock className="w-6 h-6 text-purple-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-foreground">{totalDuration}</p>
          <p className="text-xs text-purple-500">Minutes</p>
        </div>
        <div className="bg-success/10 rounded-lg p-4 text-center">
          <Users className="w-6 h-6 text-success mx-auto mb-2" />
          <p className="text-2xl font-bold text-foreground">{candidateCount}</p>
          <p className="text-xs text-success">Candidates</p>
        </div>
        <div className="bg-warning/10 rounded-lg p-4 text-center">
          <Shield className="w-6 h-6 text-warning mx-auto mb-2" />
          <p className="text-2xl font-bold text-foreground">
            {assessment.proctoring_settings?.enabled === true ? "On" : "Off"}
          </p>
          <p className="text-xs text-warning">Proctoring</p>
        </div>
      </div>

      {/* Pre-publish Checks */}
      {publishCheck && (
        <div className="space-y-3">
          <div
            className={`rounded-lg border p-4 ${
              publishCheck.can_publish
                ? "bg-success/10 border-success/30"
                : "bg-destructive/10 border-destructive/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {publishCheck.can_publish ? (
                <CheckCircle className="w-5 h-5 text-success" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive" />
              )}
              <span
                className={`font-medium ${
                  publishCheck.can_publish ? "text-success" : "text-destructive"
                }`}
              >
                {publishCheck.can_publish ? "Ready to Publish" : "Cannot Publish Yet"}
              </span>
            </div>
            {!publishCheck.can_publish && publishCheck.issues && publishCheck.issues.length > 0 && (
              <ul className="text-sm text-destructive list-disc list-inside space-y-1">
                {publishCheck.issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
          {publishCheck.warnings && publishCheck.warnings.length > 0 && (
            <div className="rounded-lg border p-4 bg-warning/10 border-warning/30">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-warning" />
                <span className="font-medium text-warning">Warnings</span>
              </div>
              <ul className="text-sm text-warning list-disc list-inside space-y-1">
                {publishCheck.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Review Sections */}
      <div className="space-y-4">
        {sections.map((section) => (
          <div
            key={section.title}
            className={`rounded-lg border ${getStatusColor(section.status)}`}
          >
            <div className="p-4 flex items-center gap-3 border-b border-inherit">
              {getStatusIcon(section.status)}
              <section.icon className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-foreground">{section.title}</span>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              {section.items.map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium text-foreground">
                    {item.value === undefined || item.value === ""
                      ? "Not set"
                      : typeof item.value === "boolean"
                      ? item.value
                        ? "Yes"
                        : "No"
                      : String(item.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation */}
      <div className="bg-card rounded-lg border border-border p-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-5 h-5 mt-0.5 rounded border-border text-primary focus:ring-primary"
          />
          <div>
            <p className="font-medium text-foreground">
              I confirm that all settings are correct
            </p>
            <p className="text-sm text-muted-foreground">
              By publishing this assessment, invitation emails will be sent to all added
              candidates. This action cannot be undone.
            </p>
          </div>
        </label>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-border">
        <button
          onClick={onPrev}
          className="px-4 py-2 text-foreground hover:bg-muted rounded-lg"
        >
          Previous
        </button>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              setIsSaving(true);
              try {
                await onSave({ confirmed: false });
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
            className="px-4 py-2 border border-border text-foreground rounded-lg hover:bg-muted"
          >
            Save as Draft
          </button>
          <button
            onClick={handleConfirmAndPublish}
            disabled={!allComplete || !confirmed || isSaving || isPublishing}
            className="flex items-center gap-2 px-6 py-2 bg-success text-success-foreground rounded-lg hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPublishing || isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                Publish Assessment
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
