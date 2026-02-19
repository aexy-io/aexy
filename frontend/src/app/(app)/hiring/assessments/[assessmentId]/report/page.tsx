"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  FileText,
  Clock,
  TrendingUp,
  Search,
  Filter,
  Download,
  ChevronDown,
  MoreVertical,
  Eye,
  Mail,
  Shield,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAssessment, useAssessmentMetrics, useAssessmentCandidates } from "@/hooks/useAssessments";

interface CandidateResult {
  id: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  score: number | null;
  trust_score: number | null;
  started_at: string | null;
  completed_at: string | null;
  time_taken_minutes: number | null;
}

function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  color = "blue",
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: { value: number; isPositive: boolean };
  color?: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-info/10 text-info",
    green: "bg-success/10 text-success",
    yellow: "bg-warning/10 text-warning",
    purple: "bg-purple-500/10 text-purple-500",
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
          {trend && (
            <p
              className={`text-sm mt-1 ${
                trend.isPositive ? "text-success" : "text-destructive"
              }`}
            >
              {trend.isPositive ? "+" : "-"}
              {Math.abs(trend.value)}% from last week
            </p>
          )}
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function ScoreDistributionChart({ data }: { data: number[] }) {
  // Simple histogram
  const ranges = ["0-20", "21-40", "41-60", "61-80", "81-100"];
  const counts = [0, 0, 0, 0, 0];

  data.forEach((score) => {
    if (score <= 20) counts[0]++;
    else if (score <= 40) counts[1]++;
    else if (score <= 60) counts[2]++;
    else if (score <= 80) counts[3]++;
    else counts[4]++;
  });

  const max = Math.max(...counts, 1);

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="font-semibold text-foreground mb-4">Score Distribution</h3>
      <div className="flex items-end justify-between h-40 gap-2">
        {ranges.map((range, idx) => (
          <div key={range} className="flex-1 flex flex-col items-center">
            <div
              className="w-full bg-primary rounded-t"
              style={{ height: `${(counts[idx] / max) * 100}%`, minHeight: counts[idx] > 0 ? "8px" : "0" }}
            />
            <p className="text-xs text-muted-foreground mt-2">{range}</p>
            <p className="text-xs font-medium text-foreground">{counts[idx]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidateRow({
  candidate,
  onView,
  onResend,
  resending,
  resendStatus,
}: {
  candidate: CandidateResult;
  onView: () => void;
  onResend: () => void;
  resending?: boolean;
  resendStatus?: "success" | "error" | null;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { icon: React.ElementType; color: string; label: string }> = {
      completed: { icon: CheckCircle, color: "bg-success/20 text-success", label: "Completed" },
      in_progress: { icon: Clock, color: "bg-info/20 text-info", label: "In Progress" },
      invited: { icon: Mail, color: "bg-warning/20 text-warning", label: "Invited" },
      expired: { icon: XCircle, color: "bg-muted text-muted-foreground", label: "Expired" },
    };
    const badge = badges[status] || badges.invited;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${badge.color}`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    );
  };

  const getTrustScoreBadge = (score: number | null) => {
    if (score === null) return null;

    let color = "bg-success/20 text-success";
    if (score < 50) color = "bg-destructive/20 text-destructive";
    else if (score < 70) color = "bg-warning/20 text-warning";

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${color}`}>
        <Shield className="h-3 w-3" />
        {score}%
      </span>
    );
  };

  return (
    <tr className="hover:bg-accent">
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-foreground">{candidate.candidate_name}</p>
          <p className="text-sm text-muted-foreground">{candidate.candidate_email}</p>
        </div>
      </td>
      <td className="px-4 py-3">{getStatusBadge(candidate.status)}</td>
      <td className="px-4 py-3">
        {candidate.score !== null ? (
          <span className="font-semibold text-foreground">{candidate.score}%</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-4 py-3">{getTrustScoreBadge(candidate.trust_score)}</td>
      <td className="px-4 py-3">
        {candidate.time_taken_minutes !== null ? (
          <span className="text-foreground">{candidate.time_taken_minutes} min</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        {candidate.completed_at ? (
          <span className="text-sm text-muted-foreground">
            {new Date(candidate.completed_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-accent rounded"
          >
            <MoreVertical className="h-5 w-5 text-muted-foreground" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-40 bg-popover rounded-md shadow-lg border border-border py-1 z-10">
              <button
                onClick={() => {
                  setShowMenu(false);
                  onView();
                }}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-popover-foreground hover:bg-accent"
              >
                <Eye className="h-4 w-4" />
                View Details
              </button>
              {(candidate.status === "invited" || candidate.status === "expired") && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onResend();
                  }}
                  disabled={resending}
                  className={`flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-accent disabled:opacity-50 ${
                    resendStatus === "success"
                      ? "text-success"
                      : resendStatus === "error"
                      ? "text-destructive"
                      : "text-popover-foreground"
                  }`}
                >
                  {resending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : resendStatus === "success" ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : resendStatus === "error" ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {resending
                    ? "Sending..."
                    : resendStatus === "success"
                    ? "Sent!"
                    : resendStatus === "error"
                    ? "Failed"
                    : "Resend Invite"}
                </button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AssessmentReportPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.assessmentId as string;

  const { user, isLoading: authLoading, logout } = useAuth();
  const { currentWorkspaceId, workspacesLoading } = useWorkspace();

  const { assessment, isLoading: assessmentLoading } = useAssessment(
    assessmentId,
    currentWorkspaceId || undefined
  );
  const { metrics, isLoading: metricsLoading } = useAssessmentMetrics(assessmentId);
  const { candidates: rawCandidates, isLoading: candidatesLoading } = useAssessmentCandidates(
    assessmentId,
    currentWorkspaceId || null
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "date" | "name">("date");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<{ id: string; status: "success" | "error" } | null>(null);

  const handleResendInvite = async (candidateId: string) => {
    if (resendingId) return;
    setResendingId(candidateId);
    setResendResult(null);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/assessments/${assessmentId}/candidates/${candidateId}/resend-invite`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) {
        throw new Error("Failed to resend invite");
      }
      setResendResult({ id: candidateId, status: "success" });
    } catch {
      setResendResult({ id: candidateId, status: "error" });
    } finally {
      setResendingId(null);
      setTimeout(() => setResendResult(null), 3000);
    }
  };

  // Transform invitation data to CandidateResult format
  const candidates: CandidateResult[] = (rawCandidates || []).map((invitation) => {
    // Calculate time taken if completed
    let timeTakenMinutes: number | null = null;
    if (invitation.started_at && invitation.completed_at) {
      const startTime = new Date(invitation.started_at).getTime();
      const endTime = new Date(invitation.completed_at).getTime();
      timeTakenMinutes = Math.round((endTime - startTime) / 60000);
    }

    // Map status
    let status = "invited";
    if (invitation.status === "completed") {
      status = "completed";
    } else if (invitation.status === "started" || invitation.started_at) {
      status = "in_progress";
    } else if (invitation.status === "expired") {
      status = "expired";
    }

    return {
      id: invitation.id,
      candidate_name: invitation.candidate?.name || "Unknown",
      candidate_email: invitation.candidate?.email || "",
      status,
      score: invitation.latest_score ?? null,
      trust_score: invitation.latest_trust_score ?? null,
      started_at: invitation.started_at,
      completed_at: invitation.completed_at,
      time_taken_minutes: timeTakenMinutes,
    };
  });

  const filteredCandidates = candidates
    .filter((c) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          c.candidate_name.toLowerCase().includes(query) ||
          c.candidate_email.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .filter((c) => {
      if (statusFilter) {
        return c.status === statusFilter;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "score") {
        return (b.score || 0) - (a.score || 0);
      }
      if (sortBy === "name") {
        return a.candidate_name.localeCompare(b.candidate_name);
      }
      // date
      const dateA = new Date(a.completed_at || a.started_at || 0).getTime();
      const dateB = new Date(b.completed_at || b.started_at || 0).getTime();
      return dateB - dateA;
    });

  const completedCandidates = candidates.filter((c) => c.status === "completed");
  const averageScore =
    completedCandidates.length > 0
      ? Math.round(
          completedCandidates.reduce((sum, c) => sum + (c.score || 0), 0) /
            completedCandidates.length
        )
      : 0;
  const scores = completedCandidates.map((c) => c.score || 0);

  if (authLoading || workspacesLoading || assessmentLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Assessment not found</h2>
          <Link href="/hiring/assessments" className="text-primary hover:text-primary/80">
            Back to assessments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/hiring/assessments"
              className="p-2 hover:bg-accent rounded-lg"
            >
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{assessment.title}</h1>
              <p className="text-muted-foreground">{assessment.job_designation}</p>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg hover:bg-accent text-foreground">
            <Download className="h-4 w-4" />
            Export Report
          </button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <MetricCard
            title="Total Candidates"
            value={candidates.length}
            icon={Users}
            color="blue"
          />
          <MetricCard
            title="Completed"
            value={completedCandidates.length}
            icon={CheckCircle}
            color="green"
          />
          <MetricCard
            title="Average Score"
            value={`${averageScore}%`}
            icon={TrendingUp}
            color="purple"
          />
          <MetricCard
            title="Avg Time"
            value={`${
              completedCandidates.length > 0
                ? Math.round(
                    completedCandidates.reduce((sum, c) => sum + (c.time_taken_minutes || 0), 0) /
                      completedCandidates.length
                  )
                : 0
            } min`}
            icon={Clock}
            color="yellow"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <ScoreDistributionChart data={scores} />

          {/* Quick Stats */}
          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">Quick Stats</h3>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <span className="text-muted-foreground">Highest Score</span>
                <span className="font-semibold text-success">
                  {scores.length > 0 ? Math.max(...scores) : 0}%
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <span className="text-muted-foreground">Lowest Score</span>
                <span className="font-semibold text-destructive">
                  {scores.length > 0 ? Math.min(...scores) : 0}%
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <span className="text-muted-foreground">Passing Rate (60%+)</span>
                <span className="font-semibold text-info">
                  {scores.length > 0
                    ? Math.round((scores.filter((s) => s >= 60).length / scores.length) * 100)
                    : 0}
                  %
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <span className="text-muted-foreground">Completion Rate</span>
                <span className="font-semibold text-purple-500">
                  {candidates.length > 0
                    ? Math.round((completedCandidates.length / candidates.length) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Candidates Table */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-x-auto">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="font-semibold text-foreground">Candidates</h3>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search candidates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-input text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-input text-foreground"
              >
                <option value="">All Status</option>
                <option value="completed">Completed</option>
                <option value="in_progress">In Progress</option>
                <option value="invited">Invited</option>
                <option value="expired">Expired</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "score" | "date" | "name")}
                className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-input text-foreground"
              >
                <option value="date">Sort by Date</option>
                <option value="score">Sort by Score</option>
                <option value="name">Sort by Name</option>
              </select>
            </div>
          </div>

          {candidatesLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">No candidates found</p>
            </div>
          ) : (
            <table className="w-full min-w-[600px]">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Candidate
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Trust Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Completed
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCandidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    onView={() =>
                      router.push(
                        `/hiring/assessments/${assessmentId}/candidates/${candidate.id}`
                      )
                    }
                    onResend={() => handleResendInvite(candidate.id)}
                    resending={resendingId === candidate.id}
                    resendStatus={resendResult?.id === candidate.id ? resendResult.status : null}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
