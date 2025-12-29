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
      // Clear token and redirect to login
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        window.location.href = "/login";
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
