"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Award,
  Users,
  Calendar,
  RefreshCw,
  Plus,
  ChevronRight,
  BookOpen,
  AlertCircle,
  FileText,
  TrendingUp,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  complianceApi,
  ComplianceOverview,
  MandatoryTrainingWithStats,
  TrainingAssignmentWithDetails,
  CertificationWithStats,
  DeveloperCertificationWithDetails,
  OverdueReport,
  ExpiringCertificationsReport,
} from "@/lib/api";

type TabType = "overview" | "training" | "certifications" | "my_compliance" | "reports";

export default function CompliancePage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ComplianceOverview | null>(null);
  const [trainings, setTrainings] = useState<MandatoryTrainingWithStats[]>([]);
  const [myAssignments, setMyAssignments] = useState<TrainingAssignmentWithDetails[]>([]);
  const [certifications, setCertifications] = useState<CertificationWithStats[]>([]);
  const [myCertifications, setMyCertifications] = useState<DeveloperCertificationWithDetails[]>([]);
  const [overdueReport, setOverdueReport] = useState<OverdueReport | null>(null);
  const [expiringReport, setExpiringReport] = useState<ExpiringCertificationsReport | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentWorkspaceId || !user?.id) return;
    setLoading(true);
    try {
      const [overviewData, trainingsData, myAssignmentsData, certsData, myCertsData] = await Promise.all([
        complianceApi.reports.getOverview(currentWorkspaceId),
        complianceApi.training.list(currentWorkspaceId, { is_active: true }),
        complianceApi.assignments.list(currentWorkspaceId, { developer_id: user.id }),
        complianceApi.certifications.list(currentWorkspaceId, { is_active: true }),
        complianceApi.developerCertifications.list(currentWorkspaceId, { developer_id: user.id }),
      ]);

      setOverview(overviewData);
      setTrainings(trainingsData.items);
      setMyAssignments(myAssignmentsData.items);
      setCertifications(certsData.items);
      setMyCertifications(myCertsData.items);
    } catch (error) {
      console.error("Failed to fetch compliance data:", error);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspaceId, user?.id]);

  const fetchReports = useCallback(async () => {
    if (!currentWorkspaceId) return;
    try {
      const [overdue, expiring] = await Promise.all([
        complianceApi.reports.getOverdue(currentWorkspaceId),
        complianceApi.reports.getExpiringCertifications(currentWorkspaceId, 30),
      ]);
      setOverdueReport(overdue);
      setExpiringReport(expiring);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
    }
  }, [currentWorkspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === "reports") {
      fetchReports();
    }
  }, [activeTab, fetchReports]);

  const handleStartAssignment = async (assignmentId: string) => {
    if (!currentWorkspaceId || !user?.id) return;
    try {
      await complianceApi.assignments.start(assignmentId, currentWorkspaceId, user.id);
      fetchData();
    } catch (error) {
      console.error("Failed to start assignment:", error);
    }
  };

  const handleCompleteAssignment = async (assignmentId: string) => {
    if (!currentWorkspaceId || !user?.id) return;
    try {
      await complianceApi.assignments.complete(assignmentId, currentWorkspaceId, user.id);
      fetchData();
    } catch (error) {
      console.error("Failed to complete assignment:", error);
    }
  };

  const handleAcknowledgeAssignment = async (assignmentId: string) => {
    if (!currentWorkspaceId || !user?.id) return;
    try {
      await complianceApi.assignments.acknowledge(assignmentId, currentWorkspaceId, user.id);
      fetchData();
    } catch (error) {
      console.error("Failed to acknowledge assignment:", error);
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
          <p className="text-muted-foreground text-sm">Loading compliance data...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-900/50 text-green-400 border-green-700";
      case "in_progress":
        return "bg-blue-900/50 text-blue-400 border-blue-700";
      case "overdue":
        return "bg-red-900/50 text-red-400 border-red-700";
      case "pending":
        return "bg-yellow-900/50 text-yellow-400 border-yellow-700";
      case "waived":
        return "bg-accent text-foreground border-border";
      case "active":
        return "bg-green-900/50 text-green-400 border-green-700";
      case "expired":
        return "bg-red-900/50 text-red-400 border-red-700";
      case "expiring_soon":
        return "bg-orange-900/50 text-orange-400 border-orange-700";
      default:
        return "bg-accent text-foreground border-border";
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const myOverdue = myAssignments.filter((a) => a.is_overdue);
  const myPending = myAssignments.filter((a) => a.status === "pending" || a.status === "in_progress");
  const myExpiring = myCertifications.filter((c) => c.is_expiring_soon);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-xl">
              <Shield className="h-7 w-7 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Compliance & Certifications</h1>
              <p className="text-muted-foreground text-sm">Track mandatory training and certifications</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Stats for User */}
        {(myOverdue.length > 0 || myExpiring.length > 0) && (
          <div className="mb-6">
            {myOverdue.length > 0 && (
              <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 mb-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  <div>
                    <p className="text-red-400 font-medium">You have {myOverdue.length} overdue training assignment{myOverdue.length > 1 ? "s" : ""}</p>
                    <p className="text-red-300/80 text-sm">Please complete them as soon as possible</p>
                  </div>
                </div>
              </div>
            )}
            {myExpiring.length > 0 && (
              <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-orange-400" />
                  <div>
                    <p className="text-orange-400 font-medium">{myExpiring.length} certification{myExpiring.length > 1 ? "s" : ""} expiring soon</p>
                    <p className="text-orange-300/80 text-sm">Consider renewing before they expire</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-muted/50 p-1 rounded-lg w-fit">
          {[
            { id: "overview", label: "Overview", icon: TrendingUp },
            { id: "training", label: "Training", icon: BookOpen },
            { id: "certifications", label: "Certifications", icon: Award },
            { id: "my_compliance", label: "My Compliance", icon: Users },
            { id: "reports", label: "Reports", icon: FileText },
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

        {/* Overview Tab */}
        {activeTab === "overview" && overview && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-900/50 rounded-lg">
                    <BookOpen className="h-5 w-5 text-blue-400" />
                  </div>
                  <span className="text-muted-foreground text-sm">Total Training</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{overview.total_assignments}</div>
                <div className="text-sm text-muted-foreground mt-1">{overview.active_mandatory_trainings} active programs</div>
              </div>

              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-green-900/50 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                  </div>
                  <span className="text-muted-foreground text-sm">Completion Rate</span>
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {(overview.overall_completion_rate * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground mt-1">{overview.completed_assignments} completed</div>
              </div>

              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-red-900/50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  </div>
                  <span className="text-muted-foreground text-sm">Overdue</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{overview.overdue_assignments}</div>
                <div className="text-sm text-muted-foreground mt-1">{overview.pending_assignments} pending</div>
              </div>

              <div className="bg-muted rounded-xl p-4 border border-border">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-amber-900/50 rounded-lg">
                    <Award className="h-5 w-5 text-amber-400" />
                  </div>
                  <span className="text-muted-foreground text-sm">Certifications</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{overview.active_certifications}</div>
                <div className="text-sm text-muted-foreground mt-1">{overview.expiring_soon_certifications} expiring soon</div>
              </div>
            </div>

            {/* Progress Bars */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-muted rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Training Progress</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Completed</span>
                      <span className="text-green-400">{overview.completed_assignments}</span>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{
                          width: `${overview.total_assignments > 0 ? (overview.completed_assignments / overview.total_assignments) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">In Progress</span>
                      <span className="text-blue-400">{overview.in_progress_assignments}</span>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{
                          width: `${overview.total_assignments > 0 ? (overview.in_progress_assignments / overview.total_assignments) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Overdue</span>
                      <span className="text-red-400">{overview.overdue_assignments}</span>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full"
                        style={{
                          width: `${overview.total_assignments > 0 ? (overview.overdue_assignments / overview.total_assignments) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-muted rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Certification Status</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Active</span>
                      <span className="text-green-400">{overview.active_certifications}</span>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{
                          width: `${overview.total_certifications > 0 ? (overview.active_certifications / overview.total_certifications) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Expiring Soon</span>
                      <span className="text-orange-400">{overview.expiring_soon_certifications}</span>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full"
                        style={{
                          width: `${overview.total_certifications > 0 ? (overview.expiring_soon_certifications / overview.total_certifications) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Expired</span>
                      <span className="text-red-400">{overview.expired_certifications}</span>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full"
                        style={{
                          width: `${overview.total_certifications > 0 ? (overview.expired_certifications / overview.total_certifications) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Training Tab */}
        {activeTab === "training" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-foreground">Mandatory Training Programs</h2>
            </div>

            {trainings.length === 0 ? (
              <div className="bg-muted rounded-xl p-12 border border-border text-center">
                <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No Training Programs</h3>
                <p className="text-muted-foreground">No mandatory training programs have been created yet.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {trainings.map((training) => (
                  <div
                    key={training.id}
                    className="bg-muted rounded-xl p-5 border border-border hover:border-border transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-foreground font-medium">{training.name}</h3>
                        {training.description && (
                          <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{training.description}</p>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded border ${training.is_active ? "bg-green-900/50 text-green-400 border-green-700" : "bg-accent text-muted-foreground border-border"}`}>
                        {training.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                      <div className="text-center p-2 bg-accent/50 rounded-lg">
                        <div className="text-lg font-bold text-foreground">{training.total_assignments}</div>
                        <div className="text-xs text-muted-foreground">Assigned</div>
                      </div>
                      <div className="text-center p-2 bg-accent/50 rounded-lg">
                        <div className="text-lg font-bold text-green-400">{training.completed_assignments}</div>
                        <div className="text-xs text-muted-foreground">Completed</div>
                      </div>
                      <div className="text-center p-2 bg-accent/50 rounded-lg">
                        <div className="text-lg font-bold text-red-400">{training.overdue_assignments}</div>
                        <div className="text-xs text-muted-foreground">Overdue</div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Completion Rate</span>
                        <span className="text-foreground">{(training.completion_rate * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-accent rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full"
                          style={{ width: `${training.completion_rate * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                      <span>Due in {training.due_days_after_assignment} days</span>
                      {training.recurring_months && (
                        <span>Recurs every {training.recurring_months} months</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Certifications Tab */}
        {activeTab === "certifications" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-foreground">Certifications</h2>
            </div>

            {certifications.length === 0 ? (
              <div className="bg-muted rounded-xl p-12 border border-border text-center">
                <Award className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No Certifications</h3>
                <p className="text-muted-foreground">No certifications have been defined yet.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {certifications.map((cert) => (
                  <div
                    key={cert.id}
                    className="bg-muted rounded-xl p-5 border border-border hover:border-border transition"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {cert.logo_url ? (
                        <img src={cert.logo_url} alt={cert.name} className="w-12 h-12 rounded-lg object-cover" />
                      ) : (
                        <div className="w-12 h-12 bg-amber-900/30 rounded-lg flex items-center justify-center">
                          <Award className="h-6 w-6 text-amber-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-foreground font-medium truncate">{cert.name}</h3>
                        <p className="text-muted-foreground text-sm truncate">{cert.issuing_authority}</p>
                      </div>
                    </div>

                    {cert.description && (
                      <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{cert.description}</p>
                    )}

                    <div className="flex flex-wrap gap-1 mb-3">
                      {cert.skill_tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5 bg-accent text-foreground rounded">
                          {tag}
                        </span>
                      ))}
                      {cert.skill_tags.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{cert.skill_tags.length - 3}</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
                      <div className="text-center">
                        <div className="text-lg font-bold text-foreground">{cert.active_holders}</div>
                        <div className="text-xs text-muted-foreground">Active Holders</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-orange-400">{cert.expiring_soon_count}</div>
                        <div className="text-xs text-muted-foreground">Expiring Soon</div>
                      </div>
                    </div>

                    {cert.validity_months && (
                      <div className="mt-3 text-sm text-muted-foreground text-center">
                        Valid for {cert.validity_months} months
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* My Compliance Tab */}
        {activeTab === "my_compliance" && (
          <div className="space-y-6">
            {/* My Training Assignments */}
            <div className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary-400" />
                  My Training Assignments
                </h2>
              </div>

              {myAssignments.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-3" />
                  <p className="text-muted-foreground">No training assignments</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {myAssignments.map((assignment) => (
                    <div key={assignment.id} className="p-4 hover:bg-accent/30 transition">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <h3 className="text-foreground font-medium truncate">{assignment.training_name}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded border ${getStatusColor(assignment.status)}`}>
                              {assignment.status.replace("_", " ")}
                            </span>
                          </div>
                          {assignment.training_description && (
                            <p className="text-muted-foreground text-sm mt-1 line-clamp-1">{assignment.training_description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              Due: {formatDate(assignment.due_date)}
                            </span>
                            {assignment.days_until_due !== null && !assignment.is_overdue && (
                              <span>{assignment.days_until_due} days remaining</span>
                            )}
                            {assignment.is_overdue && (
                              <span className="text-red-400">Overdue by {Math.abs(assignment.days_until_due || 0)} days</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          {assignment.status === "pending" && !assignment.acknowledged_at && (
                            <button
                              onClick={() => handleAcknowledgeAssignment(assignment.id)}
                              className="px-3 py-1.5 text-sm bg-accent hover:bg-muted text-foreground rounded-lg transition"
                            >
                              Acknowledge
                            </button>
                          )}
                          {assignment.status === "pending" && assignment.acknowledged_at && (
                            <button
                              onClick={() => handleStartAssignment(assignment.id)}
                              className="px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
                            >
                              Start
                            </button>
                          )}
                          {assignment.status === "in_progress" && (
                            <button
                              onClick={() => handleCompleteAssignment(assignment.id)}
                              className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
                            >
                              Complete
                            </button>
                          )}
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>

                      {assignment.status === "in_progress" && (
                        <div className="mt-3">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="text-foreground">{assignment.progress_percentage}%</span>
                          </div>
                          <div className="h-2 bg-accent rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 rounded-full"
                              style={{ width: `${assignment.progress_percentage}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My Certifications */}
            <div className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-400" />
                  My Certifications
                </h2>
              </div>

              {myCertifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Award className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No certifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {myCertifications.map((cert) => (
                    <div key={cert.id} className="p-4 hover:bg-accent/30 transition">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <h3 className="text-foreground font-medium truncate">{cert.certification_name}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded border ${getStatusColor(cert.status)}`}>
                              {cert.status.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-sm mt-1">{cert.certification_issuing_authority}</p>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span>Issued: {formatDate(cert.issued_date)}</span>
                            {cert.expiry_date && (
                              <span>Expires: {formatDate(cert.expiry_date)}</span>
                            )}
                            {cert.days_until_expiry !== null && cert.days_until_expiry > 0 && (
                              <span className={cert.is_expiring_soon ? "text-orange-400" : ""}>
                                {cert.days_until_expiry} days until expiry
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          {cert.verified_at && (
                            <span className="text-xs text-green-400 flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" /> Verified
                            </span>
                          )}
                          {cert.verification_url && (
                            <a
                              href={cert.verification_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary-400 hover:text-primary-300 text-sm"
                            >
                              Verify
                            </a>
                          )}
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            {/* Overdue Training Report */}
            <div className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  Overdue Training Report
                </h2>
                {overdueReport && (
                  <span className="text-sm text-red-400">{overdueReport.total} overdue</span>
                )}
              </div>

              {!overdueReport || overdueReport.assignments.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-3" />
                  <p className="text-muted-foreground">No overdue training assignments</p>
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                  {overdueReport.assignments.map((assignment) => (
                    <div key={assignment.id} className="p-4 hover:bg-accent/30 transition">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-foreground font-medium">{assignment.training_name}</h3>
                          <p className="text-muted-foreground text-sm">{assignment.developer_name} ({assignment.developer_email})</p>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span>Due: {formatDate(assignment.due_date)}</span>
                            <span className="text-red-400">
                              Overdue by {Math.abs(assignment.days_until_due || 0)} days
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expiring Certifications Report */}
            <div className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-400" />
                  Expiring Certifications (Next 30 Days)
                </h2>
                {expiringReport && (
                  <span className="text-sm text-orange-400">{expiringReport.total} expiring</span>
                )}
              </div>

              {!expiringReport || expiringReport.certifications.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-3" />
                  <p className="text-muted-foreground">No certifications expiring soon</p>
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                  {expiringReport.certifications.map((cert) => (
                    <div key={cert.id} className="p-4 hover:bg-accent/30 transition">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-foreground font-medium">{cert.certification_name}</h3>
                          <p className="text-muted-foreground text-sm">{cert.developer_name} ({cert.developer_email})</p>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span>Expires: {cert.expiry_date ? formatDate(cert.expiry_date) : "N/A"}</span>
                            {cert.days_until_expiry !== null && (
                              <span className={cert.is_expired ? "text-red-400" : "text-orange-400"}>
                                {cert.is_expired
                                  ? "Expired"
                                  : `${cert.days_until_expiry} days remaining`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
