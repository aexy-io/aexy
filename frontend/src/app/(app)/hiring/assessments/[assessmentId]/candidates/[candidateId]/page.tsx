"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Calendar,
  User,
  Mail,
  TrendingUp,
  Video,
  Monitor,
  Camera,
  Eye,
  Send,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";

interface CandidateDetails {
  candidate: {
    id: string;
    name: string;
    email: string;
  };
  invitation: {
    id: string;
    status: string;
    invited_at: string;
    started_at: string | null;
    completed_at: string | null;
  };
  attempt: {
    id: string;
    attempt_number: number;
    status: string;
    started_at: string;
    completed_at: string | null;
    time_taken_seconds: number | null;
    total_score: number | null;
    percentage_score: number | null;
    max_possible_score: number | null;
  } | null;
  submissions: Array<{
    question_id: string;
    question_title: string;
    question_type: string;
    difficulty: string;
    max_marks: number;
    sequence: number;
    submitted_at: string;
    time_taken_seconds: number;
    evaluation: {
      marks_obtained: number;
      percentage: number;
      feedback: string | null;
      test_case_results: any;
      evaluated_at: string;
    } | null;
  }>;
  proctoring: {
    trust_score: number;
    trust_level: string;
    total_events: number;
    critical_events: number;
    event_summary: Record<string, any>;
    deductions: Record<string, any>;
    events: Array<{
      event_type: string;
      severity: string;
      timestamp: string;
      event_data: any;
    }>;
    webcam_recording_url: string | null;
    screen_recording_url: string | null;
  } | null;
  assessment?: {
    id: string;
    title: string;
    total_questions: number;
    max_score: number;
  } | null;
}

