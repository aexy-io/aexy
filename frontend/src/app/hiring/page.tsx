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
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  hiringApi,
  developerApi,
  teamApi,
  TeamGapAnalysis,
  BusFactorRisk,
  HiringRequirement,
  GeneratedJD,
  InterviewRubric,
  Developer,
  TeamListItem,
} from "@/lib/api";

export default function HiringPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
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
    gaps: true,
    busFactors: true,
    requirements: true,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const devs = await developerApi.list();
      setDevelopers(devs);

      // Fetch teams and requirements if we have a workspace
      if (currentWorkspaceId) {
        try {
          const [teamsList, reqs] = await Promise.all([
            teamApi.list(currentWorkspaceId),
            hiringApi.listRequirements(currentWorkspaceId, undefined, selectedTeamId || undefined),
          ]);
          setTeams(teamsList);
          setRequirements(reqs);
        } catch (error) {
          console.error("Failed to fetch requirements:", error);
          setTeams([]);
          setRequirements([]);
        }
      } else {
        setTeams([]);
        setRequirements([]);
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
    // If team is selected, use team_id, otherwise use all developers
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
    // Clear previous analysis when team changes
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  // Show workspace required message if no workspace
  if (!hasWorkspaces) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <Building2 className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Workspace Required</h2>
          <p className="text-slate-400 mb-6">
            Create a workspace first to start using Hiring Intelligence.
          </p>
          <Link
            href="/settings/organization"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
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
        return "bg-red-900/50 text-red-400 border-red-700";
      case "moderate":
        return "bg-yellow-900/50 text-yellow-400 border-yellow-700";
      default:
        return "bg-slate-700 text-slate-300 border-slate-600";
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
        return "bg-red-900/50 text-red-400";
      case "high":
        return "bg-orange-900/50 text-orange-400";
      case "medium":
        return "bg-yellow-900/50 text-yellow-400";
      default:
        return "bg-slate-700 text-slate-400";
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <AppHeader user={user} logout={logout} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Users className="h-8 w-8 text-primary-500" />
              Hiring Intelligence
            </h1>
            {currentWorkspace && (
              <p className="text-slate-400 mt-1 flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {currentWorkspace.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Project Selector */}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-400" />
              <select
                value={selectedTeamId || "all"}
                onChange={(e) => handleTeamChange(e.target.value)}
                className="bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 focus:border-primary-500 focus:outline-none text-sm min-w-[160px]"
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
              className="bg-primary-600 hover:bg-primary-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
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

        {/* Project Filter Indicator */}
        {selectedTeamId && (
          <div className="mb-6 p-3 bg-slate-800/50 border border-slate-700 rounded-lg flex items-center gap-2">
            <Users className="h-4 w-4 text-primary-400" />
            <span className="text-slate-300 text-sm">
              Viewing: <span className="text-white font-medium">{teams.find(t => t.id === selectedTeamId)?.name || "Selected Project"}</span>
            </span>
            <button
              onClick={() => handleTeamChange("all")}
              className="ml-auto text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-700 transition"
            >
              Clear filter
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column: Analysis */}
          <div className="space-y-6">
            {/* Skill Gaps */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <button
                onClick={() => toggleSection("gaps")}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary-400" />
                  Project Skill Gaps
                </h2>
                {expandedSections.gaps ? (
                  <ChevronUp className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                )}
              </button>
              {expandedSections.gaps && (
                <div className="px-4 pb-4">
                  {!gapAnalysis ? (
                    <p className="text-slate-400 text-center py-4">
                      Click &quot;Analyze Project&quot; to identify skill gaps
                    </p>
                  ) : gapAnalysis.skill_gaps.length === 0 ? (
                    <p className="text-green-400 text-center py-4">
                      No significant skill gaps detected!
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {gapAnalysis.skill_gaps.map((gap, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border ${getSeverityColor(gap.gap_severity)}`}
                        >
                          <div className="flex items-center justify-between mb-2">
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
              )}
            </div>

            {/* Bus Factor Risks */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <button
                onClick={() => toggleSection("busFactors")}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  Bus Factor Risks
                </h2>
                {expandedSections.busFactors ? (
                  <ChevronUp className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                )}
              </button>
              {expandedSections.busFactors && (
                <div className="px-4 pb-4">
                  {!gapAnalysis ? (
                    <p className="text-slate-400 text-center py-4">
                      Run analysis to identify bus factor risks
                    </p>
                  ) : gapAnalysis.bus_factor_risks.length === 0 ? (
                    <p className="text-green-400 text-center py-4">
                      No significant bus factor risks!
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {gapAnalysis.bus_factor_risks.map((risk, idx) => (
                        <div key={idx} className="p-3 bg-slate-700/50 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white font-medium">{risk.skill_or_area}</span>
                            <span className={`text-xs font-medium ${getRiskColor(risk.risk_level)}`}>
                              {risk.risk_level.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm text-slate-400">{risk.impact_description}</p>
                          {risk.developer_name && (
                            <p className="text-xs text-slate-500 mt-1">
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
              )}
            </div>
          </div>

          {/* Right Column: Hiring Requirements */}
          <div className="space-y-6">
            {/* Hiring Requirements */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <div className="p-4 flex items-center justify-between border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary-400" />
                  Hiring Requirements
                </h2>
                <button
                  onClick={() => setShowNewReqForm(!showNewReqForm)}
                  disabled={!currentWorkspaceId}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title={currentWorkspaceId ? "Create new requirement" : "Select a workspace first"}
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              {showNewReqForm && (
                <div className="p-4 bg-slate-700/50 border-b border-slate-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newReqTitle}
                      onChange={(e) => setNewReqTitle(e.target.value)}
                      placeholder="Role title (e.g., Senior Go Engineer)"
                      className="flex-1 bg-slate-700 text-white rounded-lg px-4 py-2 border border-slate-600 focus:border-primary-500 focus:outline-none"
                    />
                    <button
                      onClick={handleCreateRequirement}
                      disabled={!newReqTitle}
                      className="bg-primary-600 hover:bg-primary-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition"
                    >
                      Create
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-700">
                {requirements.length === 0 ? (
                  <div className="p-4 text-slate-400 text-center">
                    {currentWorkspaceId
                      ? "No hiring requirements yet. Create one to get started!"
                      : "Select a workspace to view hiring requirements."}
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
                      className={`w-full p-4 text-left hover:bg-slate-700 transition ${
                        selectedRequirement?.id === req.id ? "bg-slate-700" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-medium">{req.role_title}</span>
                        <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(req.priority)}`}>
                          {req.priority}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="capitalize">{req.status}</span>
                        {req.timeline && <span>{req.timeline}</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Selected Requirement Actions */}
            {selectedRequirement && (
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4">
                  {selectedRequirement.role_title}
                </h3>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <button
                    onClick={handleGenerateJD}
                    disabled={generatingJD}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white px-4 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
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
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white px-4 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
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
                    <h4 className="text-md font-medium text-white mb-3">Generated Job Description</h4>
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <h5 className="text-lg font-semibold text-white mb-2">{generatedJD.role_title}</h5>
                      <p className="text-slate-300 text-sm mb-4">{generatedJD.summary}</p>

                      <div className="mb-3">
                        <h6 className="text-sm font-medium text-slate-400 mb-2">Must Have</h6>
                        <div className="flex flex-wrap gap-2">
                          {generatedJD.must_have_skills.map((skill, idx) => (
                            <span
                              key={idx}
                              className="bg-red-900/50 text-red-300 px-2 py-1 rounded text-xs"
                            >
                              {skill.skill} ({skill.level}%)
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h6 className="text-sm font-medium text-slate-400 mb-2">Nice to Have</h6>
                        <div className="flex flex-wrap gap-2">
                          {generatedJD.nice_to_have_skills.map((skill, idx) => (
                            <span
                              key={idx}
                              className="bg-slate-600 text-slate-300 px-2 py-1 rounded text-xs"
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
                    <h4 className="text-md font-medium text-white mb-3">Interview Rubric</h4>
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <div className="mb-4">
                        <h6 className="text-sm font-medium text-slate-400 mb-2">
                          Technical Questions ({interviewRubric.technical_questions.length})
                        </h6>
                        <div className="space-y-2">
                          {interviewRubric.technical_questions.slice(0, 3).map((q, idx) => (
                            <div key={idx} className="text-sm">
                              <p className="text-slate-300">{q.question}</p>
                              <p className="text-xs text-slate-500">
                                Skill: {q.skill_assessed} | Difficulty: {q.difficulty}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {interviewRubric.system_design_prompt && (
                        <div>
                          <h6 className="text-sm font-medium text-slate-400 mb-2">System Design</h6>
                          <p className="text-sm text-slate-300">{interviewRubric.system_design_prompt}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
