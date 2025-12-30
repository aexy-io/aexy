import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to home (login page)
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  getGitHubLoginUrl: () => `${API_BASE_URL}/auth/github/login`,
};

// Developer API
export const developerApi = {
  getMe: async () => {
    const response = await api.get("/developers/me");
    return response.data;
  },

  updateMe: async (data: DeveloperUpdate) => {
    const response = await api.patch("/developers/me", data);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/developers/${id}`);
    return response.data;
  },

  list: async (skip = 0, limit = 100) => {
    const response = await api.get("/developers/", { params: { skip, limit } });
    return response.data;
  },
};

// Types
export interface LanguageSkill {
  name: string;
  proficiency_score: number;
  lines_of_code: number;
  commits_count: number;
  trend: "growing" | "stable" | "declining";
}

export interface FrameworkSkill {
  name: string;
  category: string;
  proficiency_score: number;
  usage_count: number;
}

export interface DomainExpertise {
  name: string;
  confidence_score: number;
}

export interface SkillFingerprint {
  languages: LanguageSkill[];
  frameworks: FrameworkSkill[];
  domains: DomainExpertise[];
  tools: string[];
}

export interface WorkPatterns {
  preferred_complexity: string;
  collaboration_style: string;
  peak_productivity_hours: number[];
  average_pr_size: number;
  average_review_turnaround_hours: number;
}

export interface GrowthTrajectory {
  skills_acquired_6m: string[];
  skills_acquired_12m: string[];
  skills_declining: string[];
  learning_velocity: number;
}

export interface GitHubConnection {
  github_username: string;
  github_name: string | null;
  github_avatar_url: string | null;
  connected_at: string | null;
}

export interface Developer {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  skill_fingerprint: SkillFingerprint | null;
  work_patterns: WorkPatterns | null;
  growth_trajectory: GrowthTrajectory | null;
  github_connection: GitHubConnection | null;
  created_at: string;
  updated_at: string;
}

export interface DeveloperUpdate {
  name?: string;
  skill_fingerprint?: SkillFingerprint;
  work_patterns?: WorkPatterns;
  growth_trajectory?: GrowthTrajectory;
}

// Soft Skills Types
export interface SoftSkillsProfile {
  communication_score: number;
  mentorship_score: number;
  collaboration_score: number;
  leadership_score: number;
  communication_indicators: string[];
  mentorship_indicators: string[];
  collaboration_indicators: string[];
  leadership_indicators: string[];
  samples_analyzed: number;
}

// LLM Insights Types
export interface DeveloperInsights {
  developer_id: string;
  skill_summary: string;
  strengths: string[];
  growth_areas: string[];
  recommended_tasks: string[];
  soft_skills: SoftSkillsProfile | null;
}

// Task Matching Types
export interface TaskSignals {
  required_skills: string[];
  preferred_skills: string[];
  domain: string | null;
  complexity: string;
  estimated_effort: string | null;
  keywords: string[];
  confidence: number;
}

export interface MatchScore {
  developer_id: string;
  overall_score: number;
  skill_match: number;
  experience_match: number;
  growth_opportunity: number;
  reasoning: string;
  strengths: string[];
  gaps: string[];
}

export interface TaskMatchResult {
  task_signals: TaskSignals;
  candidates: Array<{
    developer_id: string;
    developer_name: string | null;
    match_score: MatchScore;
    rank: number;
  }>;
  recommendations: string[];
  warnings: string[];
}

// Analysis API
// What-if Analysis Types
export interface WhatIfScenario {
  scenario_id: string;
  scenario_name: string;
  assignments: {
    task_id: string;
    task_title: string;
    developer_id: string;
    developer_name: string | null;
    match_score: number;
    skill_match: number;
    growth_opportunity: number;
  }[];
  workload_impacts: {
    developer_id: string;
    developer_name: string | null;
    current_tasks: number;
    assigned_tasks: number;
    total_tasks: number;
    workload_status: string;
    estimated_hours: number;
  }[];
  team_impact: {
    total_tasks: number;
    assigned_tasks: number;
    unassigned_tasks: number;
    average_match_score: number;
    skill_coverage: Record<string, number>;
    growth_distribution: Record<string, number>;
    warnings: string[];
  };
  recommendations: string[];
}

export interface BenchmarkResult {
  developer_id: string;
  developer_name: string | null;
  peer_group_size: number;
  percentile_overall: number;
  language_comparisons: {
    skill: string;
    score: number;
    peer_avg: number;
    percentile: number;
    delta: number;
  }[];
  framework_comparisons: {
    skill: string;
    score: number;
    peer_avg: number;
    percentile: number;
    delta: number;
  }[];
  domain_comparisons: {
    skill: string;
    score: number;
    peer_avg: number;
    percentile: number;
    delta: number;
  }[];
  strengths: string[];
  growth_opportunities: string[];
  recommendations: string[];
}

export interface TeamSkillGaps {
  team_size: number;
  gaps: { skill: string; average_score: number; experts: number }[];
  at_risk: { skill: string; average_score: number; experts: number }[];
  well_covered: { skill: string; average_score: number; experts: number }[];
  recommendations: string[];
}

export const analysisApi = {
  getDeveloperInsights: async (developerId: string): Promise<DeveloperInsights> => {
    const response = await api.get(`/analysis/developers/${developerId}/insights`);
    return response.data;
  },

  getSoftSkills: async (developerId: string): Promise<SoftSkillsProfile> => {
    const response = await api.get(`/analysis/developers/${developerId}/soft-skills`);
    return response.data;
  },

  refreshAnalysis: async (developerId: string, force = false) => {
    const response = await api.post(`/analysis/developers/${developerId}/refresh`, { force });
    return response.data;
  },

  matchTask: async (task: {
    title: string;
    description: string;
    source?: string;
    labels?: string[];
  }): Promise<TaskMatchResult> => {
    const response = await api.post("/analysis/match/task", task);
    return response.data;
  },

  analyzeCode: async (code: string, filePath?: string, languageHint?: string) => {
    const response = await api.post("/analysis/code", {
      code,
      file_path: filePath,
      language_hint: languageHint,
    });
    return response.data;
  },

  // Peer Benchmarking
  getBenchmark: async (developerId: string, domain?: string): Promise<BenchmarkResult> => {
    const params = domain ? { domain } : {};
    const response = await api.get(`/analysis/developers/${developerId}/benchmark`, { params });
    return response.data;
  },

  getTeamSkillGaps: async (targetSkills: string[]): Promise<TeamSkillGaps> => {
    const response = await api.get("/analysis/team/skill-gaps", {
      params: { target_skills: targetSkills.join(",") },
    });
    return response.data;
  },

  // What-if Analysis
  createWhatIfScenario: async (request: {
    scenario_name: string;
    tasks: { id: string; title: string; description?: string; signals?: object }[];
    proposed_assignments: { task_id: string; developer_id: string }[];
    current_workloads?: Record<string, number>;
  }): Promise<WhatIfScenario> => {
    const response = await api.post("/analysis/whatif/scenario", request);
    return response.data;
  },

  optimizeAssignments: async (request: {
    tasks: { id: string; title: string; description?: string; signals?: object }[];
    max_per_developer?: number;
    current_workloads?: Record<string, number>;
  }): Promise<WhatIfScenario> => {
    const response = await api.post("/analysis/whatif/optimize", request);
    return response.data;
  },

  compareScenarios: async (
    scenarioA: {
      scenario_name: string;
      tasks: object[];
      proposed_assignments: { task_id: string; developer_id: string }[];
    },
    scenarioB: {
      scenario_name: string;
      tasks: object[];
      proposed_assignments: { task_id: string; developer_id: string }[];
    }
  ) => {
    const response = await api.post("/analysis/whatif/compare", {
      scenario_a: scenarioA,
      scenario_b: scenarioB,
    });
    return response.data;
  },
};

// ============================================================================
// Phase 3: Career Intelligence Types
// ============================================================================

export interface CareerRole {
  id: string;
  name: string;
  level: number;
  track: string;
  description: string | null;
  responsibilities: string[];
  required_skills: Record<string, number>;
  preferred_skills: Record<string, number>;
  soft_skill_requirements: Record<string, number>;
  is_active: boolean;
  organization_id: string | null;
}

export interface SkillGap {
  skill: string;
  current: number;
  target: number;
  gap: number;
}

export interface RoleGapAnalysis {
  developer_id: string;
  role_id: string;
  role_name: string;
  overall_readiness: number;
  skill_gaps: SkillGap[];
  met_requirements: string[];
  soft_skill_gaps: Record<string, number>;
  estimated_time_to_ready_months: number | null;
}

export interface RoleSuggestion {
  role: CareerRole;
  readiness_score: number;
  progression_type: string;
  key_gaps: string[];
  estimated_preparation_months: number;
}

export interface PromotionReadiness {
  developer_id: string;
  target_role_id: string;
  target_role_name: string;
  overall_readiness: number;
  met_criteria: string[];
  missing_criteria: string[];
  recommendations: string[];
  timeline_estimate: string | null;
}

export interface LearningActivity {
  type: string;
  description: string;
  source: string;
  url: string | null;
  estimated_hours: number | null;
}

export interface LearningMilestone {
  id: string;
  learning_path_id: string;
  skill_name: string;
  target_score: number;
  current_score: number;
  status: "not_started" | "in_progress" | "completed" | "behind";
  target_date: string | null;
  completed_date: string | null;
  recommended_activities: LearningActivity[];
  completed_activities: string[];
  sequence: number;
}

export interface LearningPath {
  id: string;
  developer_id: string;
  target_role_id: string | null;
  target_role_name: string | null;
  skill_gaps: Record<string, { current: number; target: number; gap: number }>;
  phases: {
    name: string;
    duration_weeks: number;
    skills: string[];
    activities: LearningActivity[];
  }[];
  milestones: LearningMilestone[];
  status: "active" | "completed" | "paused" | "abandoned";
  progress_percentage: number;
  trajectory_status: "on_track" | "ahead" | "behind" | "at_risk";
  estimated_success_probability: number | null;
  risk_factors: string[];
  recommendations: string[];
  started_at: string;
  target_completion: string | null;
  actual_completion: string | null;
  generated_by_model: string | null;
}

export interface StretchAssignment {
  task_id: string;
  task_title: string;
  source: string;
  skill_growth: string[];
  alignment_score: number;
  challenge_level: string;
}

export interface TeamSkillGapDetail {
  skill: string;
  current_coverage: number;
  average_proficiency: number;
  gap_severity: "critical" | "moderate" | "low";
  developers_with_skill: string[];
}

export interface BusFactorRisk {
  skill_or_area: string;
  risk_level: "critical" | "high" | "medium";
  single_developer: string | null;
  developer_name: string | null;
  impact_description: string;
  mitigation_suggestion: string;
}

export interface TeamGapAnalysis {
  team_id: string | null;
  organization_id: string;
  total_developers: number;
  skill_gaps: TeamSkillGapDetail[];
  bus_factor_risks: BusFactorRisk[];
  critical_missing_skills: string[];
  analysis_date: string;
}

export interface GeneratedJD {
  role_title: string;
  level: string;
  summary: string;
  must_have_skills: { skill: string; level: number; reasoning: string | null }[];
  nice_to_have_skills: { skill: string; level: number; reasoning: string | null }[];
  responsibilities: string[];
  qualifications: string[];
  cultural_indicators: string[];
  full_text: string;
}

export interface InterviewQuestion {
  question: string;
  skill_assessed: string;
  difficulty: string;
  evaluation_criteria: string[];
  red_flags: string[];
  bonus_indicators: string[];
}

export interface InterviewRubric {
  role_title: string;
  technical_questions: InterviewQuestion[];
  behavioral_questions: InterviewQuestion[];
  system_design_prompt: string | null;
  culture_fit_criteria: string[];
}

export interface HiringRequirement {
  id: string;
  organization_id: string;
  team_id: string | null;
  target_role_id: string | null;
  role_title: string;
  priority: "critical" | "high" | "medium" | "low";
  timeline: string | null;
  must_have_skills: { skill: string; level: number; reasoning: string }[];
  nice_to_have_skills: { skill: string; level: number; reasoning: string }[];
  soft_skill_requirements: Record<string, number>;
  gap_analysis: Record<string, unknown>;
  roadmap_items: string[];
  job_description: string | null;
  interview_rubric: Record<string, unknown>;
  status: "draft" | "active" | "filled" | "cancelled";
}

export interface CandidateScorecard {
  requirement_id: string;
  role_title: string;
  candidate_name: string | null;
  overall_score: number;
  must_have_met: number;
  must_have_total: number;
  nice_to_have_met: number;
  nice_to_have_total: number;
  skill_assessments: {
    skill: string;
    candidate_level: number;
    required_level: number;
    meets_requirement: boolean;
    gap: number;
  }[];
  strengths: string[];
  concerns: string[];
  recommendation: "strong_yes" | "yes" | "maybe" | "no";
}

// Career API
export const careerApi = {
  listRoles: async (organizationId?: string): Promise<CareerRole[]> => {
    const params = organizationId ? { organization_id: organizationId } : {};
    const response = await api.get("/career/roles", { params });
    return response.data;
  },

  getRoleRequirements: async (roleId: string) => {
    const response = await api.get(`/career/roles/${roleId}/requirements`);
    return response.data;
  },

  suggestNextRoles: async (developerId: string, organizationId?: string): Promise<RoleSuggestion[]> => {
    const params = organizationId ? { organization_id: organizationId } : {};
    const response = await api.get(`/career/developers/${developerId}/next-roles`, { params });
    return response.data;
  },

  getPromotionReadiness: async (developerId: string, roleId: string): Promise<PromotionReadiness> => {
    const response = await api.get(`/career/developers/${developerId}/readiness/${roleId}`);
    return response.data;
  },

  compareToRole: async (developerId: string, roleId: string): Promise<RoleGapAnalysis> => {
    const response = await api.get(`/career/developers/${developerId}/gap/${roleId}`);
    return response.data;
  },
};

// Learning API
export const learningApi = {
  listPaths: async (developerId: string): Promise<LearningPath[]> => {
    const response = await api.get("/learning/paths", { params: { developer_id: developerId } });
    return response.data;
  },

  getPath: async (pathId: string): Promise<LearningPath> => {
    const response = await api.get(`/learning/paths/${pathId}`);
    return response.data;
  },

  generatePath: async (developerId: string, targetRoleId: string, timelineMonths?: number, includeExternal?: boolean): Promise<LearningPath> => {
    const response = await api.post("/learning/paths", {
      target_role_id: targetRoleId,
      timeline_months: timelineMonths || 12,
      include_external_resources: includeExternal || false,
    }, { params: { developer_id: developerId } });
    return response.data;
  },

  regeneratePath: async (pathId: string): Promise<LearningPath> => {
    const response = await api.post(`/learning/paths/${pathId}/regenerate`);
    return response.data;
  },

  getProgress: async (pathId: string) => {
    const response = await api.get(`/learning/paths/${pathId}/progress`);
    return response.data;
  },

  getMilestones: async (pathId: string): Promise<LearningMilestone[]> => {
    const response = await api.get(`/learning/paths/${pathId}/milestones`);
    return response.data;
  },

  getActivities: async (pathId: string): Promise<LearningActivity[]> => {
    const response = await api.get(`/learning/paths/${pathId}/activities`);
    return response.data;
  },

  getStretchAssignments: async (developerId: string): Promise<StretchAssignment[]> => {
    const response = await api.get(`/learning/developers/${developerId}/stretch-tasks`);
    return response.data;
  },

  pausePath: async (pathId: string) => {
    const response = await api.post(`/learning/paths/${pathId}/pause`);
    return response.data;
  },

  resumePath: async (pathId: string) => {
    const response = await api.post(`/learning/paths/${pathId}/resume`);
    return response.data;
  },
};

// Hiring API
export const hiringApi = {
  analyzeTeamGaps: async (developerIds: string[], targetSkills?: string[]): Promise<TeamGapAnalysis> => {
    const response = await api.post("/hiring/team-gaps", {
      developer_ids: developerIds,
      target_skills: targetSkills,
    });
    return response.data;
  },

  getBusFactorRisks: async (developerIds: string[]): Promise<BusFactorRisk[]> => {
    const response = await api.post("/hiring/bus-factor", {
      developer_ids: developerIds,
    });
    return response.data;
  },

  listRequirements: async (organizationId: string, status?: string): Promise<HiringRequirement[]> => {
    const params: Record<string, string> = { organization_id: organizationId };
    if (status) params.status_filter = status;
    const response = await api.get("/hiring/requirements", { params });
    return response.data;
  },

  getRequirement: async (requirementId: string): Promise<HiringRequirement> => {
    const response = await api.get(`/hiring/requirements/${requirementId}`);
    return response.data;
  },

  createRequirement: async (data: {
    organization_id: string;
    role_title: string;
    team_id?: string;
    priority?: string;
    timeline?: string;
  }): Promise<HiringRequirement> => {
    const response = await api.post("/hiring/requirements", data);
    return response.data;
  },

  generateJD: async (requirementId: string): Promise<GeneratedJD> => {
    const response = await api.post(`/hiring/requirements/${requirementId}/jd`);
    return response.data;
  },

  generateRubric: async (requirementId: string): Promise<InterviewRubric> => {
    const response = await api.post(`/hiring/requirements/${requirementId}/rubric`);
    return response.data;
  },

  createScorecard: async (requirementId: string, candidateSkills: Record<string, number>, candidateName?: string): Promise<CandidateScorecard> => {
    const response = await api.post(`/hiring/requirements/${requirementId}/scorecard`, {
      requirement_id: requirementId,
      candidate_skills: candidateSkills,
      candidate_name: candidateName,
    });
    return response.data;
  },

  updateStatus: async (requirementId: string, status: string) => {
    const response = await api.patch(`/hiring/requirements/${requirementId}/status`, null, {
      params: { new_status: status },
    });
    return response.data;
  },
};

// ============================================================================
// Phase 4: Advanced Analytics Types
// ============================================================================

export interface DeveloperSkillData {
  developer_id: string;
  developer_name: string;
  skills: { skill: string; value: number }[];
}

export interface SkillHeatmapData {
  skills: string[];
  developer_skills: DeveloperSkillData[];
  generated_at: string;
}

export interface DeveloperTrend {
  developer_id: string;
  commits: number[];
  prs_merged: number[];
  reviews: number[];
}

export interface ProductivityTrends {
  periods: string[];
  developer_trends: DeveloperTrend[];
  overall_trend: string;
}

export interface WorkloadItem {
  developer_id: string;
  developer_name: string;
  workload: number;
  percentage: number;
}

export interface WorkloadDistribution {
  workloads: WorkloadItem[];
  total_workload: number;
  average_workload: number;
  imbalance_score: number;
}

export interface CollaborationNode {
  id: string;
  name: string;
  activity_level: number;
}

export interface CollaborationEdge {
  source: string;
  target: string;
  weight: number;
  interaction_type: string;
}

export interface CollaborationGraph {
  nodes: CollaborationNode[];
  edges: CollaborationEdge[];
  density: number;
}

export interface RiskFactor {
  factor: string;
  weight: number;
  evidence: string;
  trend?: string;
}

export interface AttritionRiskAnalysis {
  developer_id: string;
  risk_score: number;
  confidence: number;
  risk_level: "low" | "moderate" | "high" | "critical";
  factors: RiskFactor[];
  positive_signals: string[];
  recommendations: string[];
  suggested_actions: string[];
  analyzed_at: string;
}

export interface BurnoutRiskAssessment {
  developer_id: string;
  risk_score: number;
  confidence: number;
  risk_level: "low" | "moderate" | "high" | "critical";
  indicators: string[];
  factors: RiskFactor[];
  recommendations: string[];
  analyzed_at: string;
}

export interface SkillGrowthPrediction {
  skill: string;
  current: number;
  predicted: number;
  timeline: string;
}

export interface CareerReadiness {
  next_level: string;
  readiness_score: number;
  blockers: string[];
}

export interface PerformanceTrajectory {
  developer_id: string;
  trajectory: "accelerating" | "steady" | "plateauing" | "declining";
  confidence: number;
  predicted_growth: SkillGrowthPrediction[];
  challenges: string[];
  opportunities: string[];
  career_readiness: CareerReadiness;
  recommendations: string[];
  analyzed_at: string;
}

export interface TeamRisk {
  risk: string;
  severity: "low" | "moderate" | "high" | "critical";
  mitigation: string;
}

export interface CapacityAssessment {
  current_utilization: number;
  sustainable_velocity: boolean;
  bottlenecks: string[];
}

export interface TeamHealthAnalysis {
  team_id: string | null;
  health_score: number;
  health_grade: "A" | "B" | "C" | "D" | "F";
  strengths: string[];
  risks: TeamRisk[];
  capacity_assessment: CapacityAssessment;
  recommendations: string[];
  suggested_hires: string[];
  analyzed_at: string;
}

// Analytics API
export const analyticsApi = {
  getSkillHeatmap: async (developerIds: string[], skills?: string[], maxSkills?: number): Promise<SkillHeatmapData> => {
    const response = await api.post("/analytics/heatmap/skills", {
      developer_ids: developerIds,
      skills,
      max_skills: maxSkills || 15,
    });
    return response.data;
  },

  getProductivityTrends: async (
    developerIds: string[],
    dateRange?: { start_date: string; end_date: string },
    groupBy?: string
  ): Promise<ProductivityTrends> => {
    const response = await api.post("/analytics/productivity", {
      developer_ids: developerIds,
      date_range: dateRange,
      group_by: groupBy || "week",
    });
    return response.data;
  },

  getWorkloadDistribution: async (developerIds: string[], days?: number): Promise<WorkloadDistribution> => {
    const response = await api.post("/analytics/workload", {
      developer_ids: developerIds,
      days: days || 30,
    });
    return response.data;
  },

  getCollaborationNetwork: async (developerIds: string[], days?: number): Promise<CollaborationGraph> => {
    const response = await api.post("/analytics/collaboration", {
      developer_ids: developerIds,
      days: days || 90,
    });
    return response.data;
  },
};

// Predictions API
export const predictionsApi = {
  getAttritionRisk: async (developerId: string, days?: number): Promise<AttritionRiskAnalysis> => {
    const response = await api.get(`/predictions/attrition/${developerId}`, {
      params: { days: days || 90 },
    });
    return response.data;
  },

  getBurnoutRisk: async (developerId: string, days?: number): Promise<BurnoutRiskAssessment> => {
    const response = await api.get(`/predictions/burnout/${developerId}`, {
      params: { days: days || 30 },
    });
    return response.data;
  },

  getPerformanceTrajectory: async (developerId: string, months?: number): Promise<PerformanceTrajectory> => {
    const response = await api.get(`/predictions/trajectory/${developerId}`, {
      params: { months: months || 6 },
    });
    return response.data;
  },

  getTeamHealth: async (developerIds: string[], teamId?: string): Promise<TeamHealthAnalysis> => {
    const response = await api.post("/predictions/team-health", {
      developer_ids: developerIds,
      team_id: teamId,
    });
    return response.data;
  },

  refreshDeveloperInsights: async (developerId: string) => {
    const response = await api.post(`/predictions/insights/refresh/${developerId}`);
    return response.data;
  },
};

// Report Types
export interface WidgetConfig {
  id: string;
  type: string;
  metric: string;
  title: string;
  config?: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
}

export interface ReportFilters {
  date_range?: { days?: number; start_date?: string; end_date?: string };
  developer_ids?: string[];
  team_ids?: string[];
}

export interface CustomReport {
  id: string;
  creator_id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  widgets: WidgetConfig[];
  filters: ReportFilters;
  layout: Record<string, unknown>;
  is_template: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  preview_widgets: WidgetConfig[];
  widget_count: number;
}

export interface ScheduledReport {
  id: string;
  report_id: string;
  schedule: "daily" | "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  time_utc: string;
  recipients: string[];
  delivery_method: "email" | "slack" | "both";
  export_format: "pdf" | "csv" | "json" | "xlsx";
  is_active: boolean;
  last_sent_at: string | null;
  next_run_at: string;
}

// Reports API
export const reportsApi = {
  listReports: async (includePublic = true, includeTemplates = false): Promise<CustomReport[]> => {
    const response = await api.get("/reports", {
      params: { include_public: includePublic, include_templates: includeTemplates },
    });
    return response.data;
  },

  getReport: async (reportId: string): Promise<CustomReport> => {
    const response = await api.get(`/reports/${reportId}`);
    return response.data;
  },

  createReport: async (data: {
    name: string;
    description?: string;
    widgets: WidgetConfig[];
    filters?: ReportFilters;
    layout?: Record<string, unknown>;
    is_public?: boolean;
  }): Promise<CustomReport> => {
    const response = await api.post("/reports", data);
    return response.data;
  },

  updateReport: async (reportId: string, data: Partial<{
    name: string;
    description: string;
    widgets: WidgetConfig[];
    filters: ReportFilters;
    layout: Record<string, unknown>;
    is_public: boolean;
  }>): Promise<CustomReport> => {
    const response = await api.put(`/reports/${reportId}`, data);
    return response.data;
  },

  deleteReport: async (reportId: string): Promise<void> => {
    await api.delete(`/reports/${reportId}`);
  },

  cloneReport: async (reportId: string, newName: string): Promise<CustomReport> => {
    const response = await api.post(`/reports/${reportId}/clone`, null, {
      params: { new_name: newName },
    });
    return response.data;
  },

  getReportData: async (reportId: string, developerIds?: string[]): Promise<Record<string, unknown>> => {
    const response = await api.post(`/reports/${reportId}/data`, {
      developer_ids: developerIds,
    });
    return response.data;
  },

  listTemplates: async (category?: string): Promise<ReportTemplate[]> => {
    const response = await api.get("/reports/templates/list", {
      params: category ? { category } : {},
    });
    return response.data;
  },

  createFromTemplate: async (templateId: string, name?: string): Promise<CustomReport> => {
    const response = await api.post(`/reports/templates/${templateId}/create`, null, {
      params: name ? { name } : {},
    });
    return response.data;
  },

  listSchedules: async (reportId?: string): Promise<ScheduledReport[]> => {
    const response = await api.get("/reports/schedules/list", {
      params: reportId ? { report_id: reportId } : {},
    });
    return response.data;
  },

  createSchedule: async (reportId: string, data: {
    schedule: "daily" | "weekly" | "monthly";
    time_utc: string;
    recipients: string[];
    delivery_method: "email" | "slack" | "both";
    export_format: "pdf" | "csv" | "json" | "xlsx";
    day_of_week?: number;
    day_of_month?: number;
  }): Promise<ScheduledReport> => {
    const response = await api.post(`/reports/${reportId}/schedules`, data);
    return response.data;
  },

  deleteSchedule: async (scheduleId: string): Promise<void> => {
    await api.delete(`/reports/schedules/${scheduleId}`);
  },
};

// Exports API
export const exportsApi = {
  createExport: async (data: {
    export_type: "report" | "developer_profile" | "team_analytics";
    format: "pdf" | "csv" | "json" | "xlsx";
    config?: Record<string, unknown>;
  }) => {
    const response = await api.post("/exports", data);
    return response.data;
  },

  getExportStatus: async (jobId: string) => {
    const response = await api.get(`/exports/${jobId}`);
    return response.data;
  },

  listExports: async (limit = 20) => {
    const response = await api.get("/exports", { params: { limit } });
    return response.data;
  },

  getDownloadUrl: (jobId: string) => `${api.defaults.baseURL}/exports/${jobId}/download`,
};

// ============================================================================
// Repository Management Types & API
// ============================================================================

export interface Organization {
  id: string;
  github_id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  is_enabled: boolean;
  repository_count: number;
  enabled_repository_count: number;
}

export interface Repository {
  id: string;
  github_id: number;
  full_name: string;
  name: string;
  owner_login: string;
  owner_type: string;
  description: string | null;
  is_private: boolean;
  language: string | null;
  organization_id: string | null;
  is_enabled: boolean;
  sync_status: "pending" | "syncing" | "synced" | "failed";
  last_sync_at: string | null;
  commits_synced: number;
  prs_synced: number;
  reviews_synced: number;
  webhook_status: "none" | "pending" | "active" | "failed";
}

export interface RepositoryStatus {
  repository_id: string;
  is_enabled: boolean;
  sync_status: string;
  last_sync_at: string | null;
  sync_error: string | null;
  commits_synced: number;
  prs_synced: number;
  reviews_synced: number;
  webhook_id: number | null;
  webhook_status: string;
}

export interface OnboardingStatus {
  completed: boolean;
}

export interface Installation {
  installation_id: number;
  account_login: string;
  account_type: string;
  repository_selection: string;
  is_active: boolean;
}

export interface InstallationStatus {
  has_installation: boolean;
  installations: Installation[];
  install_url: string | null;
}

export const repositoriesApi = {
  // Organizations
  listOrganizations: async (): Promise<Organization[]> => {
    const response = await api.get("/repositories/organizations");
    return response.data;
  },

  enableOrganization: async (orgId: string): Promise<{ message: string; count: number }> => {
    const response = await api.post(`/repositories/organizations/${orgId}/enable`);
    return response.data;
  },

  disableOrganization: async (orgId: string): Promise<{ message: string; count: number }> => {
    const response = await api.post(`/repositories/organizations/${orgId}/disable`);
    return response.data;
  },

  // Repositories
  listRepositories: async (params?: {
    organization_id?: string;
    enabled_only?: boolean;
  }): Promise<Repository[]> => {
    const response = await api.get("/repositories", { params });
    return response.data;
  },

  enableRepository: async (repoId: string): Promise<{
    id: string;
    repository_id: string;
    is_enabled: boolean;
    sync_status: string;
  }> => {
    const response = await api.post(`/repositories/${repoId}/enable`);
    return response.data;
  },

  disableRepository: async (repoId: string): Promise<{ message: string }> => {
    const response = await api.post(`/repositories/${repoId}/disable`);
    return response.data;
  },

  getRepositoryStatus: async (repoId: string): Promise<RepositoryStatus> => {
    const response = await api.get(`/repositories/${repoId}/status`);
    return response.data;
  },

  // Sync
  refreshAvailableRepos: async (): Promise<{
    organizations: { created: number; updated: number };
    repositories: { created: number; updated: number };
  }> => {
    const response = await api.post("/repositories/sync/refresh");
    return response.data;
  },

  startSync: async (repoId: string): Promise<{ job_id: string; message: string }> => {
    const response = await api.post(`/repositories/${repoId}/sync/start`);
    return response.data;
  },

  // Webhooks
  registerWebhook: async (repoId: string): Promise<{ webhook_id: number; status: string }> => {
    const response = await api.post(`/repositories/${repoId}/webhook/register`);
    return response.data;
  },

  unregisterWebhook: async (repoId: string): Promise<{ message: string }> => {
    const response = await api.post(`/repositories/${repoId}/webhook/unregister`);
    return response.data;
  },

  // Onboarding
  getOnboardingStatus: async (): Promise<OnboardingStatus> => {
    const response = await api.get("/repositories/onboarding/status");
    return response.data;
  },

  completeOnboarding: async (): Promise<{ message: string }> => {
    const response = await api.post("/repositories/onboarding/complete");
    return response.data;
  },

  // Installation (GitHub App)
  getInstallationStatus: async (): Promise<InstallationStatus> => {
    const response = await api.get("/repositories/installation/status");
    return response.data;
  },

  syncInstallations: async (): Promise<{ message: string; count: number }> => {
    const response = await api.post("/repositories/installation/sync");
    return response.data;
  },
};

// ============================================================================
// Organization & Team Management Types & API
// ============================================================================

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  type: "internal" | "github_linked";
  description: string | null;
  avatar_url: string | null;
  github_org_id: string | null;
  owner_id: string;
  member_count: number;
  team_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceListItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  avatar_url: string | null;
  owner_id: string;
  member_count: number;
  team_count: number;
  is_active: boolean;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  developer_id: string;
  developer_name: string | null;
  developer_email: string | null;
  developer_avatar_url: string | null;
  role: "owner" | "admin" | "member" | "viewer";
  status: "pending" | "active" | "suspended" | "removed";
  is_billable: boolean;
  invited_at: string | null;
  joined_at: string | null;
  created_at: string;
}

export interface WorkspaceBillingStatus {
  workspace_id: string;
  has_subscription: boolean;
  current_plan: string | null;
  status: string | null;
  total_seats: number;
  used_seats: number;
  available_seats: number;
  price_per_seat_cents: number;
  next_billing_date: string | null;
}

export interface Team {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  type: "manual" | "repo_based";
  source_repository_ids: string[] | null;
  auto_sync_enabled: boolean;
  member_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamListItem {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  type: string;
  member_count: number;
  is_active: boolean;
}

export interface TeamMember {
  id: string;
  team_id: string;
  developer_id: string;
  developer_name: string | null;
  developer_email: string | null;
  developer_avatar_url: string | null;
  role: "lead" | "member";
  source: "manual" | "repo_contributor";
  joined_at: string;
  created_at: string;
}

export interface TeamSyncResult {
  team_id: string;
  added_members: number;
  removed_members: number;
  unchanged_members: number;
}

export interface TeamProfile {
  team_id: string;
  team_name: string;
  member_count: number;
  languages: { name: string; average_proficiency: number; developer_count: number; total_commits: number }[];
  frameworks: { name: string; category: string; developer_count: number }[];
  domains: { name: string; average_confidence: number; developer_count: number }[];
  tools: string[];
  velocity: { merged_prs: number; total_additions: number; total_deletions: number; total_commits: number; period_days: number } | null;
  commit_distribution: Record<string, { commits: number; percentage: number }> | null;
}

export interface TeamBusFactor {
  team_id: string;
  bus_factor_skills: Record<string, number>;
  critical_skills: string[];
}

export interface TeamSkillCoverage {
  team_id: string;
  coverage_percentage: number;
  covered_skills: string[];
  missing_skills: string[];
}

// Workspace API
export const workspaceApi = {
  list: async (): Promise<WorkspaceListItem[]> => {
    const response = await api.get("/workspaces");
    return response.data;
  },

  get: async (workspaceId: string): Promise<Workspace> => {
    const response = await api.get(`/workspaces/${workspaceId}`);
    return response.data;
  },

  create: async (data: {
    name: string;
    type?: string;
    github_org_id?: string;
    description?: string;
  }): Promise<Workspace> => {
    const response = await api.post("/workspaces", data);
    return response.data;
  },

  update: async (workspaceId: string, data: {
    name?: string;
    description?: string;
    avatar_url?: string;
    settings?: Record<string, unknown>;
  }): Promise<Workspace> => {
    const response = await api.patch(`/workspaces/${workspaceId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}`);
  },

  // Members
  getMembers: async (workspaceId: string, includePending = false): Promise<WorkspaceMember[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/members`, {
      params: { include_pending: includePending },
    });
    return response.data;
  },

  addMember: async (workspaceId: string, developerId: string, role = "member"): Promise<WorkspaceMember> => {
    const response = await api.post(`/workspaces/${workspaceId}/members`, {
      developer_id: developerId,
      role,
    });
    return response.data;
  },

  inviteMember: async (workspaceId: string, email: string, role = "member"): Promise<WorkspaceMember> => {
    const response = await api.post(`/workspaces/${workspaceId}/members/invite`, {
      email,
      role,
    });
    return response.data;
  },

  updateMemberRole: async (workspaceId: string, developerId: string, role: string): Promise<WorkspaceMember> => {
    const response = await api.patch(`/workspaces/${workspaceId}/members/${developerId}`, { role });
    return response.data;
  },

  removeMember: async (workspaceId: string, developerId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/members/${developerId}`);
  },

  // GitHub Integration
  linkGitHub: async (workspaceId: string, githubOrgId: string): Promise<Workspace> => {
    const response = await api.post(`/workspaces/${workspaceId}/link-github`, {
      github_org_id: githubOrgId,
    });
    return response.data;
  },

  syncGitHub: async (workspaceId: string): Promise<{ message: string }> => {
    const response = await api.post(`/workspaces/${workspaceId}/sync-github`);
    return response.data;
  },

  // Billing
  getBillingStatus: async (workspaceId: string): Promise<WorkspaceBillingStatus> => {
    const response = await api.get(`/workspaces/${workspaceId}/billing`);
    return response.data;
  },

  getSeatUsage: async (workspaceId: string): Promise<{
    total_members: number;
    billable_seats: number;
    base_seats: number;
    additional_seats: number;
    seats_available: number;
  }> => {
    const response = await api.get(`/workspaces/${workspaceId}/billing/seats`);
    return response.data;
  },
};

// Team API (nested under workspace)
export const teamApi = {
  list: async (workspaceId: string, includeInactive = false): Promise<TeamListItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams`, {
      params: { include_inactive: includeInactive },
    });
    return response.data;
  },

  get: async (workspaceId: string, teamId: string): Promise<Team> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}`);
    return response.data;
  },

  create: async (workspaceId: string, data: {
    name: string;
    description?: string;
    type?: string;
    source_repository_ids?: string[];
  }): Promise<Team> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams`, data);
    return response.data;
  },

  update: async (workspaceId: string, teamId: string, data: {
    name?: string;
    description?: string;
    auto_sync_enabled?: boolean;
    settings?: Record<string, unknown>;
  }): Promise<Team> => {
    const response = await api.patch(`/workspaces/${workspaceId}/teams/${teamId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, teamId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/teams/${teamId}`);
  },

  // Members
  getMembers: async (workspaceId: string, teamId: string): Promise<TeamMember[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/members`);
    return response.data;
  },

  addMember: async (workspaceId: string, teamId: string, developerId: string, role = "member"): Promise<TeamMember> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams/${teamId}/members`, {
      developer_id: developerId,
      role,
    });
    return response.data;
  },

  updateMemberRole: async (workspaceId: string, teamId: string, developerId: string, role: string): Promise<TeamMember> => {
    const response = await api.patch(`/workspaces/${workspaceId}/teams/${teamId}/members/${developerId}`, { role });
    return response.data;
  },

  removeMember: async (workspaceId: string, teamId: string, developerId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/teams/${teamId}/members/${developerId}`);
  },

  // Team Generation
  createFromRepository: async (workspaceId: string, data: {
    repository_id: string;
    team_name?: string;
    include_contributors_since_days?: number;
  }): Promise<Team> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams/from-repository`, data);
    return response.data;
  },

  sync: async (workspaceId: string, teamId: string): Promise<TeamSyncResult> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams/${teamId}/sync`);
    return response.data;
  },

  // Analytics
  getProfile: async (workspaceId: string, teamId: string): Promise<TeamProfile> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/profile`);
    return response.data;
  },

  getVelocity: async (workspaceId: string, teamId: string, periodDays = 30): Promise<{
    merged_prs: number;
    total_additions: number;
    total_deletions: number;
    total_commits: number;
    period_days: number;
  }> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/velocity`, {
      params: { period_days: periodDays },
    });
    return response.data;
  },

  getBusFactor: async (workspaceId: string, teamId: string): Promise<TeamBusFactor> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/bus-factor`);
    return response.data;
  },

  getSkillCoverage: async (workspaceId: string, teamId: string, requiredSkills?: string[]): Promise<TeamSkillCoverage> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/skill-coverage`, {
      params: requiredSkills ? { required_skills: requiredSkills.join(",") } : {},
    });
    return response.data;
  },
};