export default function CandidateDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.assessmentId as string;
  const candidateId = params.candidateId as string;

  const { user, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, workspacesLoading } = useWorkspace();

  const [details, setDetails] = useState<CandidateDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "questions" | "proctoring">("overview");
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "success" | "error">("idle");
  const [reevaluating, setReevaluating] = useState(false);
  const [reevalStatus, setReevalStatus] = useState<"idle" | "success" | "error">("idle");

  const fetchDetails = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/assessments/${assessmentId}/candidates/${candidateId}/details?workspace_id=${currentWorkspaceId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch candidate details");
      }

      const data = await response.json();
      setDetails(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || workspacesLoading || !currentWorkspaceId) return;
    fetchDetails();
  }, [assessmentId, candidateId, currentWorkspaceId, authLoading, workspacesLoading]);

  const handleResendInvite = async () => {
    if (resending || !details) return;
    setResending(true);
    setResendStatus("idle");
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/assessments/${assessmentId}/candidates/${candidateId}/resend-invite`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Failed to resend invite");
      }
      setResendStatus("success");
      setTimeout(() => setResendStatus("idle"), 3000);
    } catch {
      setResendStatus("error");
      setTimeout(() => setResendStatus("idle"), 3000);
    } finally {
      setResending(false);
    }
  };

  const handleReevaluate = async () => {
    if (reevaluating || !details?.attempt) return;
    setReevaluating(true);
    setReevalStatus("idle");
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/assessments/${assessmentId}/candidates/${candidateId}/reevaluate?workspace_id=${currentWorkspaceId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Failed to re-evaluate");
      }
      setReevalStatus("success");
      // Refresh details to show updated scores
      await fetchDetails();
      setTimeout(() => setReevalStatus("idle"), 3000);
    } catch {
      setReevalStatus("error");
      setTimeout(() => setReevalStatus("idle"), 3000);
    } finally {
      setReevaluating(false);
    }
  };

  if (loading || authLoading || workspacesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {error || "Candidate not found"}
          </h2>
          <Link
            href={`/hiring/assessments/${assessmentId}/report`}
            className="text-primary hover:text-primary/80"
          >
            Back to report
          </Link>
        </div>
      </div>
    );
  }

  const getTrustScoreColor = (score: number) => {
    if (score >= 90) return "text-success";
    if (score >= 70) return "text-warning";
    return "text-destructive";
  };

  const getTrustScoreBg = (score: number) => {
    if (score >= 90) return "bg-success/10";
    if (score >= 70) return "bg-warning/10";
    return "bg-destructive/10";
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href={`/hiring/assessments/${assessmentId}/report`}
            className="p-2 hover:bg-accent rounded-lg"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{details?.candidate.name}</h1>
            {
              details?.assessment && (
                <p className="text-muted-foreground">{details?.assessment?.title}</p>
              )
            }
          </div>
          <div className="flex items-center gap-2">
            {details?.attempt && (
              <button
                onClick={handleReevaluate}
                disabled={reevaluating}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  reevalStatus === "success"
                    ? "bg-success/10 text-success"
                    : reevalStatus === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-accent text-foreground hover:bg-accent/80 border border-border"
                } disabled:opacity-50`}
              >
                {reevaluating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : reevalStatus === "success" ? (
                  <CheckCircle className="h-4 w-4" />
                ) : reevalStatus === "error" ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {reevaluating
                  ? "Re-evaluating..."
                  : reevalStatus === "success"
                  ? "Scores Updated!"
                  : reevalStatus === "error"
                  ? "Failed"
                  : "Re-evaluate"}
              </button>
            )}
            {(details?.invitation?.status!=="completed") && (
              <button
                onClick={handleResendInvite}
                disabled={resending}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  resendStatus === "success"
                    ? "bg-success/10 text-success"
                    : resendStatus === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                } disabled:opacity-50`}
              >
                {resending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : resendStatus === "success" ? (
                  <CheckCircle className="h-4 w-4" />
                ) : resendStatus === "error" ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {resending
                  ? "Sending..."
                  : resendStatus === "success"
                  ? "Invite Sent!"
                  : resendStatus === "error"
                  ? "Failed to Send"
                  : "Resend Invite"}
              </button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-lg border border-border p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Score</p>
                <p className="text-3xl font-bold text-foreground">
                  {details?.attempt?.percentage_score != null
                    ? `${details.attempt.percentage_score.toFixed(0)}%`
                    : details?.attempt?.total_score != null
                    ? `${details.attempt.total_score.toFixed(0)}/${details.attempt.max_possible_score ?? "?"}`
                    : "N/A"}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary opacity-50" />
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Trust Score</p>
                <p className={`text-3xl font-bold ${details?.proctoring ? getTrustScoreColor(details?.proctoring?.trust_score) : "text-muted-foreground"}`}>
                  {details?.proctoring?.trust_score || "N/A"}
                  {details?.proctoring && "%"}
                </p>
              </div>
              <Shield className={`h-8 w-8 opacity-50 ${details?.proctoring ? getTrustScoreColor(details?.proctoring?.trust_score) : "text-muted-foreground"}`} />
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Time Taken</p>
                <p className="text-3xl font-bold text-foreground">
                  {details?.attempt?.time_taken_seconds
                    ? `${Math.round(details?.attempt.time_taken_seconds / 60)}m`
                    : "N/A"}
                </p>
              </div>
              <Clock className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Questions</p>
                <p className="text-3xl font-bold text-foreground">
                  {details?.submissions?.length}/{details?.assessment?.total_questions ?? "?"}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-success opacity-50" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border mb-6">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab("overview")}
              className={`pb-4 px-2 border-b-2 transition-colors ${
                activeTab === "overview"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("questions")}
              className={`pb-4 px-2 border-b-2 transition-colors ${
                activeTab === "questions"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Questions ({details?.submissions?.length || 0})
            </button>
            {details?.proctoring && (
              <button
                onClick={() => setActiveTab("proctoring")}
                className={`pb-4 px-2 border-b-2 transition-colors ${
                  activeTab === "proctoring"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Proctoring
              </button>
            )}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Candidate Info */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-4">Candidate Information</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium text-foreground">{details?.candidate?.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium text-foreground">{details?.candidate?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Invited</p>
                    <p className="font-medium text-foreground">
                      {formatTimestamp(details?.invitation?.invited_at)}
                    </p>
                  </div>
                </div>
                {details?.attempt?.completed_at && (
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <div>
                      <p className="text-sm text-muted-foreground">Completed</p>
                      <p className="font-medium text-foreground">
                        {formatTimestamp(details?.attempt.completed_at)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Performance Summary */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-4">Performance Summary</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                    <span className="text-sm text-muted-foreground">Overall Score</span>
                    <span className="font-semibold text-foreground">
                      {details?.attempt?.percentage_score?.toFixed(1) ?? "0"}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${details?.attempt?.percentage_score || 0}%` }}
                    />
                  </div>
                </div>

                {details?.proctoring && (
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                      <span className="text-sm text-muted-foreground">Trust Score</span>
                      <span className={`font-semibold ${getTrustScoreColor(details?.proctoring?.trust_score)}`}>
                        {details?.proctoring?.trust_score}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          details?.proctoring?.trust_score >= 90
                            ? "bg-success"
                            : details?.proctoring?.trust_score >= 70
                            ? "bg-warning"
                            : "bg-destructive"
                        }`}
                        style={{ width: `${details?.proctoring?.trust_score || 0}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-border space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Questions Attempted</span>
                    <span className="text-foreground font-medium">
                      {details?.submissions?.length} / {details?.assessment?.total_questions ?? "?"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Time</span>
                    <span className="text-foreground font-medium">
                      {formatDuration(details?.attempt?.time_taken_seconds || null)}
                    </span>
                  </div>
                  {details?.proctoring && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Violations</span>
                      <span className="text-foreground font-medium">
                        {details?.proctoring?.total_events} ({details?.proctoring?.critical_events} critical)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "questions" && (
          <div className="bg-card rounded-lg border border-border overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Question
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Difficulty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {details?.submissions?.map((submission, idx) => (
                  <tr key={submission.question_id} className="hover:bg-accent">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground">
                          Q{submission.sequence + 1}. {submission.question_title}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Max: {submission.max_marks} marks
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground capitalize">
                        {submission.question_type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${
                          submission.difficulty === "easy"
                            ? "bg-success/20 text-success"
                            : submission.difficulty === "medium"
                            ? "bg-warning/20 text-warning"
                            : "bg-destructive/20 text-destructive"
                        }`}
                      >
                        {submission.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {submission.evaluation ? (
                        <div>
                          <p className="font-semibold text-foreground">
                            {submission.evaluation.marks_obtained.toFixed(1)} /{" "}
                            {submission.max_marks}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {submission.evaluation.percentage.toFixed(0)}%
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">
                        {formatDuration(submission.time_taken_seconds)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {submission.evaluation ? (
                        <CheckCircle className="h-5 w-5 text-success" />
                      ) : (
                        <Clock className="h-5 w-5 text-warning" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "proctoring" && details?.proctoring && (
          <div className="space-y-6">
            {/* Trust Score Overview */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h3 className="font-semibold text-foreground">Trust Score Overview</h3>
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${getTrustScoreBg(details?.proctoring?.trust_score)}`}>
                  <Shield className={`h-5 w-5 ${getTrustScoreColor(details?.proctoring?.trust_score)}`} />
                  <span className={`font-bold ${getTrustScoreColor(details?.proctoring?.trust_score)}`}>
                    {details?.proctoring?.trust_score}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Trust Level</p>
                  <p className="text-lg font-semibold text-foreground capitalize">
                    {details?.proctoring?.trust_level}
                  </p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Total Events</p>
                  <p className="text-lg font-semibold text-foreground">
                    {details?.proctoring?.total_events}
                  </p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Critical Events</p>
                  <p className="text-lg font-semibold text-destructive">
                    {details?.proctoring?.critical_events}
                  </p>
                </div>
              </div>
            </div>

            {/* Event Summary */}
            {Object.keys(details?.proctoring?.event_summary).length > 0 && (
              <div className="bg-card rounded-lg border border-border p-6">
                <h3 className="font-semibold text-foreground mb-4">Violation Summary</h3>
                <div className="space-y-3">
                  {Object.entries(details?.proctoring?.event_summary).map(([eventType, data]: [string, any]) => (
                    <div key={eventType} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <AlertTriangle
                          className={`h-5 w-5 ${
                            data.severity === "critical"
                              ? "text-destructive"
                              : data.severity === "warning"
                              ? "text-warning"
                              : "text-info"
                          }`}
                        />
                        <div>
                          <p className="font-medium text-foreground capitalize">
                            {eventType.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {data.severity} • {data.count} occurrence{data.count !== 1 && "s"}
                          </p>
                        </div>
                      </div>
                      {details?.proctoring!.deductions[eventType] && (
                        <span className="text-sm font-semibold text-destructive">
                          -{details?.proctoring!.deductions[eventType].actual_deduction} points
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recordings */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-4">Recordings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Webcam Recording */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Camera className="h-5 w-5 text-primary" />
                    <h4 className="font-medium text-foreground">Webcam Recording</h4>
                  </div>
                  {details?.proctoring?.webcam_recording_url ? (
                    <video
                      controls
                      className="w-full rounded-lg bg-black"
                      src={details?.proctoring?.webcam_recording_url}
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="w-full h-48 bg-muted rounded-lg flex flex-col items-center justify-center">
                      <Camera className="h-12 w-12 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground text-sm">Recording not available</p>
                    </div>
                  )}
                </div>

                {/* Screen Recording */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Monitor className="h-5 w-5 text-primary" />
                    <h4 className="font-medium text-foreground">Screen Recording</h4>
                  </div>
                  {details?.proctoring?.screen_recording_url ? (
                    <video
                      controls
                      className="w-full rounded-lg bg-black"
                      src={details?.proctoring?.screen_recording_url}
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="w-full h-48 bg-muted rounded-lg flex flex-col items-center justify-center">
                      <Monitor className="h-12 w-12 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground text-sm">Recording not available</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Event Timeline */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-4">Event Timeline</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {details?.proctoring?.events.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No proctoring events recorded</p>
                ) : (
                  details?.proctoring?.events.map((event, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                      <AlertTriangle
                        className={`h-4 w-4 mt-0.5 ${
                          event.severity === "critical"
                            ? "text-destructive"
                            : event.severity === "warning"
                            ? "text-warning"
                            : "text-info"
                        }`}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground capitalize">
                          {event.event_type.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(event.timestamp)}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full capitalize ${
                          event.severity === "critical"
                            ? "bg-destructive/20 text-destructive"
                            : event.severity === "warning"
                            ? "bg-warning/20 text-warning"
                            : "bg-info/20 text-info"
                        }`}
                      >
                        {event.severity}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
