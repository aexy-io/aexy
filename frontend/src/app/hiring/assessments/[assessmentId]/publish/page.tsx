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
import { AppHeader } from "@/components/layout/AppHeader";
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Assessment not found</h2>
          <Link href="/hiring/assessments" className="text-blue-600 hover:text-blue-700">
            Back to assessments
          </Link>
        </div>
      </div>
    );
  }

  const totalQuestions = assessment.topics?.reduce((sum, t) => {
    const qt = t.question_types;
    if (qt && typeof qt === 'object') {
      return sum + (qt.code || 0) + (qt.mcq || 0) + (qt.subjective || 0) + (qt.pseudo_code || 0);
    }
    return sum;
  }, 0) || 0;

  const totalDuration = assessment.topics?.reduce(
    (sum, t) => sum + (t.estimated_time_minutes || 0),
    0
  ) || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} onLogout={logout} />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Success Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Assessment Published Successfully!
          </h1>
          <p className="text-lg text-gray-600">
            Your assessment is now live and invitations have been sent to candidates.
          </p>
        </div>

        {/* Assessment Summary Card */}
        <div className="bg-white rounded-lg border shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{assessment.title}</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-gray-900">{totalQuestions}</p>
              <p className="text-xs text-gray-500">Questions</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Clock className="h-5 w-5 text-purple-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-gray-900">{totalDuration}</p>
              <p className="text-xs text-gray-500">Minutes</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Users className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-gray-900">{assessment.total_candidates || 0}</p>
              <p className="text-xs text-gray-500">Candidates</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Mail className="h-5 w-5 text-orange-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-gray-900">{assessment.total_candidates || 0}</p>
              <p className="text-xs text-gray-500">Invites Sent</p>
            </div>
          </div>

          {/* Schedule Info */}
          {assessment.schedule && (
            <div className="border-t pt-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Assessment Window:</span>{" "}
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
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ExternalLink className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900">Assessment Link</h3>
          </div>
          <p className="text-sm text-blue-700 mb-3">
            Share this link with candidates who haven't received an invitation email:
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={assessmentUrl}
              className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm text-gray-700"
            />
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Copy className="h-4 w-4" />
              Copy
            </button>
          </div>
        </div>

        {/* What's Next */}
        <div className="bg-white rounded-lg border shadow-sm p-6 mb-8">
          <h3 className="font-semibold text-gray-900 mb-4">What happens next?</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-6 h-6 bg-green-100 rounded-full text-green-600 text-sm font-medium shrink-0">
                1
              </div>
              <div>
                <p className="font-medium text-gray-900">Invitations Sent</p>
                <p className="text-sm text-gray-500">
                  All candidates have received email invitations with their unique assessment links.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-6 h-6 bg-blue-100 rounded-full text-blue-600 text-sm font-medium shrink-0">
                2
              </div>
              <div>
                <p className="font-medium text-gray-900">Candidates Take Assessment</p>
                <p className="text-sm text-gray-500">
                  Candidates can start the assessment anytime within the scheduled window.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-6 h-6 bg-purple-100 rounded-full text-purple-600 text-sm font-medium shrink-0">
                3
              </div>
              <div>
                <p className="font-medium text-gray-900">View Results</p>
                <p className="text-sm text-gray-500">
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
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            View Report Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/hiring/assessments"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
          >
            Back to Assessments
          </Link>
        </div>
      </main>
    </div>
  );
}
