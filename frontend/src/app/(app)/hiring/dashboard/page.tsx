"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Users,
  Plus,
  ClipboardCheck,
  BarChart3,
  ArrowRight,
  TrendingUp,
  Clock,
  UserPlus,
  FileText,
  CheckCircle2,
  AlertCircle,
  Target,
} from "lucide-react";
import {
  hiringApi,
  HiringRequirement,
} from "@/lib/api";
import { useOrganizationAssessmentMetrics, useAssessments } from "@/hooks/useAssessments";

export default function HiringDashboardPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId, currentWorkspace, workspacesLoading, hasWorkspaces } = useWorkspace();
  const [requirements, setRequirements] = useState<HiringRequirement[]>([]);
  const [loading, setLoading] = useState(true);

  // Assessment data
  const { metrics: assessmentMetrics } = useOrganizationAssessmentMetrics(currentWorkspaceId);
  const { assessments } = useAssessments(currentWorkspaceId, { limit: 5 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (currentWorkspaceId) {
        const reqs = await hiringApi.listRequirements(currentWorkspaceId);
        setRequirements(reqs);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading || loading || workspacesLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (!hasWorkspaces) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 className="h-10 w-10 text-slate-600" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Workspace Required</h2>
          <p className="text-slate-400 mb-6">
            Create a workspace first to start using Hiring Intelligence.
          </p>
          <Link
            href="/settings/organization"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium shadow-lg shadow-primary-500/20"
          >
            <Building2 className="h-5 w-5" />
            Create Workspace
          </Link>
        </div>
      </div>
    );
  }

  // Calculate stats
  const activeRequirements = requirements.filter(r => r.status === "active").length;
  const totalCandidates = assessmentMetrics?.total_candidates ?? 0;
  const completedAssessments = assessmentMetrics?.unique_attempts ?? 0;
  const attemptRate = assessmentMetrics?.attempt_rate ?? 0;

  return (
    <main className="w-full px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-primary-500/20 to-blue-500/20 rounded-xl">
              <Target className="h-7 w-7 text-primary-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Hiring Dashboard</h1>
              {currentWorkspace && (
                <p className="text-slate-400 text-sm flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" />
                  {currentWorkspace.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <FileText className="h-5 w-5 text-blue-400" />
              </div>
              <span className="text-sm text-slate-400">Open Positions</span>
            </div>
            <p className="text-3xl font-bold text-white">{activeRequirements}</p>
            <p className="text-xs text-slate-500 mt-1">Active hiring requirements</p>
          </div>

          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Users className="h-5 w-5 text-green-400" />
              </div>
              <span className="text-sm text-slate-400">Total Candidates</span>
            </div>
            <p className="text-3xl font-bold text-white">{totalCandidates}</p>
            <p className="text-xs text-slate-500 mt-1">Across all assessments</p>
          </div>

          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-purple-400" />
              </div>
              <span className="text-sm text-slate-400">Completed</span>
            </div>
            <p className="text-3xl font-bold text-white">{completedAssessments}</p>
            <p className="text-xs text-slate-500 mt-1">Assessment completions</p>
          </div>

          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <TrendingUp className="h-5 w-5 text-orange-400" />
              </div>
              <span className="text-sm text-slate-400">Completion Rate</span>
            </div>
            <p className="text-3xl font-bold text-white">{Math.round(attemptRate)}%</p>
            <p className="text-xs text-slate-500 mt-1">Of invited candidates</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link
            href="/hiring/candidates"
            className="group bg-gradient-to-br from-blue-900/30 to-blue-800/20 rounded-xl border border-blue-800/50 p-5 hover:border-blue-600/50 transition"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-blue-500/20 rounded-lg">
                <UserPlus className="h-6 w-6 text-blue-400" />
              </div>
              <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-blue-400 transition" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">Add Candidate</h3>
            <p className="text-sm text-slate-400">Add a new candidate to your pipeline</p>
          </Link>

          <Link
            href="/hiring/assessments/new"
            className="group bg-gradient-to-br from-primary-900/30 to-primary-800/20 rounded-xl border border-primary-800/50 p-5 hover:border-primary-600/50 transition"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-primary-500/20 rounded-lg">
                <ClipboardCheck className="h-6 w-6 text-primary-400" />
              </div>
              <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-primary-400 transition" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">Create Assessment</h3>
            <p className="text-sm text-slate-400">Build a new technical assessment</p>
          </Link>

          <Link
            href="/hiring/analytics"
            className="group bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-xl border border-purple-800/50 p-5 hover:border-purple-600/50 transition"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-purple-500/20 rounded-lg">
                <BarChart3 className="h-6 w-6 text-purple-400" />
              </div>
              <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-purple-400 transition" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">View Analytics</h3>
            <p className="text-sm text-slate-400">Skill gaps & hiring intelligence</p>
          </Link>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Recent Assessments */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary-400" />
                Recent Assessments
              </h2>
              <Link
                href="/hiring/assessments"
                className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="divide-y divide-slate-800">
              {assessments && assessments.length > 0 ? (
                assessments.slice(0, 5).map((assessment) => (
                  <Link
                    key={assessment.id}
                    href={`/hiring/assessments/${assessment.id}/report`}
                    className="flex items-center justify-between p-4 hover:bg-slate-800/50 transition group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        assessment.status === 'active' ? 'bg-green-400' :
                        assessment.status === 'draft' ? 'bg-yellow-400' : 'bg-slate-400'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-white group-hover:text-primary-400 transition">
                          {assessment.title}
                        </p>
                        <p className="text-xs text-slate-400">{assessment.job_designation}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-white">{assessment.total_candidates ?? 0}</p>
                        <p className="text-xs text-slate-400">candidates</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-primary-400 transition" />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="p-8 text-center">
                  <ClipboardCheck className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm mb-3">No assessments yet</p>
                  <Link
                    href="/hiring/assessments/new"
                    className="inline-flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300"
                  >
                    <Plus className="h-4 w-4" />
                    Create your first assessment
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Open Positions */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-400" />
                Open Positions
              </h2>
              <Link
                href="/hiring/analytics"
                className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                Manage
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="divide-y divide-slate-800">
              {requirements.filter(r => r.status === "active").length > 0 ? (
                requirements.filter(r => r.status === "active").slice(0, 5).map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 hover:bg-slate-800/50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${
                        req.priority === 'critical' ? 'bg-red-500/20' :
                        req.priority === 'high' ? 'bg-orange-500/20' :
                        req.priority === 'medium' ? 'bg-yellow-500/20' : 'bg-slate-700'
                      }`}>
                        <AlertCircle className={`h-4 w-4 ${
                          req.priority === 'critical' ? 'text-red-400' :
                          req.priority === 'high' ? 'text-orange-400' :
                          req.priority === 'medium' ? 'text-yellow-400' : 'text-slate-400'
                        }`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{req.role_title}</p>
                        <p className="text-xs text-slate-400 capitalize">{req.priority} priority</p>
                      </div>
                    </div>
                    {req.timeline && (
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3.5 w-3.5" />
                        {req.timeline}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center">
                  <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm mb-3">No open positions</p>
                  <Link
                    href="/hiring/analytics"
                    className="inline-flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300"
                  >
                    <Plus className="h-4 w-4" />
                    Create a hiring requirement
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hiring Funnel Preview */}
        <div className="mt-8 bg-slate-900/50 rounded-xl border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              Hiring Funnel
            </h2>
            <Link
              href="/hiring/analytics"
              className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
            >
              View detailed analytics
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {[
              { stage: "Applied", count: totalCandidates, color: "bg-blue-500" },
              { stage: "Screening", count: Math.round(totalCandidates * 0.7), color: "bg-cyan-500" },
              { stage: "Assessment", count: completedAssessments, color: "bg-primary-500" },
              { stage: "Interview", count: Math.round(completedAssessments * 0.5), color: "bg-purple-500" },
              { stage: "Offer", count: Math.round(completedAssessments * 0.2), color: "bg-orange-500" },
              { stage: "Hired", count: Math.round(completedAssessments * 0.1), color: "bg-green-500" },
            ].map((item, idx) => (
              <div key={item.stage} className="text-center">
                <div className="relative h-24 flex items-end justify-center mb-2">
                  <div
                    className={`w-full ${item.color} rounded-t-lg transition-all`}
                    style={{
                      height: `${Math.max(20, (item.count / Math.max(totalCandidates, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-lg font-bold text-white">{item.count}</p>
                <p className="text-xs text-slate-400">{item.stage}</p>
              </div>
            ))}
          </div>
        </div>
    </main>
  );
}
