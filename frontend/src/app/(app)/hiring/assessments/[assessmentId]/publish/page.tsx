"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle,
  Users,
  Mail,
  Clock,
  ExternalLink,
  Copy,
  ArrowRight,
  FileText,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAssessment } from "@/hooks/useAssessments";

export default function AssessmentPublishSuccessPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.assessmentId as string;

  const { user, isLoading: authLoading, logout } = useAuth();
  const { currentWorkspaceId, workspacesLoading } = useWorkspace();

  const { assessment, isLoading: assessmentLoading } = useAssessment(
    assessmentId,
    currentWorkspaceId || undefined
  );

  const assessmentUrl = typeof window !== "undefined"
    ? `${window.location.origin}/take/${assessmentId}`
    : "";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(assessmentUrl);
  };

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

  const totalQuestions = assessment.total_questions || 0;
  const totalDuration = assessment.total_duration_minutes || 0;

  return (
    <div className="min-h-screen bg-background">
<main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Success Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-success/20 rounded-full mb-4">
            <CheckCircle className="h-8 w-8 text-success" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Assessment Published Successfully!
          </h1>
          <p className="text-lg text-muted-foreground">
            Your assessment is now live and invitations have been sent to candidates.
          </p>
        </div>

        {/* Assessment Summary Card */}
        <div className="bg-card rounded-lg border border-border shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">{assessment.title}</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-muted rounded-lg">
              <FileText className="h-5 w-5 text-info mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{totalQuestions}</p>
              <p className="text-xs text-muted-foreground">Questions</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <Clock className="h-5 w-5 text-purple-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{totalDuration}</p>
              <p className="text-xs text-muted-foreground">Minutes</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <Users className="h-5 w-5 text-success mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">0</p>
              <p className="text-xs text-muted-foreground">Candidates</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <Mail className="h-5 w-5 text-warning mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">0</p>
              <p className="text-xs text-muted-foreground">Invites Sent</p>
            </div>
          </div>

          {/* Schedule Info */}
          {assessment.schedule && (
            <div className="border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Assessment Window:</span>{" "}
                {assessment.schedule.start_date
                  ? new Date(assessment.schedule.start_date).toLocaleDateString()
                  : "Not set"}{" "}
                -{" "}
                {assessment.schedule.end_date
                  ? new Date(assessment.schedule.end_date).toLocaleDateString()
                  : "Not set"}
              </p>
            </div>
          )}
        </div>

        {/* Assessment Link */}
        <div className="bg-info/10 rounded-lg border border-info/30 p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ExternalLink className="h-5 w-5 text-info" />
            <h3 className="font-semibold text-foreground">Assessment Link</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Share this link with candidates who haven't received an invitation email:
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={assessmentUrl}
              className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
            />
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              <Copy className="h-4 w-4" />
              Copy
            </button>
          </div>
        </div>

        {/* What's Next */}
        <div className="bg-card rounded-lg border border-border shadow-sm p-6 mb-8">
          <h3 className="font-semibold text-foreground mb-4">What happens next?</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-6 h-6 bg-success/20 rounded-full text-success text-sm font-medium shrink-0">
                1
              </div>
              <div>
                <p className="font-medium text-foreground">Invitations Sent</p>
                <p className="text-sm text-muted-foreground">
                  All candidates have received email invitations with their unique assessment links.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-6 h-6 bg-info/20 rounded-full text-info text-sm font-medium shrink-0">
                2
              </div>
              <div>
                <p className="font-medium text-foreground">Candidates Take Assessment</p>
                <p className="text-sm text-muted-foreground">
                  Candidates can start the assessment anytime within the scheduled window.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-6 h-6 bg-purple-500/20 rounded-full text-purple-500 text-sm font-medium shrink-0">
                3
              </div>
              <div>
                <p className="font-medium text-foreground">View Results</p>
                <p className="text-sm text-muted-foreground">
                  Track progress and view detailed reports as candidates complete the assessment.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={`/hiring/assessments/${assessmentId}/report`}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium"
          >
            View Report Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/hiring/assessments"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-card border border-border text-foreground rounded-lg hover:bg-accent font-medium"
          >
            Back to Assessments
          </Link>
        </div>
      </main>
    </div>
  );
}
