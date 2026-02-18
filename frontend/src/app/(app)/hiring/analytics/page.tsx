"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Users,
  AlertTriangle,
  FileText,
  ClipboardCheck,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Target,
  TrendingUp,
  BarChart3,
  PieChart,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  DollarSign,
  UserCheck,
} from "lucide-react";
import {
  hiringApi,
  developerApi,
  teamApi,
  TeamGapAnalysis,
  HiringRequirement,
  GeneratedJD,
  InterviewRubric,
  Developer,
  TeamListItem,
  PipelineMetrics,
} from "@/lib/api";
import { useOrganizationAssessmentMetrics } from "@/hooks/useAssessments";

export default function HiringAnalyticsPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId, currentWorkspace, workspacesLoading, hasWorkspaces } = useWorkspace();
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [gapAnalysis, setGapAnalysis] = useState<TeamGapAnalysis | null>(null);
  const [requirements, setRequirements] = useState<HiringRequirement[]>([]);
  const [selectedRequirement, setSelectedRequirement] = useState<HiringRequirement | null>(null);
  const [generatedJD, setGeneratedJD] = useState<GeneratedJD | null>(null);
  const [interviewRubric, setInterviewRubric] = useState<InterviewRubric | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingJD, setGeneratingJD] = useState(false);
  const [generatingRubric, setGeneratingRubric] = useState(false);
  const [showNewReqForm, setShowNewReqForm] = useState(false);
  const [newReqTitle, setNewReqTitle] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    codeIntelligence: true,
    funnel: true,
    performance: true,
  });
  const [pipelineMetrics, setPipelineMetrics] = useState<PipelineMetrics | null>(null);

  // Assessment metrics
  const { metrics: assessmentMetrics } = useOrganizationAssessmentMetrics(currentWorkspaceId);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const devs = await developerApi.list();
      setDevelopers(devs);

      if (currentWorkspaceId) {
        try {
          const [teamsList, reqs, metrics] = await Promise.all([
            teamApi.list(currentWorkspaceId),
            hiringApi.listRequirements(currentWorkspaceId, undefined, selectedTeamId || undefined),
            hiringApi.getPipelineMetrics(currentWorkspaceId),
          ]);
          setTeams(teamsList);
          setRequirements(reqs);
          setPipelineMetrics(metrics);
        } catch (error) {
          console.error("Failed to fetch requirements:", error);
          setTeams([]);
          setRequirements([]);
          setPipelineMetrics(null);
        }
      } else {
        setTeams([]);
        setRequirements([]);
        setPipelineMetrics(null);
      }
    } catch (error) {
      console.error("Failed to fetch hiring data:", error);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspaceId, selectedTeamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAnalyzeTeam = async () => {
    if (!selectedTeamId && developers.length === 0) return;
    setAnalyzing(true);
    try {
      const developerIds = selectedTeamId ? undefined : developers.map((d) => d.id);
      const analysis = await hiringApi.analyzeTeamGaps(developerIds, undefined, selectedTeamId || undefined);
      setGapAnalysis(analysis);
    } catch (error) {
      console.error("Failed to analyze team:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleTeamChange = (teamId: string) => {
    setSelectedTeamId(teamId === "all" ? null : teamId);
    setGapAnalysis(null);
  };

  const handleCreateRequirement = async () => {
    if (!newReqTitle || !currentWorkspaceId) return;
    try {
      const newReq = await hiringApi.createRequirement({
        organization_id: currentWorkspaceId,
        role_title: newReqTitle,
        team_id: selectedTeamId || undefined,
      });
      setRequirements([...requirements, newReq]);
      setShowNewReqForm(false);
      setNewReqTitle("");
    } catch (error) {
      console.error("Failed to create requirement:", error);
    }
  };

  const handleGenerateJD = async () => {
    if (!selectedRequirement) return;
    setGeneratingJD(true);
    try {
      const jd = await hiringApi.generateJD(selectedRequirement.id);
      setGeneratedJD(jd);
    } catch (error) {
      console.error("Failed to generate JD:", error);
    } finally {
      setGeneratingJD(false);
    }
  };

  const handleGenerateRubric = async () => {
    if (!selectedRequirement) return;
    setGeneratingRubric(true);
    try {
      const rubric = await hiringApi.generateRubric(selectedRequirement.id);
      setInterviewRubric(rubric);
    } catch (error) {
      console.error("Failed to generate rubric:", error);
    } finally {
      setGeneratingRubric(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  if (isLoading || loading || workspacesLoading) {
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

  if (!hasWorkspaces) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Workspace Required</h2>
          <p className="text-muted-foreground mb-6">
            Create a workspace first to start using Hiring Analytics.
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

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-50 text-red-600 dark:bg-red-900/50 dark:text-red-400 border-red-200 dark:border-red-700";
      case "moderate":
        return "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400 border-yellow-200 dark:border-yellow-700";
      default:
        return "bg-accent text-foreground border-border";
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "critical":
        return "text-red-400";
      case "high":
        return "text-orange-400";
      default:
        return "text-yellow-400";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "bg-red-50 text-red-600 dark:bg-red-900/50 dark:text-red-400";
      case "high":
        return "bg-orange-50 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400";
      case "medium":
        return "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400";
      default:
        return "bg-accent text-muted-foreground";
    }
  };

  // Calculate metrics
  const totalCandidates = assessmentMetrics?.total_candidates ?? 0;
  const completedAssessments = assessmentMetrics?.unique_attempts ?? 0;
  const attemptRate = assessmentMetrics?.attempt_rate ?? 0;

  return (
    <main className="w-full px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl">
              <BarChart3 className="h-7 w-7 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Hiring Analytics</h1>
              {currentWorkspace && (
                <p className="text-muted-foreground text-sm flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" />
                  {currentWorkspace.name}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <select
                value={selectedTeamId || "all"}
                onChange={(e) => handleTeamChange(e.target.value)}
                className="bg-accent text-foreground rounded-lg px-3 py-2 border border-border focus:border-primary-500 focus:outline-none text-sm min-w-[160px]"
              >
                <option value="all">All Projects</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAnalyzeTeam}
              disabled={analyzing || (!selectedTeamId && developers.length === 0)}
              className="bg-primary-600 hover:bg-primary-700 disabled:bg-muted text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
            >
              {analyzing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4" />
                  Analyze {selectedTeamId ? "Project" : "All"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code-Based Intelligence Section */}
        <div className="mb-8">
          <button
            onClick={() => toggleSection("codeIntelligence")}
            className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4"
          >
            <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-lg">
                <Target className="h-5 w-5 text-green-400" />
              </div>
              Code-Based Intelligence
              <span className="text-xs font-normal text-muted-foreground ml-2">Derived from your codebase</span>
            </h2>
            {expandedSections.codeIntelligence ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </button>

          {expandedSections.codeIntelligence && (
            <>
              {/* Project Filter Indicator */}
              {selectedTeamId && (
                <div className="mb-6 p-3 bg-muted/50 border border-border rounded-lg flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary-400" />
                  <span className="text-foreground text-sm">
                    Viewing: <span className="text-foreground font-medium">{teams.find(t => t.id === selectedTeamId)?.name || "Selected Project"}</span>
                  </span>
                  <button
                    onClick={() => handleTeamChange("all")}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition"
                  >
                    Clear filter
                  </button>
                </div>
              )}

              <div className="grid lg:grid-cols-2 gap-6 mb-8">
                {/* Skill Gaps */}
                <div className="bg-background/50 rounded-xl border border-border overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary-400" />
                      Project Skill Gaps
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">Skills your team needs based on codebase analysis</p>
                  </div>
                  <div className="p-4">
                    {!gapAnalysis ? (
                      <p className="text-muted-foreground text-center py-8">
                        Click &quot;Analyze Project&quot; to identify skill gaps
                      </p>
                    ) : gapAnalysis.skill_gaps.length === 0 ? (
                      <p className="text-green-400 text-center py-8">
                        No significant skill gaps detected!
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {gapAnalysis.skill_gaps.map((gap, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg border ${getSeverityColor(gap.gap_severity)}`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                              <span className="font-medium">{gap.skill}</span>
                              <span className="text-xs uppercase">{gap.gap_severity}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm opacity-80">
                              <span>{Math.round(gap.current_coverage * 100)}% coverage</span>
                              <span>{Math.round(gap.average_proficiency)}% avg proficiency</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bus Factor Risks */}
                <div className="bg-background/50 rounded-xl border border-border overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-400" />
                      Bus Factor Risks
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">Single points of failure from commit history</p>
                  </div>
                  <div className="p-4">
                    {!gapAnalysis ? (
                      <p className="text-muted-foreground text-center py-8">
                        Run analysis to identify bus factor risks
                      </p>
                    ) : gapAnalysis.bus_factor_risks.length === 0 ? (
                      <p className="text-green-400 text-center py-8">
                        No significant bus factor risks!
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {gapAnalysis.bus_factor_risks.map((risk, idx) => (
                          <div key={idx} className="p-3 bg-accent/50 rounded-lg">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-1">
                              <span className="text-foreground font-medium">{risk.skill_or_area}</span>
                              <span className={`text-xs font-medium ${getRiskColor(risk.risk_level)}`}>
                                {risk.risk_level.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{risk.impact_description}</p>
                            {risk.developer_name && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Only expert: {risk.developer_name}
                              </p>
                            )}
                            <p className="text-xs text-primary-400 mt-2">
                              {risk.mitigation_suggestion}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Hiring Requirements */}
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-background/50 rounded-xl border border-border overflow-hidden">
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary-400" />
                        Hiring Requirements
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">Track your open positions</p>
                    </div>
                    <button
                      onClick={() => setShowNewReqForm(!showNewReqForm)}
                      disabled={!currentWorkspaceId}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition disabled:opacity-50"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>

                  {showNewReqForm && (
                    <div className="p-4 bg-accent/50 border-b border-border">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newReqTitle}
                          onChange={(e) => setNewReqTitle(e.target.value)}
                          placeholder="Role title (e.g., Senior Go Engineer)"
                          className="flex-1 bg-accent text-foreground rounded-lg px-4 py-2 border border-border focus:border-primary-500 focus:outline-none"
                        />
                        <button
                          onClick={handleCreateRequirement}
                          disabled={!newReqTitle}
                          className="bg-primary-600 hover:bg-primary-700 disabled:bg-muted text-white px-4 py-2 rounded-lg font-medium transition"
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="divide-y divide-border max-h-80 overflow-y-auto">
                    {requirements.length === 0 ? (
                      <div className="p-8 text-muted-foreground text-center">
                        No hiring requirements yet. Create one to get started!
                      </div>
                    ) : (
                      requirements.map((req) => (
                        <button
                          key={req.id}
                          onClick={() => {
                            setSelectedRequirement(req);
                            setGeneratedJD(null);
                            setInterviewRubric(null);
                          }}
                          className={`w-full p-4 text-left hover:bg-accent transition ${
                            selectedRequirement?.id === req.id ? "bg-accent" : ""
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-1">
                            <span className="text-foreground font-medium">{req.role_title}</span>
                            <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(req.priority)}`}>
                              {req.priority}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="capitalize">{req.status}</span>
                            {req.timeline && <span>{req.timeline}</span>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Selected Requirement Actions */}
                {selectedRequirement ? (
                  <div className="bg-muted rounded-xl p-6 border border-border">
                    <h3 className="text-lg font-semibold text-foreground mb-4">
                      {selectedRequirement.role_title}
                    </h3>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <button
                        onClick={handleGenerateJD}
                        disabled={generatingJD}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-muted text-white px-4 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
                      >
                        {generatingJD ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <FileText className="h-4 w-4" />
                            Generate JD
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleGenerateRubric}
                        disabled={generatingRubric}
                        className="bg-purple-600 hover:bg-purple-700 disabled:bg-muted text-white px-4 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
                      >
                        {generatingRubric ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <ClipboardCheck className="h-4 w-4" />
                            Interview Rubric
                          </>
                        )}
                      </button>
                    </div>

                    {/* Generated JD Preview */}
                    {generatedJD && (
                      <div className="mb-6">
                        <h4 className="text-md font-medium text-foreground mb-3">Generated Job Description</h4>
                        <div className="bg-accent/50 rounded-lg p-4">
                          <h5 className="text-lg font-semibold text-foreground mb-2">{generatedJD.role_title}</h5>
                          <p className="text-foreground text-sm mb-4">{generatedJD.summary}</p>

                          <div className="mb-3">
                            <h6 className="text-sm font-medium text-muted-foreground mb-2">Must Have</h6>
                            <div className="flex flex-wrap gap-2">
                              {generatedJD.must_have_skills.map((skill, idx) => (
                                <span
                                  key={idx}
                                  className="bg-red-100 dark:bg-red-900/50 text-red-300 px-2 py-1 rounded text-xs"
                                >
                                  {skill.skill} ({skill.level}%)
                                </span>
                              ))}
                            </div>
                          </div>

                          <div>
                            <h6 className="text-sm font-medium text-muted-foreground mb-2">Nice to Have</h6>
                            <div className="flex flex-wrap gap-2">
                              {generatedJD.nice_to_have_skills.map((skill, idx) => (
                                <span
                                  key={idx}
                                  className="bg-muted text-foreground px-2 py-1 rounded text-xs"
                                >
                                  {skill.skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Interview Rubric Preview */}
                    {interviewRubric && (
                      <div>
                        <h4 className="text-md font-medium text-foreground mb-3">Interview Rubric</h4>
                        <div className="bg-accent/50 rounded-lg p-4">
                          <div className="mb-4">
                            <h6 className="text-sm font-medium text-muted-foreground mb-2">
                              Technical Questions ({interviewRubric.technical_questions.length})
                            </h6>
                            <div className="space-y-2">
                              {interviewRubric.technical_questions.slice(0, 3).map((q, idx) => (
                                <div key={idx} className="text-sm">
                                  <p className="text-foreground">{q.question}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Skill: {q.skill_assessed} | Difficulty: {q.difficulty}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {interviewRubric.system_design_prompt && (
                            <div>
                              <h6 className="text-sm font-medium text-muted-foreground mb-2">System Design</h6>
                              <p className="text-sm text-foreground">{interviewRubric.system_design_prompt}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-background/50 rounded-xl border border-border p-8 flex items-center justify-center">
                    <div className="text-center">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">Select a requirement to generate JD or rubric</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Hiring Funnel Analytics */}
        <div className="mb-8">
          <button
            onClick={() => toggleSection("funnel")}
            className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4"
          >
            <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg">
                <PieChart className="h-5 w-5 text-blue-400" />
              </div>
              Hiring Funnel Analytics
            </h2>
            {expandedSections.funnel ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </button>

          {expandedSections.funnel && (
            <div className="bg-background/50 rounded-xl border border-border p-6">
              {pipelineMetrics ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mb-6">
                    {[
                      { stage: "applied", label: "Applied", color: "bg-blue-500" },
                      { stage: "screening", label: "Screening", color: "bg-cyan-500" },
                      { stage: "assessment", label: "Assessment", color: "bg-primary-500" },
                      { stage: "interview", label: "Interview", color: "bg-purple-500" },
                      { stage: "offer", label: "Offer", color: "bg-orange-500" },
                      { stage: "hired", label: "Hired", color: "bg-green-500" },
                    ].map((item) => {
                      const count = pipelineMetrics.by_stage[item.stage] || 0;
                      const total = pipelineMetrics.total || 1;
                      const percent = Math.round((count / total) * 100);
                      return (
                        <div key={item.stage} className="text-center">
                          <div className="relative h-32 flex items-end justify-center mb-3">
                            <div
                              className={`w-full ${item.color} rounded-t-lg transition-all`}
                              style={{
                                height: `${Math.max(15, percent)}%`,
                              }}
                            />
                          </div>
                          <p className="text-2xl font-bold text-foreground">{count}</p>
                          <p className="text-sm text-muted-foreground">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{percent}%</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Conversion Rates */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-border">
                    {[
                      { from: "applied", to: "screening", fromLabel: "Applied", toLabel: "Screening" },
                      { from: "screening", to: "assessment", fromLabel: "Screening", toLabel: "Assessment" },
                      { from: "assessment", to: "interview", fromLabel: "Assessment", toLabel: "Interview" },
                      { from: "interview", to: "offer", fromLabel: "Interview", toLabel: "Offer" },
                      { from: "offer", to: "hired", fromLabel: "Offer", toLabel: "Hired" },
                    ].map((conv) => {
                      const rate = pipelineMetrics.conversion_rates[`${conv.from}_to_${conv.to}`] || 0;
                      return (
                        <div key={`${conv.from}-${conv.to}`} className="text-center">
                          <p className="text-xs text-muted-foreground mb-1">{conv.fromLabel} → {conv.toLabel}</p>
                          <p className={`text-lg font-bold ${rate >= 50 ? 'text-green-400' : rate >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {rate}%
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No pipeline data available</p>
                  <p className="text-sm mt-2">Add candidates to see funnel analytics</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Performance Metrics */}
        <div className="mb-8">
          <button
            onClick={() => toggleSection("performance")}
            className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4"
          >
            <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-lg">
                <TrendingUp className="h-5 w-5 text-orange-400" />
              </div>
              Performance Metrics
            </h2>
            {expandedSections.performance ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </button>

          {expandedSections.performance && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-background/50 rounded-xl border border-border p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                  <Clock className="h-5 w-5 text-blue-400" />
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <ArrowDownRight className="h-3 w-3" />
                    -12%
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">18 days</p>
                <p className="text-sm text-muted-foreground">Avg. Time to Hire</p>
              </div>

              <div className="bg-background/50 rounded-xl border border-border p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                  <Percent className="h-5 w-5 text-purple-400" />
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" />
                    +5%
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">{Math.round(attemptRate)}%</p>
                <p className="text-sm text-muted-foreground">Assessment Pass Rate</p>
              </div>

              <div className="bg-background/50 rounded-xl border border-border p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                  <UserCheck className="h-5 w-5 text-green-400" />
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" />
                    +8%
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">85%</p>
                <p className="text-sm text-muted-foreground">Offer Accept Rate</p>
              </div>

              <div className="bg-background/50 rounded-xl border border-border p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                  <DollarSign className="h-5 w-5 text-orange-400" />
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" />
                    +3%
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">$4,200</p>
                <p className="text-sm text-muted-foreground">Avg. Cost per Hire</p>
              </div>
            </div>
          )}
        </div>

        {/* Source Effectiveness - Coming Soon */}
        <div className="bg-background/50 rounded-xl border border-border p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-pink-500/20 to-rose-500/20 rounded-lg">
              <PieChart className="h-5 w-5 text-pink-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Source Effectiveness</h2>
              <p className="text-sm text-muted-foreground">Which channels bring the best candidates</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { source: "LinkedIn", candidates: 45, hires: 8, rate: 18, color: "bg-blue-500" },
              { source: "Referrals", candidates: 20, hires: 6, rate: 30, color: "bg-green-500" },
              { source: "Direct", candidates: 35, hires: 4, rate: 11, color: "bg-purple-500" },
              { source: "Job Boards", candidates: 60, hires: 5, rate: 8, color: "bg-orange-500" },
            ].map((item) => (
              <div key={item.source} className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-3 h-3 rounded-full ${item.color}`} />
                  <span className="text-sm font-medium text-foreground">{item.source}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Candidates</span>
                    <span className="text-foreground">{item.candidates}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Hires</span>
                    <span className="text-foreground">{item.hires}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Conversion</span>
                    <span className="text-green-400">{item.rate}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
    </main>
  );
}
