"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  Target,
  Award,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  FileText,
  Plus,
  Play,
  Calendar,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  learningAnalyticsApi,
  ExecutiveDashboard,
  CompletionRateReport,
  ReportDefinitionWithDetails,
  ReportRunWithDetails,
  ReportDefinitionCreate,
  ReportType,
  ReportScheduleFrequency,
  ExportFormat,
} from "@/lib/api";

type TabType = "dashboard" | "trends" | "reports" | "runs";

export default function LearningAnalyticsPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();

  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [loading, setLoading] = useState(true);
  const [periodDays, setPeriodDays] = useState(30);
  const [periodType, setPeriodType] = useState<"daily" | "weekly" | "monthly">("monthly");

  // Data state
  const [dashboard, setDashboard] = useState<ExecutiveDashboard | null>(null);
  const [completionRates, setCompletionRates] = useState<CompletionRateReport | null>(null);
  const [reports, setReports] = useState<ReportDefinitionWithDetails[]>([]);
  const [runs, setRuns] = useState<ReportRunWithDetails[]>([]);

  // Modal state
  const [showCreateReport, setShowCreateReport] = useState(false);
  const [newReport, setNewReport] = useState<ReportDefinitionCreate>({
    name: "",
    description: "",
    report_type: "executive_summary",
    is_scheduled: false,
    export_format: "pdf",
    recipients: [],
  });

  const fetchDashboard = useCallback(async () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    try {
      const [dashboardData, completionData] = await Promise.all([
        learningAnalyticsApi.getExecutiveDashboard({ period_days: periodDays }),
        learningAnalyticsApi.getCompletionRates({ period_type: periodType, periods: 12 }),
      ]);
      setDashboard(dashboardData);
      setCompletionRates(completionData);
    } catch (error) {
      console.error("Failed to fetch dashboard:", error);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspaceId, periodDays, periodType]);

  const fetchReports = useCallback(async () => {
    if (!currentWorkspaceId) return;
    try {
      const [reportsData, runsData] = await Promise.all([
        learningAnalyticsApi.reports.list({ is_active: true }),
        learningAnalyticsApi.runs.list({ page_size: 20 }),
      ]);
      setReports(reportsData.items);
      setRuns(runsData.items);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
    }
  }, [currentWorkspaceId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (activeTab === "reports" || activeTab === "runs") {
      fetchReports();
    }
  }, [activeTab, fetchReports]);

  const handleCreateReport = async () => {
    if (!currentWorkspaceId || !newReport.name) return;
    try {
      await learningAnalyticsApi.reports.create(newReport);
      setShowCreateReport(false);
      setNewReport({
        name: "",
        description: "",
        report_type: "executive_summary",
        is_scheduled: false,
        export_format: "pdf",
        recipients: [],
      });
      fetchReports();
    } catch (error) {
      console.error("Failed to create report:", error);
    }
  };

  const handleRunReport = async (definitionId: string) => {
    if (!currentWorkspaceId) return;
    try {
      await learningAnalyticsApi.reports.triggerRun(definitionId);
      fetchReports();
    } catch (error) {
      console.error("Failed to run report:", error);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatChange = (value: number) => {
    const isPositive = value >= 0;
    return (
      <span className={`flex items-center gap-1 text-sm ${isPositive ? "text-green-400" : "text-red-400"}`}>
        {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-50 text-green-600 dark:bg-green-900/50 dark:text-green-400 border-green-200 dark:border-green-700";
      case "running":
        return "bg-blue-50 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 border-blue-200 dark:border-blue-700";
      case "pending":
        return "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400 border-yellow-200 dark:border-yellow-700";
      case "failed":
        return "bg-red-50 text-red-600 dark:bg-red-900/50 dark:text-red-400 border-red-200 dark:border-red-700";
      default:
        return "bg-accent text-foreground border-border";
    }
  };

  const getReportTypeLabel = (type: ReportType) => {
    const labels: Record<ReportType, string> = {
      executive_summary: "Executive Summary",
      team_progress: "Team Progress",
      individual_progress: "Individual Progress",
      compliance_status: "Compliance Status",
      budget_utilization: "Budget Utilization",
      skill_gap_analysis: "Skill Gap Analysis",
      roi_analysis: "ROI Analysis",
      certification_tracking: "Certification Tracking",
      custom: "Custom Report",
    };
    return labels[type] || type;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl">
              <BarChart3 className="h-7 w-7 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Learning Analytics</h1>
              <p className="text-muted-foreground text-sm">Executive dashboard and reporting</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              className="bg-muted border border-border text-foreground text-sm rounded-lg px-3 py-2"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
            <button
              onClick={fetchDashboard}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-muted/50 p-1 rounded-lg w-fit">
          {[
            { id: "dashboard", label: "Dashboard", icon: BarChart3 },
            { id: "trends", label: "Trends", icon: TrendingUp },
            { id: "reports", label: "Reports", icon: FileText },
            { id: "runs", label: "Run History", icon: Clock },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-primary-600 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === "dashboard" && dashboard && (
          <div className="space-y-6">
            {/* Key Metrics Grid */}
            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Clock className="h-5 w-5 text-blue-400" />
                  </div>
                  {formatChange(dashboard.metrics.learning_hours_change)}
                </div>
                <div className="text-2xl font-bold text-foreground">{dashboard.metrics.total_learning_hours.toFixed(0)}</div>
                <div className="text-sm text-muted-foreground mt-1">Total Learning Hours</div>
              </div>

              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <Users className="h-5 w-5 text-green-400" />
                  </div>
                  {formatChange(dashboard.metrics.active_learners_change)}
                </div>
                <div className="text-2xl font-bold text-foreground">{dashboard.metrics.active_learners}</div>
                <div className="text-sm text-muted-foreground mt-1">Active Learners</div>
              </div>

              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Target className="h-5 w-5 text-purple-400" />
                  </div>
                  <span className="text-sm text-muted-foreground">{dashboard.metrics.completed_goals}/{dashboard.metrics.total_goals}</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{formatPercent(dashboard.metrics.goal_completion_rate)}</div>
                <div className="text-sm text-muted-foreground mt-1">Goal Completion Rate</div>
              </div>

              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Award className="h-5 w-5 text-amber-400" />
                  </div>
                  {formatChange(dashboard.metrics.certifications_earned_change)}
                </div>
                <div className="text-2xl font-bold text-foreground">{dashboard.metrics.certifications_earned}</div>
                <div className="text-sm text-muted-foreground mt-1">Certifications Earned</div>
              </div>
            </div>

            {/* Second Row Metrics */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-teal-100 dark:bg-teal-900/50 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-teal-400" />
                  </div>
                  {formatChange(dashboard.metrics.compliance_rate_change)}
                </div>
                <div className="text-2xl font-bold text-foreground">{formatPercent(dashboard.metrics.compliance_rate)}</div>
                <div className="text-sm text-muted-foreground mt-1">Compliance Rate</div>
                {dashboard.metrics.non_compliant_count > 0 && (
                  <div className="text-xs text-red-400 mt-2">{dashboard.metrics.non_compliant_count} non-compliant</div>
                )}
              </div>

              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                    <DollarSign className="h-5 w-5 text-indigo-400" />
                  </div>
                  <span className="text-sm text-muted-foreground">{formatPercent(dashboard.metrics.budget_utilization)}</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{formatCurrency(dashboard.metrics.spent_budget_cents)}</div>
                <div className="text-sm text-muted-foreground mt-1">Budget Spent of {formatCurrency(dashboard.metrics.total_budget_cents)}</div>
              </div>

              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-foreground">{dashboard.metrics.overdue_goals}</div>
                <div className="text-sm text-muted-foreground mt-1">Overdue Goals</div>
              </div>
            </div>

            {/* ROI & Skill Gap Analysis */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* ROI Metrics */}
              <div className="bg-muted rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                  ROI Analysis
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Investment</span>
                    <span className="text-foreground font-medium">{formatCurrency(dashboard.roi.total_investment_cents)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Courses Completed</span>
                    <span className="text-foreground font-medium">{dashboard.roi.total_courses_completed}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Cost per Course</span>
                    <span className="text-foreground font-medium">{formatCurrency(dashboard.roi.cost_per_course_cents)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Cost per Certification</span>
                    <span className="text-foreground font-medium">{formatCurrency(dashboard.roi.cost_per_certification_cents)}</span>
                  </div>
                  <div className="pt-3 border-t border-border">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">ROI Percentage</span>
                      <span className={`text-lg font-bold ${dashboard.roi.roi_percentage >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {formatPercent(dashboard.roi.roi_percentage / 100)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Skill Gaps */}
              <div className="bg-muted rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-400" />
                  Skill Gap Analysis
                  <span className="text-xs px-2 py-0.5 bg-accent text-foreground rounded-full ml-auto">
                    {dashboard.skill_gaps.total_gaps} gaps
                  </span>
                </h3>
                {dashboard.skill_gaps.skills.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-400" />
                    <p>No significant skill gaps detected</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dashboard.skill_gaps.skills.slice(0, 5).map((skill) => (
                      <div key={skill.skill_name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-foreground">{skill.skill_name}</span>
                          <span className={skill.gap_percentage > 50 ? "text-red-400" : "text-orange-400"}>
                            {skill.gap_percentage.toFixed(0)}% gap
                          </span>
                        </div>
                        <div className="h-2 bg-accent rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${skill.gap_percentage > 50 ? "bg-red-500" : "bg-orange-500"}`}
                            style={{ width: `${Math.min(skill.gap_percentage, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>{skill.current_count} current / {skill.required_count} required</span>
                          <span>{skill.in_progress_count} in progress</span>
                        </div>
                      </div>
                    ))}
                    {dashboard.skill_gaps.critical_gaps > 0 && (
                      <div className="mt-4 pt-3 border-t border-border">
                        <span className="text-red-400 text-sm">{dashboard.skill_gaps.critical_gaps} critical gaps ({">"}50%)</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Team Comparison */}
            <div className="bg-muted rounded-xl p-6 border border-border">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-400" />
                Team Performance Comparison
              </h3>
              {dashboard.team_comparison.teams.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p>No team data available</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-sm font-medium text-muted-foreground pb-3">Team</th>
                        <th className="text-right text-sm font-medium text-muted-foreground pb-3">Learning Hours</th>
                        <th className="text-right text-sm font-medium text-muted-foreground pb-3">Courses</th>
                        <th className="text-right text-sm font-medium text-muted-foreground pb-3">Goal Rate</th>
                        <th className="text-right text-sm font-medium text-muted-foreground pb-3">Compliance</th>
                        <th className="text-right text-sm font-medium text-muted-foreground pb-3">Budget Used</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {dashboard.team_comparison.teams.map((team) => (
                        <tr key={team.team_id} className="hover:bg-accent/30">
                          <td className="py-3 text-foreground font-medium">{team.team_name}</td>
                          <td className="py-3 text-right text-foreground">{team.learning_hours.toFixed(1)}</td>
                          <td className="py-3 text-right text-foreground">{team.courses_completed}</td>
                          <td className="py-3 text-right">
                            <span className={team.goal_completion_rate >= 0.7 ? "text-green-400" : team.goal_completion_rate >= 0.4 ? "text-yellow-400" : "text-red-400"}>
                              {formatPercent(team.goal_completion_rate)}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <span className={team.compliance_rate >= 0.9 ? "text-green-400" : team.compliance_rate >= 0.7 ? "text-yellow-400" : "text-red-400"}>
                              {formatPercent(team.compliance_rate)}
                            </span>
                          </td>
                          <td className="py-3 text-right text-foreground">{formatPercent(team.budget_utilization)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trends Tab */}
        {activeTab === "trends" && completionRates && (
          <div className="space-y-6">
            {/* Period Type Selector */}
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-sm">View by:</span>
              <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
                {(["daily", "weekly", "monthly"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setPeriodType(type)}
                    className={`px-3 py-1.5 text-sm rounded-md transition ${
                      periodType === type
                        ? "bg-primary-600 text-white"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Overall Completion Rate */}
            <div className="bg-muted rounded-xl p-6 border border-border">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-foreground">Completion Rate Over Time</h3>
                <div className="text-right">
                  <div className="text-2xl font-bold text-foreground">{formatPercent(completionRates.overall_rate)}</div>
                  <div className="text-sm text-muted-foreground">Overall Rate</div>
                </div>
              </div>

              {/* Simple Bar Chart */}
              <div className="space-y-3">
                {completionRates.entries.map((entry, index) => (
                  <div key={entry.period} className="flex items-center gap-4">
                    <div className="w-24 text-sm text-muted-foreground text-right">{entry.period}</div>
                    <div className="flex-1">
                      <div className="h-6 bg-accent rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-500 to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${entry.rate * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-20 text-sm text-right">
                      <span className="text-foreground font-medium">{formatPercent(entry.rate)}</span>
                    </div>
                    <div className="w-24 text-xs text-muted-foreground text-right">
                      {entry.completed}/{entry.total}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trend Charts */}
            {dashboard && (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Learning Hours Trend */}
                <div className="bg-muted rounded-xl p-6 border border-border">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-400" />
                    Learning Hours Trend
                  </h3>
                  <div className="space-y-2">
                    {dashboard.trends.learning_hours.slice(-7).map((point) => (
                      <div key={point.date} className="flex items-center gap-3">
                        <div className="w-20 text-xs text-muted-foreground">{point.date}</div>
                        <div className="flex-1 h-4 bg-accent rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.min((point.value / Math.max(...dashboard.trends.learning_hours.map(p => p.value))) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="w-12 text-xs text-foreground text-right">{point.value.toFixed(0)}h</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Active Learners Trend */}
                <div className="bg-muted rounded-xl p-6 border border-border">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Users className="h-5 w-5 text-green-400" />
                    Active Learners Trend
                  </h3>
                  <div className="space-y-2">
                    {dashboard.trends.active_learners.slice(-7).map((point) => (
                      <div key={point.date} className="flex items-center gap-3">
                        <div className="w-20 text-xs text-muted-foreground">{point.date}</div>
                        <div className="flex-1 h-4 bg-accent rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${Math.min((point.value / Math.max(...dashboard.trends.active_learners.map(p => p.value))) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="w-12 text-xs text-foreground text-right">{point.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Report Definitions</h2>
              <button
                onClick={() => setShowCreateReport(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
              >
                <Plus className="h-4 w-4" />
                Create Report
              </button>
            </div>

            {reports.length === 0 ? (
              <div className="bg-muted rounded-xl p-12 border border-border text-center">
                <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No Reports</h3>
                <p className="text-muted-foreground mb-4">Create your first report definition to get started.</p>
                <button
                  onClick={() => setShowCreateReport(true)}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
                >
                  Create Report
                </button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="bg-muted rounded-xl p-5 border border-border hover:border-border transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-foreground font-medium">{report.name}</h3>
                        <p className="text-muted-foreground text-sm mt-1">{getReportTypeLabel(report.report_type)}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded border ${report.is_active ? "bg-green-50 text-green-600 dark:bg-green-900/50 dark:text-green-400 border-green-200 dark:border-green-700" : "bg-accent text-muted-foreground border-border"}`}>
                        {report.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    {report.description && (
                      <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{report.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                      {report.is_scheduled && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {report.schedule_frequency}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        {report.export_format.toUpperCase()}
                      </span>
                      <span>{report.total_runs} runs</span>
                    </div>

                    {report.last_run_at && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                        <span>Last run: {formatDate(report.last_run_at)}</span>
                        {report.last_run_status && (
                          <span className={`px-1.5 py-0.5 rounded border ${getStatusColor(report.last_run_status)}`}>
                            {report.last_run_status}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-3 border-t border-border">
                      <button
                        onClick={() => handleRunReport(report.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
                      >
                        <Play className="h-4 w-4" />
                        Run Now
                      </button>
                      <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition">
                        <Settings className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Runs Tab */}
        {activeTab === "runs" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-foreground">Report Run History</h2>

            {runs.length === 0 ? (
              <div className="bg-muted rounded-xl p-12 border border-border text-center">
                <Clock className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No Runs Yet</h3>
                <p className="text-muted-foreground">Run a report to see the history here.</p>
              </div>
            ) : (
              <div className="bg-muted rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-border bg-background/50">
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">Report</th>
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">Type</th>
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">Status</th>
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">Triggered By</th>
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">Started</th>
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">Duration</th>
                        <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {runs.map((run) => (
                        <tr key={run.id} className="hover:bg-accent/30">
                          <td className="px-4 py-3 text-foreground font-medium">{run.report_name || "Unknown"}</td>
                          <td className="px-4 py-3 text-muted-foreground text-sm">
                            {run.report_type ? getReportTypeLabel(run.report_type) : "N/A"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded border inline-flex items-center gap-1 ${getStatusColor(run.status)}`}>
                              {run.status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
                              {run.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
                              {run.status === "failed" && <XCircle className="h-3 w-3" />}
                              {run.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-sm capitalize">{run.triggered_by}</td>
                          <td className="px-4 py-3 text-muted-foreground text-sm">{formatDate(run.started_at)}</td>
                          <td className="px-4 py-3 text-muted-foreground text-sm">
                            {run.duration_seconds !== null ? `${run.duration_seconds}s` : "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {run.status === "completed" && run.result_file_path && (
                              <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition">
                                <Download className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Create Report Modal */}
        {showCreateReport && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-muted rounded-xl border border-border w-full max-w-lg">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Create Report Definition</h2>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
                  <input
                    type="text"
                    value={newReport.name}
                    onChange={(e) => setNewReport({ ...newReport, name: e.target.value })}
                    placeholder="Monthly Learning Summary"
                    className="w-full bg-background border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                  <textarea
                    value={newReport.description || ""}
                    onChange={(e) => setNewReport({ ...newReport, description: e.target.value })}
                    placeholder="Optional description..."
                    rows={2}
                    className="w-full bg-background border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Report Type *</label>
                  <select
                    value={newReport.report_type}
                    onChange={(e) => setNewReport({ ...newReport, report_type: e.target.value as ReportType })}
                    className="w-full bg-background border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500"
                  >
                    <option value="executive_summary">Executive Summary</option>
                    <option value="team_progress">Team Progress</option>
                    <option value="individual_progress">Individual Progress</option>
                    <option value="compliance_status">Compliance Status</option>
                    <option value="budget_utilization">Budget Utilization</option>
                    <option value="skill_gap_analysis">Skill Gap Analysis</option>
                    <option value="roi_analysis">ROI Analysis</option>
                    <option value="certification_tracking">Certification Tracking</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Export Format</label>
                  <select
                    value={newReport.export_format}
                    onChange={(e) => setNewReport({ ...newReport, export_format: e.target.value as ExportFormat })}
                    className="w-full bg-background border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500"
                  >
                    <option value="pdf">PDF</option>
                    <option value="csv">CSV</option>
                    <option value="xlsx">Excel (XLSX)</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newReport.is_scheduled}
                      onChange={(e) => setNewReport({ ...newReport, is_scheduled: e.target.checked })}
                      className="rounded border-border bg-background text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-foreground">Schedule automatic runs</span>
                  </label>
                </div>

                {newReport.is_scheduled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Frequency</label>
                      <select
                        value={newReport.schedule_frequency || "weekly"}
                        onChange={(e) => setNewReport({ ...newReport, schedule_frequency: e.target.value as ReportScheduleFrequency })}
                        className="w-full bg-background border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Biweekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Time</label>
                      <input
                        type="time"
                        value={newReport.schedule_time || "09:00"}
                        onChange={(e) => setNewReport({ ...newReport, schedule_time: e.target.value })}
                        className="w-full bg-background border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-border flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateReport(false)}
                  className="px-4 py-2 text-muted-foreground hover:text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateReport}
                  disabled={!newReport.name}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition"
                >
                  Create Report
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
