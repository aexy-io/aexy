"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  GitBranch,
  Users,
  AlertTriangle,
  FileText,
  ClipboardCheck,
  Plus,
  RefreshCw,
  Calendar,
  GraduationCap,
  LogOut,
  ChevronDown,
  ChevronUp,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  hiringApi,
  developerApi,
  TeamGapAnalysis,
  BusFactorRisk,
  HiringRequirement,
  GeneratedJD,
  InterviewRubric,
  Developer,
} from "@/lib/api";

export default function HiringPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [developers, setDevelopers] = useState<Developer[]>([]);
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

      // For demo, use a placeholder org ID
      // In production, this would come from user context
      const orgId = "demo-org";
      const reqs = await hiringApi.listRequirements(orgId);
      setRequirements(reqs);
    } catch (error) {
      console.error("Failed to fetch hiring data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAnalyzeTeam = async () => {
    if (developers.length === 0) return;
    setAnalyzing(true);
    try {
      const developerIds = developers.map((d) => d.id);
      const analysis = await hiringApi.analyzeTeamGaps(developerIds);
      setGapAnalysis(analysis);
    } catch (error) {
      console.error("Failed to analyze team:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCreateRequirement = async () => {
    if (!newReqTitle) return;
    try {
      const req = await hiringApi.createRequirement({
        organization_id: "demo-org",
        role_title: newReqTitle,
        priority: "high",
      });
      setRequirements([req, ...requirements]);
      setNewReqTitle("");
      setShowNewReqForm(false);
      setSelectedRequirement(req);
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

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
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
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-8 w-8 text-primary-500" />
              <span className="text-2xl font-bold text-white">Gitraki</span>
            </div>
            <nav className="hidden md:flex items-center gap-1 ml-6">
              <Link
                href="/dashboard"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition"
              >
                Dashboard
              </Link>
              <Link
                href="/sprint-planning"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Sprint Planning
              </Link>
              <Link
                href="/learning"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <GraduationCap className="h-4 w-4" />
                Learning
              </Link>
              <Link
                href="/hiring"
                className="px-3 py-2 text-white bg-slate-700 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Hiring
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {user?.avatar_url && (
                <Image
                  src={user.avatar_url}
                  alt={user.name || "User"}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <span className="text-white">{user?.name || user?.email}</span>
            </div>
            <button onClick={logout} className="text-slate-400 hover:text-white transition">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Users className="h-8 w-8 text-primary-500" />
            Hiring Intelligence
          </h1>
          <button
            onClick={handleAnalyzeTeam}
            disabled={analyzing || developers.length === 0}
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
                Analyze Team
              </>
            )}
          </button>
        </div>

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
                  Team Skill Gaps
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
                      Click &quot;Analyze Team&quot; to identify skill gaps
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
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
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
