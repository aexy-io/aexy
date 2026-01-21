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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (!hasWorkspaces) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Workspace Required</h2>
          <p className="text-muted-foreground mb-6">
            Create a workspace first to start using Hiring Intelligence.
          </p>
          <Link
            href="/settings/organization"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition font-medium shadow-lg shadow-primary/20"
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
    <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-primary/20 to-info/20 rounded-xl">
              <Target className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Hiring Dashboard</h1>
              {currentWorkspace && (
                <p className="text-muted-foreground text-sm flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" />
                  {currentWorkspace.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-info/20 rounded-lg">
                <FileText className="h-5 w-5 text-info" />
              </div>
              <span className="text-sm text-muted-foreground">Open Positions</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{activeRequirements}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Active hiring requirements</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-success/20 rounded-lg">
                <Users className="h-5 w-5 text-success" />
              </div>
              <span className="text-sm text-muted-foreground">Total Candidates</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{totalCandidates}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Across all assessments</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-purple-500" />
              </div>
              <span className="text-sm text-muted-foreground">Completed</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{completedAssessments}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Assessment completions</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-warning/20 rounded-lg">
                <TrendingUp className="h-5 w-5 text-warning" />
              </div>
              <span className="text-sm text-muted-foreground">Completion Rate</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{Math.round(attemptRate)}%</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Of invited candidates</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link
            href="/hiring/candidates"
            className="group bg-gradient-to-br from-info/10 to-info/5 rounded-xl border border-info/30 p-5 hover:border-info/50 transition"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-info/20 rounded-lg">
                <UserPlus className="h-6 w-6 text-info" />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-info transition" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Add Candidate</h3>
            <p className="text-sm text-muted-foreground">Add a new candidate to your pipeline</p>
          </Link>

          <Link
            href="/hiring/assessments/new"
            className="group bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl border border-primary/30 p-5 hover:border-primary/50 transition"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-primary/20 rounded-lg">
                <ClipboardCheck className="h-6 w-6 text-primary" />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Create Assessment</h3>
            <p className="text-sm text-muted-foreground">Build a new technical assessment</p>
          </Link>

          <Link
            href="/hiring/analytics"
            className="group bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-xl border border-purple-500/30 p-5 hover:border-purple-500/50 transition"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-purple-500/20 rounded-lg">
                <BarChart3 className="h-6 w-6 text-purple-500" />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-purple-500 transition" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">View Analytics</h3>
            <p className="text-sm text-muted-foreground">Skill gaps & hiring intelligence</p>
          </Link>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Recent Assessments */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Recent Assessments
              </h2>
              <Link
                href="/hiring/assessments"
                className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {assessments && assessments.length > 0 ? (
                assessments.slice(0, 5).map((assessment) => (
                  <Link
                    key={assessment.id}
                    href={`/hiring/assessments/${assessment.id}/report`}
                    className="flex items-center justify-between p-4 hover:bg-accent transition group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        assessment.status === 'active' ? 'bg-success' :
                        assessment.status === 'draft' ? 'bg-warning' : 'bg-muted-foreground'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition">
                          {assessment.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{assessment.job_designation}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">{assessment.total_candidates ?? 0}</p>
                        <p className="text-xs text-muted-foreground">candidates</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition" />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="p-8 text-center">
                  <ClipboardCheck className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm mb-3">No assessments yet</p>
                  <Link
                    href="/hiring/assessments/new"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80"
                  >
                    <Plus className="h-4 w-4" />
                    Create your first assessment
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Open Positions */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-info" />
                Open Positions
              </h2>
              <Link
                href="/hiring/analytics"
                className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
              >
                Manage
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {requirements.filter(r => r.status === "active").length > 0 ? (
                requirements.filter(r => r.status === "active").slice(0, 5).map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 hover:bg-accent transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${
                        req.priority === 'critical' ? 'bg-destructive/20' :
                        req.priority === 'high' ? 'bg-warning/20' :
                        req.priority === 'medium' ? 'bg-warning/20' : 'bg-muted'
                      }`}>
                        <AlertCircle className={`h-4 w-4 ${
                          req.priority === 'critical' ? 'text-destructive' :
                          req.priority === 'high' ? 'text-warning' :
                          req.priority === 'medium' ? 'text-warning' : 'text-muted-foreground'
                        }`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{req.role_title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{req.priority} priority</p>
                      </div>
                    </div>
                    {req.timeline && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {req.timeline}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm mb-3">No open positions</p>
                  <Link
                    href="/hiring/analytics"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80"
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
        <div className="mt-8 bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              Hiring Funnel
            </h2>
            <Link
              href="/hiring/analytics"
              className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
            >
              View detailed analytics
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {[
              { stage: "Applied", count: totalCandidates, color: "bg-info" },
              { stage: "Screening", count: Math.round(totalCandidates * 0.7), color: "bg-cyan-500" },
              { stage: "Assessment", count: completedAssessments, color: "bg-primary" },
              { stage: "Interview", count: Math.round(completedAssessments * 0.5), color: "bg-purple-500" },
              { stage: "Offer", count: Math.round(completedAssessments * 0.2), color: "bg-warning" },
              { stage: "Hired", count: Math.round(completedAssessments * 0.1), color: "bg-success" },
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
                <p className="text-lg font-bold text-foreground">{item.count}</p>
                <p className="text-xs text-muted-foreground">{item.stage}</p>
              </div>
            ))}
          </div>
        </div>
    </main>
  );
}
