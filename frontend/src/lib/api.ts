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
  getGitHubLoginUrl: (redirectUrl?: string) => {
    const base = `${API_BASE_URL}/auth/github/login`;
    return redirectUrl ? `${base}?redirect_url=${encodeURIComponent(redirectUrl)}` : base;
  },
  getGoogleLoginUrl: (redirectUrl?: string) => {
    const base = `${API_BASE_URL}/auth/google/login`;
    return redirectUrl ? `${base}?redirect_url=${encodeURIComponent(redirectUrl)}` : base;
  },
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

  getGoogleStatus: async (): Promise<{ is_connected: boolean; google_email: string | null }> => {
    const response = await api.get("/developers/me/google-status");
    return response.data;
  },

  getMyAssignedTasks: async (params?: { status_filter?: string; include_done?: boolean }): Promise<MyAssignedTask[]> => {
    const response = await api.get("/developers/me/assigned-tasks", { params });
    return response.data;
  },
};

// My Assigned Task type
export interface MyAssignedTask {
  id: string;
  sprint_id: string | null;
  sprint_name: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  story_points: number | null;
  labels: string[];
  created_at: string;
  updated_at: string;
}

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

// Learning Activity types
export type ActivityType = "course" | "task" | "reading" | "project" | "pairing" | "video";
export type ActivitySource = "youtube" | "coursera" | "udemy" | "pluralsight" | "internal" | "manual";
export type ActivityStatus = "not_started" | "in_progress" | "completed" | "skipped";

export interface TimeSession {
  id: string;
  activity_log_id: string;
  developer_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  notes: string | null;
  created_at: string;
}

export interface LearningActivityLog {
  id: string;
  developer_id: string;
  learning_path_id: string | null;
  milestone_id: string | null;
  activity_type: ActivityType;
  title: string;
  description: string | null;
  source: ActivitySource;
  external_id: string | null;
  external_url: string | null;
  thumbnail_url: string | null;
  status: ActivityStatus;
  progress_percentage: number;
  estimated_duration_minutes: number | null;
  actual_time_spent_minutes: number;
  started_at: string | null;
  completed_at: string | null;
  points_earned: number;
  notes: string | null;
  rating: number | null;
  tags: string[];
  skill_tags: string[];
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LearningActivityLogWithSessions extends LearningActivityLog {
  time_sessions: TimeSession[];
}

export interface ActivityStats {
  total_activities: number;
  completed_activities: number;
  in_progress_activities: number;
  total_time_spent_minutes: number;
  total_points_earned: number;
  average_rating: number | null;
  activities_by_type: Record<string, number>;
  activities_by_source: Record<string, number>;
  completion_rate: number;
}

export interface DailyActivitySummary {
  date: string;
  activities_count: number;
  time_spent_minutes: number;
  points_earned: number;
}

export interface ActivityHistory {
  activities: LearningActivityLog[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface CreateActivityData {
  activity_type: ActivityType;
  title: string;
  description?: string;
  source: ActivitySource;
  external_id?: string;
  external_url?: string;
  thumbnail_url?: string;
  estimated_duration_minutes?: number;
  learning_path_id?: string;
  milestone_id?: string;
  tags?: string[];
  skill_tags?: string[];
  extra_data?: Record<string, unknown>;
}

export interface UpdateActivityData {
  title?: string;
  description?: string;
  status?: ActivityStatus;
  progress_percentage?: number;
  notes?: string;
  rating?: number;
  tags?: string[];
  skill_tags?: string[];
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

export type HiringCandidateStage = "applied" | "screening" | "assessment" | "interview" | "offer" | "hired" | "rejected";

export interface HiringCandidate {
  id: string;
  workspace_id: string;
  requirement_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  stage: HiringCandidateStage;
  source: string | null;
  score: number | null;
  tags: string[];
  notes: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  current_company: string | null;
  current_role: string | null;
  experience_years: number | null;
  location: string | null;
  applied_at: string;
  created_at: string;
  updated_at: string;
}

export interface HiringCandidateCreate {
  name: string;
  email: string;
  phone?: string;
  role: string;
  stage?: HiringCandidateStage;
  source?: string;
  score?: number;
  tags?: string[];
  notes?: string;
  resume_url?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  current_company?: string;
  current_role?: string;
  experience_years?: number;
  location?: string;
  requirement_id?: string;
  applied_at?: string;
}

export interface HiringCandidateUpdate {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  stage?: HiringCandidateStage;
  source?: string;
  score?: number;
  tags?: string[];
  notes?: string;
  resume_url?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  current_company?: string;
  current_role?: string;
  experience_years?: number;
  location?: string;
  requirement_id?: string;
}

export interface PipelineMetrics {
  total: number;
  by_stage: Record<string, number>;
  conversion_rates: Record<string, number>;
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

  // Team Learning
  getTeamOverview: async (teamId: string): Promise<TeamLearningOverview> => {
    const response = await api.get(`/learning/teams/${teamId}/overview`);
    return response.data;
  },

  getTeamRecommendations: async (teamId: string): Promise<TeamLearningRecommendations> => {
    const response = await api.get(`/learning/teams/${teamId}/recommendations`);
    return response.data;
  },
};

// Team Learning Types
export interface TeamMemberLearningStatus {
  developer_id: string;
  developer_name: string | null;
  developer_avatar_url: string | null;
  has_active_path: boolean;
  active_path_id: string | null;
  active_path_target_role: string | null;
  progress_percentage: number;
  trajectory_status: string | null;
  skills_in_progress: string[];
}

export interface TeamLearningOverview {
  team_id: string;
  team_name: string;
  total_members: number;
  members_with_paths: number;
  average_progress: number;
  members: TeamMemberLearningStatus[];
}

export interface TeamSkillRecommendation {
  skill: string;
  priority: string;
  coverage_percentage: number;
  average_proficiency: number;
  members_lacking: number;
  reason: string;
}

export interface TeamLearningRecommendations {
  team_id: string;
  team_name: string;
  recommended_skills: TeamSkillRecommendation[];
}

// Learning Activity API
// External Course types
export interface ExternalCourse {
  provider: string;
  external_id: string;
  title: string;
  description: string | null;
  url: string;
  thumbnail_url: string | null;
  instructor: string | null;
  duration_minutes: number | null;
  rating: number | null;
  review_count: number | null;
  price: number | null;
  is_free: boolean;
  skill_tags: string[];
  difficulty: string | null;
}

export interface CourseSearchResponse {
  courses: ExternalCourse[];
  total_results: number;
  providers_searched: string[];
}

export interface CourseImportRequest {
  course: ExternalCourse;
  learning_path_id?: string;
  milestone_id?: string;
}

// Course API
export const courseApi = {
  searchCourses: async (
    skill: string,
    providers: string = "youtube",
    maxResults: number = 10
  ): Promise<CourseSearchResponse> => {
    const response = await api.get("/learning/courses/search", {
      params: { skill, providers, max_results: maxResults },
    });
    return response.data;
  },

  importCourse: async (
    developerId: string,
    course: ExternalCourse,
    learningPathId?: string,
    milestoneId?: string
  ): Promise<{ message: string; activity_id: string; title: string }> => {
    const response = await api.post(
      "/learning/courses/import",
      {
        course,
        learning_path_id: learningPathId,
        milestone_id: milestoneId,
      },
      { params: { developer_id: developerId } }
    );
    return response.data;
  },

  getRecommendedCourses: async (
    pathId: string
  ): Promise<{ path_id: string; recommendations: Record<string, ExternalCourse[]> }> => {
    const response = await api.get("/learning/courses/recommended", {
      params: { path_id: pathId },
    });
    return response.data;
  },
};

export const learningActivityApi = {
  // Activity CRUD
  createActivity: async (developerId: string, data: CreateActivityData): Promise<LearningActivityLog> => {
    const response = await api.post("/learning/activities", data, {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  listActivities: async (
    developerId: string,
    options?: {
      activity_type?: ActivityType;
      source?: ActivitySource;
      status?: ActivityStatus;
      learning_path_id?: string;
      milestone_id?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<ActivityHistory> => {
    const response = await api.get("/learning/activities", {
      params: { developer_id: developerId, ...options },
    });
    return response.data;
  },

  getActivity: async (activityId: string, developerId: string): Promise<LearningActivityLogWithSessions> => {
    const response = await api.get(`/learning/activities/${activityId}`, {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  updateActivity: async (
    activityId: string,
    developerId: string,
    data: UpdateActivityData
  ): Promise<LearningActivityLog> => {
    const response = await api.patch(`/learning/activities/${activityId}`, data, {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  deleteActivity: async (activityId: string, developerId: string): Promise<void> => {
    await api.delete(`/learning/activities/${activityId}`, {
      params: { developer_id: developerId },
    });
  },

  // Activity actions
  startActivity: async (activityId: string, developerId: string): Promise<LearningActivityLog> => {
    const response = await api.post(`/learning/activities/${activityId}/start`, null, {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  updateProgress: async (
    activityId: string,
    developerId: string,
    progress_percentage: number,
    notes?: string
  ): Promise<LearningActivityLog> => {
    const response = await api.post(
      `/learning/activities/${activityId}/progress`,
      { progress_percentage, notes },
      { params: { developer_id: developerId } }
    );
    return response.data;
  },

  completeActivity: async (
    activityId: string,
    developerId: string,
    data?: { rating?: number; notes?: string }
  ): Promise<LearningActivityLog> => {
    const response = await api.post(`/learning/activities/${activityId}/complete`, data || {}, {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  // Time sessions
  startTimeSession: async (
    activityId: string,
    developerId: string,
    notes?: string
  ): Promise<TimeSession> => {
    const response = await api.post(
      `/learning/activities/${activityId}/sessions/start`,
      { notes },
      { params: { developer_id: developerId } }
    );
    return response.data;
  },

  endTimeSession: async (
    activityId: string,
    developerId: string,
    notes?: string
  ): Promise<TimeSession> => {
    const response = await api.post(
      `/learning/activities/${activityId}/sessions/end`,
      { notes },
      { params: { developer_id: developerId } }
    );
    return response.data;
  },

  // Statistics
  getStats: async (developerId: string): Promise<ActivityStats> => {
    const response = await api.get("/learning/activities/stats", {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  getDailySummaries: async (developerId: string, days?: number): Promise<DailyActivitySummary[]> => {
    const response = await api.get("/learning/activities/daily-summaries", {
      params: { developer_id: developerId, days: days || 30 },
    });
    return response.data;
  },

  // Path/milestone specific
  getActivitiesForPath: async (pathId: string, developerId: string): Promise<LearningActivityLog[]> => {
    const response = await api.get(`/learning/activities/by-path/${pathId}`, {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  getActivitiesForMilestone: async (milestoneId: string, developerId: string): Promise<LearningActivityLog[]> => {
    const response = await api.get(`/learning/activities/by-milestone/${milestoneId}`, {
      params: { developer_id: developerId },
    });
    return response.data;
  },
};

// Hiring API
export const hiringApi = {
  analyzeTeamGaps: async (
    developerIds?: string[],
    targetSkills?: string[],
    teamId?: string
  ): Promise<TeamGapAnalysis> => {
    const response = await api.post("/hiring/team-gaps", {
      developer_ids: developerIds,
      target_skills: targetSkills,
      team_id: teamId,
    });
    return response.data;
  },

  getBusFactorRisks: async (developerIds?: string[], teamId?: string): Promise<BusFactorRisk[]> => {
    const response = await api.post("/hiring/bus-factor", {
      developer_ids: developerIds,
      team_id: teamId,
    });
    return response.data;
  },

  listRequirements: async (organizationId: string, status?: string, teamId?: string): Promise<HiringRequirement[]> => {
    const params: Record<string, string> = { organization_id: organizationId };
    if (status) params.status_filter = status;
    if (teamId) params.team_id = teamId;
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

  // Hiring Candidates Pipeline
  listCandidates: async (
    workspaceId: string,
    filters?: { stage?: string; source?: string; role?: string; search?: string }
  ): Promise<HiringCandidate[]> => {
    const response = await api.get("/hiring/candidates", {
      params: { workspace_id: workspaceId, ...filters },
    });
    return response.data;
  },

  createCandidate: async (workspaceId: string, data: HiringCandidateCreate): Promise<HiringCandidate> => {
    const response = await api.post("/hiring/candidates", data, {
      params: { workspace_id: workspaceId },
    });
    return response.data;
  },

  getCandidate: async (candidateId: string): Promise<HiringCandidate> => {
    const response = await api.get(`/hiring/candidates/${candidateId}`);
    return response.data;
  },

  updateCandidate: async (candidateId: string, data: HiringCandidateUpdate): Promise<HiringCandidate> => {
    const response = await api.patch(`/hiring/candidates/${candidateId}`, data);
    return response.data;
  },

  updateCandidateStage: async (candidateId: string, stage: HiringCandidateStage): Promise<HiringCandidate> => {
    const response = await api.patch(`/hiring/candidates/${candidateId}/stage`, { stage });
    return response.data;
  },

  deleteCandidate: async (candidateId: string): Promise<void> => {
    await api.delete(`/hiring/candidates/${candidateId}`);
  },

  getPipelineMetrics: async (workspaceId: string): Promise<PipelineMetrics> => {
    const response = await api.get("/hiring/candidates/pipeline-metrics", {
      params: { workspace_id: workspaceId },
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

  // File Browsing
  getContents: async (
    repoId: string,
    options?: { path?: string; ref?: string }
  ): Promise<Array<{ name: string; path: string; type: "file" | "dir"; size: number; sha: string }>> => {
    const response = await api.get(`/repositories/${repoId}/contents`, { params: options });
    return response.data;
  },

  getFileContent: async (
    repoId: string,
    path: string,
    ref?: string
  ): Promise<{ name: string; path: string; sha: string; size: number; content: string; encoding: string }> => {
    const response = await api.get(`/repositories/${repoId}/file`, { params: { path, ref } });
    return response.data;
  },

  getBranches: async (
    repoId: string
  ): Promise<Array<{ name: string; protected: boolean; sha: string }>> => {
    const response = await api.get(`/repositories/${repoId}/branches`);
    return response.data;
  },

  // Auto-sync settings
  getAutoSyncSettings: async (): Promise<{ enabled: boolean; frequency: string }> => {
    const response = await api.get("/repositories/auto-sync/settings");
    return response.data;
  },

  updateAutoSyncSettings: async (
    settings: { enabled: boolean; frequency: string }
  ): Promise<{ enabled: boolean; frequency: string }> => {
    const response = await api.put("/repositories/auto-sync/settings", settings);
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
  app_permissions: Record<string, boolean> | null;
  invited_at: string | null;
  joined_at: string | null;
  created_at: string;
}

export interface WorkspacePendingInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  status: "pending" | "accepted" | "expired" | "revoked";
  app_permissions: Record<string, boolean> | null;
  invited_by_name: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface WorkspaceInviteResult {
  type: "member" | "pending_invite";
  member: WorkspaceMember | null;
  pending_invite: WorkspacePendingInvite | null;
  message: string | null;
}

export interface InviteInfo {
  workspace_name: string;
  workspace_slug: string;
  invited_by_name: string | null;
  invited_by_email: string | null;
  email: string;
  role: string;
  expires_at: string | null;
  is_expired: boolean;
  is_valid: boolean;
}

export interface AcceptInviteResponse {
  success: boolean;
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  message: string;
}

export interface WorkspaceAppSettings {
  hiring: boolean;
  tracking: boolean;
  oncall: boolean;
  sprints: boolean;
  documents: boolean;
  ticketing: boolean;
  [key: string]: boolean;
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

// Billing/Subscription types
export interface PlanFeatures {
  id: string;
  name: string;
  tier: "free" | "pro" | "enterprise";
  description: string | null;
  price_monthly_cents: number;
  max_repos: number;
  max_commits_per_repo: number;
  max_prs_per_repo: number;
  sync_history_days: number;
  llm_requests_per_day: number;
  llm_provider_access: string[];
  enable_real_time_sync: boolean;
  enable_advanced_analytics: boolean;
  enable_exports: boolean;
  enable_webhooks: boolean;
  enable_team_features: boolean;
}

export interface SubscriptionStatus {
  has_subscription: boolean;
  subscription: {
    id: string;
    status: string;
    plan_id: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
  } | null;
  plan: PlanFeatures | null;
  customer: {
    id: string;
    stripe_customer_id: string | null;
    email: string | null;
  } | null;
}

// Usage and Billing Types
export interface UsageSummary {
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_base_cost_cents: number;
  total_cost_cents: number;
  margin_percent: number;
  by_provider: Record<string, {
    input_tokens: number;
    output_tokens: number;
    cost_cents: number;
  }>;
  period_start: string | null;
  period_end: string | null;
}

export interface UsageEstimate {
  current_month_cost_cents: number;
  projected_month_cost_cents: number;
  daily_average_cost_cents: number;
  days_elapsed: number;
  days_remaining: number;
}

export interface BillingHistoryEntry {
  period_start: string;
  period_end: string;
  total_tokens: number;
  total_cost_cents: number;
  total_requests: number;
  by_provider: Record<string, {
    input_tokens: number;
    output_tokens: number;
  }>;
}

export interface Invoice {
  id: string;
  number: string | null;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string | null;
  paid_at: string | null;
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
}

export interface LimitsUsageSummary {
  plan: {
    id: string;
    name: string;
    tier: string;
  };
  repos: {
    used: number;
    limit: number;
    unlimited: boolean;
  };
  llm: {
    used_today: number;
    limit_per_day: number;
    unlimited: boolean;
    providers: string[];
    reset_at: string | null;
  };
  tokens: {
    free_tokens_per_month: number;
    tokens_used_this_month: number;
    input_tokens_this_month: number;
    output_tokens_this_month: number;
    tokens_remaining_free: number;
    is_in_overage: boolean;
    overage_tokens: number;
    overage_cost_cents: number;
    input_cost_per_1k_cents: number;
    output_cost_per_1k_cents: number;
    enable_overage_billing: boolean;
    reset_at: string | null;
  };
  features: {
    real_time_sync: boolean;
    webhooks: boolean;
    advanced_analytics: boolean;
    exports: boolean;
    team_features: boolean;
  };
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

// Sprint Types
export type SprintStatus = "planning" | "active" | "review" | "retrospective" | "completed";
export type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskSourceType = "github_issue" | "jira" | "linear" | "manual";

export interface Sprint {
  id: string;
  team_id: string;
  workspace_id: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  start_date: string;
  end_date: string;
  capacity_hours: number | null;
  velocity_commitment: number | null;
  settings: Record<string, unknown>;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  tasks_count: number;
  completed_count: number;
  total_points: number;
  completed_points: number;
}

export interface SprintListItem {
  id: string;
  team_id: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  start_date: string;
  end_date: string;
  tasks_count: number;
  completed_count: number;
  total_points: number;
  completed_points: number;
}

export interface SprintTask {
  id: string;
  sprint_id: string | null;  // Can be null for project-level tasks
  team_id: string | null;    // Set for project-level tasks
  workspace_id: string | null;
  source_type: TaskSourceType;
  source_id: string;
  source_url: string | null;
  title: string;
  description: string | null;
  description_json: Record<string, unknown> | null;  // TipTap JSON for rich text
  story_points: number | null;
  priority: TaskPriority;
  labels: string[];
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_avatar_url: string | null;
  assignment_reason: string | null;
  assignment_confidence: number | null;
  status: TaskStatus;
  status_id: string | null;
  custom_fields: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  carried_over_from_sprint_id: string | null;
  // Epic reference
  epic_id: string | null;
  // Subtask support
  parent_task_id: string | null;
  subtasks_count: number;
  // External sync tracking
  last_synced_at: string | null;
  external_updated_at: string | null;
  sync_status: "synced" | "pending" | "conflict";
  // Mentions
  mentioned_user_ids: string[];
  mentioned_file_paths: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  title_template: string;
  description_template: string | null;
  default_priority: TaskPriority;
  default_story_points: number | null;
  default_labels: string[];
  subtasks: string[];
  checklist: string[];
  usage_count: number;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplateCreate {
  name: string;
  description?: string;
  category?: string;
  title_template: string;
  description_template?: string;
  default_priority?: TaskPriority;
  default_story_points?: number;
  default_labels?: string[];
  subtasks?: string[];
  checklist?: string[];
}

export interface TaskFromTemplateCreate {
  template_id: string;
  title_variables?: Record<string, string>;
  sprint_id?: string;
  assignee_id?: string;
  override_priority?: TaskPriority;
  override_story_points?: number;
  additional_labels?: string[];
  create_subtasks?: boolean;
}

export interface SprintStats {
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  todo_tasks: number;
  total_points: number;
  completed_points: number;
  remaining_points: number;
  completion_percentage: number;
}

export interface BurndownData {
  dates: string[];
  ideal: number[];
  actual: number[];
  scope_changes: { date: string; change: number; new_total: number }[];
}

export interface VelocityDataPoint {
  sprint_id: string;
  sprint_name: string;
  committed: number;
  completed: number;
  carry_over: number;
  completion_rate: number;
}

export interface VelocityTrend {
  sprints: VelocityDataPoint[];
  average_velocity: number;
  trend: "improving" | "stable" | "declining";
}

export interface AssignmentSuggestion {
  task_id: string;
  task_title: string;
  suggested_developer_id: string;
  suggested_developer_name: string | null;
  confidence: number;
  reasoning: string;
  alternative_developers: { developer_id: string; developer_name: string | null; score: number }[];
}

export interface CapacityAnalysis {
  total_capacity_hours: number;
  committed_hours: number;
  utilization_rate: number;
  overcommitted: boolean;
  per_member_capacity: {
    developer_id: string;
    developer_name: string | null;
    assigned_tasks: number;
    assigned_points: number;
    committed_hours: number;
    capacity_hours: number;
    utilization: number;
  }[];
  recommendations: string[];
}

export interface CompletionPrediction {
  predicted_completion_rate: number;
  confidence: number;
  risk_factors: string[];
  at_risk_tasks: { task_id: string; title: string; risk: string }[];
  recommendations: string[];
}

export interface SprintRetrospective {
  id: string;
  sprint_id: string;
  went_well: { id: string; content: string; author_id: string | null; votes: number }[];
  to_improve: { id: string; content: string; author_id: string | null; votes: number }[];
  action_items: { id: string; item: string; assignee_id: string | null; status: string; due_date: string | null }[];
  team_mood_score: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskActivityAction =
  | "created"
  | "updated"
  | "status_changed"
  | "assigned"
  | "unassigned"
  | "comment"
  | "priority_changed"
  | "points_changed"
  | "epic_changed";

export interface TaskActivity {
  id: string;
  task_id: string;
  action: TaskActivityAction;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar_url: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TaskActivityList {
  activities: TaskActivity[];
  total: number;
}

// Custom Status Types
export type StatusCategory = "todo" | "in_progress" | "done";

export interface CustomTaskStatus {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  category: StatusCategory;
  color: string;
  icon: string | null;
  position: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomField {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  field_type: "text" | "number" | "select" | "multiselect" | "date" | "url";
  options: { value: string; label: string; color?: string }[] | null;
  is_required: boolean;
  default_value: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

  inviteMember: async (workspaceId: string, email: string, role = "member"): Promise<WorkspaceInviteResult> => {
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

  // Pending Invites
  getPendingInvites: async (workspaceId: string): Promise<WorkspacePendingInvite[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/invites`);
    return response.data;
  },

  revokePendingInvite: async (workspaceId: string, inviteId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/invites/${inviteId}`);
  },

  resendPendingInvite: async (workspaceId: string, inviteId: string): Promise<WorkspacePendingInvite> => {
    const response = await api.post(`/workspaces/${workspaceId}/invites/${inviteId}/resend`);
    return response.data;
  },

  resendMemberInvite: async (workspaceId: string, developerId: string): Promise<WorkspaceMember> => {
    const response = await api.post(`/workspaces/${workspaceId}/members/${developerId}/resend-invite`);
    return response.data;
  },

  // Invite Token (for accepting invites via email link)
  getInviteInfo: async (token: string): Promise<InviteInfo> => {
    const response = await api.get(`/invites/${token}`);
    return response.data;
  },

  acceptInvite: async (token: string): Promise<AcceptInviteResponse> => {
    const response = await api.post(`/invites/${token}/accept`);
    return response.data;
  },

  // Join Request
  requestToJoin: async (workspaceId: string): Promise<{
    status: string;
    message: string;
    workspace_id: string;
    workspace_name: string;
  }> => {
    const response = await api.post(`/workspaces/${workspaceId}/join-request`);
    return response.data;
  },

  // App Settings & Permissions
  getAppSettings: async (workspaceId: string): Promise<WorkspaceAppSettings> => {
    const response = await api.get(`/workspaces/${workspaceId}/apps`);
    return response.data;
  },

  updateAppSettings: async (workspaceId: string, apps: Record<string, boolean>): Promise<WorkspaceAppSettings> => {
    const response = await api.patch(`/workspaces/${workspaceId}/apps`, { apps });
    return response.data;
  },

  updateMemberAppPermissions: async (
    workspaceId: string,
    developerId: string,
    appPermissions: Record<string, boolean>
  ): Promise<WorkspaceMember> => {
    const response = await api.patch(`/workspaces/${workspaceId}/members/${developerId}/apps`, {
      app_permissions: appPermissions,
    });
    return response.data;
  },

  getMemberEffectivePermissions: async (
    workspaceId: string,
    developerId: string
  ): Promise<WorkspaceAppSettings> => {
    const response = await api.get(`/workspaces/${workspaceId}/members/${developerId}/apps/effective`);
    return response.data;
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

  // Custom Task Statuses
  getTaskStatuses: async (workspaceId: string): Promise<CustomTaskStatus[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/task-statuses`);
    return response.data;
  },

  createTaskStatus: async (workspaceId: string, data: {
    name: string;
    category?: StatusCategory;
    color?: string;
    icon?: string;
    is_default?: boolean;
  }): Promise<CustomTaskStatus> => {
    const response = await api.post(`/workspaces/${workspaceId}/task-statuses`, data);
    return response.data;
  },

  updateTaskStatus: async (workspaceId: string, statusId: string, data: {
    name?: string;
    category?: StatusCategory;
    color?: string;
    icon?: string;
    is_default?: boolean;
  }): Promise<CustomTaskStatus> => {
    const response = await api.patch(`/workspaces/${workspaceId}/task-statuses/${statusId}`, data);
    return response.data;
  },

  deleteTaskStatus: async (workspaceId: string, statusId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/task-statuses/${statusId}`);
  },

  reorderTaskStatuses: async (workspaceId: string, statusIds: string[]): Promise<CustomTaskStatus[]> => {
    const response = await api.post(`/workspaces/${workspaceId}/task-statuses/reorder`, {
      status_ids: statusIds,
    });
    return response.data;
  },

  // Custom Fields
  getCustomFields: async (workspaceId: string): Promise<CustomField[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/custom-fields`);
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

// Sprint API
export const sprintApi = {
  // Sprint CRUD
  list: async (workspaceId: string, teamId: string, statusFilter?: SprintStatus): Promise<SprintListItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/sprints`, {
      params: statusFilter ? { status_filter: statusFilter } : {},
    });
    return response.data;
  },

  getActive: async (workspaceId: string, teamId: string): Promise<Sprint | null> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/sprints/active`);
    return response.data;
  },

  get: async (workspaceId: string, teamId: string, sprintId: string): Promise<Sprint> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/sprints/${sprintId}`);
    return response.data;
  },

  create: async (workspaceId: string, teamId: string, data: {
    name: string;
    start_date: string;
    end_date: string;
    goal?: string;
    capacity_hours?: number;
    velocity_commitment?: number;
    settings?: Record<string, unknown>;
  }): Promise<Sprint> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams/${teamId}/sprints`, data);
    return response.data;
  },

  update: async (workspaceId: string, teamId: string, sprintId: string, data: {
    name?: string;
    goal?: string;
    start_date?: string;
    end_date?: string;
    capacity_hours?: number;
    velocity_commitment?: number;
    settings?: Record<string, unknown>;
  }): Promise<Sprint> => {
    const response = await api.patch(`/workspaces/${workspaceId}/teams/${teamId}/sprints/${sprintId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, teamId: string, sprintId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/teams/${teamId}/sprints/${sprintId}`);
  },

  // Lifecycle
  start: async (workspaceId: string, teamId: string, sprintId: string): Promise<Sprint> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams/${teamId}/sprints/${sprintId}/start`);
    return response.data;
  },

  startReview: async (workspaceId: string, teamId: string, sprintId: string): Promise<Sprint> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams/${teamId}/sprints/${sprintId}/review`);
    return response.data;
  },

  startRetrospective: async (workspaceId: string, teamId: string, sprintId: string): Promise<Sprint> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams/${teamId}/sprints/${sprintId}/retro`);
    return response.data;
  },

  complete: async (workspaceId: string, teamId: string, sprintId: string): Promise<Sprint> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams/${teamId}/sprints/${sprintId}/complete`);
    return response.data;
  },

  getStats: async (workspaceId: string, teamId: string, sprintId: string): Promise<SprintStats> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/sprints/${sprintId}/stats`);
    return response.data;
  },

  // Tasks
  getTasks: async (sprintId: string, statusFilter?: TaskStatus, assigneeId?: string): Promise<SprintTask[]> => {
    const response = await api.get(`/sprints/${sprintId}/tasks`, {
      params: {
        ...(statusFilter && { status_filter: statusFilter }),
        ...(assigneeId && { assignee_id: assigneeId }),
      },
    });
    return response.data;
  },

  addTask: async (sprintId: string, data: {
    title: string;
    source_type?: TaskSourceType;
    source_id?: string;
    source_url?: string;
    description?: string;
    description_json?: Record<string, unknown>;
    story_points?: number;
    priority?: TaskPriority;
    labels?: string[];
    assignee_id?: string;
    status?: TaskStatus;
    epic_id?: string;
    parent_task_id?: string;
    mentioned_user_ids?: string[];
    mentioned_file_paths?: string[];
  }): Promise<SprintTask> => {
    const response = await api.post(`/sprints/${sprintId}/tasks`, data);
    return response.data;
  },

  updateTask: async (sprintId: string, taskId: string, data: {
    title?: string;
    description?: string;
    description_json?: Record<string, unknown>;
    story_points?: number;
    priority?: TaskPriority;
    status?: TaskStatus;
    labels?: string[];
    epic_id?: string | null;
    sprint_id?: string | null;
    assignee_id?: string | null;
    mentioned_user_ids?: string[];
    mentioned_file_paths?: string[];
  }): Promise<SprintTask> => {
    const response = await api.patch(`/sprints/${sprintId}/tasks/${taskId}`, data);
    return response.data;
  },

  updateTaskStatus: async (sprintId: string, taskId: string, status: TaskStatus): Promise<SprintTask> => {
    const response = await api.patch(`/sprints/${sprintId}/tasks/${taskId}/status`, { status });
    return response.data;
  },

  removeTask: async (sprintId: string, taskId: string): Promise<void> => {
    await api.delete(`/sprints/${sprintId}/tasks/${taskId}`);
  },

  getSubtasks: async (sprintId: string, taskId: string): Promise<SprintTask[]> => {
    const response = await api.get(`/sprints/${sprintId}/tasks/${taskId}/subtasks`);
    return response.data;
  },

  // Activity Log
  getTaskActivities: async (sprintId: string, taskId: string, limit = 50, offset = 0): Promise<TaskActivityList> => {
    const response = await api.get(`/sprints/${sprintId}/tasks/${taskId}/activities`, {
      params: { limit, offset },
    });
    return response.data;
  },

  addTaskComment: async (sprintId: string, taskId: string, comment: string): Promise<TaskActivity> => {
    const response = await api.post(`/sprints/${sprintId}/tasks/${taskId}/comments`, { comment });
    return response.data;
  },

  assignTask: async (sprintId: string, taskId: string, developerId: string, reason?: string, confidence?: number): Promise<SprintTask> => {
    const response = await api.post(`/sprints/${sprintId}/tasks/${taskId}/assign`, {
      developer_id: developerId,
      ...(reason && { reason }),
      ...(confidence !== undefined && { confidence }),
    });
    return response.data;
  },

  unassignTask: async (sprintId: string, taskId: string): Promise<SprintTask> => {
    const response = await api.delete(`/sprints/${sprintId}/tasks/${taskId}/assign`);
    return response.data;
  },

  bulkAssignTasks: async (sprintId: string, assignments: { task_id: string; developer_id: string; reason?: string; confidence?: number }[]): Promise<SprintTask[]> => {
    const response = await api.post(`/sprints/${sprintId}/tasks/bulk-assign`, { assignments });
    return response.data;
  },

  bulkUpdateStatus: async (sprintId: string, taskIds: string[], status: TaskStatus): Promise<SprintTask[]> => {
    const response = await api.post(`/sprints/${sprintId}/tasks/bulk-status`, { task_ids: taskIds, status });
    return response.data;
  },

  bulkMoveTasks: async (sprintId: string, taskIds: string[], targetSprintId: string): Promise<SprintTask[]> => {
    const response = await api.post(`/sprints/${sprintId}/tasks/bulk-move`, { task_ids: taskIds, target_sprint_id: targetSprintId });
    return response.data;
  },

  exportTasks: async (sprintId: string, format: 'csv' | 'xlsx' | 'pdf' | 'json'): Promise<Blob> => {
    const response = await api.get(`/sprints/${sprintId}/tasks/export/${format}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  reorderTasks: async (sprintId: string, taskIds: string[]): Promise<SprintTask[]> => {
    const response = await api.post(`/sprints/${sprintId}/tasks/reorder`, { task_ids: taskIds });
    return response.data;
  },

  importTasks: async (sprintId: string, source: TaskSourceType, config: {
    github?: { owner: string; repo: string; api_token?: string; labels?: string[]; limit?: number };
    jira?: { api_url: string; api_key: string; project_key: string; jql_filter?: string; limit?: number };
    linear?: { api_key: string; team_id?: string; labels?: string[]; limit?: number };
  }): Promise<{ imported_count: number; tasks: SprintTask[] }> => {
    const response = await api.post(`/sprints/${sprintId}/tasks/import`, { source, ...config });
    return response.data;
  },

  // AI-powered
  getSuggestions: async (sprintId: string): Promise<AssignmentSuggestion[]> => {
    const response = await api.post(`/sprints/${sprintId}/tasks/suggest-assignments`);
    return response.data;
  },

  optimize: async (sprintId: string): Promise<{
    original_score: number;
    optimized_score: number;
    improvement: number;
    changes: { task_id: string; task_title: string; current_developer_id: string; new_developer_id: string; reason: string }[];
    recommendations: string[];
  }> => {
    const response = await api.post(`/sprints/${sprintId}/tasks/optimize`);
    return response.data;
  },

  getCapacity: async (sprintId: string): Promise<CapacityAnalysis> => {
    const response = await api.get(`/sprints/${sprintId}/tasks/capacity`);
    return response.data;
  },

  getPrediction: async (sprintId: string): Promise<CompletionPrediction> => {
    const response = await api.get(`/sprints/${sprintId}/tasks/completion-prediction`);
    return response.data;
  },

  // Analytics
  getBurndown: async (sprintId: string): Promise<BurndownData> => {
    const response = await api.get(`/sprints/${sprintId}/burndown`);
    return response.data;
  },

  getVelocity: async (teamId: string, numSprints = 6): Promise<VelocityTrend> => {
    const response = await api.get(`/teams/${teamId}/velocity`, {
      params: { num_sprints: numSprints },
    });
    return response.data;
  },

  getCarryOver: async (teamId: string): Promise<{
    total_carry_over: number;
    average_carry_over: number;
    carry_over_rate: number;
    trend: string;
    sprints: { sprint_id: string; sprint_name: string; carry_over_points: number; carry_over_rate: number }[];
  }> => {
    const response = await api.get(`/teams/${teamId}/carry-over`);
    return response.data;
  },

  getTeamHealth: async (teamId: string): Promise<{
    overall_score: number;
    velocity_score: number;
    consistency_score: number;
    completion_score: number;
    carry_over_rate: number;
    average_velocity: number;
    velocity_trend: string;
    recommendations: string[];
  }> => {
    const response = await api.get(`/teams/${teamId}/health`);
    return response.data;
  },

  // Retrospective
  getRetrospective: async (sprintId: string): Promise<SprintRetrospective | null> => {
    try {
      const response = await api.get(`/sprints/${sprintId}/retrospective`);
      return response.data;
    } catch {
      return null;
    }
  },

  saveRetrospective: async (sprintId: string, data: {
    went_well?: { id?: string; content: string; author_id?: string; votes?: number }[];
    to_improve?: { id?: string; content: string; author_id?: string; votes?: number }[];
    action_items?: { id?: string; item: string; assignee_id?: string; status?: string; due_date?: string }[];
    team_mood_score?: number;
    notes?: string;
  }): Promise<SprintRetrospective> => {
    const response = await api.post(`/sprints/${sprintId}/retrospective`, data);
    return response.data;
  },

  addRetroItem: async (sprintId: string, data: {
    category: "went_well" | "to_improve" | "action_item";
    content: string;
    assignee_id?: string;
    due_date?: string;
  }): Promise<SprintRetrospective> => {
    const response = await api.post(`/sprints/${sprintId}/retrospective/items`, data);
    return response.data;
  },

  updateRetroItem: async (sprintId: string, itemId: string, data: {
    content?: string;
    status?: "pending" | "in_progress" | "done";
    assignee_id?: string;
    due_date?: string;
  }): Promise<SprintRetrospective> => {
    const response = await api.patch(`/sprints/${sprintId}/retrospective/items/${itemId}`, data);
    return response.data;
  },

  deleteRetroItem: async (sprintId: string, itemId: string): Promise<SprintRetrospective> => {
    const response = await api.delete(`/sprints/${sprintId}/retrospective/items/${itemId}`);
    return response.data;
  },

  voteRetroItem: async (sprintId: string, itemId: string): Promise<SprintRetrospective> => {
    const response = await api.post(`/sprints/${sprintId}/retrospective/items/${itemId}/vote`);
    return response.data;
  },

  // Carry over
  carryOver: async (workspaceId: string, teamId: string, fromSprintId: string, toSprintId: string, taskIds: string[]): Promise<{
    carried_count: number;
    tasks: SprintTask[];
  }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/teams/${teamId}/sprints/${fromSprintId}/carry-over/${toSprintId}`,
      { task_ids: taskIds }
    );
    return response.data;
  },
};

// ============================================================================
// Task Templates API (workspace-scoped task templates)
// ============================================================================

export interface TaskTemplateListResponse {
  items: TaskTemplate[];
  total: number;
}

export const taskTemplatesApi = {
  list: async (workspaceId: string, options?: {
    category?: string;
    is_active?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<TaskTemplateListResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/task-templates`, { params: options });
    return response.data;
  },

  get: async (workspaceId: string, templateId: string): Promise<TaskTemplate> => {
    const response = await api.get(`/workspaces/${workspaceId}/task-templates/${templateId}`);
    return response.data;
  },

  create: async (workspaceId: string, data: TaskTemplateCreate): Promise<TaskTemplate> => {
    const response = await api.post(`/workspaces/${workspaceId}/task-templates`, data);
    return response.data;
  },

  update: async (workspaceId: string, templateId: string, data: Partial<TaskTemplateCreate> & { is_active?: boolean }): Promise<TaskTemplate> => {
    const response = await api.patch(`/workspaces/${workspaceId}/task-templates/${templateId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, templateId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/task-templates/${templateId}`);
  },

  useTemplate: async (workspaceId: string, templateId: string, data: {
    sprint_id: string;
    title_variables?: Record<string, string>;
    assignee_id?: string;
    override_priority?: TaskPriority;
    override_story_points?: number;
    additional_labels?: string[];
    create_subtasks?: boolean;
  }): Promise<SprintTask> => {
    const response = await api.post(`/workspaces/${workspaceId}/task-templates/${templateId}/use`, data);
    return response.data;
  },

  listCategories: async (workspaceId: string): Promise<string[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/task-templates/categories/list`);
    return response.data;
  },
};

// ============================================================================
// Project Tasks API (project-level tasks without sprint)
// ============================================================================

export const projectTasksApi = {
  /**
   * List all tasks for a project/team.
   * By default, only returns tasks without a sprint (backlog items).
   */
  list: async (teamId: string, options?: {
    statusFilter?: TaskStatus;
    assigneeId?: string;
    includeSprintTasks?: boolean;
  }): Promise<SprintTask[]> => {
    const response = await api.get(`/teams/${teamId}/tasks`, {
      params: {
        ...(options?.statusFilter && { status_filter: options.statusFilter }),
        ...(options?.assigneeId && { assignee_id: options.assigneeId }),
        ...(options?.includeSprintTasks !== undefined && { include_sprint_tasks: options.includeSprintTasks }),
      },
    });
    return response.data;
  },

  /**
   * Create a new task at the project level (without sprint).
   */
  create: async (teamId: string, data: {
    title: string;
    description?: string;
    description_json?: Record<string, unknown>;
    story_points?: number;
    priority?: TaskPriority;
    labels?: string[];
    assignee_id?: string;
    status?: TaskStatus;
    epic_id?: string;
    sprint_id?: string;  // Optional - can assign to sprint on creation
    mentioned_user_ids?: string[];
    mentioned_file_paths?: string[];
  }): Promise<SprintTask> => {
    const response = await api.post(`/teams/${teamId}/tasks`, data);
    return response.data;
  },

  /**
   * Get a task by ID.
   */
  get: async (teamId: string, taskId: string): Promise<SprintTask> => {
    const response = await api.get(`/teams/${teamId}/tasks/${taskId}`);
    return response.data;
  },

  /**
   * Update a task.
   */
  update: async (teamId: string, taskId: string, data: {
    title?: string;
    description?: string;
    description_json?: Record<string, unknown>;
    story_points?: number;
    priority?: TaskPriority;
    status?: TaskStatus;
    labels?: string[];
    epic_id?: string | null;
    sprint_id?: string | null;
    assignee_id?: string | null;
    mentioned_user_ids?: string[];
    mentioned_file_paths?: string[];
  }): Promise<SprintTask> => {
    const response = await api.patch(`/teams/${teamId}/tasks/${taskId}`, data);
    return response.data;
  },

  /**
   * Update task status.
   */
  updateStatus: async (teamId: string, taskId: string, status: TaskStatus): Promise<SprintTask> => {
    const response = await api.patch(`/teams/${teamId}/tasks/${taskId}/status`, { status });
    return response.data;
  },

  /**
   * Move task to sprint or back to backlog.
   */
  moveToSprint: async (teamId: string, taskId: string, sprintId: string | null): Promise<SprintTask> => {
    const response = await api.patch(`/teams/${teamId}/tasks/${taskId}/move-to-sprint`, null, {
      params: { sprint_id: sprintId },
    });
    return response.data;
  },

  /**
   * Delete a task.
   */
  delete: async (teamId: string, taskId: string): Promise<void> => {
    await api.delete(`/teams/${teamId}/tasks/${taskId}`);
  },
};

// ============================================================================
// Task Configuration Types & API
// ============================================================================

export type CustomFieldType = "text" | "number" | "select" | "multiselect" | "date" | "url";

export interface TaskStatusConfig {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  category: StatusCategory;
  color: string;
  icon: string | null;
  position: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomFieldOption {
  value: string;
  label: string;
  color?: string;
}

export interface CustomField {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  field_type: CustomFieldType;
  options: CustomFieldOption[] | null;
  is_required: boolean;
  default_value: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const taskConfigApi = {
  // Task Statuses
  getStatuses: async (workspaceId: string): Promise<TaskStatusConfig[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/task-statuses`);
    return response.data;
  },

  createStatus: async (workspaceId: string, data: {
    name: string;
    category?: StatusCategory;
    color?: string;
    icon?: string;
    is_default?: boolean;
  }): Promise<TaskStatusConfig> => {
    const response = await api.post(`/workspaces/${workspaceId}/task-statuses`, data);
    return response.data;
  },

  getStatus: async (workspaceId: string, statusId: string): Promise<TaskStatusConfig> => {
    const response = await api.get(`/workspaces/${workspaceId}/task-statuses/${statusId}`);
    return response.data;
  },

  updateStatus: async (workspaceId: string, statusId: string, data: {
    name?: string;
    category?: StatusCategory;
    color?: string;
    icon?: string;
    is_default?: boolean;
  }): Promise<TaskStatusConfig> => {
    const response = await api.patch(`/workspaces/${workspaceId}/task-statuses/${statusId}`, data);
    return response.data;
  },

  deleteStatus: async (workspaceId: string, statusId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/task-statuses/${statusId}`);
  },

  reorderStatuses: async (workspaceId: string, statusIds: string[]): Promise<TaskStatusConfig[]> => {
    const response = await api.post(`/workspaces/${workspaceId}/task-statuses/reorder`, {
      status_ids: statusIds,
    });
    return response.data;
  },

  // Custom Fields
  getCustomFields: async (workspaceId: string): Promise<CustomField[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/custom-fields`);
    return response.data;
  },

  createCustomField: async (workspaceId: string, data: {
    name: string;
    field_type: CustomFieldType;
    options?: CustomFieldOption[];
    is_required?: boolean;
    default_value?: string;
  }): Promise<CustomField> => {
    const response = await api.post(`/workspaces/${workspaceId}/custom-fields`, data);
    return response.data;
  },

  getCustomField: async (workspaceId: string, fieldId: string): Promise<CustomField> => {
    const response = await api.get(`/workspaces/${workspaceId}/custom-fields/${fieldId}`);
    return response.data;
  },

  updateCustomField: async (workspaceId: string, fieldId: string, data: {
    name?: string;
    options?: CustomFieldOption[];
    is_required?: boolean;
    default_value?: string;
  }): Promise<CustomField> => {
    const response = await api.patch(`/workspaces/${workspaceId}/custom-fields/${fieldId}`, data);
    return response.data;
  },

  deleteCustomField: async (workspaceId: string, fieldId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/custom-fields/${fieldId}`);
  },

  reorderCustomFields: async (workspaceId: string, fieldIds: string[]): Promise<CustomField[]> => {
    const response = await api.post(`/workspaces/${workspaceId}/custom-fields/reorder`, {
      field_ids: fieldIds,
    });
    return response.data;
  },
};

// ============================================================================
// Jira & Linear Integration Types & API
// ============================================================================

export interface StatusMapping {
  remote_status: string;
  workspace_status_slug: string;
}

export interface FieldMapping {
  remote_field: string;
  workspace_field_slug: string;
}

export interface JiraIntegration {
  id: string;
  workspace_id: string;
  site_url: string;
  user_email: string;
  project_mappings: Record<string, { project_key: string; jql_filter?: string }>;
  status_mappings: Record<string, string>;
  field_mappings: Record<string, string>;
  sync_enabled: boolean;
  sync_direction: "import" | "bidirectional";
  last_sync_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LinearIntegration {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  organization_name: string | null;
  team_mappings: Record<string, { linear_team_id: string; labels_filter?: string[] }>;
  status_mappings: Record<string, string>;
  field_mappings: Record<string, string>;
  sync_enabled: boolean;
  last_sync_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RemoteProject {
  key: string;
  name: string;
}

export interface RemoteTeam {
  id: string;
  name: string;
}

export interface RemoteStatus {
  id: string;
  name: string;
  category: string | null;
}

export interface RemoteField {
  id: string;
  name: string;
  field_type: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  available_projects?: RemoteProject[];
  available_teams?: RemoteTeam[];
  available_statuses?: RemoteStatus[];
  available_fields?: RemoteField[];
}

export interface SyncResult {
  success: boolean;
  message: string;
  synced_count: number;
  created_count: number;
  updated_count: number;
  error_count: number;
  errors: string[];
}

// ============================================================================
// Gamification Types & API
// ============================================================================

export type BadgeCategory = "achievement" | "streak" | "skill" | "milestone";
export type BadgeRarity = "common" | "rare" | "epic" | "legendary";

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  points_value: number;
  unlock_conditions: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface EarnedBadge {
  id: string;
  badge: Badge;
  earned_at: string;
  context: Record<string, unknown> | null;
}

export interface GamificationProfile {
  id: string;
  developer_id: string;
  total_points: number;
  level: number;
  level_progress_points: number;
  current_streak_days: number;
  longest_streak_days: number;
  last_activity_date: string | null;
  activities_completed: number;
  paths_completed: number;
  milestones_completed: number;
  total_learning_minutes: number;
  created_at: string;
  updated_at: string;
  earned_badges: EarnedBadge[];
  recent_badges: EarnedBadge[];
}

export interface LevelProgress {
  current_level: number;
  current_level_name: string;
  points_in_level: number;
  points_for_next_level: number;
  progress_percentage: number;
  next_level: number | null;
}

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  is_active_today: boolean;
  streak_at_risk: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  developer_id: string;
  developer_name: string | null;
  developer_avatar: string | null;
  points: number;
  level: number;
  streak_days: number;
}

export interface Leaderboard {
  scope: string;
  period: string;
  entries: LeaderboardEntry[];
  user_rank: number | null;
  total_participants: number;
}

// Gamification API
export const gamificationApi = {
  getProfile: async (): Promise<GamificationProfile> => {
    const response = await api.get("/gamification/profile");
    return response.data;
  },

  getAllBadges: async (): Promise<Badge[]> => {
    const response = await api.get("/gamification/badges");
    return response.data;
  },

  getEarnedBadges: async (): Promise<EarnedBadge[]> => {
    const response = await api.get("/gamification/badges/earned");
    return response.data;
  },

  getStreak: async (): Promise<StreakInfo> => {
    const response = await api.get("/gamification/streak");
    return response.data;
  },

  getLevelProgress: async (): Promise<LevelProgress> => {
    const response = await api.get("/gamification/level-progress");
    return response.data;
  },

  checkBadges: async (): Promise<Badge[]> => {
    const response = await api.post("/gamification/badges/check");
    return response.data;
  },

  seedBadges: async (): Promise<{ message: string; badges_created: number }> => {
    const response = await api.post("/gamification/badges/seed");
    return response.data;
  },
};

export const integrationsApi = {
  // Jira Integration
  getJiraIntegration: async (workspaceId: string): Promise<JiraIntegration | null> => {
    try {
      const response = await api.get(`/workspaces/${workspaceId}/integrations/jira`);
      return response.data;
    } catch {
      return null;
    }
  },

  createJiraIntegration: async (workspaceId: string, data: {
    site_url: string;
    user_email: string;
    api_token: string;
  }): Promise<JiraIntegration> => {
    const response = await api.post(`/workspaces/${workspaceId}/integrations/jira`, data);
    return response.data;
  },

  testJiraConnection: async (workspaceId: string, data?: {
    site_url: string;
    user_email: string;
    api_token: string;
  }): Promise<ConnectionTestResult> => {
    const response = await api.post(`/workspaces/${workspaceId}/integrations/jira/test`, data);
    return response.data;
  },

  updateJiraIntegration: async (workspaceId: string, data: {
    project_mappings?: Record<string, { project_key: string; jql_filter?: string }>;
    status_mappings?: StatusMapping[];
    field_mappings?: FieldMapping[];
    sync_enabled?: boolean;
    sync_direction?: "import" | "bidirectional";
  }): Promise<JiraIntegration> => {
    const response = await api.patch(`/workspaces/${workspaceId}/integrations/jira`, data);
    return response.data;
  },

  deleteJiraIntegration: async (workspaceId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/integrations/jira`);
  },

  syncJira: async (workspaceId: string, teamId?: string): Promise<SyncResult> => {
    const response = await api.post(`/workspaces/${workspaceId}/integrations/jira/sync`, null, {
      params: teamId ? { team_id: teamId } : undefined,
    });
    return response.data;
  },

  getJiraStatuses: async (workspaceId: string): Promise<RemoteStatus[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/jira/statuses`);
    return response.data;
  },

  getJiraFields: async (workspaceId: string): Promise<RemoteField[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/jira/fields`);
    return response.data;
  },

  getJiraProjects: async (workspaceId: string): Promise<RemoteProject[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/jira/projects`);
    return response.data;
  },

  // Linear Integration
  getLinearIntegration: async (workspaceId: string): Promise<LinearIntegration | null> => {
    try {
      const response = await api.get(`/workspaces/${workspaceId}/integrations/linear`);
      return response.data;
    } catch {
      return null;
    }
  },

  createLinearIntegration: async (workspaceId: string, data: {
    api_key: string;
  }): Promise<LinearIntegration> => {
    const response = await api.post(`/workspaces/${workspaceId}/integrations/linear`, data);
    return response.data;
  },

  testLinearConnection: async (workspaceId: string, data?: {
    api_key: string;
  }): Promise<ConnectionTestResult> => {
    const response = await api.post(`/workspaces/${workspaceId}/integrations/linear/test`, data);
    return response.data;
  },

  updateLinearIntegration: async (workspaceId: string, data: {
    team_mappings?: Record<string, { linear_team_id: string; labels_filter?: string[] }>;
    status_mappings?: StatusMapping[];
    field_mappings?: FieldMapping[];
    sync_enabled?: boolean;
  }): Promise<LinearIntegration> => {
    const response = await api.patch(`/workspaces/${workspaceId}/integrations/linear`, data);
    return response.data;
  },

  deleteLinearIntegration: async (workspaceId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/integrations/linear`);
  },

  syncLinear: async (workspaceId: string, teamId?: string): Promise<SyncResult> => {
    const response = await api.post(`/workspaces/${workspaceId}/integrations/linear/sync`, null, {
      params: teamId ? { team_id: teamId } : undefined,
    });
    return response.data;
  },

  getLinearStates: async (workspaceId: string): Promise<RemoteStatus[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/linear/states`);
    return response.data;
  },

  getLinearFields: async (workspaceId: string): Promise<RemoteField[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/linear/fields`);
    return response.data;
  },

  getLinearTeams: async (workspaceId: string): Promise<RemoteTeam[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/linear/teams`);
    return response.data;
  },
};

// ============================================================================
// Epic Types & API
// ============================================================================

export type EpicStatus = "open" | "in_progress" | "done" | "cancelled";
export type EpicPriority = "critical" | "high" | "medium" | "low";
export type EpicSourceType = "jira" | "linear" | "manual";

export interface Epic {
  id: string;
  workspace_id: string;
  key: string;
  title: string;
  description: string | null;
  status: EpicStatus;
  color: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_avatar_url: string | null;
  start_date: string | null;
  target_date: string | null;
  completed_date: string | null;
  priority: EpicPriority;
  labels: string[];
  total_tasks: number;
  completed_tasks: number;
  total_story_points: number;
  completed_story_points: number;
  progress_percentage: number;
  source_type: EpicSourceType;
  source_id: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface EpicListItem {
  id: string;
  workspace_id: string;
  key: string;
  title: string;
  status: EpicStatus;
  color: string;
  owner_id: string | null;
  owner_name: string | null;
  priority: EpicPriority;
  target_date: string | null;
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
}

export interface EpicDetail extends Epic {
  tasks_by_status: Record<string, number>;
  tasks_by_team: Record<string, number>;
  recent_completions: number;
}

export interface EpicTimelineSprintItem {
  sprint_id: string;
  sprint_name: string;
  team_id: string;
  team_name: string;
  status: string;
  start_date: string;
  end_date: string;
  task_count: number;
  completed_count: number;
  story_points: number;
  completed_points: number;
}

export interface EpicTimeline {
  epic_id: string;
  epic_title: string;
  sprints: EpicTimelineSprintItem[];
  total_sprints: number;
  completed_sprints: number;
  current_sprints: number;
  planned_sprints: number;
}

export interface EpicProgress {
  epic_id: string;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  blocked_tasks: number;
  total_story_points: number;
  completed_story_points: number;
  remaining_story_points: number;
  task_completion_percentage: number;
  points_completion_percentage: number;
  tasks_completed_this_week: number;
  points_completed_this_week: number;
  estimated_completion_date: string | null;
}

export interface EpicBurndownDataPoint {
  date: string;
  remaining_points: number;
  remaining_tasks: number;
  scope_total: number;
}

export interface EpicBurndown {
  epic_id: string;
  data_points: EpicBurndownDataPoint[];
  start_date: string;
  target_date: string | null;
  ideal_burndown: number[];
}

export const epicApi = {
  // List epics
  list: async (
    workspaceId: string,
    options?: {
      status?: EpicStatus;
      owner_id?: string;
      priority?: EpicPriority;
      include_archived?: boolean;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<EpicListItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/epics`, {
      params: options,
    });
    return response.data;
  },

  // Create epic
  create: async (
    workspaceId: string,
    data: {
      title: string;
      description?: string;
      status?: EpicStatus;
      color?: string;
      owner_id?: string;
      start_date?: string;
      target_date?: string;
      priority?: EpicPriority;
      labels?: string[];
      source_type?: EpicSourceType;
      source_id?: string;
      source_url?: string;
    }
  ): Promise<Epic> => {
    const response = await api.post(`/workspaces/${workspaceId}/epics`, data);
    return response.data;
  },

  // Get epic
  get: async (workspaceId: string, epicId: string): Promise<Epic> => {
    const response = await api.get(`/workspaces/${workspaceId}/epics/${epicId}`);
    return response.data;
  },

  // Get epic detail
  getDetail: async (workspaceId: string, epicId: string): Promise<EpicDetail> => {
    const response = await api.get(`/workspaces/${workspaceId}/epics/${epicId}/detail`);
    return response.data;
  },

  // Update epic
  update: async (
    workspaceId: string,
    epicId: string,
    data: {
      title?: string;
      description?: string;
      status?: EpicStatus;
      color?: string;
      owner_id?: string;
      start_date?: string;
      target_date?: string;
      priority?: EpicPriority;
      labels?: string[];
    }
  ): Promise<Epic> => {
    const response = await api.patch(`/workspaces/${workspaceId}/epics/${epicId}`, data);
    return response.data;
  },

  // Delete epic
  delete: async (workspaceId: string, epicId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/epics/${epicId}`);
  },

  // Archive/unarchive
  archive: async (workspaceId: string, epicId: string): Promise<Epic> => {
    const response = await api.post(`/workspaces/${workspaceId}/epics/${epicId}/archive`);
    return response.data;
  },

  unarchive: async (workspaceId: string, epicId: string): Promise<Epic> => {
    const response = await api.post(`/workspaces/${workspaceId}/epics/${epicId}/unarchive`);
    return response.data;
  },

  // Task management
  addTasks: async (
    workspaceId: string,
    epicId: string,
    taskIds: string[]
  ): Promise<{ added_count: number; already_in_epic: number; task_ids: string[] }> => {
    const response = await api.post(`/workspaces/${workspaceId}/epics/${epicId}/tasks`, {
      task_ids: taskIds,
    });
    return response.data;
  },

  removeTask: async (workspaceId: string, epicId: string, taskId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/epics/${epicId}/tasks/${taskId}`);
  },

  // Analytics
  getTimeline: async (workspaceId: string, epicId: string): Promise<EpicTimeline> => {
    const response = await api.get(`/workspaces/${workspaceId}/epics/${epicId}/timeline`);
    return response.data;
  },

  getProgress: async (workspaceId: string, epicId: string): Promise<EpicProgress> => {
    const response = await api.get(`/workspaces/${workspaceId}/epics/${epicId}/progress`);
    return response.data;
  },

  getBurndown: async (workspaceId: string, epicId: string): Promise<EpicBurndown> => {
    const response = await api.get(`/workspaces/${workspaceId}/epics/${epicId}/burndown`);
    return response.data;
  },
};

// Billing API
export const billingApi = {
  getSubscriptionStatus: async (workspaceId?: string): Promise<SubscriptionStatus> => {
    const response = await api.get("/billing/status", {
      params: workspaceId ? { workspace_id: workspaceId } : {},
    });
    return response.data;
  },

  getPlans: async (): Promise<PlanFeatures[]> => {
    const response = await api.get("/billing/plans");
    return response.data;
  },

  createCheckoutSession: async (data: {
    plan_tier: string;
    success_url: string;
    cancel_url: string;
    workspace_id?: string;
  }): Promise<{ checkout_url: string }> => {
    const response = await api.post("/billing/checkout", data);
    return response.data;
  },

  createPortalSession: async (data: {
    return_url: string;
  }): Promise<{ portal_url: string }> => {
    const response = await api.post("/billing/portal", data);
    return response.data;
  },

  changePlan: async (data: {
    plan_tier: string;
    workspace_id?: string;
  }): Promise<{ success: boolean; message: string }> => {
    const response = await api.post("/billing/change-plan", data);
    return response.data;
  },

  // Usage tracking
  getUsageSummary: async (): Promise<UsageSummary> => {
    const response = await api.get("/billing/usage");
    return response.data;
  },

  getUsageEstimate: async (): Promise<UsageEstimate> => {
    const response = await api.get("/billing/usage/estimate");
    return response.data;
  },

  getBillingHistory: async (months: number = 6): Promise<BillingHistoryEntry[]> => {
    const response = await api.get("/billing/usage/history", {
      params: { months },
    });
    return response.data;
  },

  getInvoices: async (limit: number = 10): Promise<Invoice[]> => {
    const response = await api.get("/billing/invoices", {
      params: { limit },
    });
    return response.data;
  },

  getLimitsUsage: async (): Promise<LimitsUsageSummary> => {
    const response = await api.get("/billing/limits");
    return response.data;
  },
};

// ============ Reviews & Goals API Types ============

export type ReviewCycleType = "annual" | "semi_annual" | "quarterly" | "custom";
export type ReviewCycleStatus = "draft" | "active" | "self_review" | "peer_review" | "manager_review" | "completed";
export type ReviewStatus = "pending" | "self_review_submitted" | "peer_review_in_progress" | "manager_review_in_progress" | "completed" | "acknowledged";
export type GoalType = "performance" | "skill_development" | "project" | "leadership" | "team_contribution";
export type GoalPriority = "critical" | "high" | "medium" | "low";
export type GoalStatus = "draft" | "active" | "in_progress" | "completed" | "cancelled";
export type PeerRequestStatus = "pending" | "accepted" | "declined" | "completed";

export interface ReviewCycleSettings {
  enable_self_review: boolean;
  enable_peer_review: boolean;
  enable_manager_review: boolean;
  anonymous_peer_reviews: boolean;
  min_peer_reviewers: number;
  max_peer_reviewers: number;
  peer_selection_mode: "employee_choice" | "manager_assigned" | "both";
  include_github_metrics: boolean;
  review_questions: string[];
  rating_scale: number;
}

export interface ReviewCycle {
  id: string;
  workspace_id: string;
  name: string;
  cycle_type: ReviewCycleType;
  period_start: string;
  period_end: string;
  self_review_deadline: string | null;
  peer_review_deadline: string | null;
  manager_review_deadline: string | null;
  settings: ReviewCycleSettings | null;
  status: ReviewCycleStatus;
  created_at: string;
  updated_at: string;
}

export interface ReviewCycleDetail extends ReviewCycle {
  total_reviews: number;
  completed_reviews: number;
  pending_self_reviews: number;
  pending_peer_reviews: number;
  pending_manager_reviews: number;
}

export interface IndividualReview {
  id: string;
  review_cycle_id: string;
  developer_id: string;
  developer_name: string | null;
  developer_email: string | null;
  developer_avatar_url: string | null;
  manager_id: string | null;
  manager_name: string | null;
  manager_source: "team_lead" | "assigned";
  status: ReviewStatus;
  overall_rating: number | null;
  ratings_breakdown: Record<string, number> | null;
  completed_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewSubmission {
  id: string;
  individual_review_id: string;
  submission_type: "self" | "peer" | "manager";
  reviewer_id: string | null;
  reviewer_name: string | null;
  is_anonymous: boolean;
  responses: ReviewResponses;
  linked_goals: string[];
  linked_contributions: string[];
  status: "draft" | "submitted";
  submitted_at: string | null;
  created_at: string;
}

export interface ReviewResponses {
  achievements: Achievement[];
  areas_for_growth: GrowthArea[];
  question_responses: Record<string, string>;
  strengths: string[];
  growth_areas: string[];
}

export interface Achievement {
  title: string;
  context: string;
  observation: string;
  impact: string;
  next_steps: string;
  linked_goal_id: string | null;
  linked_contributions: string[];
}

export interface GrowthArea {
  area: string;
  context: string;
  observation: string;
  impact: string;
  next_steps: string;
  suggested_goal: string | null;
}

export interface IndividualReviewDetail extends IndividualReview {
  contribution_summary: Record<string, unknown> | null;
  ai_summary: string | null;
  self_review: ReviewSubmission | null;
  peer_reviews: ReviewSubmission[];
  manager_review: ReviewSubmission | null;
  goals: WorkGoal[];
}

export interface ReviewRequest {
  id: string;
  individual_review_id: string;
  requester_id: string;
  requester_name: string | null;
  reviewer_id: string;
  reviewer_name: string | null;
  reviewer_email: string | null;
  reviewer_avatar_url: string | null;
  message: string | null;
  request_source: "employee" | "manager";
  assigned_by_id: string | null;
  status: PeerRequestStatus;
  submission_id: string | null;
  created_at: string;
  responded_at: string | null;
}

export interface KeyResult {
  id: string;
  description: string;
  target: number;
  current: number;
  unit: string;
}

export interface WorkGoal {
  id: string;
  developer_id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  specific: string | null;
  measurable: string | null;
  achievable: string | null;
  relevant: string | null;
  time_bound: string | null;
  goal_type: GoalType;
  priority: GoalPriority;
  is_private: boolean;
  progress_percentage: number;
  status: GoalStatus;
  key_results: KeyResult[];
  linked_activity: Record<string, unknown> | null;
  tracking_keywords: string[];
  review_cycle_id: string | null;
  learning_milestone_id: string | null;
  suggested_from_path: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface WorkGoalDetail extends WorkGoal {
  linked_commits: Array<{ sha: string; title: string; additions: number; deletions: number }>;
  linked_pull_requests: Array<{ id: string; title: string; additions: number; deletions: number; url: string }>;
}

export interface ContributionMetrics {
  commits: { total: number; by_repo: Record<string, number>; by_month: Record<string, number> };
  pull_requests: { total: number; merged: number; by_repo: Record<string, number> };
  code_reviews: { total: number; approved: number; changes_requested: number };
  lines: { added: number; removed: number };
  languages: Record<string, number>;
  skills_demonstrated: string[];
}

export interface ContributionHighlight {
  type: "commit" | "pull_request" | "code_review";
  id: string;
  title: string;
  impact: string;
  additions: number;
  deletions: number;
  url: string | null;
}

export interface ContributionSummary {
  id: string;
  developer_id: string;
  period_start: string;
  period_end: string;
  period_type: string;
  metrics: ContributionMetrics;
  highlights: ContributionHighlight[];
  ai_insights: string | null;
  created_at: string;
}

export interface GoalSuggestion {
  title: string;
  goal_type: GoalType;
  suggested_measurable: string;
  suggested_keywords: string[];
  learning_milestone_id: string | null;
  skill_name: string | null;
  source: string;
  confidence: number;
}

// ============ Reviews API ============

export const reviewsApi = {
  // Review Cycles
  createCycle: async (
    workspaceId: string,
    data: {
      name: string;
      cycle_type: ReviewCycleType;
      period_start: string;
      period_end: string;
      self_review_deadline?: string;
      peer_review_deadline?: string;
      manager_review_deadline?: string;
      settings?: Partial<ReviewCycleSettings>;
    }
  ): Promise<ReviewCycle> => {
    const response = await api.post(`/reviews/workspaces/${workspaceId}/cycles`, data);
    return response.data;
  },

  listCycles: async (workspaceId: string, status?: string): Promise<ReviewCycle[]> => {
    const response = await api.get(`/reviews/workspaces/${workspaceId}/cycles`, {
      params: status ? { status } : {},
    });
    return response.data;
  },

  getCycle: async (cycleId: string): Promise<ReviewCycleDetail> => {
    const response = await api.get(`/reviews/cycles/${cycleId}`);
    return response.data;
  },

  updateCycle: async (
    cycleId: string,
    data: Partial<{
      name: string;
      cycle_type: ReviewCycleType;
      period_start: string;
      period_end: string;
      self_review_deadline: string;
      peer_review_deadline: string;
      manager_review_deadline: string;
      settings: Partial<ReviewCycleSettings>;
      status: ReviewCycleStatus;
    }>
  ): Promise<ReviewCycle> => {
    const response = await api.put(`/reviews/cycles/${cycleId}`, data);
    return response.data;
  },

  activateCycle: async (cycleId: string): Promise<ReviewCycle> => {
    const response = await api.post(`/reviews/cycles/${cycleId}/activate`);
    return response.data;
  },

  advanceCyclePhase: async (cycleId: string): Promise<{ status: string }> => {
    const response = await api.post(`/reviews/cycles/${cycleId}/advance-phase`);
    return response.data;
  },

  // Individual Reviews
  getMyReviews: async (developerId: string, status?: string): Promise<IndividualReview[]> => {
    const response = await api.get("/reviews/my-reviews", {
      params: { developer_id: developerId, ...(status ? { status } : {}) },
    });
    return response.data;
  },

  getManagerReviews: async (managerId: string): Promise<IndividualReview[]> => {
    const response = await api.get("/reviews/manager-reviews", {
      params: { manager_id: managerId },
    });
    return response.data;
  },

  getReview: async (reviewId: string): Promise<IndividualReviewDetail> => {
    const response = await api.get(`/reviews/${reviewId}`);
    return response.data;
  },

  getReviewContributions: async (reviewId: string): Promise<Record<string, unknown>> => {
    const response = await api.get(`/reviews/${reviewId}/contributions`);
    return response.data;
  },

  submitSelfReview: async (
    reviewId: string,
    data: {
      responses: ReviewResponses;
      linked_goals?: string[];
      linked_contributions?: string[];
    }
  ): Promise<ReviewSubmission> => {
    const response = await api.post(`/reviews/${reviewId}/self-review`, data);
    return response.data;
  },

  submitManagerReview: async (
    reviewId: string,
    data: {
      responses: ReviewResponses;
      overall_rating: number;
      ratings_breakdown?: Record<string, number>;
      linked_goals?: string[];
      linked_contributions?: string[];
    }
  ): Promise<ReviewSubmission> => {
    const response = await api.post(`/reviews/${reviewId}/manager-review`, data);
    return response.data;
  },

  finalizeReview: async (
    reviewId: string,
    data: { overall_rating: number; ratings_breakdown?: Record<string, number> }
  ): Promise<IndividualReview> => {
    const response = await api.post(`/reviews/${reviewId}/finalize`, data);
    return response.data;
  },

  acknowledgeReview: async (reviewId: string): Promise<IndividualReview> => {
    const response = await api.post(`/reviews/${reviewId}/acknowledge`);
    return response.data;
  },

  // Peer Reviews
  requestPeerReview: async (
    reviewId: string,
    requesterId: string,
    data: { reviewer_id: string; message?: string }
  ): Promise<ReviewRequest> => {
    const response = await api.post(`/reviews/${reviewId}/peer-requests`, data, {
      params: { requester_id: requesterId },
    });
    return response.data;
  },

  assignPeerReviewers: async (
    reviewId: string,
    managerId: string,
    data: { reviewer_ids: string[]; message?: string }
  ): Promise<ReviewRequest[]> => {
    const response = await api.post(`/reviews/${reviewId}/assign-peer-reviewers`, data, {
      params: { manager_id: managerId },
    });
    return response.data;
  },

  getPendingPeerRequests: async (reviewerId: string): Promise<ReviewRequest[]> => {
    const response = await api.get("/reviews/peer-requests/pending", {
      params: { reviewer_id: reviewerId },
    });
    return response.data;
  },

  respondToPeerRequest: async (
    requestId: string,
    data: { accept: boolean; decline_reason?: string }
  ): Promise<ReviewRequest> => {
    const response = await api.post(`/reviews/peer-requests/${requestId}/respond`, data);
    return response.data;
  },

  submitPeerReview: async (
    requestId: string,
    reviewerId: string,
    data: {
      responses: ReviewResponses;
      is_anonymous?: boolean;
      linked_goals?: string[];
      linked_contributions?: string[];
    }
  ): Promise<ReviewSubmission> => {
    const response = await api.post(`/reviews/peer-requests/${requestId}/submit`, data, {
      params: { reviewer_id: reviewerId },
    });
    return response.data;
  },

  // Goals
  createGoal: async (
    developerId: string,
    workspaceId: string,
    data: {
      title: string;
      description?: string;
      specific?: string;
      measurable?: string;
      achievable?: string;
      relevant?: string;
      time_bound?: string;
      goal_type: GoalType;
      priority: GoalPriority;
      is_private?: boolean;
      key_results?: Array<{ description: string; target: number; unit: string }>;
      tracking_keywords?: string[];
      review_cycle_id?: string;
      learning_milestone_id?: string;
    }
  ): Promise<WorkGoal> => {
    const response = await api.post("/reviews/goals", data, {
      params: { developer_id: developerId, workspace_id: workspaceId },
    });
    return response.data;
  },

  listGoals: async (
    developerId: string,
    params?: {
      workspace_id?: string;
      status?: string;
      goal_type?: string;
      review_cycle_id?: string;
    }
  ): Promise<WorkGoal[]> => {
    const response = await api.get("/reviews/goals", {
      params: { developer_id: developerId, ...params },
    });
    return response.data;
  },

  getGoal: async (goalId: string): Promise<WorkGoalDetail> => {
    const response = await api.get(`/reviews/goals/${goalId}`);
    return response.data;
  },

  updateGoal: async (
    goalId: string,
    data: Partial<{
      title: string;
      description: string | null;
      specific: string | null;
      measurable: string | null;
      achievable: string | null;
      relevant: string | null;
      time_bound: string | null;
      goal_type: GoalType;
      priority: GoalPriority;
      is_private: boolean;
      status: GoalStatus;
      key_results: KeyResult[];
      tracking_keywords: string[];
    }>
  ): Promise<WorkGoal> => {
    const response = await api.put(`/reviews/goals/${goalId}`, data);
    return response.data;
  },

  updateGoalProgress: async (
    goalId: string,
    data: {
      progress_percentage: number;
      key_result_updates?: Array<{ id: string; current: number }>;
    }
  ): Promise<WorkGoal> => {
    const response = await api.put(`/reviews/goals/${goalId}/progress`, data);
    return response.data;
  },

  autoLinkContributions: async (
    goalId: string
  ): Promise<{ linked_commits: number; linked_pull_requests: number; commits: string[]; pull_requests: string[] }> => {
    const response = await api.post(`/reviews/goals/${goalId}/auto-link`);
    return response.data;
  },

  getLinkedContributions: async (
    goalId: string
  ): Promise<{
    goal_id: string;
    commits: Array<{ sha: string; title: string; additions: number; deletions: number }>;
    pull_requests: Array<{ id: string; title: string; additions: number; deletions: number; url: string }>;
    total_additions: number;
    total_deletions: number;
  }> => {
    const response = await api.get(`/reviews/goals/${goalId}/linked-contributions`);
    return response.data;
  },

  completeGoal: async (goalId: string, finalNotes?: string): Promise<WorkGoal> => {
    const response = await api.post(`/reviews/goals/${goalId}/complete`, { final_notes: finalNotes });
    return response.data;
  },

  getGoalSuggestions: async (developerId: string): Promise<GoalSuggestion[]> => {
    const response = await api.get("/reviews/goals/suggestions", {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  // Contributions
  getContributionSummary: async (
    developerId: string,
    params?: {
      period_start?: string;
      period_end?: string;
      period_type?: string;
    }
  ): Promise<ContributionSummary> => {
    const response = await api.get("/reviews/contributions/summary", {
      params: { developer_id: developerId, ...params },
    });
    return response.data;
  },

  generateContributionSummary: async (
    developerId: string,
    data: {
      period_start?: string;
      period_end?: string;
      period_type?: "annual" | "semi_annual" | "quarterly" | "monthly" | "custom";
    }
  ): Promise<ContributionSummary> => {
    const response = await api.post("/reviews/contributions/generate", data, {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  getContributionHighlights: async (
    developerId: string,
    periodStart: string,
    periodEnd: string,
    limit?: number
  ): Promise<ContributionHighlight[]> => {
    const response = await api.get("/reviews/contributions/highlights", {
      params: { developer_id: developerId, period_start: periodStart, period_end: periodEnd, limit },
    });
    return response.data;
  },
};

// ============ Notification Types ============

export type NotificationEventType =
  | "peer_review_requested"
  | "peer_review_received"
  | "review_cycle_phase_changed"
  | "manager_review_completed"
  | "review_acknowledged"
  | "deadline_reminder_1_day"
  | "deadline_reminder_day_of"
  | "goal_auto_linked"
  | "goal_at_risk"
  | "goal_completed"
  | "workspace_invite"
  | "team_added";

export interface Notification {
  id: string;
  recipient_id: string;
  event_type: NotificationEventType;
  title: string;
  body: string;
  context: {
    review_id?: string;
    goal_id?: string;
    cycle_id?: string;
    request_id?: string;
    requester_name?: string;
    requester_avatar?: string;
    action_url?: string;
    workspace_id?: string;
    workspace_name?: string;
    extra?: Record<string, unknown>;
  };
  is_read: boolean;
  read_at: string | null;
  in_app_delivered: boolean;
  email_sent: boolean;
  email_sent_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
  unread_count: number;
}

export interface NotificationPreference {
  id: string;
  developer_id: string;
  event_type: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  slack_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferencesResponse {
  preferences: Record<string, NotificationPreference>;
  available_event_types: string[];
}

// ============ Notification API ============

export const notificationsApi = {
  // List notifications
  list: async (
    developerId: string,
    params?: {
      page?: number;
      per_page?: number;
      unread_only?: boolean;
    }
  ): Promise<NotificationListResponse> => {
    const response = await api.get("/notifications", {
      params: { developer_id: developerId, ...params },
    });
    return response.data;
  },

  // Get unread count
  getUnreadCount: async (developerId: string): Promise<{ count: number }> => {
    const response = await api.get("/notifications/count", {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  // Poll for new notifications
  poll: async (
    developerId: string,
    since: string
  ): Promise<{
    notifications: Notification[];
    latest_timestamp: string | null;
  }> => {
    const response = await api.get("/notifications/poll", {
      params: { developer_id: developerId, since },
    });
    return response.data;
  },

  // Mark as read
  markAsRead: async (notificationId: string, developerId: string): Promise<Notification> => {
    const response = await api.post(`/notifications/${notificationId}/read`, null, {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  // Mark all as read
  markAllAsRead: async (developerId: string): Promise<{ marked_read: number }> => {
    const response = await api.post("/notifications/read-all", null, {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  // Delete notification
  delete: async (notificationId: string, developerId: string): Promise<void> => {
    await api.delete(`/notifications/${notificationId}`, {
      params: { developer_id: developerId },
    });
  },

  // Get preferences
  getPreferences: async (developerId: string): Promise<NotificationPreferencesResponse> => {
    const response = await api.get("/notifications/preferences", {
      params: { developer_id: developerId },
    });
    return response.data;
  },

  // Update preference
  updatePreference: async (
    developerId: string,
    eventType: string,
    data: {
      in_app_enabled?: boolean;
      email_enabled?: boolean;
      slack_enabled?: boolean;
    }
  ): Promise<NotificationPreference> => {
    const response = await api.put(`/notifications/preferences/${eventType}`, data, {
      params: { developer_id: developerId },
    });
    return response.data;
  },
};

// ============ On-Call Types ============

export interface DeveloperBrief {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface OnCallConfig {
  id: string;
  team_id: string;
  is_enabled: boolean;
  timezone: string;
  default_shift_duration_hours: number;
  google_calendar_enabled: boolean;
  google_calendar_id: string | null;
  slack_channel_id: string | null;
  notify_before_shift_minutes: number;
  notify_on_shift_change: boolean;
  created_at: string;
  updated_at: string;
  current_oncall: OnCallSchedule | null;
}

export interface OnCallSchedule {
  id: string;
  config_id: string;
  developer_id: string;
  developer: DeveloperBrief | null;
  start_time: string;
  end_time: string;
  is_override: boolean;
  original_developer_id: string | null;
  original_developer: DeveloperBrief | null;
  override_reason: string | null;
  google_event_id: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnCallScheduleListResponse {
  schedules: OnCallSchedule[];
  total: number;
  start_date: string;
  end_date: string;
}

export interface CurrentOnCallResponse {
  is_active: boolean;
  schedule: OnCallSchedule | null;
  next_schedule: OnCallSchedule | null;
}

export interface SwapRequest {
  id: string;
  schedule_id: string;
  schedule: OnCallSchedule | null;
  requester_id: string;
  requester: DeveloperBrief | null;
  target_id: string;
  target: DeveloperBrief | null;
  status: "pending" | "accepted" | "declined" | "cancelled";
  message: string | null;
  responded_at: string | null;
  response_message: string | null;
  created_at: string;
}

export interface GoogleCalendarStatus {
  is_connected: boolean;
  calendar_email: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  description: string | null;
  primary: boolean;
  access_role: string | null;
}

// ============ On-Call API ============

export const oncallApi = {
  // Config
  getConfig: async (workspaceId: string, teamId: string): Promise<OnCallConfig | null> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/oncall`);
    return response.data;
  },

  enableOnCall: async (
    workspaceId: string,
    teamId: string,
    config: {
      timezone?: string;
      default_shift_duration_hours?: number;
      slack_channel_id?: string | null;
      notify_before_shift_minutes?: number;
      notify_on_shift_change?: boolean;
    }
  ): Promise<OnCallConfig> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams/${teamId}/oncall/enable`, config);
    return response.data;
  },

  disableOnCall: async (workspaceId: string, teamId: string): Promise<void> => {
    await api.post(`/workspaces/${workspaceId}/teams/${teamId}/oncall/disable`);
  },

  updateConfig: async (
    workspaceId: string,
    teamId: string,
    config: Partial<{
      timezone: string;
      default_shift_duration_hours: number;
      google_calendar_enabled: boolean;
      google_calendar_id: string;
      slack_channel_id: string;
      notify_before_shift_minutes: number;
      notify_on_shift_change: boolean;
    }>
  ): Promise<OnCallConfig> => {
    const response = await api.patch(`/workspaces/${workspaceId}/teams/${teamId}/oncall/config`, config);
    return response.data;
  },

  // Schedules
  getSchedules: async (
    workspaceId: string,
    teamId: string,
    startDate: string,
    endDate: string
  ): Promise<OnCallScheduleListResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/oncall/schedules`, {
      params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
  },

  createSchedule: async (
    workspaceId: string,
    teamId: string,
    schedule: { developer_id: string; start_time: string; end_time: string }
  ): Promise<OnCallSchedule> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams/${teamId}/oncall/schedules`, schedule);
    return response.data;
  },

  createBulkSchedules: async (
    workspaceId: string,
    teamId: string,
    schedules: Array<{ developer_id: string; start_time: string; end_time: string }>
  ): Promise<OnCallSchedule[]> => {
    const response = await api.post(`/workspaces/${workspaceId}/teams/${teamId}/oncall/schedules/bulk`, {
      schedules,
    });
    return response.data;
  },

  updateSchedule: async (
    workspaceId: string,
    teamId: string,
    scheduleId: string,
    updates: Partial<{ developer_id: string; start_time: string; end_time: string }>
  ): Promise<OnCallSchedule> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/teams/${teamId}/oncall/schedules/${scheduleId}`,
      updates
    );
    return response.data;
  },

  deleteSchedule: async (workspaceId: string, teamId: string, scheduleId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/teams/${teamId}/oncall/schedules/${scheduleId}`);
  },

  // Current on-call
  getCurrentOnCall: async (workspaceId: string, teamId: string): Promise<CurrentOnCallResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/oncall/current`);
    return response.data;
  },

  // Swaps
  requestSwap: async (
    workspaceId: string,
    teamId: string,
    scheduleId: string,
    targetId: string,
    message?: string
  ): Promise<SwapRequest> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/teams/${teamId}/oncall/schedules/${scheduleId}/swap-request`,
      { target_id: targetId, message }
    );
    return response.data;
  },

  getSwapRequests: async (workspaceId: string, teamId: string): Promise<SwapRequest[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/teams/${teamId}/oncall/swap-requests`);
    return response.data;
  },

  acceptSwap: async (workspaceId: string, teamId: string, swapId: string): Promise<SwapRequest> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/teams/${teamId}/oncall/swap-requests/${swapId}/accept`
    );
    return response.data;
  },

  declineSwap: async (
    workspaceId: string,
    teamId: string,
    swapId: string,
    responseMessage?: string
  ): Promise<SwapRequest> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/teams/${teamId}/oncall/swap-requests/${swapId}/decline`,
      { response_message: responseMessage }
    );
    return response.data;
  },

  // Override
  createOverride: async (
    workspaceId: string,
    teamId: string,
    scheduleId: string,
    newDeveloperId: string,
    reason?: string
  ): Promise<OnCallSchedule> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/teams/${teamId}/oncall/schedules/${scheduleId}/override`,
      { new_developer_id: newDeveloperId, reason }
    );
    return response.data;
  },
};

// ============ Google Calendar API ============

export const googleCalendarApi = {
  getConnectUrl: async (workspaceId: string): Promise<{ auth_url: string }> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/google-calendar/connect`);
    return response.data;
  },

  getStatus: async (workspaceId: string): Promise<GoogleCalendarStatus> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/google-calendar/status`);
    return response.data;
  },

  listCalendars: async (workspaceId: string): Promise<{ calendars: GoogleCalendarInfo[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/google-calendar/calendars`);
    return response.data;
  },

  selectCalendar: async (workspaceId: string, teamId: string, calendarId: string): Promise<void> => {
    await api.post(`/workspaces/${workspaceId}/integrations/google-calendar/select-calendar/${teamId}`, {
      calendar_id: calendarId,
    });
  },

  disconnect: async (workspaceId: string): Promise<void> => {
    await api.post(`/workspaces/${workspaceId}/integrations/google-calendar/disconnect`);
  },

  sync: async (workspaceId: string, teamId: string): Promise<{ status: string; synced_count: number }> => {
    const response = await api.post(`/workspaces/${workspaceId}/integrations/google-calendar/sync`, null, {
      params: { team_id: teamId },
    });
    return response.data;
  },
};

// ============ Document Types ============

export type DocumentStatus = "draft" | "generating" | "generated" | "failed";
export type DocumentLinkType = "file" | "directory";
export type DocumentPermission = "view" | "comment" | "edit" | "admin";
export type DocumentVisibility = "private" | "workspace" | "public";
export type DocumentNotificationType = "comment" | "mention" | "share" | "edit";
export type TemplateCategory = "api_docs" | "readme" | "function_docs" | "module_docs" | "guides" | "changelog" | "custom" | "general";
export type DocumentSpaceRole = "admin" | "editor" | "viewer";

export interface DocumentTreeItem {
  id: string;
  title: string;
  icon: string | null;
  parent_id: string | null;
  space_id: string | null;
  space_name: string | null;
  position: number;
  visibility: DocumentVisibility;
  created_by_id: string | null;
  is_favorited: boolean;
  has_children: boolean;
  children: DocumentTreeItem[];
  created_at: string;
  updated_at: string;
}

// Document Spaces
export interface DocumentSpace {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  is_archived: boolean;
  member_count: number;
  document_count: number;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentSpaceListItem {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  is_archived: boolean;
  member_count: number;
  document_count: number;
}

export interface DocumentSpaceMember {
  id: string;
  space_id: string;
  developer_id: string;
  developer_name: string | null;
  developer_email: string | null;
  developer_avatar: string | null;
  role: DocumentSpaceRole;
  invited_by_id: string | null;
  invited_by_name: string | null;
  joined_at: string | null;
  created_at: string;
}

export interface DocumentSpaceCreate {
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
}

export interface DocumentSpaceUpdate {
  name?: string | null;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_archived?: boolean | null;
}

export interface DocumentSpaceMemberAdd {
  developer_id: string;
  role?: DocumentSpaceRole;
}

export interface Document {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  title: string;
  content: Record<string, unknown>;
  content_text: string | null;
  icon: string | null;
  cover_image: string | null;
  is_template: boolean;
  is_published: boolean;
  published_at: string | null;
  visibility: DocumentVisibility;
  generation_status: DocumentStatus;
  last_generated_at: string | null;
  created_by_id: string | null;
  created_by_name: string | null;
  created_by_avatar: string | null;
  last_edited_by_id: string | null;
  last_edited_by_name: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentListItem {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  generation_status: DocumentStatus;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  content: Record<string, unknown>;
  content_diff: Record<string, unknown> | null;
  created_by_id: string | null;
  created_by_name: string | null;
  created_by_avatar: string | null;
  change_summary: string | null;
  is_auto_save: boolean;
  is_auto_generated: boolean;
  created_at: string;
}

export interface DocumentTemplate {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  category: TemplateCategory;
  icon: string | null;
  content_template: Record<string, unknown>;
  prompt_template: string;
  system_prompt: string | null;
  variables: string[];
  is_system: boolean;
  is_active: boolean;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  category: TemplateCategory;
  icon: string | null;
  is_system: boolean;
  variables: string[];
}

export interface DocumentCodeLink {
  id: string;
  document_id: string;
  repository_id: string;
  repository_name: string | null;
  path: string;
  link_type: DocumentLinkType;
  branch: string;
  document_section_id: string | null;
  last_commit_sha: string | null;
  last_content_hash: string | null;
  last_synced_at: string | null;
  has_pending_changes: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentCollaborator {
  id: string;
  document_id: string;
  developer_id: string;
  developer_name: string | null;
  developer_email: string | null;
  developer_avatar: string | null;
  permission: DocumentPermission;
  invited_by_id: string | null;
  invited_by_name: string | null;
  invited_at: string;
}

export interface GitHubSyncConfig {
  id: string;
  document_id: string;
  repository_id: string;
  repository_name: string | null;
  file_path: string;
  branch: string;
  sync_direction: "export_only" | "import_only" | "bidirectional";
  auto_export: boolean;
  auto_import: boolean;
  last_exported_at: string | null;
  last_imported_at: string | null;
  last_export_commit: string | null;
  last_import_commit: string | null;
  created_at: string;
}

export interface DocumentCreate {
  title?: string;
  content?: Record<string, unknown>;
  parent_id?: string;
  template_id?: string;
  space_id?: string;
  icon?: string;
  cover_image?: string;
  visibility?: DocumentVisibility;
}

export interface DocumentUpdate {
  title?: string;
  content?: Record<string, unknown>;
  icon?: string;
  cover_image?: string;
  visibility?: DocumentVisibility;
  is_auto_save?: boolean;
}

// Notification types
export interface DocumentNotification {
  id: string;
  document_id: string;
  document_title: string | null;
  document_icon: string | null;
  type: DocumentNotificationType;
  message: string;
  is_read: boolean;
  created_by_id: string | null;
  created_by_name: string | null;
  created_by_avatar: string | null;
  created_at: string;
  read_at: string | null;
}

export interface DocumentNotificationList {
  notifications: DocumentNotification[];
  total: number;
  unread_count: number;
}

// Ancestor (breadcrumb) types
export interface DocumentAncestor {
  id: string;
  title: string;
  icon: string | null;
}

// ============ Document API ============

export const documentApi = {
  // Document CRUD
  create: async (workspaceId: string, data: DocumentCreate): Promise<Document> => {
    const response = await api.post(`/workspaces/${workspaceId}/documents`, data);
    return response.data;
  },

  list: async (
    workspaceId: string,
    options?: { parent_id?: string; search?: string; limit?: number; offset?: number }
  ): Promise<DocumentListItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/documents`, { params: options });
    return response.data;
  },

  getTree: async (
    workspaceId: string,
    options?: { parent_id?: string; include_templates?: boolean; visibility?: DocumentVisibility; space_id?: string }
  ): Promise<DocumentTreeItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/documents/tree`, { params: options });
    return response.data;
  },

  // Favorites
  getFavorites: async (workspaceId: string): Promise<DocumentTreeItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/documents/favorites`);
    return response.data;
  },

  toggleFavorite: async (workspaceId: string, documentId: string): Promise<{ is_favorited: boolean }> => {
    const response = await api.post(`/workspaces/${workspaceId}/documents/${documentId}/favorite`);
    return response.data;
  },

  // Ancestors (Breadcrumbs)
  getAncestors: async (workspaceId: string, documentId: string): Promise<DocumentAncestor[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/documents/${documentId}/ancestors`);
    return response.data;
  },

  // Notifications
  getNotifications: async (
    workspaceId: string,
    options?: { unread_only?: boolean; limit?: number; offset?: number }
  ): Promise<DocumentNotificationList> => {
    const response = await api.get(`/workspaces/${workspaceId}/documents/notifications`, { params: options });
    return response.data;
  },

  markNotificationRead: async (workspaceId: string, notificationId: string): Promise<{ success: boolean }> => {
    const response = await api.post(`/workspaces/${workspaceId}/documents/notifications/${notificationId}/read`);
    return response.data;
  },

  markAllNotificationsRead: async (workspaceId: string): Promise<{ marked_read: number }> => {
    const response = await api.post(`/workspaces/${workspaceId}/documents/notifications/mark-all-read`);
    return response.data;
  },

  get: async (workspaceId: string, documentId: string): Promise<Document> => {
    const response = await api.get(`/workspaces/${workspaceId}/documents/${documentId}`);
    return response.data;
  },

  update: async (workspaceId: string, documentId: string, data: DocumentUpdate): Promise<Document> => {
    const response = await api.patch(`/workspaces/${workspaceId}/documents/${documentId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, documentId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/documents/${documentId}`);
  },

  move: async (
    workspaceId: string,
    documentId: string,
    data: { new_parent_id?: string; position: number }
  ): Promise<Document> => {
    const response = await api.post(`/workspaces/${workspaceId}/documents/${documentId}/move`, data);
    return response.data;
  },

  duplicate: async (
    workspaceId: string,
    documentId: string,
    includeChildren?: boolean
  ): Promise<Document> => {
    const response = await api.post(`/workspaces/${workspaceId}/documents/${documentId}/duplicate`, null, {
      params: { include_children: includeChildren },
    });
    return response.data;
  },

  // Version History
  getVersions: async (
    workspaceId: string,
    documentId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<DocumentVersion[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/documents/${documentId}/versions`, {
      params: options,
    });
    return response.data;
  },

  restoreVersion: async (workspaceId: string, documentId: string, versionId: string): Promise<Document> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/documents/${documentId}/restore/${versionId}`
    );
    return response.data;
  },

  // Code Links
  createCodeLink: async (
    workspaceId: string,
    documentId: string,
    data: {
      repository_id: string;
      path: string;
      link_type?: DocumentLinkType;
      branch?: string;
      section_id?: string;
    }
  ): Promise<DocumentCodeLink> => {
    const response = await api.post(`/workspaces/${workspaceId}/documents/${documentId}/code-links`, data);
    return response.data;
  },

  getCodeLinks: async (workspaceId: string, documentId: string): Promise<DocumentCodeLink[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/documents/${documentId}/code-links`);
    return response.data;
  },

  deleteCodeLink: async (workspaceId: string, documentId: string, linkId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/documents/${documentId}/code-links/${linkId}`);
  },

  // Collaborators
  addCollaborator: async (
    workspaceId: string,
    documentId: string,
    data: { developer_id: string; permission?: DocumentPermission }
  ): Promise<DocumentCollaborator> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/documents/${documentId}/collaborators`,
      data
    );
    return response.data;
  },

  updateCollaborator: async (
    workspaceId: string,
    documentId: string,
    developerId: string,
    permission: DocumentPermission
  ): Promise<void> => {
    await api.patch(`/workspaces/${workspaceId}/documents/${documentId}/collaborators/${developerId}`, {
      permission,
    });
  },

  removeCollaborator: async (workspaceId: string, documentId: string, developerId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/documents/${documentId}/collaborators/${developerId}`);
  },

  // AI Generation
  generate: async (
    workspaceId: string,
    documentId: string,
    templateCategory?: string
  ): Promise<{ status: string; document_id: string; content: Record<string, unknown> }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/documents/${documentId}/generate`,
      null,
      { params: { template_category: templateCategory || "function_docs" } }
    );
    return response.data;
  },

  generateFromCode: async (
    workspaceId: string,
    code: string,
    options?: {
      template_category?: string;
      file_path?: string;
      language?: string;
    }
  ): Promise<{ status: string; content: Record<string, unknown> }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/documents/generate-from-code`,
      null,
      {
        params: {
          code,
          template_category: options?.template_category || "function_docs",
          file_path: options?.file_path,
          language: options?.language,
        },
      }
    );
    return response.data;
  },

  generateFromRepository: async (
    workspaceId: string,
    options: {
      repository_id: string;
      path?: string;
      branch?: string;
      template_category?: string;
      custom_prompt?: string;
    }
  ): Promise<{
    status: string;
    content: Record<string, unknown>;
    repository: string;
    path: string;
    branch: string;
  }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/documents/generate-from-repository`,
      null,
      {
        params: {
          repository_id: options.repository_id,
          path: options.path || "",
          branch: options.branch || "main",
          template_category: options.template_category || "module_docs",
          custom_prompt: options.custom_prompt || undefined,
        },
      }
    );
    return response.data;
  },

  suggestImprovements: async (
    workspaceId: string,
    documentId: string
  ): Promise<{
    status: string;
    document_id: string;
    suggestions: {
      quality_score: number;
      improvements: Array<{
        priority: string;
        section: string;
        issue: string;
        suggestion: string;
      }>;
      missing_sections: string[];
      overall_assessment: string;
    };
  }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/documents/${documentId}/suggest-improvements`
    );
    return response.data;
  },

  // GitHub Sync
  setupGitHubSync: async (
    workspaceId: string,
    documentId: string,
    options: {
      repository_id: string;
      file_path: string;
      branch?: string;
      sync_direction?: "export_only" | "import_only" | "bidirectional";
      auto_export?: boolean;
      auto_import?: boolean;
    }
  ): Promise<GitHubSyncConfig> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/documents/${documentId}/github-sync`,
      null,
      { params: options }
    );
    return response.data;
  },

  getGitHubSyncConfigs: async (
    workspaceId: string,
    documentId: string
  ): Promise<GitHubSyncConfig[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/documents/${documentId}/github-sync`
    );
    return response.data;
  },

  exportToGitHub: async (
    workspaceId: string,
    documentId: string,
    syncId: string,
    commitMessage?: string
  ): Promise<{ status: string; commit_sha?: string; file_path?: string; branch?: string; message?: string }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/documents/${documentId}/github-sync/${syncId}/export`,
      null,
      { params: { commit_message: commitMessage } }
    );
    return response.data;
  },

  importFromGitHub: async (
    workspaceId: string,
    documentId: string,
    syncId: string,
    createVersion?: boolean
  ): Promise<{ status: string; file_sha?: string; file_path?: string; title?: string; message?: string }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/documents/${documentId}/github-sync/${syncId}/import`,
      null,
      { params: { create_version: createVersion ?? true } }
    );
    return response.data;
  },

  deleteGitHubSync: async (workspaceId: string, documentId: string, syncId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/documents/${documentId}/github-sync/${syncId}`);
  },
};

// ============ Template API ============

export const templateApi = {
  list: async (options?: {
    workspace_id?: string;
    category?: TemplateCategory;
    include_system?: boolean;
  }): Promise<TemplateListItem[]> => {
    const response = await api.get("/templates", { params: options });
    return response.data;
  },

  get: async (templateId: string): Promise<DocumentTemplate> => {
    const response = await api.get(`/templates/${templateId}`);
    return response.data;
  },

  create: async (
    workspaceId: string,
    data: {
      name: string;
      category: TemplateCategory;
      content_template: Record<string, unknown>;
      prompt_template: string;
      variables: string[];
      description?: string;
      icon?: string;
      system_prompt?: string;
    }
  ): Promise<DocumentTemplate> => {
    const response = await api.post("/templates", data, { params: { workspace_id: workspaceId } });
    return response.data;
  },

  duplicate: async (templateId: string, workspaceId: string): Promise<DocumentTemplate> => {
    const response = await api.post(`/templates/${templateId}/duplicate`, null, {
      params: { workspace_id: workspaceId },
    });
    return response.data;
  },
};

// ============ Document Space API ============

export const spaceApi = {
  // Space CRUD
  list: async (
    workspaceId: string,
    options?: { include_archived?: boolean }
  ): Promise<DocumentSpaceListItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/spaces`, { params: options });
    return response.data;
  },

  create: async (workspaceId: string, data: DocumentSpaceCreate): Promise<DocumentSpace> => {
    const response = await api.post(`/workspaces/${workspaceId}/spaces`, data);
    return response.data;
  },

  get: async (workspaceId: string, spaceId: string): Promise<DocumentSpace> => {
    const response = await api.get(`/workspaces/${workspaceId}/spaces/${spaceId}`);
    return response.data;
  },

  update: async (
    workspaceId: string,
    spaceId: string,
    data: DocumentSpaceUpdate
  ): Promise<DocumentSpace> => {
    const response = await api.patch(`/workspaces/${workspaceId}/spaces/${spaceId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, spaceId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/spaces/${spaceId}`);
  },

  // Members
  getMembers: async (workspaceId: string, spaceId: string): Promise<DocumentSpaceMember[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/spaces/${spaceId}/members`);
    return response.data;
  },

  addMember: async (
    workspaceId: string,
    spaceId: string,
    data: DocumentSpaceMemberAdd
  ): Promise<DocumentSpaceMember> => {
    const response = await api.post(`/workspaces/${workspaceId}/spaces/${spaceId}/members`, data);
    return response.data;
  },

  updateMemberRole: async (
    workspaceId: string,
    spaceId: string,
    memberId: string,
    role: DocumentSpaceRole
  ): Promise<void> => {
    await api.patch(`/workspaces/${workspaceId}/spaces/${spaceId}/members/${memberId}`, { role });
  },

  removeMember: async (workspaceId: string, spaceId: string, memberId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/spaces/${spaceId}/members/${memberId}`);
  },

  addAllWorkspaceMembers: async (
    workspaceId: string,
    spaceId: string
  ): Promise<{ added_count: number }> => {
    const response = await api.post(`/workspaces/${workspaceId}/spaces/${spaceId}/members/add-all`);
    return response.data;
  },
};

// ============ Tracking Types ============

export type TrackingSource = "slack_command" | "slack_channel" | "web" | "api" | "inferred";
export type BlockerSeverity = "low" | "medium" | "high" | "critical";
export type BlockerCategory = "technical" | "dependency" | "resource" | "external" | "process" | "other";
export type BlockerStatus = "active" | "resolved" | "escalated";
export type WorkLogType = "progress" | "note" | "question" | "decision" | "update";
export type ChannelType = "standup" | "team" | "project" | "general";

export interface Standup {
  id: string;
  developer_id: string;
  team_id: string;
  sprint_id: string | null;
  workspace_id: string;
  standup_date: string;
  yesterday_summary: string;
  today_plan: string;
  blockers_summary: string | null;
  source: TrackingSource;
  slack_message_ts: string | null;
  slack_channel_id: string | null;
  parsed_tasks: Record<string, unknown>[] | null;
  parsed_blockers: Record<string, unknown>[] | null;
  sentiment_score: number | null;
  productivity_signals: Record<string, unknown> | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  developer_name: string | null;
  developer_avatar: string | null;
  // Nested developer object (optional - may be included in expanded responses)
  developer?: { id: string; name: string | null; email: string | null; avatar_url: string | null };
}

export interface StandupCreate {
  team_id: string;
  sprint_id?: string;
  standup_date?: string;
  yesterday_summary: string;
  today_plan: string;
  blockers_summary?: string;
  source?: TrackingSource;
}

export interface StandupListResponse {
  standups: Standup[];
  total: number;
  page: number;
  page_size: number;
}

export interface WorkLog {
  id: string;
  developer_id: string;
  task_id: string | null;
  sprint_id: string | null;
  workspace_id: string;
  notes: string;
  log_type: WorkLogType;
  source: TrackingSource;
  slack_message_ts: string | null;
  slack_channel_id: string | null;
  external_task_ref: string | null;
  logged_at: string;
  created_at: string;
  developer_name: string | null;
  task_title: string | null;
}

export interface WorkLogCreate {
  task_id?: string;
  external_task_ref?: string;
  sprint_id?: string;
  notes: string;
  log_type?: WorkLogType;
  source?: TrackingSource;
}

export interface WorkLogListResponse {
  logs: WorkLog[];
  total: number;
  page: number;
  page_size: number;
}

export interface TimeEntry {
  id: string;
  developer_id: string;
  task_id: string | null;
  sprint_id: string | null;
  workspace_id: string;
  duration_minutes: number;
  description: string | null;
  entry_date: string;
  started_at: string | null;
  ended_at: string | null;
  source: TrackingSource;
  slack_message_ts: string | null;
  is_inferred: boolean;
  confidence_score: number | null;
  inference_metadata: Record<string, unknown> | null;
  external_task_ref: string | null;
  created_at: string;
  updated_at: string;
  developer_name: string | null;
  task_title: string | null;
  // Nested objects (optional - may be included in expanded responses)
  task?: { id: string; title: string };
  developer?: { id: string; name: string | null; email: string | null };
}

export interface TimeEntryCreate {
  task_id?: string;
  external_task_ref?: string;
  sprint_id?: string;
  duration_minutes: number;
  description?: string;
  entry_date?: string;
  started_at?: string;
  ended_at?: string;
  source?: TrackingSource;
}

export interface TimeEntryListResponse {
  entries: TimeEntry[];
  total: number;
  total_minutes: number;
  page: number;
  page_size: number;
}

export interface Blocker {
  id: string;
  developer_id: string;
  task_id: string | null;
  sprint_id: string | null;
  team_id: string;
  workspace_id: string;
  description: string;
  severity: BlockerSeverity;
  category: BlockerCategory;
  status: BlockerStatus;
  resolved_at: string | null;
  resolution_notes: string | null;
  resolved_by_id: string | null;
  source: TrackingSource;
  slack_message_ts: string | null;
  slack_channel_id: string | null;
  standup_id: string | null;
  escalated_to_id: string | null;
  escalated_at: string | null;
  escalation_notes: string | null;
  external_task_ref: string | null;
  reported_at: string;
  created_at: string;
  updated_at: string;
  developer_name: string | null;
  resolved_by_name: string | null;
  escalated_to_name: string | null;
  task_title: string | null;
  // Nested objects (optional - may be included in expanded responses)
  task?: { id: string; title: string };
  developer?: { id: string; name: string | null; email: string | null };
  escalated_to?: { id: string; name: string | null; email: string | null };
}

export interface BlockerCreate {
  team_id: string;
  task_id?: string;
  external_task_ref?: string;
  sprint_id?: string;
  description: string;
  severity?: BlockerSeverity;
  category?: BlockerCategory;
  source?: TrackingSource;
}

export interface BlockerListResponse {
  blockers: Blocker[];
  total: number;
  active_count: number;
  resolved_count: number;
  escalated_count: number;
  page: number;
  page_size: number;
}

export interface TodayStandupStatus {
  submitted: boolean;
  standup_id: string | null;
  submitted_at: string | null;
}

export interface ActiveTaskSummary {
  task_id: string;
  task_title: string;
  status: string;
  time_logged_today: number;
  total_time_logged: number;
  last_activity: string | null;
}

export interface WeeklySummary {
  standups_submitted: number;
  standups_expected: number;
  total_time_logged: number;
  work_logs_count: number;
  blockers_reported: number;
  blockers_resolved: number;
}

export interface IndividualDashboard {
  developer_id: string;
  developer_name: string | null;
  today_standup: TodayStandupStatus;
  active_tasks: ActiveTaskSummary[];
  active_blockers: Blocker[];
  time_logged_today: number;
  time_logged_this_week?: number;
  weekly_summary: WeeklySummary;
  activity_pattern: Record<string, unknown> | null;
  standup_streak?: number;
  has_standup_today?: boolean;
  time_entries?: TimeEntry[];
  resolved_blockers_count?: number;
  work_logs?: WorkLog[];
  todays_standup?: Standup;
  recent_standups?: Standup[];
}

export interface TeamMemberStandupStatus {
  developer_id: string;
  developer_name: string;
  developer_avatar: string | null;
  submitted: boolean;
  submitted_at: string | null;
}

export interface TeamMemberSummary {
  developer_id: string;
  name?: string;
  email?: string;
  avatar_url?: string | null;
  has_standup_today?: boolean;
  time_logged_today?: number;
  time_logged_this_week?: number;
  active_blockers_count?: number;
  todays_standup?: Standup;
}

export interface TeamDashboard {
  team_id: string;
  team_name: string | null;
  today_date: string;
  standup_completion: TeamMemberStandupStatus[];
  participation_rate: number;
  active_blockers: Blocker[];
  escalated_blockers?: Blocker[];
  resolved_blockers?: Blocker[];
  blockers_by_severity: Record<string, number>;
  sprint_progress: Record<string, unknown> | null;
  total_time_logged_today: number;
  total_time_logged?: number;
  recent_work_logs: WorkLog[];
  member_summaries?: TeamMemberSummary[];
  resolved_blockers_count?: number;
  sprint_completion_rate?: number;
  completed_tasks?: number;
  total_tasks?: number;
}

export interface SlackChannelConfig {
  id: string;
  integration_id: string;
  team_id: string;
  workspace_id: string;
  channel_id: string;
  channel_name: string;
  channel_type: ChannelType;
  auto_parse_standups: boolean;
  auto_parse_task_refs: boolean;
  auto_parse_blockers: boolean;
  standup_prompt_time: string | null;
  standup_format_hint: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SlackChannelConfigCreate {
  integration_id: string;
  team_id: string;
  channel_id: string;
  channel_name: string;
  channel_type?: ChannelType;
  auto_parse_standups?: boolean;
  auto_parse_task_refs?: boolean;
  auto_parse_blockers?: boolean;
  standup_prompt_time?: string;
  standup_format_hint?: string;
}

// ============ Analytics Types ============

export interface TeamAnalytics {
  team_id: string;
  team_name: string;
  date_range: { start_date: string; end_date: string };
  metrics: {
    total_standups: number;
    standup_participation_rate: number;
    total_time_logged: number;
    avg_time_per_day: number;
    total_blockers_reported: number;
    total_blockers_resolved: number;
    avg_blocker_resolution_hours: number;
  };
  trends: {
    standups_by_day: Array<{ date: string; count: number }>;
    time_by_day: Array<{ date: string; minutes: number }>;
    blockers_by_day: Array<{ date: string; reported: number; resolved: number }>;
  };
  sentiment_analysis: {
    average_score: number;
    trend: number;
    distribution: { positive: number; neutral: number; negative: number };
  };
  member_metrics: Array<{
    developer_id: string;
    name: string;
    avatar_url?: string;
    standups_submitted: number;
    time_logged: number;
    blockers_reported: number;
    sentiment_avg: number;
    streak_days: number;
  }>;
}

export interface BlockerAnalytics {
  team_id: string;
  date_range: { start_date: string; end_date: string };
  summary: {
    total_reported: number;
    total_resolved: number;
    total_escalated: number;
    currently_active: number;
    avg_resolution_time_hours: number;
    avg_escalation_time_hours: number;
  };
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  sla_metrics: {
    within_sla: number;
    breached_sla: number;
    avg_time_to_first_response_hours: number;
  };
  trends: {
    reported_by_day: Array<{ date: string; count: number }>;
    resolved_by_day: Array<{ date: string; count: number }>;
    avg_age_by_day: Array<{ date: string; hours: number }>;
  };
  top_contributors: Array<{
    developer_id: string;
    name: string;
    reported: number;
    resolved: number;
  }>;
}

export interface TimeReport {
  date_range: { start_date: string; end_date: string };
  summary: {
    total_minutes: number;
    total_entries: number;
    avg_per_day: number;
    days_with_entries: number;
  };
  by_project: Array<{ project_id: string; project_name: string; minutes: number; percentage: number }>;
  by_task: Array<{ task_id: string; task_title: string; minutes: number; percentage: number }>;
  by_day: Array<{ date: string; minutes: number; entries: number }>;
  by_week: Array<{ week_start: string; minutes: number; entries: number }>;
}

// ============ Tracking API ============

export const trackingApi = {
  // Standups
  getMyStandups: async (options?: { limit?: number; sprint_id?: string }): Promise<StandupListResponse> => {
    const response = await api.get("/tracking/standups/me", { params: options });
    return response.data;
  },

  getTeamStandups: async (teamId: string, date?: string): Promise<Standup[]> => {
    const response = await api.get(`/tracking/standups/team/${teamId}`, { params: { standup_date: date } });
    return response.data;
  },

  submitStandup: async (data: StandupCreate): Promise<Standup> => {
    const response = await api.post("/tracking/standups", data);
    return response.data;
  },

  // Work Logs
  getMyLogs: async (options?: { limit?: number; task_id?: string }): Promise<WorkLogListResponse> => {
    const response = await api.get("/tracking/logs/me", { params: options });
    return response.data;
  },

  getTaskLogs: async (taskId: string): Promise<WorkLog[]> => {
    const response = await api.get(`/tracking/logs/task/${taskId}`);
    return response.data;
  },

  createLog: async (data: WorkLogCreate): Promise<WorkLog> => {
    const response = await api.post("/tracking/logs", data);
    return response.data;
  },

  // Time Entries
  getMyTimeEntries: async (options?: { start_date?: string; end_date?: string }): Promise<TimeEntryListResponse> => {
    const response = await api.get("/tracking/time/me", { params: options });
    return response.data;
  },

  logTime: async (data: TimeEntryCreate): Promise<TimeEntry> => {
    const response = await api.post("/tracking/time", data);
    return response.data;
  },

  getTaskTime: async (taskId: string): Promise<{ task_id: string; total_minutes: number; entry_count: number; entries: TimeEntry[] }> => {
    const response = await api.get(`/tracking/time/task/${taskId}`);
    return response.data;
  },

  // Blockers
  getActiveBlockers: async (teamId?: string): Promise<BlockerListResponse> => {
    const response = await api.get("/tracking/blockers/active", { params: { team_id: teamId } });
    return response.data;
  },

  reportBlocker: async (data: BlockerCreate): Promise<Blocker> => {
    const response = await api.post("/tracking/blockers", data);
    return response.data;
  },

  resolveBlocker: async (blockerId: string, notes?: string): Promise<Blocker> => {
    const response = await api.patch(`/tracking/blockers/${blockerId}/resolve`, { resolution_notes: notes });
    return response.data;
  },

  escalateBlocker: async (blockerId: string, escalateToId: string, notes?: string): Promise<Blocker> => {
    const response = await api.patch(`/tracking/blockers/${blockerId}/escalate`, { escalate_to_id: escalateToId, escalation_notes: notes });
    return response.data;
  },

  // Dashboards
  getMyDashboard: async (): Promise<IndividualDashboard> => {
    const response = await api.get("/tracking/dashboard/me");
    return response.data;
  },

  getTeamDashboard: async (teamId: string): Promise<TeamDashboard> => {
    const response = await api.get(`/tracking/dashboard/team/${teamId}`);
    return response.data;
  },

  // Channel Config
  getChannelConfigs: async (workspaceId: string): Promise<SlackChannelConfig[]> => {
    const response = await api.get("/tracking/channels", { params: { workspace_id: workspaceId } });
    return response.data;
  },

  createChannelConfig: async (data: SlackChannelConfigCreate): Promise<SlackChannelConfig> => {
    const response = await api.post("/tracking/channels", data);
    return response.data;
  },

  updateChannelConfig: async (configId: string, data: Partial<SlackChannelConfigCreate & { is_active?: boolean }>): Promise<SlackChannelConfig> => {
    const response = await api.patch(`/tracking/channels/${configId}`, data);
    return response.data;
  },

  deleteChannelConfig: async (configId: string): Promise<void> => {
    await api.delete(`/tracking/channels/${configId}`);
  },

  // Analytics
  getTeamAnalytics: async (
    teamId: string,
    options?: { start_date?: string; end_date?: string }
  ): Promise<TeamAnalytics> => {
    const response = await api.get(`/tracking/analytics/team/${teamId}`, { params: options });
    return response.data;
  },

  getBlockerAnalytics: async (
    teamId: string,
    options?: { start_date?: string; end_date?: string }
  ): Promise<BlockerAnalytics> => {
    const response = await api.get(`/tracking/analytics/blockers/${teamId}`, { params: options });
    return response.data;
  },

  getTimeReport: async (options?: {
    start_date?: string;
    end_date?: string;
    group_by?: "day" | "week" | "project" | "task";
  }): Promise<TimeReport> => {
    const response = await api.get("/tracking/time/report", { params: options });
    return response.data;
  },

  // Export endpoints
  exportStandups: async (options: {
    start_date: string;
    end_date: string;
    format: "csv" | "pdf" | "json";
    team_id?: string;
  }): Promise<Blob> => {
    const response = await api.get("/tracking/export/standups", {
      params: options,
      responseType: "blob",
    });
    return response.data;
  },

  exportTimesheet: async (options: {
    start_date: string;
    end_date: string;
    format: "csv" | "pdf" | "json";
  }): Promise<Blob> => {
    const response = await api.get("/tracking/export/timesheet", {
      params: options,
      responseType: "blob",
    });
    return response.data;
  },

  exportBlockers: async (options: {
    start_date: string;
    end_date: string;
    format: "csv" | "pdf" | "json";
    team_id?: string;
  }): Promise<Blob> => {
    const response = await api.get("/tracking/export/blockers", {
      params: options,
      responseType: "blob",
    });
    return response.data;
  },
};

// ============ Slack Integration API ============

export interface SlackIntegration {
  id: string;
  organization_id: string;
  team_id: string;
  team_name: string;
  bot_user_id: string;
  is_active: boolean;
  installed_at: string;
  installed_by_id: string;
  user_mappings: Record<string, string>;
}

export const slackApi = {
  // Get install URL
  getInstallUrl: (organizationId: string, installerId: string) => {
    return `${API_BASE_URL}/slack/install?organization_id=${organizationId}&installer_id=${installerId}`;
  },

  // Get integration by organization
  getIntegration: async (organizationId: string): Promise<SlackIntegration | null> => {
    try {
      const response = await api.get(`/slack/integration/org/${organizationId}`);
      return response.data;
    } catch {
      return null;
    }
  },

  // Get integration by ID
  getIntegrationById: async (integrationId: string): Promise<SlackIntegration | null> => {
    try {
      const response = await api.get(`/slack/integration/${integrationId}`);
      return response.data;
    } catch {
      return null;
    }
  },

  // Update integration
  updateIntegration: async (integrationId: string, data: {
    is_active?: boolean;
    notification_preferences?: Record<string, boolean>;
  }): Promise<SlackIntegration> => {
    const response = await api.put(`/slack/integration/${integrationId}`, data);
    return response.data;
  },

  // Disconnect/uninstall
  disconnect: async (integrationId: string): Promise<void> => {
    await api.delete(`/slack/integration/${integrationId}`);
  },

  // Get notification logs
  getNotificationLogs: async (integrationId: string, limit = 50): Promise<Array<{
    id: string;
    channel_id: string;
    notification_type: string;
    success: boolean;
    error_message?: string;
    sent_at: string;
  }>> => {
    const response = await api.get(`/slack/integration/${integrationId}/logs`, { params: { limit } });
    return response.data;
  },

  // Map user
  mapUser: async (integrationId: string, slackUserId: string, developerId: string): Promise<void> => {
    await api.post(`/slack/integration/${integrationId}/user-mapping`, {
      slack_user_id: slackUserId,
      developer_id: developerId,
    });
  },

  // Unmap user
  unmapUser: async (integrationId: string, slackUserId: string): Promise<void> => {
    await api.delete(`/slack/integration/${integrationId}/user-mapping/${slackUserId}`);
  },
};

// ============ Slack Sync API ============

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members: number;
}

export interface SlackConfiguredChannel {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_type: string;
  team_id: string;
  is_active: boolean;
  auto_parse_standups: boolean;
  auto_parse_task_refs: boolean;
  auto_parse_blockers: boolean;
}

export interface SlackUserMappingStats {
  total_slack_users: number;
  total_developers: number;
  newly_mapped: number;
  already_mapped: number;
  unmapped: number;
}

export interface SlackImportStats {
  channels_processed: number;
  total_messages: number;
  standups_imported: number;
  work_logs_imported: number;
  blockers_imported: number;
  skipped: number;
  errors: Array<{ channel: string; error: string }>;
}

export const slackSyncApi = {
  // Get available Slack channels
  getChannels: async (integrationId: string): Promise<{ channels: SlackChannel[] }> => {
    const response = await api.get(`/slack/integration/${integrationId}/channels`);
    return response.data;
  },

  // Get configured channels for monitoring
  getConfiguredChannels: async (integrationId: string): Promise<{ channels: SlackConfiguredChannel[] }> => {
    const response = await api.get(`/slack/integration/${integrationId}/configured-channels`);
    return response.data;
  },

  // Configure a channel for monitoring
  configureChannel: async (
    integrationId: string,
    data: {
      channel_id: string;
      channel_name: string;
      slack_team_id: string;  // Slack team ID (e.g., T18A883UL)
      team_id?: string;  // Internal team UUID (optional)
      channel_type?: string;
      auto_parse_standups?: boolean;
      auto_parse_task_refs?: boolean;
      auto_parse_blockers?: boolean;
    }
  ): Promise<SlackConfiguredChannel> => {
    const response = await api.post(`/slack/integration/${integrationId}/configure-channel`, data);
    return response.data;
  },

  // Remove channel config
  removeChannelConfig: async (integrationId: string, configId: string): Promise<void> => {
    await api.delete(`/slack/integration/${integrationId}/configured-channels/${configId}`);
  },

  // Import Slack history (async task)
  importHistory: async (
    integrationId: string,
    options?: {
      channel_ids?: string[];
      days_back?: number;
      team_id?: string;
      sprint_id?: string;
    }
  ): Promise<{ task_id: string; status: string; message: string }> => {
    const response = await api.post(`/slack/integration/${integrationId}/import-history`, options || {});
    return response.data;
  },

  // Trigger immediate sync
  syncChannels: async (integrationId: string): Promise<{ task_id: string; status: string; message: string }> => {
    const response = await api.post(`/slack/integration/${integrationId}/sync`);
    return response.data;
  },

  // Auto-map Slack users to developers
  autoMapUsers: async (integrationId: string): Promise<SlackUserMappingStats> => {
    const response = await api.post(`/slack/integration/${integrationId}/auto-map-users`);
    return response.data;
  },
};

// ==================== Ticketing Types ====================

export type TicketFormAuthMode = "anonymous" | "email_verification";
export type TicketFormTemplateType = "bug_report" | "feature_request" | "support";
export type TicketStatus = "new" | "acknowledged" | "in_progress" | "waiting_on_submitter" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketSeverity = "critical" | "high" | "medium" | "low";
export type EscalationLevel = "level_1" | "level_2" | "level_3" | "level_4";
export type NotificationChannel = "email" | "slack" | "in_app";
export type TicketFieldType = "text" | "textarea" | "email" | "number" | "select" | "multiselect" | "checkbox" | "file" | "date" | "datetime";

export interface EscalationRule {
  level: EscalationLevel;
  delay_minutes: number;
  notify_users?: string[];
  notify_teams?: string[];
  notify_oncall?: boolean;
  channels: NotificationChannel[];
}

export interface EscalationMatrix {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  severity_levels: TicketSeverity[];
  rules: EscalationRule[];
  form_ids?: string[];
  team_ids?: string[];
  priority_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketEscalation {
  id: string;
  ticket_id: string;
  escalation_matrix_id: string;
  level: EscalationLevel;
  triggered_at: string;
  notified_users: string[];
  notified_channels: NotificationChannel[];
  acknowledged_at?: string;
  acknowledged_by_id?: string;
}

export interface FieldOption {
  value: string;
  label: string;
}

export interface ValidationRules {
  // Common validation type preset
  validation_type?: string;

  // Length constraints
  min_length?: number;
  max_length?: number;

  // Number constraints
  min?: number;
  max?: number;

  // Pattern matching
  pattern?: string;
  pattern_message?: string;

  // File upload constraints
  allowed_file_types?: string[];
  max_file_size_mb?: number;

  // Date constraints
  min_date?: string;
  max_date?: string;

  // Custom error message
  custom_message?: string;
}

export interface ExternalMappings {
  github?: string;
  jira?: string;
  linear?: string;
}

export interface TicketFormField {
  id: string;
  form_id: string;
  name: string;
  field_key: string;
  field_type: TicketFieldType;
  placeholder?: string;
  default_value?: string;
  help_text?: string;
  is_required: boolean;
  validation_rules: ValidationRules;
  options?: FieldOption[];
  position: number;
  is_visible: boolean;
  external_mappings: ExternalMappings;
  created_at: string;
  updated_at: string;
}

export interface FormDestinationConfig {
  type: "github" | "jira" | "linear";
  enabled: boolean;
  repository_id?: string;
  labels?: string[];
  project_key?: string;
  issue_type?: string;
  team_id?: string;
}

export interface ConditionalRule {
  field_id: string;
  condition: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
  value?: string;
  target_field_id: string;
  action: "show" | "hide" | "require";
}

export interface FormTheme {
  primary_color?: string;
  logo_url?: string;
  custom_css?: string;
  header_text?: string;
}

export interface TicketForm {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description?: string;
  template_type?: TicketFormTemplateType;
  public_url_token: string;
  is_active: boolean;
  auth_mode: TicketFormAuthMode;
  require_email: boolean;
  theme: FormTheme;
  success_message?: string;
  redirect_url?: string;
  destinations: FormDestinationConfig[];
  auto_create_task: boolean;
  default_team_id?: string;
  auto_assign_oncall: boolean;
  default_severity?: TicketSeverity;
  default_priority?: TicketPriority;
  conditional_rules: ConditionalRule[];
  submission_count: number;
  created_by_id?: string;
  created_at: string;
  updated_at: string;
  fields?: TicketFormField[];
}

export interface TicketFormListItem {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description?: string;
  template_type?: TicketFormTemplateType;
  public_url_token: string;
  is_active: boolean;
  auth_mode: TicketFormAuthMode;
  submission_count: number;
  created_at: string;
  updated_at: string;
}

export interface TicketAttachment {
  filename: string;
  url: string;
  size: number;
  type: string;
}

export interface ExternalIssue {
  platform: "github" | "jira" | "linear";
  issue_id: string;
  issue_url: string;
  synced_at: string;
}

export interface Ticket {
  id: string;
  form_id: string;
  workspace_id: string;
  ticket_number: number;
  submitter_email?: string;
  submitter_name?: string;
  email_verified: boolean;
  field_values: Record<string, unknown>;
  attachments: TicketAttachment[];
  status: TicketStatus;
  priority?: TicketPriority;
  severity?: TicketSeverity;
  assignee_id?: string;
  team_id?: string;
  external_issues: ExternalIssue[];
  linked_task_id?: string;
  first_response_at?: string;
  resolved_at?: string;
  closed_at?: string;
  sla_due_at?: string;
  sla_breached: boolean;
  created_at: string;
  updated_at: string;
  form_name?: string;
  assignee_name?: string;
  team_name?: string;
}

export interface TicketListItem {
  id: string;
  form_id: string;
  ticket_number: number;
  submitter_email?: string;
  submitter_name?: string;
  status: TicketStatus;
  priority?: TicketPriority;
  severity?: TicketSeverity;
  assignee_id?: string;
  sla_breached: boolean;
  created_at: string;
  updated_at: string;
  form_name?: string;
  assignee_name?: string;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_id?: string;
  author_email?: string;
  is_internal: boolean;
  content: string;
  attachments: TicketAttachment[];
  old_status?: string;
  new_status?: string;
  created_at: string;
  author_name?: string;
}

export interface TicketStats {
  total_tickets: number;
  open_tickets: number;
  by_status: Record<string, number>;
  sla_breached: number;
  assigned_to_me?: number;
  unassigned?: number;
}

export interface FormTemplate {
  name: string;
  description: string;
  field_count: number;
}

// ==================== Ticketing API ====================

export const ticketFormsApi = {
  // List templates
  getTemplates: async (workspaceId: string): Promise<Record<string, FormTemplate>> => {
    const response = await api.get(`/workspaces/${workspaceId}/ticket-forms/templates`);
    return response.data;
  },

  // Create from template
  createFromTemplate: async (
    workspaceId: string,
    templateType: TicketFormTemplateType,
    name?: string
  ): Promise<TicketForm> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/ticket-forms/from-template/${templateType}`,
      null,
      { params: { name } }
    );
    return response.data;
  },

  // List forms
  list: async (workspaceId: string, isActive?: boolean): Promise<TicketFormListItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/ticket-forms`, {
      params: { is_active: isActive },
    });
    return response.data;
  },

  // Create form
  create: async (
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      template_type?: TicketFormTemplateType;
      auth_mode?: TicketFormAuthMode;
      require_email?: boolean;
      theme?: FormTheme;
      success_message?: string;
      redirect_url?: string;
      destinations?: FormDestinationConfig[];
      auto_create_task?: boolean;
      default_team_id?: string;
      conditional_rules?: ConditionalRule[];
    }
  ): Promise<TicketForm> => {
    const response = await api.post(`/workspaces/${workspaceId}/ticket-forms`, data);
    return response.data;
  },

  // Get form
  get: async (workspaceId: string, formId: string): Promise<TicketForm> => {
    const response = await api.get(`/workspaces/${workspaceId}/ticket-forms/${formId}`);
    return response.data;
  },

  // Update form
  update: async (
    workspaceId: string,
    formId: string,
    data: Partial<{
      name: string;
      description: string;
      is_active: boolean;
      auth_mode: TicketFormAuthMode;
      require_email: boolean;
      theme: FormTheme;
      success_message: string;
      redirect_url: string;
      destinations: FormDestinationConfig[];
      auto_create_task: boolean;
      default_team_id: string;
      conditional_rules: ConditionalRule[];
    }>
  ): Promise<TicketForm> => {
    const response = await api.patch(`/workspaces/${workspaceId}/ticket-forms/${formId}`, data);
    return response.data;
  },

  // Delete form
  delete: async (workspaceId: string, formId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/ticket-forms/${formId}`);
  },

  // Duplicate form
  duplicate: async (workspaceId: string, formId: string, newName: string): Promise<TicketForm> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/ticket-forms/${formId}/duplicate`,
      null,
      { params: { new_name: newName } }
    );
    return response.data;
  },

  // List fields
  listFields: async (workspaceId: string, formId: string): Promise<TicketFormField[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/ticket-forms/${formId}/fields`);
    return response.data;
  },

  // Add field
  addField: async (
    workspaceId: string,
    formId: string,
    data: {
      name: string;
      field_key: string;
      field_type?: TicketFieldType;
      placeholder?: string;
      default_value?: string;
      help_text?: string;
      is_required?: boolean;
      validation_rules?: ValidationRules;
      options?: FieldOption[];
      position?: number;
      is_visible?: boolean;
      external_mappings?: ExternalMappings;
    }
  ): Promise<TicketFormField> => {
    const response = await api.post(`/workspaces/${workspaceId}/ticket-forms/${formId}/fields`, data);
    return response.data;
  },

  // Update field
  updateField: async (
    workspaceId: string,
    formId: string,
    fieldId: string,
    data: Partial<{
      name: string;
      placeholder: string;
      default_value: string;
      help_text: string;
      is_required: boolean;
      validation_rules: ValidationRules;
      options: FieldOption[];
      position: number;
      is_visible: boolean;
      external_mappings: ExternalMappings;
    }>
  ): Promise<TicketFormField> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/ticket-forms/${formId}/fields/${fieldId}`,
      data
    );
    return response.data;
  },

  // Delete field
  deleteField: async (workspaceId: string, formId: string, fieldId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/ticket-forms/${formId}/fields/${fieldId}`);
  },

  // Reorder fields
  reorderFields: async (
    workspaceId: string,
    formId: string,
    fieldIds: string[]
  ): Promise<TicketFormField[]> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/ticket-forms/${formId}/fields/reorder`,
      { field_ids: fieldIds }
    );
    return response.data;
  },
};

export const ticketsApi = {
  // List tickets
  list: async (
    workspaceId: string,
    params?: {
      form_id?: string;
      status?: TicketStatus[];
      priority?: TicketPriority[];
      assignee_id?: string;
      team_id?: string;
      submitter_email?: string;
      sla_breached?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ tickets: TicketListItem[]; total: number; limit: number; offset: number }> => {
    const response = await api.get(`/workspaces/${workspaceId}/tickets`, { params });
    return response.data;
  },

  // Get stats
  getStats: async (workspaceId: string): Promise<TicketStats> => {
    const response = await api.get(`/workspaces/${workspaceId}/tickets/stats`);
    return response.data;
  },

  // Get ticket
  get: async (workspaceId: string, ticketId: string): Promise<Ticket> => {
    const response = await api.get(`/workspaces/${workspaceId}/tickets/${ticketId}`);
    return response.data;
  },

  // Get ticket by number
  getByNumber: async (workspaceId: string, ticketNumber: number): Promise<Ticket> => {
    const response = await api.get(`/workspaces/${workspaceId}/tickets/number/${ticketNumber}`);
    return response.data;
  },

  // Update ticket
  update: async (
    workspaceId: string,
    ticketId: string,
    data: Partial<{
      status: TicketStatus;
      priority: TicketPriority;
      assignee_id: string;
      team_id: string;
    }>
  ): Promise<Ticket> => {
    const response = await api.patch(`/workspaces/${workspaceId}/tickets/${ticketId}`, data);
    return response.data;
  },

  // Assign ticket
  assign: async (
    workspaceId: string,
    ticketId: string,
    data: { assignee_id?: string; team_id?: string }
  ): Promise<Ticket> => {
    const response = await api.post(`/workspaces/${workspaceId}/tickets/${ticketId}/assign`, data);
    return response.data;
  },

  // Delete ticket
  delete: async (workspaceId: string, ticketId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/tickets/${ticketId}`);
  },

  // List responses
  listResponses: async (
    workspaceId: string,
    ticketId: string,
    includeInternal?: boolean
  ): Promise<TicketComment[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/tickets/${ticketId}/responses`, {
      params: { include_internal: includeInternal },
    });
    return response.data;
  },

  // Add response
  addResponse: async (
    workspaceId: string,
    ticketId: string,
    data: {
      content: string;
      is_internal?: boolean;
      new_status?: TicketStatus;
      attachments?: TicketAttachment[];
    }
  ): Promise<TicketComment> => {
    const response = await api.post(`/workspaces/${workspaceId}/tickets/${ticketId}/responses`, data);
    return response.data;
  },

  // Create task from ticket
  createTaskFromTicket: async (
    workspaceId: string,
    ticketId: string,
    data: {
      project_id: string;
      sprint_id?: string;
      title?: string;
      priority?: string;
    }
  ): Promise<{ task_id: string; task_title: string; linked: boolean }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/tickets/${ticketId}/create-task`,
      data
    );
    return response.data;
  },
};

export const publicFormsApi = {
  // Get public form
  get: async (publicToken: string): Promise<{
    id: string;
    name: string;
    description?: string;
    auth_mode: TicketFormAuthMode;
    require_email: boolean;
    theme: FormTheme;
    thank_you_page?: Record<string, unknown>;
    fields: TicketFormField[];
    conditional_rules: ConditionalRule[];
  }> => {
    const response = await api.get(`/public/forms/${publicToken}`);
    return response.data;
  },

  // Submit form
  submit: async (
    publicToken: string,
    data: {
      submitter_email?: string;
      submitter_name?: string;
      field_values: Record<string, unknown>;
    }
  ): Promise<{
    submission_id: string;
    ticket_number?: number;
    success_message?: string;
    redirect_url?: string;
    requires_email_verification: boolean;
  }> => {
    // Send data with correct field names matching backend schema
    const payload = {
      submitter_email: data.submitter_email,
      submitter_name: data.submitter_name,
      field_values: data.field_values,
    };
    const response = await api.post(`/public/forms/${publicToken}/submit`, payload);
    return response.data;
  },

  // Verify email
  verifyEmail: async (
    publicToken: string,
    token: string
  ): Promise<{ verified: boolean; ticket_number: number }> => {
    const response = await api.post(`/public/forms/${publicToken}/verify-email`, { token });
    return response.data;
  },
};

export const escalationApi = {
  // List escalation matrices
  list: async (workspaceId: string, activeOnly = true): Promise<EscalationMatrix[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/escalation-matrices`, {
      params: { active_only: activeOnly },
    });
    return response.data;
  },

  // Get escalation matrix
  get: async (workspaceId: string, matrixId: string): Promise<EscalationMatrix> => {
    const response = await api.get(`/workspaces/${workspaceId}/escalation-matrices/${matrixId}`);
    return response.data;
  },

  // Create escalation matrix
  create: async (
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      severity_levels: TicketSeverity[];
      rules: EscalationRule[];
      form_ids?: string[];
      team_ids?: string[];
      priority_order?: number;
    }
  ): Promise<EscalationMatrix> => {
    const response = await api.post(`/workspaces/${workspaceId}/escalation-matrices`, data);
    return response.data;
  },

  // Update escalation matrix
  update: async (
    workspaceId: string,
    matrixId: string,
    data: Partial<{
      name: string;
      description: string;
      severity_levels: TicketSeverity[];
      rules: EscalationRule[];
      form_ids: string[];
      team_ids: string[];
      priority_order: number;
      is_active: boolean;
    }>
  ): Promise<EscalationMatrix> => {
    const response = await api.patch(`/workspaces/${workspaceId}/escalation-matrices/${matrixId}`, data);
    return response.data;
  },

  // Delete escalation matrix
  delete: async (workspaceId: string, matrixId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/escalation-matrices/${matrixId}`);
  },

  // List ticket escalations
  listForTicket: async (workspaceId: string, ticketId: string): Promise<TicketEscalation[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/tickets/${ticketId}/escalations`);
    return response.data;
  },

  // Acknowledge escalation
  acknowledge: async (
    workspaceId: string,
    ticketId: string,
    escalationId: string
  ): Promise<TicketEscalation> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/tickets/${ticketId}/escalations/${escalationId}/acknowledge`
    );
    return response.data;
  },
};

// ============================================================================
// Assessment Platform Types
// ============================================================================

export type AssessmentStatus = "draft" | "active" | "completed" | "archived";
export type QuestionType = "code" | "mcq" | "subjective" | "pseudo_code" | "audio_repeat" | "audio_transcribe" | "audio_spoken_answer" | "audio_read_speak";
export type DifficultyLevel = "easy" | "medium" | "hard";
export type InvitationStatus = "pending" | "sent" | "started" | "completed" | "expired";
export type AttemptStatus = "in_progress" | "completed" | "terminated" | "evaluated";
export type StepStatus = "incomplete" | "complete" | "error";

export interface SkillConfig {
  id: string;
  name: string;
  category?: string;
  weight?: number;
}

export interface QuestionTypeConfig {
  code: number;
  mcq: number;
  subjective: number;
  pseudo_code: number;
}

export interface TopicConfig {
  id?: string;
  topic: string;
  subtopics: string[];
  difficulty_level: DifficultyLevel;
  question_types: QuestionTypeConfig;
  fullstack_config?: FullStackConfig;
  estimated_time_minutes: number;
  max_score: number;
  additional_requirements?: string;
}

export interface FullStackConfig {
  type: "frontend" | "backend" | "fullstack" | "devops";
  vm_template: string;
  duration_minutes: number;
  starter_code?: Record<string, unknown>;
  problem_statement?: Record<string, unknown>;
  evaluation_config?: Record<string, unknown>;
}

export interface ScheduleConfig {
  type?: "flexible" | "fixed";
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  time_zone?: string;
  timezone?: string;
  access_window_hours?: number;
  allow_late_submission?: boolean;
  grace_period_minutes?: number;
}

export interface ProctoringSettings {
  enable_webcam?: boolean;
  enable_screen_recording?: boolean;
  enable_face_detection?: boolean;
  enable_tab_tracking?: boolean;
  enable_copy_paste_detection?: boolean;
  enable_fullscreen_enforcement?: boolean;
  allow_calculator?: boolean;
  allow_ide?: boolean;
  // Alternative property names used by wizard
  enabled?: boolean;
  webcam_required?: boolean;
  screen_recording?: boolean;
  fullscreen_required?: boolean;
  face_detection?: boolean;
  tab_switch_detection?: boolean;
}

export interface SecuritySettings {
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  prevent_copy_paste?: boolean;
  prevent_right_click?: boolean;
  prevent_devtools?: boolean;
  require_fullscreen?: boolean;
  max_violations_allowed?: number;
  // Alternative property names used by wizard
  disable_copy_paste?: boolean;
  disable_right_click?: boolean;
  show_one_question_at_time?: boolean;
  prevent_back_navigation?: boolean;
}

export interface CandidateFieldConfig {
  required?: string[];
  optional?: string[];
  custom?: Array<{ name: string; label: string; type: string; required: boolean }>;
  phone_required?: boolean;
  resume_required?: boolean;
  linkedin_required?: boolean;
  github_required?: boolean;
}

export interface EmailTemplateConfig {
  subject: string;
  body: string;
  include_instructions: boolean;
  include_deadline: boolean;
  include_duration: boolean;
}

export interface WizardStepStatus {
  step1: StepStatus;
  step2: StepStatus;
  step3: StepStatus;
  step4: StepStatus;
  step5: StepStatus;
}

export interface WizardStatusResponse {
  current_step: number;
  step_status: WizardStepStatus;
  is_draft: boolean;
  last_saved_at: string | null;
  can_publish: boolean;
  validation_errors: Record<string, string[]>;
}

export interface Assessment {
  id: string;
  organization_id: string;
  created_by: string | null;
  title: string;
  job_designation: string;
  department: string | null;
  experience_min: number;
  experience_max: number;
  include_freshers: boolean;
  skills: SkillConfig[];
  enable_skill_weights: boolean;
  description: string | null;
  schedule: ScheduleConfig | null;
  proctoring_settings: ProctoringSettings | null;
  security_settings: SecuritySettings | null;
  candidate_fields: CandidateFieldConfig | null;
  email_template: EmailTemplateConfig | null;
  total_questions: number;
  total_duration_minutes: number;
  max_score: number;
  status: AssessmentStatus;
  wizard_step: number;
  wizard_step_status: WizardStepStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  topics?: AssessmentTopic[];
  max_attempts?: number;
  passing_score_percent?: number;
  total_candidates?: number;
}

export interface AssessmentSummary {
  id: string;
  title: string;
  job_designation: string;
  status: AssessmentStatus;
  total_questions: number;
  total_duration_minutes: number;
  total_candidates: number;
  completed_candidates: number;
  average_score: number | null;
  created_at: string;
  published_at: string | null;
}

export interface AssessmentTopic {
  id: string;
  assessment_id: string;
  topic: string;
  subtopics: string[];
  difficulty_level: DifficultyLevel;
  question_types: QuestionTypeConfig;
  fullstack_config: FullStackConfig | null;
  estimated_time_minutes: number;
  max_score: number;
  additional_requirements: string | null;
  sequence_order: number;
  created_at: string;
}

export interface MCQOption {
  id: string;
  text: string;
  is_correct: boolean;
  explanation?: string;
}

export interface TestCase {
  id: string;
  input: string;
  expected_output: string;
  is_hidden: boolean;
  weight: number;
  description?: string;
}

export interface QuestionExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface AssessmentQuestion {
  id: string;
  assessment_id: string;
  topic_id: string | null;
  question_type: QuestionType;
  difficulty: DifficultyLevel;
  title: string;
  problem_statement: string;
  input_format: string | null;
  output_format: string | null;
  examples: QuestionExample[];
  constraints: string[];
  hints: string[];
  test_cases: TestCase[];
  starter_code: Record<string, string>;
  allowed_languages: string[];
  vm_config: Record<string, unknown> | null;
  options: MCQOption[];
  allow_multiple: boolean;
  sample_answer: string | null;
  key_points: string[];
  audio_url: string | null;
  evaluation_rubric: Record<string, unknown>;
  max_marks: number;
  estimated_time_minutes: number;
  tags: string[];
  sequence_order: number;
  is_ai_generated: boolean;
  created_at: string;
}

export interface AssessmentCandidate {
  id: string;
  organization_id: string;
  email: string;
  name: string;
  phone: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  source: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
}

export interface AssessmentInvitation {
  id: string;
  assessment_id: string;
  candidate_id: string;
  candidate: AssessmentCandidate;
  invitation_token: string;
  status: InvitationStatus;
  invited_at: string;
  email_sent_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  deadline: string | null;
  attempt_count?: number;
  latest_score?: number | null;
  latest_trust_score?: number | null;
  // Alternative flat properties
  candidate_email?: string;
  candidate_name?: string;
  source?: string;
}

export interface AssessmentMetrics {
  total_candidates: number;
  total_invitations: number;
  unique_attempts: number;
  attempt_rate: number;
  completion_rate: number;
  average_score: number | null;
  average_trust_score: number | null;
}

export interface TopicSuggestionResponse {
  topics: TopicConfig[];
  rationale: string | null;
}

export interface CandidateImportResponse {
  total: number;
  imported: number;
  duplicates: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

export interface PrePublishCheckResponse {
  can_publish: boolean;
  warnings: string[];
  errors: string[];
  issues: string[];  // Step-specific issues with step references for UI display
  checklist: Record<string, boolean>;
}

export interface PublishResponse {
  assessment_id: string;
  status: AssessmentStatus;
  published_at: string;
  total_invitations: number;
  emails_sent: number;
  public_link: string | null;
}

// ============================================================================
// Assessment Platform API
// ============================================================================

export const assessmentApi = {
  // CRUD Operations
  create: async (data: {
    title: string;
    job_designation?: string;
    organization_id: string;
  }): Promise<Assessment> => {
    const response = await api.post("/assessments", data);
    return response.data;
  },

  list: async (
    organizationId: string,
    options?: {
      status?: AssessmentStatus;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ items: AssessmentSummary[]; total: number }> => {
    const response = await api.get("/assessments", {
      params: {
        organization_id: organizationId,
        ...options,
      },
    });
    return response.data;
  },

  get: async (assessmentId: string, organizationId?: string): Promise<Assessment> => {
    const response = await api.get(`/assessments/${assessmentId}`, {
      params: organizationId ? { organization_id: organizationId } : undefined,
    });
    return response.data;
  },

  update: async (
    assessmentId: string,
    data: Partial<Assessment>,
    organizationId?: string
  ): Promise<Assessment> => {
    const response = await api.put(`/assessments/${assessmentId}`, data, {
      params: organizationId ? { organization_id: organizationId } : undefined,
    });
    return response.data;
  },

  delete: async (assessmentId: string, organizationId: string): Promise<void> => {
    await api.delete(`/assessments/${assessmentId}`, {
      params: { organization_id: organizationId },
    });
  },

  clone: async (
    assessmentId: string,
    organizationId: string,
    title?: string
  ): Promise<Assessment> => {
    const response = await api.post(`/assessments/${assessmentId}/clone`, null, {
      params: { organization_id: organizationId, title },
    });
    return response.data;
  },

  // Wizard Operations
  getWizardStatus: async (
    assessmentId: string,
    organizationId: string
  ): Promise<WizardStatusResponse> => {
    const response = await api.get(`/assessments/${assessmentId}/wizard/status`, {
      params: { organization_id: organizationId },
    });
    return response.data;
  },

  saveStep1: async (
    assessmentId: string,
    organizationId: string,
    data: {
      title: string;
      job_designation: string;
      department?: string;
      experience_min: number;
      experience_max: number;
      include_freshers: boolean;
      skills: SkillConfig[];
      enable_skill_weights: boolean;
      description?: string;
    }
  ): Promise<Assessment> => {
    const response = await api.put(`/assessments/${assessmentId}/step/1`, data, {
      params: { organization_id: organizationId },
    });
    return response.data;
  },

  saveStep2: async (
    assessmentId: string,
    organizationId: string,
    data: {
      topics: TopicConfig[];
      enable_ai_generation?: boolean;
    }
  ): Promise<Assessment> => {
    const response = await api.put(`/assessments/${assessmentId}/step/2`, data, {
      params: { organization_id: organizationId },
    });
    return response.data;
  },

  saveStep3: async (
    assessmentId: string,
    organizationId: string,
    data: {
      schedule: ScheduleConfig;
      proctoring_settings?: ProctoringSettings;
      security_settings?: SecuritySettings;
      candidate_fields?: CandidateFieldConfig;
      max_attempts?: number;
      passing_score_percent?: number;
    }
  ): Promise<Assessment> => {
    const response = await api.put(`/assessments/${assessmentId}/step/3`, data, {
      params: { organization_id: organizationId },
    });
    return response.data;
  },

  saveStep4: async (
    assessmentId: string,
    organizationId: string,
    data: {
      candidates: Array<{ email: string; name: string; phone?: string; source?: string }>;
      email_template?: EmailTemplateConfig;
      send_immediately?: boolean;
    }
  ): Promise<Assessment> => {
    const response = await api.put(`/assessments/${assessmentId}/step/4`, data, {
      params: { organization_id: organizationId },
    });
    return response.data;
  },

  saveStep5: async (
    assessmentId: string,
    organizationId: string,
    data: { confirmed: boolean }
  ): Promise<Assessment> => {
    const response = await api.put(`/assessments/${assessmentId}/step/5`, data, {
      params: { organization_id: organizationId },
    });
    return response.data;
  },

  // Topics
  listTopics: async (assessmentId: string): Promise<AssessmentTopic[]> => {
    const response = await api.get(`/assessments/${assessmentId}/topics`);
    return response.data;
  },

  suggestTopics: async (
    assessmentId: string,
    data: { skills: string[]; job_designation: string; experience_level?: string; count?: number }
  ): Promise<TopicSuggestionResponse> => {
    const response = await api.post(`/assessments/${assessmentId}/topics/suggest`, data);
    return response.data;
  },

  // Questions
  listQuestions: async (assessmentId: string, topicId?: string): Promise<AssessmentQuestion[]> => {
    const response = await api.get(`/assessments/${assessmentId}/questions`, {
      params: topicId ? { topic_id: topicId } : undefined,
    });
    return response.data;
  },

  createQuestion: async (
    assessmentId: string,
    data: Partial<AssessmentQuestion>
  ): Promise<AssessmentQuestion> => {
    const response = await api.post(`/assessments/${assessmentId}/questions`, data);
    return response.data;
  },

  updateQuestion: async (
    assessmentId: string,
    questionId: string,
    data: Partial<AssessmentQuestion>
  ): Promise<AssessmentQuestion> => {
    const response = await api.put(`/assessments/${assessmentId}/questions/${questionId}`, data);
    return response.data;
  },

  deleteQuestion: async (assessmentId: string, questionId: string): Promise<void> => {
    await api.delete(`/assessments/${assessmentId}/questions/${questionId}`);
  },

  generateQuestions: async (
    assessmentId: string,
    data: {
      topic_id: string;
      question_type: QuestionType;
      difficulty?: DifficultyLevel;
      count?: number;
      context?: string;
    }
  ): Promise<{ questions: Partial<AssessmentQuestion>[]; generation_metadata?: Record<string, unknown> }> => {
    const response = await api.post(`/assessments/${assessmentId}/questions/generate`, data);
    return response.data;
  },

  // Candidates
  listCandidates: async (assessmentId: string): Promise<AssessmentInvitation[]> => {
    const response = await api.get(`/assessments/${assessmentId}/candidates`);
    return response.data;
  },

  addCandidate: async (
    assessmentId: string,
    organizationId: string,
    data: {
      email: string;
      name: string;
      phone?: string;
      resume_url?: string;
      linkedin_url?: string;
      github_url?: string;
      source?: string;
    }
  ): Promise<AssessmentInvitation> => {
    const response = await api.post(`/assessments/${assessmentId}/candidates`, data, {
      params: { organization_id: organizationId },
    });
    return response.data;
  },

  importCandidates: async (
    assessmentId: string,
    organizationId: string,
    candidates: Array<{
      email: string;
      name: string;
      phone?: string;
      source?: string;
    }>
  ): Promise<CandidateImportResponse> => {
    const response = await api.post(
      `/assessments/${assessmentId}/candidates/import`,
      { candidates },
      { params: { organization_id: organizationId } }
    );
    return response.data;
  },

  removeCandidate: async (assessmentId: string, candidateId: string): Promise<void> => {
    await api.delete(`/assessments/${assessmentId}/candidates/${candidateId}`);
  },

  // Email Template
  getEmailTemplate: async (assessmentId: string, organizationId?: string): Promise<EmailTemplateConfig> => {
    const response = await api.get(`/assessments/${assessmentId}/email-template`, {
      params: organizationId ? { organization_id: organizationId } : undefined,
    });
    return response.data;
  },

  updateEmailTemplate: async (
    assessmentId: string,
    data: EmailTemplateConfig,
    organizationId?: string
  ): Promise<EmailTemplateConfig> => {
    const response = await api.put(`/assessments/${assessmentId}/email-template`, data, {
      params: organizationId ? { organization_id: organizationId } : undefined,
    });
    return response.data;
  },

  // Publishing
  prePublishCheck: async (
    assessmentId: string,
    organizationId: string
  ): Promise<PrePublishCheckResponse> => {
    const response = await api.get(`/assessments/${assessmentId}/publish/check`, {
      params: { organization_id: organizationId },
    });
    return response.data;
  },

  publish: async (
    assessmentId: string,
    organizationId: string,
    options?: { send_invitations?: boolean; schedule_override?: ScheduleConfig }
  ): Promise<PublishResponse> => {
    const response = await api.post(
      `/assessments/${assessmentId}/publish`,
      options || {},
      { params: { organization_id: organizationId } }
    );
    return response.data;
  },

  // Metrics
  getMetrics: async (assessmentId: string): Promise<AssessmentMetrics> => {
    const response = await api.get(`/assessments/${assessmentId}/metrics`);
    return response.data;
  },

  getOrganizationMetrics: async (
    organizationId: string
  ): Promise<{ total_candidates: number; total_tests: number; unique_attempts: number; attempt_rate: number }> => {
    const response = await api.get(`/assessments/organization/${organizationId}/metrics`);
    return response.data;
  },
};

// ============================================================================
// Question Management API (across assessments)
// ============================================================================

export interface QuestionListItem {
  id: string;
  assessment_id: string;
  assessment_title: string;
  topic_id: string | null;
  topic_name: string | null;
  question_type: string;
  difficulty: string;
  title: string;
  max_marks: number;
  is_ai_generated: boolean;
  created_at: string;
  deleted_at: string | null;
  total_attempts: number;
  average_score_percent: number;
  average_time_seconds: number;
}

export interface QuestionListResponse {
  questions: QuestionListItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface QuestionAnalytics {
  question_id: string;
  total_attempts: number;
  unique_candidates: number;
  average_score_percent: number;
  median_score_percent: number;
  min_score_percent: number;
  max_score_percent: number;
  average_time_seconds: number;
  median_time_seconds: number;
  min_time_seconds: number;
  max_time_seconds: number;
  score_distribution: Record<string, number>;
  time_distribution: Record<string, number>;
  stated_difficulty: string | null;
  calculated_difficulty: string | null;
  difficulty_accuracy: number;
  skip_rate: number;
  completion_rate: number;
  partial_credit_rate: number;
  option_selection_distribution: Record<string, number> | null;
  test_case_pass_rates: Array<{ test_id: string; pass_rate: number }> | null;
  last_calculated_at: string | null;
}

export interface QuestionDetail {
  id: string;
  assessment_id: string;
  assessment_title: string;
  topic_id: string | null;
  topic_name: string | null;
  question_type: string;
  difficulty: string;
  title: string;
  problem_statement: string;
  options: MCQOption[] | null;
  test_cases: TestCase[] | null;
  starter_code: Record<string, string> | null;
  constraints: string[] | null;
  examples: QuestionExample[] | null;
  hints: string[] | null;
  sample_answer: string | null;
  key_points: string[] | null;
  evaluation_rubric: Record<string, unknown> | null;
  max_marks: number;
  estimated_time_minutes: number;
  allowed_languages: string[] | null;
  is_ai_generated: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  analytics: QuestionAnalytics | null;
}

export interface QuestionSubmissionItem {
  submission_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  attempt_id: string;
  submitted_at: string;
  time_taken_seconds: number;
  score_obtained: number | null;
  max_score: number;
  score_percent: number | null;
  status: "evaluated" | "pending";
}

export interface QuestionSubmissionsResponse {
  submissions: QuestionSubmissionItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface DeleteQuestionResponse {
  deleted: boolean;
  question_id: string;
  action: string;
  warnings: string[];
  submissions_affected: number;
}

export interface BulkDeleteResponse {
  deleted_count: number;
  failed_count: number;
  failed_ids: string[];
  warnings: string[];
}

export interface QuestionCreateRequest {
  assessment_id: string;
  topic_id?: string;
  question_type: string;
  difficulty: string;
  title: string;
  problem_statement: string;
  options?: MCQOption[];
  test_cases?: TestCase[];
  starter_code?: Record<string, string>;
  constraints?: string[];
  examples?: QuestionExample[];
  hints?: string[];
  sample_answer?: string;
  key_points?: string[];
  evaluation_rubric?: Record<string, unknown>;
  max_marks?: number;
  estimated_time_minutes?: number;
  allowed_languages?: string[];
  tags?: string[];
  add_to_bank?: boolean;
}

export interface QuestionUpdateRequest {
  topic_id?: string;
  question_type?: string;
  difficulty?: string;
  title?: string;
  problem_statement?: string;
  options?: MCQOption[];
  test_cases?: TestCase[];
  starter_code?: Record<string, string>;
  constraints?: string[];
  examples?: QuestionExample[];
  hints?: string[];
  sample_answer?: string;
  key_points?: string[];
  evaluation_rubric?: Record<string, unknown>;
  max_marks?: number;
  estimated_time_minutes?: number;
  allowed_languages?: string[];
  tags?: string[];
}

export interface QuestionListFilters {
  organization_id: string;
  assessment_id?: string;
  topic?: string;
  question_type?: string;
  difficulty?: string;
  search?: string;
  is_ai_generated?: boolean;
  include_deleted?: boolean;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export const questionsApi = {
  list: async (filters: QuestionListFilters): Promise<QuestionListResponse> => {
    const response = await api.get("/questions", { params: filters });
    return response.data;
  },

  get: async (questionId: string, includeAnalytics = true): Promise<QuestionDetail> => {
    const response = await api.get(`/questions/${questionId}`, {
      params: { include_analytics: includeAnalytics },
    });
    return response.data;
  },

  getAnalytics: async (questionId: string): Promise<QuestionAnalytics> => {
    const response = await api.get(`/questions/${questionId}/analytics`);
    return response.data;
  },

  getSubmissions: async (
    questionId: string,
    options?: {
      candidate_id?: string;
      candidate_email?: string;
      status?: "evaluated" | "pending";
      min_score?: number;
      max_score?: number;
      page?: number;
      per_page?: number;
    }
  ): Promise<QuestionSubmissionsResponse> => {
    const response = await api.get(`/questions/${questionId}/submissions`, {
      params: options,
    });
    return response.data;
  },

  create: async (data: QuestionCreateRequest): Promise<QuestionDetail> => {
    const response = await api.post("/questions", data);
    return response.data;
  },

  update: async (questionId: string, data: QuestionUpdateRequest): Promise<QuestionDetail> => {
    const response = await api.put(`/questions/${questionId}`, data);
    return response.data;
  },

  delete: async (
    questionId: string,
    options?: { force?: boolean; soft_delete?: boolean }
  ): Promise<DeleteQuestionResponse> => {
    const response = await api.delete(`/questions/${questionId}`, { params: options });
    return response.data;
  },

  restore: async (questionId: string): Promise<QuestionDetail> => {
    const response = await api.post(`/questions/${questionId}/restore`);
    return response.data;
  },

  duplicate: async (
    questionId: string,
    options?: { target_assessment_id?: string; target_topic_id?: string }
  ): Promise<QuestionDetail> => {
    const response = await api.post(`/questions/${questionId}/duplicate`, null, {
      params: options,
    });
    return response.data;
  },

  bulkDelete: async (
    questionIds: string[],
    options?: { force?: boolean; soft_delete?: boolean }
  ): Promise<BulkDeleteResponse> => {
    const response = await api.post("/questions/bulk/delete", questionIds, {
      params: options,
    });
    return response.data;
  },

  recalculateAnalytics: async (questionId: string): Promise<QuestionAnalytics> => {
    const response = await api.post(`/questions/${questionId}/recalculate-analytics`);
    return response.data;
  },
};

// ============================================================================
// Jira Integration API
// ============================================================================

export interface JiraCredentials {
  site_url: string;
  user_email: string;
  api_token: string;
}

export interface JiraIntegration {
  id: string;
  organization_id: string;
  site_url: string;
  user_email: string;
  is_active: boolean;
  created_at: string;
}

export const jiraApi = {
  testConnection: async (credentials: JiraCredentials): Promise<{ success: boolean; message?: string }> => {
    const response = await api.post("/integrations/jira/test", credentials);
    return response.data;
  },

  createIntegration: async (credentials: JiraCredentials): Promise<JiraIntegration> => {
    const response = await api.post("/integrations/jira", credentials);
    return response.data;
  },

  getIntegration: async (): Promise<JiraIntegration | null> => {
    try {
      const response = await api.get("/integrations/jira");
      return response.data;
    } catch {
      return null;
    }
  },

  disconnect: async (integrationId: string): Promise<void> => {
    await api.delete(`/integrations/jira/${integrationId}`);
  },
};

// ============================================================================
// Linear Integration API
// ============================================================================

export interface LinearCredentials {
  api_key: string;
}

export interface LinearIntegrationBasic {
  id: string;
  organization_id: string;
  is_active: boolean;
  created_at: string;
}

export const linearApi = {
  testConnection: async (credentials: LinearCredentials): Promise<{ success: boolean; message?: string }> => {
    const response = await api.post("/integrations/linear/test", credentials);
    return response.data;
  },

  createIntegration: async (credentials: LinearCredentials): Promise<LinearIntegrationBasic> => {
    const response = await api.post("/integrations/linear", credentials);
    return response.data;
  },

  getIntegration: async (): Promise<LinearIntegrationBasic | null> => {
    try {
      const response = await api.get("/integrations/linear");
      return response.data;
    } catch {
      return null;
    }
  },

  disconnect: async (integrationId: string): Promise<void> => {
    await api.delete(`/integrations/linear/${integrationId}`);
  },
};

// ============================================================================
// CRM Types
// ============================================================================

export type CRMObjectType = "company" | "person" | "deal" | "custom";

export type CRMAttributeType =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "datetime"
  | "checkbox"
  | "select"
  | "multi_select"
  | "status"
  | "email"
  | "phone"
  | "url"
  | "record_reference"
  | "user_reference"
  | "rating"
  | "formula"
  | "rollup"
  | "ai_computed";

export interface CRMAttribute {
  id: string;
  object_id: string;
  name: string;
  slug: string;
  attribute_type: CRMAttributeType;
  description: string | null;
  is_required: boolean;
  is_unique: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  is_system: boolean;
  config: Record<string, unknown>;
  default_value: unknown;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface CRMObject {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  plural_name: string;
  description: string | null;
  object_type: CRMObjectType;
  icon: string | null;
  color: string | null;
  is_system: boolean;
  is_active: boolean;
  primary_attribute_id: string | null;
  record_count: number;
  settings: Record<string, unknown>;
  attributes: CRMAttribute[];
  created_at: string;
  updated_at: string;
}

export interface CRMRecord {
  id: string;
  workspace_id: string;
  object_id: string;
  values: Record<string, unknown>;
  display_name: string | null;
  owner_id: string | null;
  owner?: { id: string; name: string | null; avatar_url: string | null };
  created_by_id: string | null;
  created_by?: { id: string; name: string | null; avatar_url: string | null };
  is_archived: boolean;
  archived_at: string | null;
  object?: CRMObject;
  created_at: string;
  updated_at: string;
}

export interface CRMNote {
  id: string;
  record_id: string;
  content: string;
  content_html: string | null;
  is_pinned: boolean;
  created_by_id: string | null;
  created_by?: { id: string; name: string | null; avatar_url: string | null };
  created_at: string;
  updated_at: string;
}

export interface CRMActivity {
  id: string;
  workspace_id: string;
  record_id: string;
  activity_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  actor_type: string;
  actor_id: string | null;
  actor_name: string | null;
  occurred_at: string;
  created_at: string;
}

export interface CRMList {
  id: string;
  workspace_id: string;
  object_id: string;
  name: string;
  description: string | null;
  view_type: "table" | "board" | "gallery" | "timeline";
  is_smart: boolean;
  filters: Record<string, unknown>[];
  sorts: Record<string, unknown>[];
  columns: string[];
  settings: Record<string, unknown>;
  is_default: boolean;
  is_shared: boolean;
  entry_count: number;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMListEntry {
  id: string;
  list_id: string;
  record_id: string;
  record?: CRMRecord;
  order: number;
  added_at: string;
}

export type CRMAutomationTriggerType =
  | "record_created"
  | "record_updated"
  | "record_deleted"
  | "field_changed"
  | "stage_changed"
  | "note_added"
  | "task_completed"
  | "email_replied"
  | "scheduled"
  | "manual";

export type CRMAutomationActionType =
  | "update_record"
  | "create_record"
  | "delete_record"
  | "add_to_list"
  | "remove_from_list"
  | "send_email"
  | "send_slack"
  | "webhook_call"
  | "assign_owner"
  | "create_task"
  | "enroll_in_sequence"
  | "wait";

export interface CRMAutomation {
  id: string;
  workspace_id: string;
  object_id: string;
  name: string;
  description: string | null;
  trigger_type: CRMAutomationTriggerType;
  trigger_config: Record<string, unknown>;
  conditions: Record<string, unknown>[];
  actions: { type: CRMAutomationActionType; config: Record<string, unknown> }[];
  is_active: boolean;
  run_count: number;
  last_run_at: string | null;
  runs_this_month: number;
  run_limit_per_month: number | null;
  error_handling: "stop" | "continue" | "retry";
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMAutomationRun {
  id: string;
  automation_id: string;
  record_id: string | null;
  trigger_data: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  steps_executed: Record<string, unknown>[];
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// =============================================================================
// PLATFORM-WIDE AUTOMATION TYPES
// =============================================================================

export type AutomationModule =
  | "crm"
  | "tickets"
  | "hiring"
  | "email_marketing"
  | "uptime"
  | "sprints"
  | "forms"
  | "booking";

export type AutomationTriggerType = string; // Module-specific triggers
export type AutomationActionType = string; // Module-specific actions

export interface Automation {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  module: AutomationModule;
  module_config: Record<string, unknown>;
  object_id: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: Record<string, unknown>[];
  actions: { type: string; config: Record<string, unknown> }[];
  is_active: boolean;
  runs_this_month: number;
  run_limit_per_month: number | null;
  error_handling: "stop" | "continue" | "retry";
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  last_run_at: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRun {
  id: string;
  automation_id: string;
  module: string;
  record_id: string | null;
  trigger_data: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  steps_executed: Record<string, unknown>[];
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface CRMSequence {
  id: string;
  workspace_id: string;
  object_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  enrollment_count: number;
  steps?: CRMSequenceStep[];
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMSequenceStep {
  id: string;
  sequence_id: string;
  step_type: string;
  config: Record<string, unknown>;
  delay_days: number;
  delay_hours: number;
  order: number;
  created_at: string;
}

export interface CRMSequenceEnrollment {
  id: string;
  sequence_id: string;
  record_id: string;
  record?: CRMRecord;
  current_step: number;
  status: "active" | "paused" | "completed" | "unenrolled" | "failed";
  enrolled_at: string;
  last_step_at: string | null;
  next_step_at: string | null;
  completed_at: string | null;
  enrolled_by_id: string | null;
}

export interface CRMWebhook {
  id: string;
  workspace_id: string;
  object_id: string | null;
  name: string;
  description: string | null;
  url: string;
  events: string[];
  secret: string;
  headers: Record<string, string>;
  retry_config: Record<string, unknown>;
  is_active: boolean;
  last_triggered_at: string | null;
  success_count: number;
  failure_count: number;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMWebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: "pending" | "success" | "failed";
  response_status: number | null;
  response_body: string | null;
  attempt_number: number;
  next_retry_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

// ============================================================================
// CRM API
// ============================================================================

export const crmApi = {
  // Objects
  objects: {
    list: async (workspaceId: string): Promise<CRMObject[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/objects`);
      return response.data;
    },

    get: async (workspaceId: string, objectId: string): Promise<CRMObject> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/objects/${objectId}`);
      return response.data;
    },

    create: async (
      workspaceId: string,
      data: { name: string; plural_name: string; object_type?: CRMObjectType; description?: string; icon?: string; color?: string }
    ): Promise<CRMObject> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/objects`, data);
      return response.data;
    },

    update: async (
      workspaceId: string,
      objectId: string,
      data: Partial<{ name: string; plural_name: string; description: string; icon: string; color: string; is_active: boolean }>
    ): Promise<CRMObject> => {
      const response = await api.patch(`/workspaces/${workspaceId}/crm/objects/${objectId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, objectId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/crm/objects/${objectId}`);
    },

    seed: async (workspaceId: string): Promise<CRMObject[]> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/objects/seed`);
      return response.data;
    },

    seedFromTemplate: async (
      workspaceId: string,
      template: string,
      useCase?: string,
      useCaseDetails?: string[]
    ): Promise<{ objects: CRMObject[]; message: string }> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/objects/seed-template`, {
        template,
        use_case: useCase,
        use_case_details: useCaseDetails,
      });
      return response.data;
    },

    recalculateCounts: async (workspaceId: string): Promise<{ status: string; counts: Record<string, number> }> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/objects/recalculate-counts`);
      return response.data;
    },
  },

  // Attributes
  attributes: {
    list: async (workspaceId: string, objectId: string): Promise<CRMAttribute[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/objects/${objectId}/attributes`);
      return response.data;
    },

    create: async (
      workspaceId: string,
      objectId: string,
      data: {
        name: string;
        attribute_type: CRMAttributeType;
        description?: string;
        is_required?: boolean;
        config?: Record<string, unknown>;
        default_value?: unknown;
      }
    ): Promise<CRMAttribute> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/objects/${objectId}/attributes`, data);
      return response.data;
    },

    update: async (
      workspaceId: string,
      attributeId: string,
      data: Partial<{
        name: string;
        description: string;
        is_required: boolean;
        is_searchable: boolean;
        is_filterable: boolean;
        is_sortable: boolean;
        config: Record<string, unknown>;
        default_value: unknown;
      }>
    ): Promise<CRMAttribute> => {
      const response = await api.patch(`/workspaces/${workspaceId}/crm/attributes/${attributeId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, attributeId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/crm/attributes/${attributeId}`);
    },
  },

  // Records
  records: {
    list: async (
      workspaceId: string,
      objectId: string,
      params?: { filters?: Record<string, unknown>[]; sorts?: Record<string, unknown>[]; skip?: number; limit?: number; include_archived?: boolean }
    ): Promise<{ records: CRMRecord[]; total: number }> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/objects/${objectId}/records`, { params });
      return response.data;
    },

    get: async (workspaceId: string, recordId: string): Promise<CRMRecord> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/records/${recordId}`);
      return response.data;
    },

    create: async (
      workspaceId: string,
      objectId: string,
      data: { values: Record<string, unknown>; owner_id?: string }
    ): Promise<CRMRecord> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/objects/${objectId}/records`, data);
      return response.data;
    },

    update: async (
      workspaceId: string,
      recordId: string,
      data: { values?: Record<string, unknown>; owner_id?: string }
    ): Promise<CRMRecord> => {
      const response = await api.patch(`/workspaces/${workspaceId}/crm/records/${recordId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, recordId: string, permanent?: boolean): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/crm/records/${recordId}`, { params: { permanent } });
    },

    bulkCreate: async (
      workspaceId: string,
      objectId: string,
      records: { values: Record<string, unknown>; owner_id?: string }[]
    ): Promise<CRMRecord[]> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/objects/${objectId}/records/bulk`, { records });
      return response.data;
    },

    bulkUpdate: async (
      workspaceId: string,
      recordIds: string[],
      values: Record<string, unknown>
    ): Promise<{ updated: number }> => {
      const response = await api.patch(`/workspaces/${workspaceId}/crm/records/bulk`, { record_ids: recordIds, values });
      return response.data;
    },

    bulkDelete: async (workspaceId: string, recordIds: string[], permanent?: boolean): Promise<{ deleted: number }> => {
      const response = await api.delete(`/workspaces/${workspaceId}/crm/records/bulk`, {
        data: { record_ids: recordIds },
        params: { permanent },
      });
      return response.data;
    },
  },

  // Notes
  notes: {
    list: async (workspaceId: string, recordId: string): Promise<CRMNote[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/records/${recordId}/notes`);
      return response.data;
    },

    create: async (
      workspaceId: string,
      recordId: string,
      data: { content: string; content_html?: string }
    ): Promise<CRMNote> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/records/${recordId}/notes`, data);
      return response.data;
    },

    update: async (
      workspaceId: string,
      noteId: string,
      data: { content?: string; content_html?: string; is_pinned?: boolean }
    ): Promise<CRMNote> => {
      const response = await api.patch(`/workspaces/${workspaceId}/crm/notes/${noteId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, noteId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/crm/notes/${noteId}`);
    },
  },

  // Activities
  activities: {
    listWorkspace: async (
      workspaceId: string,
      params?: { activity_type?: string; limit?: number; offset?: number }
    ): Promise<{ activities: CRMActivity[]; total: number; limit: number; offset: number }> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/activities`, { params });
      return response.data;
    },

    list: async (
      workspaceId: string,
      recordId: string,
      params?: { skip?: number; limit?: number }
    ): Promise<CRMActivity[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/records/${recordId}/activities`, { params });
      return response.data.activities;
    },
  },

  // Lists
  lists: {
    list: async (workspaceId: string, objectId?: string): Promise<CRMList[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/lists`, { params: { object_id: objectId } });
      return response.data;
    },

    get: async (workspaceId: string, listId: string): Promise<CRMList> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/lists/${listId}`);
      return response.data;
    },

    create: async (
      workspaceId: string,
      data: {
        object_id: string;
        name: string;
        description?: string;
        view_type?: "table" | "board" | "gallery" | "timeline";
        is_smart?: boolean;
        filters?: Record<string, unknown>[];
        sorts?: Record<string, unknown>[];
        columns?: string[];
      }
    ): Promise<CRMList> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/lists`, data);
      return response.data;
    },

    update: async (
      workspaceId: string,
      listId: string,
      data: Partial<{
        name: string;
        description: string;
        view_type: "table" | "board" | "gallery" | "timeline";
        filters: Record<string, unknown>[];
        sorts: Record<string, unknown>[];
        columns: string[];
        settings: Record<string, unknown>;
        is_shared: boolean;
      }>
    ): Promise<CRMList> => {
      const response = await api.patch(`/workspaces/${workspaceId}/crm/lists/${listId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, listId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/crm/lists/${listId}`);
    },

    getEntries: async (
      workspaceId: string,
      listId: string,
      params?: { skip?: number; limit?: number }
    ): Promise<{ entries: CRMListEntry[]; total: number }> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/lists/${listId}/entries`, { params });
      return response.data;
    },

    addEntry: async (workspaceId: string, listId: string, recordId: string): Promise<CRMListEntry> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/lists/${listId}/entries`, { record_id: recordId });
      return response.data;
    },

    removeEntry: async (workspaceId: string, listId: string, recordId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/crm/lists/${listId}/entries/${recordId}`);
    },
  },
};

// ============================================================================
// CRM Automation API
// ============================================================================

export const crmAutomationApi = {
  // Automations
  automations: {
    list: async (
      workspaceId: string,
      params?: { object_id?: string; is_active?: boolean; skip?: number; limit?: number }
    ): Promise<CRMAutomation[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/automations`, { params });
      return response.data;
    },

    get: async (workspaceId: string, automationId: string): Promise<CRMAutomation> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/automations/${automationId}`);
      return response.data;
    },

    create: async (
      workspaceId: string,
      data: {
        name: string;
        object_id: string;
        trigger_type: CRMAutomationTriggerType;
        description?: string;
        trigger_config?: Record<string, unknown>;
        conditions?: Record<string, unknown>[];
        actions: { type: CRMAutomationActionType; config: Record<string, unknown> }[];
      }
    ): Promise<CRMAutomation> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/automations`, data);
      return response.data;
    },

    update: async (
      workspaceId: string,
      automationId: string,
      data: Partial<{
        name: string;
        description: string;
        trigger_type: CRMAutomationTriggerType;
        trigger_config: Record<string, unknown>;
        conditions: Record<string, unknown>[];
        actions: { type: CRMAutomationActionType; config: Record<string, unknown> }[];
        is_active: boolean;
        run_limit_per_month: number;
        error_handling: "stop" | "continue" | "retry";
      }>
    ): Promise<CRMAutomation> => {
      const response = await api.patch(`/workspaces/${workspaceId}/crm/automations/${automationId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, automationId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/crm/automations/${automationId}`);
    },

    toggle: async (workspaceId: string, automationId: string): Promise<CRMAutomation> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/automations/${automationId}/toggle`);
      return response.data;
    },

    trigger: async (
      workspaceId: string,
      automationId: string,
      recordId: string
    ): Promise<{ message: string; automation_id: string; record_id: string }> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/automations/${automationId}/trigger`, null, {
        params: { record_id: recordId },
      });
      return response.data;
    },

    listRuns: async (
      workspaceId: string,
      automationId: string,
      params?: { skip?: number; limit?: number }
    ): Promise<CRMAutomationRun[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/automations/${automationId}/runs`, { params });
      return response.data;
    },
  },

  // Sequences
  sequences: {
    list: async (
      workspaceId: string,
      params?: { object_id?: string; is_active?: boolean; skip?: number; limit?: number }
    ): Promise<CRMSequence[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/sequences`, { params });
      return response.data;
    },

    get: async (workspaceId: string, sequenceId: string): Promise<CRMSequence> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/sequences/${sequenceId}`);
      return response.data;
    },

    create: async (
      workspaceId: string,
      data: { name: string; object_id: string; description?: string }
    ): Promise<CRMSequence> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/sequences`, data);
      return response.data;
    },

    update: async (
      workspaceId: string,
      sequenceId: string,
      data: Partial<{ name: string; description: string; is_active: boolean }>
    ): Promise<CRMSequence> => {
      const response = await api.patch(`/workspaces/${workspaceId}/crm/sequences/${sequenceId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, sequenceId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/crm/sequences/${sequenceId}`);
    },

    toggle: async (workspaceId: string, sequenceId: string): Promise<CRMSequence> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/sequences/${sequenceId}/toggle`);
      return response.data;
    },

    // Steps
    listSteps: async (workspaceId: string, sequenceId: string): Promise<CRMSequenceStep[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/sequences/${sequenceId}/steps`);
      return response.data;
    },

    addStep: async (
      workspaceId: string,
      sequenceId: string,
      data: { step_type: string; config: Record<string, unknown>; delay_days?: number; delay_hours?: number; order?: number }
    ): Promise<CRMSequenceStep> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/sequences/${sequenceId}/steps`, data);
      return response.data;
    },

    updateStep: async (
      workspaceId: string,
      stepId: string,
      data: Partial<{ step_type: string; config: Record<string, unknown>; delay_days: number; delay_hours: number }>
    ): Promise<CRMSequenceStep> => {
      const response = await api.patch(`/workspaces/${workspaceId}/crm/sequence-steps/${stepId}`, data);
      return response.data;
    },

    deleteStep: async (workspaceId: string, stepId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/crm/sequence-steps/${stepId}`);
    },

    // Enrollments
    listEnrollments: async (
      workspaceId: string,
      sequenceId: string,
      params?: { status?: string; skip?: number; limit?: number }
    ): Promise<CRMSequenceEnrollment[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/sequences/${sequenceId}/enrollments`, { params });
      return response.data;
    },

    enroll: async (workspaceId: string, sequenceId: string, recordId: string): Promise<CRMSequenceEnrollment> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/sequences/${sequenceId}/enroll`, { record_id: recordId });
      return response.data;
    },

    pauseEnrollment: async (workspaceId: string, enrollmentId: string): Promise<CRMSequenceEnrollment> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/enrollments/${enrollmentId}/pause`);
      return response.data;
    },

    resumeEnrollment: async (workspaceId: string, enrollmentId: string): Promise<CRMSequenceEnrollment> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/enrollments/${enrollmentId}/resume`);
      return response.data;
    },

    unenroll: async (workspaceId: string, enrollmentId: string): Promise<CRMSequenceEnrollment> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/enrollments/${enrollmentId}/unenroll`);
      return response.data;
    },
  },

  // Webhooks
  webhooks: {
    list: async (
      workspaceId: string,
      params?: { object_id?: string; is_active?: boolean; skip?: number; limit?: number }
    ): Promise<CRMWebhook[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/webhooks`, { params });
      return response.data;
    },

    get: async (workspaceId: string, webhookId: string): Promise<CRMWebhook> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/webhooks/${webhookId}`);
      return response.data;
    },

    create: async (
      workspaceId: string,
      data: {
        name: string;
        url: string;
        events: string[];
        object_id?: string;
        description?: string;
        headers?: Record<string, string>;
      }
    ): Promise<CRMWebhook> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/webhooks`, data);
      return response.data;
    },

    update: async (
      workspaceId: string,
      webhookId: string,
      data: Partial<{
        name: string;
        description: string;
        url: string;
        events: string[];
        headers: Record<string, string>;
        is_active: boolean;
      }>
    ): Promise<CRMWebhook> => {
      const response = await api.patch(`/workspaces/${workspaceId}/crm/webhooks/${webhookId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, webhookId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/crm/webhooks/${webhookId}`);
    },

    toggle: async (workspaceId: string, webhookId: string): Promise<CRMWebhook> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/webhooks/${webhookId}/toggle`);
      return response.data;
    },

    rotateSecret: async (workspaceId: string, webhookId: string): Promise<CRMWebhook> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/webhooks/${webhookId}/rotate-secret`);
      return response.data;
    },

    test: async (workspaceId: string, webhookId: string): Promise<{ message: string; webhook_id: string }> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/webhooks/${webhookId}/test`);
      return response.data;
    },

    listDeliveries: async (
      workspaceId: string,
      webhookId: string,
      params?: { skip?: number; limit?: number }
    ): Promise<CRMWebhookDelivery[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/crm/webhooks/${webhookId}/deliveries`, { params });
      return response.data;
    },

    retryDelivery: async (workspaceId: string, deliveryId: string): Promise<{ message: string; delivery_id: string }> => {
      const response = await api.post(`/workspaces/${workspaceId}/crm/webhook-deliveries/${deliveryId}/retry`);
      return response.data;
    },
  },
};

// =============================================================================
// PLATFORM-WIDE AUTOMATIONS API
// =============================================================================

export const automationsApi = {
  // List automations (optionally filter by module)
  list: async (
    workspaceId: string,
    params?: { module?: AutomationModule; object_id?: string; is_active?: boolean; skip?: number; limit?: number }
  ): Promise<Automation[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/automations`, { params });
    return response.data;
  },

  // Get single automation
  get: async (workspaceId: string, automationId: string): Promise<Automation> => {
    const response = await api.get(`/workspaces/${workspaceId}/automations/${automationId}`);
    return response.data;
  },

  // Create automation
  create: async (
    workspaceId: string,
    data: {
      name: string;
      module: AutomationModule;
      trigger_type: string;
      description?: string;
      module_config?: Record<string, unknown>;
      object_id?: string;
      trigger_config?: Record<string, unknown>;
      conditions?: Record<string, unknown>[];
      actions: { type: string; config: Record<string, unknown> }[];
      error_handling?: "stop" | "continue" | "retry";
      run_limit_per_month?: number;
      is_active?: boolean;
    }
  ): Promise<Automation> => {
    const response = await api.post(`/workspaces/${workspaceId}/automations`, data);
    return response.data;
  },

  // Update automation
  update: async (
    workspaceId: string,
    automationId: string,
    data: Partial<{
      name: string;
      description: string;
      module_config: Record<string, unknown>;
      trigger_config: Record<string, unknown>;
      conditions: Record<string, unknown>[];
      actions: { type: string; config: Record<string, unknown> }[];
      is_active: boolean;
      run_limit_per_month: number;
      error_handling: "stop" | "continue" | "retry";
    }>
  ): Promise<Automation> => {
    const response = await api.patch(`/workspaces/${workspaceId}/automations/${automationId}`, data);
    return response.data;
  },

  // Delete automation
  delete: async (workspaceId: string, automationId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/automations/${automationId}`);
  },

  // Toggle automation active status
  toggle: async (workspaceId: string, automationId: string): Promise<Automation> => {
    const response = await api.post(`/workspaces/${workspaceId}/automations/${automationId}/toggle`);
    return response.data;
  },

  // Manually trigger automation
  trigger: async (
    workspaceId: string,
    automationId: string,
    recordId?: string
  ): Promise<{ message: string; automation_id: string; record_id: string | null; module: string }> => {
    const response = await api.post(`/workspaces/${workspaceId}/automations/${automationId}/trigger`, null, {
      params: recordId ? { record_id: recordId } : undefined,
    });
    return response.data;
  },

  // List automation runs
  listRuns: async (
    workspaceId: string,
    automationId: string,
    params?: { skip?: number; limit?: number }
  ): Promise<AutomationRun[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/automations/${automationId}/runs`, { params });
    return response.data;
  },

  // Get single automation run
  getRun: async (workspaceId: string, runId: string): Promise<AutomationRun> => {
    const response = await api.get(`/workspaces/${workspaceId}/automations/runs/${runId}`);
    return response.data;
  },

  // Registry endpoints
  getTriggerRegistry: async (workspaceId: string): Promise<{ triggers: Record<string, string[]> }> => {
    const response = await api.get(`/workspaces/${workspaceId}/automations/registry/triggers`);
    return response.data;
  },

  getActionRegistry: async (workspaceId: string): Promise<{ actions: Record<string, string[]> }> => {
    const response = await api.get(`/workspaces/${workspaceId}/automations/registry/actions`);
    return response.data;
  },

  getModuleTriggers: async (workspaceId: string, module: string): Promise<{ module: string; triggers: string[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/automations/registry/modules/${module}/triggers`);
    return response.data;
  },

  getModuleActions: async (workspaceId: string, module: string): Promise<{ module: string; actions: string[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/automations/registry/modules/${module}/actions`);
    return response.data;
  },
};

// =============================================================================
// Google Integration API (Gmail & Calendar sync for CRM)
// =============================================================================

export interface DealCreationSettings {
  auto_create_deals: boolean;
  deal_creation_mode: "auto" | "ai" | "criteria";
  skip_personal_domains: boolean;
  default_deal_stage: string;
  default_deal_value: number | null;
  criteria: {
    subject_keywords: string[];
    body_keywords: string[];
    from_domains: string[];
  };
}

export interface GoogleSyncSettings {
  deal_settings?: DealCreationSettings;
  [key: string]: unknown;
}

export interface GoogleIntegrationStatus {
  is_connected: boolean;
  google_email: string | null;
  gmail_sync_enabled: boolean;
  calendar_sync_enabled: boolean;
  auto_sync_interval_minutes: number; // 0 = disabled, >0 = interval in minutes (Gmail)
  auto_sync_calendar_interval_minutes: number; // 0 = disabled, >0 = interval in minutes (Calendar)
  gmail_last_sync_at: string | null;
  calendar_last_sync_at: string | null;
  messages_synced: number;
  events_synced: number;
  last_error: string | null;
  granted_scopes: string[];
  sync_settings?: GoogleSyncSettings;
}

export interface SyncJobStatus {
  job_id: string;
  job_type: "gmail" | "calendar";
  status: "pending" | "running" | "completed" | "failed";
  processed_items: number;
  total_items: number | null;
  progress_message: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface GmailSyncResponse {
  status: string;
  job_id: string | null;
  messages_synced: number;
  full_sync_completed: boolean;
  history_id: string | null;
  error: string | null;
}

export interface CalendarSyncResponse {
  status: string;
  job_id: string | null;
  events_synced: number;
  calendars_synced: string[];
  error: string | null;
}

export interface SyncedEmail {
  id: string;
  gmail_id: string;
  gmail_thread_id: string | null;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: { email: string; name: string | null }[];
  cc_emails: { email: string; name: string | null }[];
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  labels: string[];
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  gmail_date: string | null;
  linked_records: { record_id: string; link_type: string }[];
  ai_summary: string | null;
  created_at: string;
}

export interface SyncedCalendarEvent {
  id: string;
  google_event_id: string;
  google_calendar_id: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  is_all_day: boolean;
  timezone: string | null;
  attendees: { email: string; name: string | null; response_status: string | null }[];
  organizer_email: string | null;
  status: string | null;
  html_link: string | null;
  conference_data: Record<string, unknown> | null;
  linked_records: { record_id: string; link_type: string }[];
  crm_activity_id: string | null;
  created_at: string;
}

export interface GoogleCalendar {
  id: string;
  name: string;
  description: string | null;
  is_primary: boolean;
  access_role: string | null;
  color: string | null;
}

export const googleIntegrationApi = {
  // Connection
  getConnectUrl: async (workspaceId: string, redirectUrl?: string): Promise<{ auth_url: string }> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/google/connect`, {
      params: { redirect_url: redirectUrl },
    });
    return response.data;
  },

  getStatus: async (workspaceId: string): Promise<GoogleIntegrationStatus> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/google/status`);
    return response.data;
  },

  updateSettings: async (
    workspaceId: string,
    settings: {
      gmail_sync_enabled?: boolean;
      calendar_sync_enabled?: boolean;
      auto_sync_interval_minutes?: number;
      auto_sync_calendar_interval_minutes?: number;
      sync_settings?: Record<string, unknown>;
    }
  ): Promise<GoogleIntegrationStatus> => {
    const response = await api.patch(`/workspaces/${workspaceId}/integrations/google/settings`, settings);
    return response.data;
  },

  disconnect: async (workspaceId: string): Promise<void> => {
    await api.post(`/workspaces/${workspaceId}/integrations/google/disconnect`);
  },

  // Connect from existing developer Google connection (for main onboarding users)
  connectFromDeveloper: async (workspaceId: string): Promise<GoogleIntegrationStatus> => {
    const response = await api.post(`/workspaces/${workspaceId}/integrations/google/connect-from-developer`);
    return response.data;
  },

  // Sync job status polling
  getSyncJobStatus: async (
    workspaceId: string,
    jobId: string
  ): Promise<SyncJobStatus> => {
    const response = await api.get(`/workspaces/${workspaceId}/integrations/google/sync-jobs/${jobId}`);
    return response.data;
  },

  // Gmail
  gmail: {
    sync: async (
      workspaceId: string,
      options?: { full_sync?: boolean; max_messages?: number }
    ): Promise<GmailSyncResponse> => {
      const response = await api.post(`/workspaces/${workspaceId}/integrations/google/gmail/sync`, options || {});
      return response.data;
    },

    listEmails: async (
      workspaceId: string,
      params?: {
        page?: number;
        page_size?: number;
        search?: string;
        from_email?: string;
        thread_id?: string;
        unread_only?: boolean;
      }
    ): Promise<{
      emails: SyncedEmail[];
      total: number;
      page: number;
      page_size: number;
      has_more: boolean;
    }> => {
      const response = await api.get(`/workspaces/${workspaceId}/integrations/google/gmail/emails`, { params });
      return response.data;
    },

    getEmail: async (workspaceId: string, emailId: string): Promise<SyncedEmail> => {
      const response = await api.get(`/workspaces/${workspaceId}/integrations/google/gmail/emails/${emailId}`);
      return response.data;
    },

    sendEmail: async (
      workspaceId: string,
      data: { to: string; subject: string; body_html: string; reply_to_message_id?: string }
    ): Promise<{ message_id: string; thread_id: string | null }> => {
      const response = await api.post(`/workspaces/${workspaceId}/integrations/google/gmail/send`, data);
      return response.data;
    },

    linkEmailToRecord: async (
      workspaceId: string,
      emailId: string,
      data: { record_id: string; link_type?: string }
    ): Promise<{ status: string; link_id?: string }> => {
      const response = await api.post(
        `/workspaces/${workspaceId}/integrations/google/gmail/emails/${emailId}/link`,
        data
      );
      return response.data;
    },
  },

  // Calendar
  calendar: {
    listCalendars: async (workspaceId: string): Promise<{ calendars: GoogleCalendar[] }> => {
      const response = await api.get(`/workspaces/${workspaceId}/integrations/google/calendar/calendars`);
      return response.data;
    },

    sync: async (
      workspaceId: string,
      options?: { calendar_ids?: string[] }
    ): Promise<CalendarSyncResponse> => {
      const response = await api.post(`/workspaces/${workspaceId}/integrations/google/calendar/sync`, options || {});
      return response.data;
    },

    listEvents: async (
      workspaceId: string,
      params?: {
        page?: number;
        page_size?: number;
        start_after?: string;
        start_before?: string;
        calendar_id?: string;
      }
    ): Promise<{
      events: SyncedCalendarEvent[];
      total: number;
      page: number;
      page_size: number;
      has_more: boolean;
    }> => {
      const response = await api.get(`/workspaces/${workspaceId}/integrations/google/calendar/events`, { params });
      return response.data;
    },

    getEvent: async (workspaceId: string, eventId: string): Promise<SyncedCalendarEvent> => {
      const response = await api.get(`/workspaces/${workspaceId}/integrations/google/calendar/events/${eventId}`);
      return response.data;
    },

    createEvent: async (
      workspaceId: string,
      data: {
        calendar_id: string;
        title: string;
        description?: string;
        location?: string;
        start_time: string;
        end_time: string;
        is_all_day?: boolean;
        attendee_emails?: string[];
        record_id?: string;
      }
    ): Promise<{ event_id: string; google_event_id: string; html_link: string | null }> => {
      const response = await api.post(`/workspaces/${workspaceId}/integrations/google/calendar/events`, data);
      return response.data;
    },

    linkEventToRecord: async (
      workspaceId: string,
      eventId: string,
      data: { record_id: string; link_type?: string }
    ): Promise<{ status: string; link_id?: string }> => {
      const response = await api.post(
        `/workspaces/${workspaceId}/integrations/google/calendar/events/${eventId}/link`,
        data
      );
      return response.data;
    },
  },

  // Contact Enrichment
  enrichContacts: async (
    workspaceId: string,
    options?: {
      email_ids?: string[];
      auto_create_contacts?: boolean;
      enrich_existing?: boolean;
    }
  ): Promise<{
    emails_processed: number;
    contacts_created: number;
    contacts_enriched: number;
    companies_created: number;
    errors: number;
  }> => {
    const response = await api.post(`/workspaces/${workspaceId}/integrations/google/enrich`, options);
    return response.data;
  },

  enrichRecord: async (
    workspaceId: string,
    recordId: string
  ): Promise<{
    enriched: boolean;
    enrichments: Record<string, unknown>;
    classification: Record<string, unknown>;
    emails_analyzed: number;
  }> => {
    const response = await api.post(`/workspaces/${workspaceId}/integrations/google/records/${recordId}/enrich`);
    return response.data;
  },
};

// =============================================================================
// AI Agents API
// =============================================================================

// Standard agent types with predefined configurations
export type StandardAgentType = "support" | "sales" | "scheduling" | "onboarding" | "recruiting" | "newsletter" | "custom";
// Allow any string for backwards compatibility with existing CRM agent types
export type AgentType = StandardAgentType | (string & {});

export interface WorkingHoursConfig {
  enabled: boolean;
  timezone: string;
  start: string;  // HH:MM format
  end: string;    // HH:MM format
  days?: number[]; // 0-6 (Sunday-Saturday)
}

export interface CRMAgent {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  agent_type: AgentType;
  mention_handle?: string | null;
  is_system: boolean;

  // LLM Configuration (optional for backwards compatibility)
  llm_provider?: "claude" | "gemini" | "ollama";
  llm_model?: string;
  temperature?: number;
  max_tokens?: number;

  // Legacy fields (for compatibility)
  goal: string | null;
  system_prompt: string | null;
  custom_instructions: string | null;
  tools: string[];
  max_iterations: number;
  timeout_seconds: number;
  model: string;

  // Behavior (optional for backwards compatibility)
  auto_respond?: boolean;
  confidence_threshold?: number;
  require_approval_below?: number;
  max_daily_responses?: number;
  response_delay_minutes?: number;

  // Working hours
  working_hours?: WorkingHoursConfig | null;

  // Escalation
  escalation_email?: string | null;
  escalation_slack_channel?: string | null;

  // Email Integration
  email_address?: string | null;
  email_enabled?: boolean;
  auto_reply_enabled?: boolean;
  email_signature?: string | null;

  // Integration
  crm_sync?: boolean;
  calendar_sync?: boolean;
  calendar_id?: string | null;

  // Status
  is_active: boolean;
  last_active_at: string | null;
  created_by_id: string | null;

  // Stats (with defaults for backwards compatibility)
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  avg_duration_ms: number;
  total_processed?: number;
  total_auto_replied?: number;
  total_escalated?: number;
  avg_confidence?: number | null;

  created_at: string;
  updated_at: string;
}

export interface AgentMetrics {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate: number;
  avg_duration_ms: number;
  avg_confidence: number;
  runs_today: number;
  runs_this_week: number;
  recent_executions: CRMAgentExecution[];
}

export interface CRMAgentExecution {
  id: string;
  agent_id: string;
  conversation_id?: string | null;
  record_id: string | null;
  triggered_by: string | null;
  trigger_id: string | null;
  input_context: Record<string, unknown>;
  output_result: Record<string, unknown> | null;
  steps: Array<{
    step_number: number;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    tool_output?: string;
    thought?: string;
    timestamp?: string;
  }>;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

// Agent Inbox Types
export interface AgentInboxMessage {
  id: string;
  agent_id: string;
  workspace_id: string;
  message_id: string;
  thread_id: string | null;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  status: "pending" | "processing" | "responded" | "escalated" | "archived";
  priority: "low" | "normal" | "high" | "urgent";
  classification: {
    intent?: string;
    sentiment?: string;
    urgency?: string;
    topics?: string[];
  } | null;
  summary: string | null;
  suggested_response: string | null;
  confidence_score: number | null;
  response_id: string | null;
  responded_at: string | null;
  escalated_to: string | null;
  escalated_at: string | null;
  attachments: Array<{ name: string; content_type?: string; length?: number }> | null;
  created_at: string;
  updated_at: string;
}

export interface EmailRoutingRule {
  id: string;
  workspace_id: string;
  agent_id: string;
  rule_type: "domain" | "sender" | "subject_contains" | "keyword";
  rule_value: string;
  priority: number;
  is_active: boolean;
  created_at: string;
}

export interface EmailDomain {
  domain: string;
  is_default: boolean;
  is_verified: boolean;
  display_name: string | null;
}

export interface EmailDomainsListResponse {
  domains: EmailDomain[];
  default_domain: string;
}

export interface EmailEnableResponse {
  email_address: string;
  domain: string;
  enabled: boolean;
}

export interface InboxActionResponse {
  success: boolean;
  message: string;
  inbox_message_id: string;
}

// Agent Conversations
export interface AgentConversation {
  id: string;
  workspace_id: string;
  agent_id: string;
  record_id: string | null;
  title: string | null;
  status: "active" | "completed" | "archived";
  conversation_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  message_count: number;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  conversation_id: string;
  execution_id: string | null;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: ToolCallInfo[] | null;
  tool_name?: string | null;
  tool_output?: Record<string, unknown> | null;
  message_index: number;
  created_at: string;
}

export interface AgentConversationWithMessages extends AgentConversation {
  messages: AgentMessage[];
}

export interface AgentToolInfo {
  name: string;
  description: string;
  category: string;
  is_dangerous?: boolean;
  requires_approval?: boolean;
}

export const TOOL_CATEGORIES = {
  actions: {
    label: "Agent Actions",
    description: "Core actions the agent can take",
    tools: ["reply", "forward", "escalate", "schedule", "create_task", "update_crm", "wait"],
  },
  crm: {
    label: "CRM Tools",
    description: "Interact with CRM data",
    tools: ["search_contacts", "get_record", "update_record", "create_record", "get_activities"],
  },
  email: {
    label: "Email Tools",
    description: "Send and manage emails",
    tools: ["send_email", "create_draft", "get_email_history", "get_writing_style"],
  },
  enrichment: {
    label: "Enrichment Tools",
    description: "Enrich contact and company data",
    tools: ["enrich_company", "enrich_person", "web_search"],
  },
  communication: {
    label: "Communication",
    description: "Send messages via various channels",
    tools: ["send_slack", "send_sms"],
  },
} as const;

export type ToolCategory = keyof typeof TOOL_CATEGORIES;

export interface AgentTypeConfigItem {
  label: string;
  description: string;
  icon: string;
  color: string;
  defaultTools: string[];
}

export const AGENT_TYPE_CONFIG: Record<StandardAgentType, AgentTypeConfigItem> = {
  support: {
    label: "Support Agent",
    description: "Handle customer support inquiries and issues",
    icon: "headphones",
    color: "#22c55e",
    defaultTools: ["reply", "escalate", "search_contacts", "get_email_history", "create_task"],
  },
  sales: {
    label: "Sales Agent",
    description: "Assist with sales outreach and follow-ups",
    icon: "trending-up",
    color: "#3b82f6",
    defaultTools: ["reply", "send_email", "search_contacts", "enrich_person", "update_crm", "schedule"],
  },
  scheduling: {
    label: "Scheduling Agent",
    description: "Manage meeting scheduling and calendar coordination",
    icon: "calendar",
    color: "#8b5cf6",
    defaultTools: ["reply", "schedule", "get_email_history"],
  },
  onboarding: {
    label: "Onboarding Agent",
    description: "Guide new users through onboarding processes",
    icon: "user-plus",
    color: "#ec4899",
    defaultTools: ["reply", "send_email", "create_task", "update_crm"],
  },
  recruiting: {
    label: "Recruiting Agent",
    description: "Assist with candidate outreach and screening",
    icon: "users",
    color: "#f97316",
    defaultTools: ["reply", "send_email", "enrich_person", "search_contacts", "schedule"],
  },
  newsletter: {
    label: "Newsletter Agent",
    description: "Manage newsletter subscriptions and content",
    icon: "newspaper",
    color: "#06b6d4",
    defaultTools: ["reply", "send_email", "get_writing_style"],
  },
  custom: {
    label: "Custom Agent",
    description: "Build a custom agent with your own configuration",
    icon: "sparkles",
    color: "#eab308",
    defaultTools: [],
  },
};

// Default config for unknown agent types
export const DEFAULT_AGENT_TYPE_CONFIG: AgentTypeConfigItem = {
  label: "Agent",
  description: "Custom agent",
  icon: "bot",
  color: "#6366f1",
  defaultTools: [],
};

// Helper to safely get agent type config
export function getAgentTypeConfig(type: AgentType): AgentTypeConfigItem {
  if (type in AGENT_TYPE_CONFIG) {
    return AGENT_TYPE_CONFIG[type as StandardAgentType];
  }
  return DEFAULT_AGENT_TYPE_CONFIG;
}

export interface WritingStyle {
  id: string;
  developer_id: string;
  workspace_id: string;
  style_profile: {
    formality?: string;
    tone?: string;
    avg_sentence_length?: number;
    common_greetings?: string[];
    common_signoffs?: string[];
    common_phrases?: string[];
    sample_excerpts?: string[];
  };
  samples_analyzed: number;
  is_trained: boolean;
  last_trained_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  style_applied: string;
}

export interface AgentCreateData {
  name: string;
  description?: string;
  agent_type?: AgentType;
  mention_handle?: string;
  llm_provider?: "claude" | "gemini" | "ollama";
  llm_model?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  custom_instructions?: string;
  tools?: string[];
  auto_respond?: boolean;
  confidence_threshold?: number;
  require_approval_below?: number;
  max_daily_responses?: number;
  response_delay_minutes?: number;
  working_hours?: WorkingHoursConfig | null;
  escalation_email?: string;
  escalation_slack_channel?: string;
  crm_sync?: boolean;
  calendar_sync?: boolean;
  calendar_id?: string;
  // Legacy fields
  goal?: string;
  max_iterations?: number;
  timeout_seconds?: number;
  model?: string;
}

export interface AgentUpdateData extends Partial<AgentCreateData> {
  is_active?: boolean;
}

export const agentsApi = {
  // Agents CRUD
  list: async (
    workspaceId: string,
    params?: {
      agent_type?: string;
      is_active?: boolean;
      include_system?: boolean;
      skip?: number;
      limit?: number;
    }
  ): Promise<CRMAgent[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents`, { params });
    return response.data;
  },

  get: async (workspaceId: string, agentId: string): Promise<CRMAgent> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/${agentId}`);
    return response.data;
  },

  create: async (
    workspaceId: string,
    data: AgentCreateData
  ): Promise<CRMAgent> => {
    const response = await api.post(`/workspaces/${workspaceId}/crm/agents`, data);
    return response.data;
  },

  update: async (
    workspaceId: string,
    agentId: string,
    data: AgentUpdateData
  ): Promise<CRMAgent> => {
    const response = await api.patch(`/workspaces/${workspaceId}/crm/agents/${agentId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, agentId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/crm/agents/${agentId}`);
  },

  toggle: async (workspaceId: string, agentId: string): Promise<CRMAgent> => {
    const response = await api.post(`/workspaces/${workspaceId}/crm/agents/${agentId}/toggle`);
    return response.data;
  },

  // Tools
  getTools: async (workspaceId: string): Promise<AgentToolInfo[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/tools`);
    return response.data;
  },

  // Metrics
  getMetrics: async (workspaceId: string, agentId: string): Promise<AgentMetrics> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/${agentId}/metrics`);
    return response.data;
  },

  // Test/Dry run
  testAgent: async (
    workspaceId: string,
    agentId: string,
    data: { context?: Record<string, unknown> }
  ): Promise<{ success: boolean; response: string; confidence: number }> => {
    const response = await api.post(`/workspaces/${workspaceId}/crm/agents/${agentId}/test`, data);
    return response.data;
  },

  // Check mention handle availability
  checkMentionHandle: async (
    workspaceId: string,
    handle: string,
    excludeAgentId?: string
  ): Promise<{ available: boolean }> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/check-handle`, {
      params: { handle, exclude_agent_id: excludeAgentId },
    });
    return response.data;
  },

  // Execution
  execute: async (
    workspaceId: string,
    agentId: string,
    data: {
      record_id?: string;
      context?: Record<string, unknown>;
    }
  ): Promise<CRMAgentExecution> => {
    const response = await api.post(`/workspaces/${workspaceId}/crm/agents/${agentId}/run`, data);
    return response.data;
  },

  listExecutions: async (
    workspaceId: string,
    agentId: string,
    params?: {
      status?: string;
      skip?: number;
      limit?: number;
    }
  ): Promise<CRMAgentExecution[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/${agentId}/executions`, { params });
    return response.data;
  },

  getExecution: async (
    workspaceId: string,
    agentId: string,
    executionId: string
  ): Promise<CRMAgentExecution> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/${agentId}/executions/${executionId}`);
    return response.data;
  },

  // Conversations
  createConversation: async (
    workspaceId: string,
    agentId: string,
    data: { message: string; record_id?: string; title?: string }
  ): Promise<AgentConversationWithMessages> => {
    const response = await api.post(`/workspaces/${workspaceId}/crm/agents/${agentId}/conversations`, data);
    return response.data;
  },

  listConversations: async (
    workspaceId: string,
    agentId: string,
    params?: { status?: string; skip?: number; limit?: number }
  ): Promise<AgentConversation[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/${agentId}/conversations`, { params });
    return response.data;
  },

  getConversation: async (
    workspaceId: string,
    agentId: string,
    conversationId: string
  ): Promise<AgentConversationWithMessages> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/${agentId}/conversations/${conversationId}`);
    return response.data;
  },

  sendMessage: async (
    workspaceId: string,
    agentId: string,
    conversationId: string,
    data: { content: string }
  ): Promise<AgentConversationWithMessages> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/crm/agents/${agentId}/conversations/${conversationId}/messages`,
      data
    );
    return response.data;
  },

  updateConversation: async (
    workspaceId: string,
    agentId: string,
    conversationId: string,
    data: { title?: string; status?: "active" | "completed" | "archived" }
  ): Promise<AgentConversation> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/crm/agents/${agentId}/conversations/${conversationId}`,
      data
    );
    return response.data;
  },

  deleteConversation: async (
    workspaceId: string,
    agentId: string,
    conversationId: string
  ): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/crm/agents/${agentId}/conversations/${conversationId}`);
  },

  // Email Integration
  listEmailDomains: async (workspaceId: string): Promise<EmailDomainsListResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/email/domains`);
    return response.data;
  },

  enableEmail: async (
    workspaceId: string,
    agentId: string,
    preferredHandle?: string,
    domain?: string
  ): Promise<EmailEnableResponse> => {
    const response = await api.post(`/workspaces/${workspaceId}/crm/agents/${agentId}/email/enable`, {
      preferred_handle: preferredHandle,
      domain: domain,
    });
    return response.data;
  },

  disableEmail: async (workspaceId: string, agentId: string): Promise<void> => {
    await api.post(`/workspaces/${workspaceId}/crm/agents/${agentId}/email/disable`);
  },

  // Inbox
  listInboxMessages: async (
    workspaceId: string,
    agentId: string,
    params?: {
      status?: string;
      priority?: string;
      skip?: number;
      limit?: number;
    }
  ): Promise<AgentInboxMessage[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/${agentId}/inbox`, { params });
    return response.data;
  },

  getInboxMessage: async (
    workspaceId: string,
    agentId: string,
    messageId: string
  ): Promise<AgentInboxMessage> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/${agentId}/inbox/${messageId}`);
    return response.data;
  },

  replyToInboxMessage: async (
    workspaceId: string,
    agentId: string,
    messageId: string,
    data: { body: string; use_suggested?: boolean; subject?: string }
  ): Promise<InboxActionResponse> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/crm/agents/${agentId}/inbox/${messageId}/reply`,
      data
    );
    return response.data;
  },

  escalateInboxMessage: async (
    workspaceId: string,
    agentId: string,
    messageId: string,
    data: { escalate_to: string; note?: string }
  ): Promise<InboxActionResponse> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/crm/agents/${agentId}/inbox/${messageId}/escalate`,
      data
    );
    return response.data;
  },

  archiveInboxMessage: async (
    workspaceId: string,
    agentId: string,
    messageId: string
  ): Promise<InboxActionResponse> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/crm/agents/${agentId}/inbox/${messageId}/archive`
    );
    return response.data;
  },

  processInboxMessage: async (
    workspaceId: string,
    agentId: string,
    messageId: string
  ): Promise<AgentInboxMessage> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/crm/agents/${agentId}/inbox/${messageId}/process`
    );
    return response.data;
  },

  // Routing Rules
  listRoutingRules: async (
    workspaceId: string,
    agentId: string
  ): Promise<EmailRoutingRule[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/agents/${agentId}/email/routing-rules`);
    return response.data;
  },

  createRoutingRule: async (
    workspaceId: string,
    agentId: string,
    data: {
      rule_type: "domain" | "sender" | "subject_contains" | "keyword";
      rule_value: string;
      priority?: number;
    }
  ): Promise<EmailRoutingRule> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/crm/agents/${agentId}/email/routing-rules`,
      data
    );
    return response.data;
  },

  deleteRoutingRule: async (
    workspaceId: string,
    agentId: string,
    ruleId: string
  ): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/crm/agents/${agentId}/email/routing-rules/${ruleId}`);
  },
};

// =============================================================================
// Automation Agent Integration API
// =============================================================================

export interface AutomationAgentTrigger {
  id: string;
  automation_id: string;
  agent_id: string;
  trigger_point: "on_start" | "on_condition_match" | "as_action";
  trigger_config: Record<string, unknown>;
  input_mapping: Record<string, string>;
  wait_for_completion: boolean;
  timeout_seconds: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  agent_name?: string | null;
  agent_type?: string | null;
}

export interface AutomationAgentTriggerListItem {
  id: string;
  automation_id: string;
  agent_id: string;
  trigger_point: string;
  wait_for_completion: boolean;
  timeout_seconds: number;
  is_active: boolean;
  created_at: string;
  agent_name: string;
  agent_type: string;
  agent_is_active: boolean;
}

export interface AutomationAgentTriggerCreate {
  agent_id: string;
  trigger_point: "on_start" | "on_condition_match" | "as_action";
  trigger_config?: Record<string, unknown>;
  input_mapping?: Record<string, string>;
  wait_for_completion?: boolean;
  timeout_seconds?: number;
}

export interface AutomationAgentTriggerUpdate {
  trigger_config?: Record<string, unknown>;
  input_mapping?: Record<string, string>;
  wait_for_completion?: boolean;
  timeout_seconds?: number;
  is_active?: boolean;
}

export interface AutomationAgentExecution {
  id: string;
  automation_run_id: string | null;
  workflow_execution_id: string | null;
  workflow_step_id: string | null;
  agent_id: string;
  agent_execution_id: string | null;
  trigger_point: string;
  input_context: Record<string, unknown>;
  output_result: Record<string, unknown> | null;
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  agent_name?: string | null;
}

export interface AutomationAgentExecutionListItem {
  id: string;
  automation_run_id: string | null;
  workflow_execution_id: string | null;
  agent_id: string;
  trigger_point: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  agent_name: string;
}

export const automationAgentsApi = {
  // Agent triggers on automations
  createTrigger: async (
    workspaceId: string,
    automationId: string,
    data: AutomationAgentTriggerCreate
  ): Promise<AutomationAgentTrigger> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/crm/automations/${automationId}/agent-triggers`,
      data
    );
    return response.data;
  },

  listTriggers: async (
    workspaceId: string,
    automationId: string,
    params?: { trigger_point?: string; active_only?: boolean }
  ): Promise<AutomationAgentTriggerListItem[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/crm/automations/${automationId}/agent-triggers`,
      { params }
    );
    return response.data;
  },

  getTrigger: async (
    workspaceId: string,
    automationId: string,
    triggerId: string
  ): Promise<AutomationAgentTrigger> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/crm/automations/${automationId}/agent-triggers/${triggerId}`
    );
    return response.data;
  },

  updateTrigger: async (
    workspaceId: string,
    automationId: string,
    triggerId: string,
    data: AutomationAgentTriggerUpdate
  ): Promise<AutomationAgentTrigger> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/crm/automations/${automationId}/agent-triggers/${triggerId}`,
      data
    );
    return response.data;
  },

  deleteTrigger: async (
    workspaceId: string,
    automationId: string,
    triggerId: string
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(
      `/workspaces/${workspaceId}/crm/automations/${automationId}/agent-triggers/${triggerId}`
    );
    return response.data;
  },

  // Agent executions for automations
  listAutomationExecutions: async (
    workspaceId: string,
    automationId: string,
    params?: { skip?: number; limit?: number }
  ): Promise<AutomationAgentExecutionListItem[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/crm/automations/${automationId}/agent-executions`,
      { params }
    );
    return response.data;
  },

  getExecution: async (
    workspaceId: string,
    automationId: string,
    executionId: string
  ): Promise<AutomationAgentExecution> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/crm/automations/${automationId}/agent-executions/${executionId}`
    );
    return response.data;
  },

  // Agent executions from agent perspective
  listAgentAutomationExecutions: async (
    workspaceId: string,
    agentId: string,
    params?: { skip?: number; limit?: number }
  ): Promise<AutomationAgentExecutionListItem[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/agents/${agentId}/automation-executions`,
      { params }
    );
    return response.data;
  },
};

export const writingStyleApi = {
  get: async (workspaceId: string): Promise<WritingStyle | null> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/writing-style`);
    return response.data;
  },

  analyze: async (workspaceId: string, maxSamples?: number): Promise<WritingStyle> => {
    const response = await api.post(`/workspaces/${workspaceId}/crm/writing-style/analyze`, null, {
      params: { max_samples: maxSamples },
    });
    return response.data;
  },

  generateEmail: async (
    workspaceId: string,
    data: {
      recipient_name: string;
      purpose: string;
      key_points?: string[];
      tone_override?: string;
    }
  ): Promise<GeneratedEmail> => {
    const response = await api.post(`/workspaces/${workspaceId}/crm/writing-style/generate-email`, data);
    return response.data;
  },
};

// Workflow Templates API
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  nodes: unknown[];
  edges: unknown[];
  viewport: { x: number; y: number; zoom: number } | null;
  is_system: boolean;
  is_published: boolean;
  use_count: number;
  created_at: string | null;
}

export interface WorkflowTemplateListItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  is_system: boolean;
  use_count: number;
  node_count: number;
  created_at: string | null;
}

export interface WorkflowTemplateCategory {
  id: string;
  label: string;
  icon: string;
  template_count: number;
}

export const workflowTemplatesApi = {
  getCategories: async (workspaceId: string): Promise<WorkflowTemplateCategory[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/workflow-templates/categories`);
    return response.data;
  },

  list: async (workspaceId: string, category?: string): Promise<WorkflowTemplateListItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/workflow-templates`, {
      params: category ? { category } : undefined,
    });
    return response.data;
  },

  get: async (workspaceId: string, templateId: string): Promise<WorkflowTemplate> => {
    const response = await api.get(`/workspaces/${workspaceId}/crm/workflow-templates/${templateId}`);
    return response.data;
  },

  apply: async (
    workspaceId: string,
    templateId: string,
    automationId: string
  ): Promise<{ success: boolean; workflow_id: string; node_count: number; edge_count: number }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/crm/workflow-templates/${templateId}/apply`,
      null,
      { params: { automation_id: automationId } }
    );
    return response.data;
  },

  create: async (
    workspaceId: string,
    automationId: string,
    data: { name: string; description?: string; category?: string }
  ): Promise<WorkflowTemplateListItem> => {
    const response = await api.post(`/workspaces/${workspaceId}/crm/workflow-templates`, null, {
      params: {
        automation_id: automationId,
        name: data.name,
        description: data.description,
        category: data.category || "custom",
      },
    });
    return response.data;
  },

  delete: async (workspaceId: string, templateId: string): Promise<{ success: boolean }> => {
    const response = await api.delete(`/workspaces/${workspaceId}/crm/workflow-templates/${templateId}`);
    return response.data;
  },
};

// Dashboard Customization API
export interface DashboardPreferences {
  id: string;
  developer_id: string;
  preset_type: string;
  visible_widgets: string[];
  widget_order: string[];
  widget_sizes: Record<string, string>;
  layout: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DashboardPreferencesUpdate {
  preset_type?: string;
  visible_widgets?: string[];
  widget_order?: string[];
  widget_sizes?: Record<string, string>;
  layout?: Record<string, unknown>;
}

export interface DashboardPresetInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  widgets: string[];
}

export interface WidgetInfo {
  id: string;
  name: string;
  category: string;
  personas: string[];
  default_size: string;
  icon: string;
}

export interface WidgetCategoryInfo {
  id: string;
  name: string;
  icon: string;
}

export const dashboardApi = {
  getPreferences: async (): Promise<DashboardPreferences> => {
    const response = await api.get("/dashboard/preferences");
    return response.data;
  },

  updatePreferences: async (data: DashboardPreferencesUpdate): Promise<DashboardPreferences> => {
    const response = await api.put("/dashboard/preferences", data);
    return response.data;
  },

  resetPreferences: async (presetType: string = "developer"): Promise<DashboardPreferences> => {
    const response = await api.post("/dashboard/preferences/reset", null, {
      params: { preset_type: presetType },
    });
    return response.data;
  },

  getPresets: async (): Promise<{ presets: DashboardPresetInfo[] }> => {
    const response = await api.get("/dashboard/presets");
    return response.data;
  },

  getWidgets: async (): Promise<{ widgets: WidgetInfo[]; categories: WidgetCategoryInfo[] }> => {
    const response = await api.get("/dashboard/widgets");
    return response.data;
  },

  getAccessibleWidgets: async (workspaceId: string, projectId?: string): Promise<string[]> => {
    const params: Record<string, string> = {};
    if (projectId) params.project_id = projectId;
    const response = await api.get(`/workspaces/${workspaceId}/dashboard/accessible-widgets`, { params });
    return response.data.widget_ids;
  },

  getWidgetsWithPermissions: async (): Promise<{ widgets: WidgetInfo[]; categories: WidgetCategoryInfo[] }> => {
    const response = await api.get("/dashboard/widgets-with-permissions");
    return response.data;
  },
};

// Role Management Types
export type PermissionCategory =
  | "members"
  | "roles"
  | "projects"
  | "teams"
  | "sprints"
  | "tasks"
  | "epics"
  | "tickets"
  | "crm"
  | "documents"
  | "assessments"
  | "hiring"
  | "tracking"
  | "billing"
  | "integrations"
  | "workspace";

export interface PermissionInfo {
  id: string;
  name: string;
  description: string;
  category: PermissionCategory;
}

export interface RoleTemplateInfo {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  permissions: string[];
  priority: number;
}

export interface CustomRole {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string;
  based_on_template: string | null;
  is_system: boolean;
  permissions: string[];
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoleCreate {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  based_on_template?: string;
  permissions?: string[];
  priority?: number;
}

export interface RoleUpdate {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  permissions?: string[];
  priority?: number;
  is_active?: boolean;
}

// Project Management Types
export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_public: boolean;
  public_slug: string | null;
  color: string;
  icon: string;
  settings: Record<string, unknown>;
  status: ProjectStatus;
  member_count: number;
  team_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  settings?: Record<string, unknown>;
  status?: ProjectStatus;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  settings?: Record<string, unknown>;
  status?: ProjectStatus;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  developer_id: string;
  developer_name: string | null;
  developer_email: string | null;
  developer_avatar_url: string | null;
  role_id: string | null;
  role_name: string | null;
  permission_overrides: Record<string, boolean> | null;
  status: "active" | "pending" | "removed";
  invited_at: string | null;
  joined_at: string | null;
  created_at: string;
}

export interface ProjectMemberAdd {
  developer_id: string;
  role_id?: string;
  permission_overrides?: Record<string, boolean>;
}

export interface ProjectMemberUpdate {
  role_id?: string | null;
  permission_overrides?: Record<string, boolean> | null;
  status?: "active" | "pending" | "removed";
}

export interface MyPermissionsResponse {
  permissions: string[];
  role_id: string | null;
  role_name: string | null;
  is_workspace_owner: boolean;
  permission_overrides: Record<string, boolean> | null;
}

export interface ProjectTeamInfo {
  team_id: string;
  team_name: string;
  team_slug: string;
  added_at: string;
}

export interface ProjectInviteRequest {
  emails: string[];
  role_id?: string;
}

export interface ProjectInviteResult {
  invited: string[];
  already_members: string[];
  pending_invites: string[];
  failed: Array<{ email: string; reason: string }>;
}

// Role Management API
export const roleApi = {
  // List role templates
  getTemplates: async (workspaceId: string): Promise<{ templates: RoleTemplateInfo[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/roles/templates`);
    return response.data;
  },

  // Get permission catalog
  getPermissions: async (workspaceId: string): Promise<{
    permissions: PermissionInfo[];
    categories: { id: PermissionCategory; name: string; icon: string }[];
  }> => {
    const response = await api.get(`/workspaces/${workspaceId}/roles/permissions`);
    return response.data;
  },

  // List workspace roles
  list: async (workspaceId: string, includeInactive = false): Promise<{ roles: CustomRole[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/roles`, {
      params: { include_inactive: includeInactive },
    });
    return response.data;
  },

  // Get single role
  get: async (workspaceId: string, roleId: string): Promise<CustomRole> => {
    const response = await api.get(`/workspaces/${workspaceId}/roles/${roleId}`);
    return response.data;
  },

  // Create role
  create: async (workspaceId: string, data: RoleCreate): Promise<CustomRole> => {
    const response = await api.post(`/workspaces/${workspaceId}/roles`, data);
    return response.data;
  },

  // Update role
  update: async (workspaceId: string, roleId: string, data: RoleUpdate): Promise<CustomRole> => {
    const response = await api.patch(`/workspaces/${workspaceId}/roles/${roleId}`, data);
    return response.data;
  },

  // Delete role
  delete: async (workspaceId: string, roleId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/roles/${roleId}`);
  },

  // Duplicate role
  duplicate: async (workspaceId: string, roleId: string, newName?: string): Promise<CustomRole> => {
    const response = await api.post(`/workspaces/${workspaceId}/roles/${roleId}/duplicate`, null, {
      params: newName ? { new_name: newName } : undefined,
    });
    return response.data;
  },

  // Reset role to template
  resetToTemplate: async (workspaceId: string, roleId: string): Promise<CustomRole> => {
    const response = await api.post(`/workspaces/${workspaceId}/roles/${roleId}/reset`);
    return response.data;
  },
};

// Project Management API
export const projectApi = {
  // List projects
  list: async (workspaceId: string, status?: ProjectStatus): Promise<{ projects: Project[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/projects`, {
      params: status ? { status } : undefined,
    });
    return response.data;
  },

  // Get single project
  get: async (workspaceId: string, projectId: string): Promise<Project> => {
    const response = await api.get(`/workspaces/${workspaceId}/projects/${projectId}`);
    return response.data;
  },

  // Create project
  create: async (workspaceId: string, data: ProjectCreate): Promise<Project> => {
    const response = await api.post(`/workspaces/${workspaceId}/projects`, data);
    return response.data;
  },

  // Update project
  update: async (workspaceId: string, projectId: string, data: ProjectUpdate): Promise<Project> => {
    const response = await api.patch(`/workspaces/${workspaceId}/projects/${projectId}`, data);
    return response.data;
  },

  // Delete project
  delete: async (workspaceId: string, projectId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/projects/${projectId}`);
  },

  // Project Members
  getMembers: async (workspaceId: string, projectId: string): Promise<{ members: ProjectMember[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/projects/${projectId}/members`);
    return response.data;
  },

  addMember: async (workspaceId: string, projectId: string, data: ProjectMemberAdd): Promise<ProjectMember> => {
    const response = await api.post(`/workspaces/${workspaceId}/projects/${projectId}/members`, data);
    return response.data;
  },

  updateMember: async (
    workspaceId: string,
    projectId: string,
    developerId: string,
    data: ProjectMemberUpdate
  ): Promise<ProjectMember> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/projects/${projectId}/members/${developerId}`,
      data
    );
    return response.data;
  },

  removeMember: async (workspaceId: string, projectId: string, developerId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/projects/${projectId}/members/${developerId}`);
  },

  // Invite by email
  invite: async (
    workspaceId: string,
    projectId: string,
    data: ProjectInviteRequest
  ): Promise<ProjectInviteResult> => {
    const response = await api.post(`/workspaces/${workspaceId}/projects/${projectId}/invite`, data);
    return response.data;
  },

  // Project Teams
  getTeams: async (workspaceId: string, projectId: string): Promise<{ teams: ProjectTeamInfo[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/projects/${projectId}/teams`);
    return response.data;
  },

  addTeam: async (workspaceId: string, projectId: string, teamId: string): Promise<ProjectTeamInfo> => {
    const response = await api.post(`/workspaces/${workspaceId}/projects/${projectId}/teams`, {
      team_id: teamId,
    });
    return response.data;
  },

  removeTeam: async (workspaceId: string, projectId: string, teamId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/projects/${projectId}/teams/${teamId}`);
  },

  // My permissions in project
  getMyPermissions: async (workspaceId: string, projectId: string): Promise<MyPermissionsResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/projects/${projectId}/my-permissions`);
    return response.data;
  },

  // Accessible widgets in project context
  getAccessibleWidgets: async (workspaceId: string, projectId: string): Promise<{ widget_ids: string[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/projects/${projectId}/accessible-widgets`);
    return response.data;
  },

  // Toggle project visibility (public/private)
  toggleVisibility: async (workspaceId: string, projectId: string): Promise<Project> => {
    const response = await api.post(`/workspaces/${workspaceId}/projects/${projectId}/toggle-visibility`);
    return response.data;
  },
};

// Public Project Types (no auth required)
export interface PublicProject {
  id: string;
  name: string;
  slug: string;
  public_slug: string | null;
  description: string | null;
  color: string;
  icon: string;
  status: ProjectStatus;
  member_count: number;
  team_count: number;
  public_tabs: string[];
  created_at: string;
}

export interface PublicTabsConfig {
  enabled_tabs: string[];
}

export interface PublicTaskItem {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  labels: string[];
  story_points: number | null;
  created_at: string;
}

export interface PublicStoryItem {
  id: string;
  key: string;
  title: string;
  as_a: string;
  i_want: string;
  so_that: string | null;
  priority: string;
  status: string;
  story_points: number | null;
  labels: string[];
  created_at: string;
}

export interface PublicBugItem {
  id: string;
  key: string;
  title: string;
  severity: string;
  priority: string;
  bug_type: string;
  status: string;
  is_regression: boolean;
  labels: string[];
  created_at: string;
}

export interface PublicGoalItem {
  id: string;
  key: string;
  title: string;
  description: string | null;
  goal_type: string;
  status: string;
  progress_percentage: number;
  target_value: number | null;
  current_value: number | null;
  start_date: string | null;
  end_date: string | null;
}

export interface PublicReleaseItem {
  id: string;
  name: string;
  version: string | null;
  description: string | null;
  status: string;
  risk_level: string;
  target_date: string | null;
  actual_release_date: string | null;
  created_at: string;
}

export interface PublicRoadmapItem {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  start_date: string;
  end_date: string;
  tasks_count: number;
  completed_count: number;
  total_points: number;
  completed_points: number;
}

export interface PublicSprintItem {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  start_date: string;
  end_date: string;
  tasks_count: number;
  completed_count: number;
  total_points: number;
  completed_points: number;
}

// Roadmap Voting Types
export interface RoadmapRequestAuthor {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

export interface RoadmapRequest {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  vote_count: number;
  comment_count: number;
  submitted_by: RoadmapRequestAuthor;
  admin_response: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  has_voted: boolean;
}

export interface PaginatedRoadmapRequests {
  items: RoadmapRequest[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface RoadmapComment {
  id: string;
  content: string;
  author: RoadmapRequestAuthor;
  is_admin_response: boolean;
  created_at: string;
}

export interface RoadmapVoteResponse {
  success: boolean;
  vote_count: number;
  has_voted: boolean;
}

export type RoadmapCategory = "feature" | "improvement" | "integration" | "bug_fix" | "other";
export type RoadmapStatus = "under_review" | "planned" | "in_progress" | "completed" | "declined";

export interface PublicBoardData {
  todo: PublicTaskItem[];
  in_progress: PublicTaskItem[];
  review: PublicTaskItem[];
  done: PublicTaskItem[];
}

// Public Projects API (no auth required)
export const publicProjectApi = {
  // Get a public project by its public slug
  getByPublicSlug: async (publicSlug: string): Promise<PublicProject> => {
    const response = await api.get(`/public/projects/${publicSlug}`);
    return response.data;
  },

  // Get backlog items
  getBacklog: async (publicSlug: string, limit = 50, offset = 0): Promise<PublicTaskItem[]> => {
    const response = await api.get(`/public/projects/${publicSlug}/backlog`, {
      params: { limit, offset },
    });
    return response.data;
  },

  // Get board data
  getBoard: async (publicSlug: string): Promise<PublicBoardData> => {
    const response = await api.get(`/public/projects/${publicSlug}/board`);
    return response.data;
  },

  // Get stories
  getStories: async (publicSlug: string, limit = 50, offset = 0): Promise<PublicStoryItem[]> => {
    const response = await api.get(`/public/projects/${publicSlug}/stories`, {
      params: { limit, offset },
    });
    return response.data;
  },

  // Get bugs
  getBugs: async (publicSlug: string, limit = 50, offset = 0): Promise<PublicBugItem[]> => {
    const response = await api.get(`/public/projects/${publicSlug}/bugs`, {
      params: { limit, offset },
    });
    return response.data;
  },

  // Get goals
  getGoals: async (publicSlug: string, limit = 50, offset = 0): Promise<PublicGoalItem[]> => {
    const response = await api.get(`/public/projects/${publicSlug}/goals`, {
      params: { limit, offset },
    });
    return response.data;
  },

  // Get releases
  getReleases: async (publicSlug: string, limit = 50, offset = 0): Promise<PublicReleaseItem[]> => {
    const response = await api.get(`/public/projects/${publicSlug}/releases`, {
      params: { limit, offset },
    });
    return response.data;
  },

  // Get roadmap (sprints) - legacy endpoint
  getRoadmap: async (publicSlug: string, limit = 50, offset = 0): Promise<PublicRoadmapItem[]> => {
    const response = await api.get(`/public/projects/${publicSlug}/roadmap`, {
      params: { limit, offset },
    });
    return response.data;
  },

  // Get timeline (sprint timeline view)
  getTimeline: async (publicSlug: string, limit = 50, offset = 0): Promise<PublicSprintItem[]> => {
    const response = await api.get(`/public/projects/${publicSlug}/timeline`, {
      params: { limit, offset },
    });
    return response.data;
  },

  // Get sprints
  getSprints: async (publicSlug: string, limit = 50, offset = 0): Promise<PublicSprintItem[]> => {
    const response = await api.get(`/public/projects/${publicSlug}/sprints`, {
      params: { limit, offset },
    });
    return response.data;
  },

  // Roadmap Voting API
  getRoadmapRequests: async (
    publicSlug: string,
    options?: {
      status?: RoadmapStatus;
      category?: RoadmapCategory;
      sortBy?: "votes" | "newest" | "oldest";
      page?: number;
      pageSize?: number;
    }
  ): Promise<PaginatedRoadmapRequests> => {
    const response = await api.get(`/public/projects/${publicSlug}/roadmap-requests`, {
      params: {
        status: options?.status,
        category: options?.category,
        sort_by: options?.sortBy || "votes",
        page: options?.page || 1,
        page_size: options?.pageSize || 10,
      },
    });
    return response.data;
  },

  getRoadmapRequest: async (publicSlug: string, requestId: string): Promise<RoadmapRequest> => {
    const response = await api.get(`/public/projects/${publicSlug}/roadmap-requests/${requestId}`);
    return response.data;
  },

  createRoadmapRequest: async (
    publicSlug: string,
    data: { title: string; description?: string; category?: RoadmapCategory }
  ): Promise<RoadmapRequest> => {
    const response = await api.post(`/public/projects/${publicSlug}/roadmap-requests`, data);
    return response.data;
  },

  voteRoadmapRequest: async (publicSlug: string, requestId: string): Promise<RoadmapVoteResponse> => {
    const response = await api.post(`/public/projects/${publicSlug}/roadmap-requests/${requestId}/vote`);
    return response.data;
  },

  getRoadmapComments: async (
    publicSlug: string,
    requestId: string,
    limit = 50,
    offset = 0
  ): Promise<RoadmapComment[]> => {
    const response = await api.get(`/public/projects/${publicSlug}/roadmap-requests/${requestId}/comments`, {
      params: { limit, offset },
    });
    return response.data;
  },

  createRoadmapComment: async (
    publicSlug: string,
    requestId: string,
    content: string
  ): Promise<RoadmapComment> => {
    const response = await api.post(`/public/projects/${publicSlug}/roadmap-requests/${requestId}/comments`, {
      content,
    });
    return response.data;
  },
};

// Project public tabs configuration API (authenticated)
export const projectTabsApi = {
  // Get public tabs configuration
  getPublicTabs: async (workspaceId: string, projectId: string): Promise<PublicTabsConfig> => {
    const response = await api.get(`/workspaces/${workspaceId}/projects/${projectId}/public-tabs`);
    return response.data;
  },

  // Update public tabs configuration
  updatePublicTabs: async (
    workspaceId: string,
    projectId: string,
    enabledTabs: string[]
  ): Promise<PublicTabsConfig> => {
    const response = await api.put(`/workspaces/${workspaceId}/projects/${projectId}/public-tabs`, {
      enabled_tabs: enabledTabs,
    });
    return response.data;
  },
};

// ============ User Stories Types ============

export type StoryStatus = "draft" | "ready" | "in_progress" | "review" | "accepted" | "rejected";
export type StoryPriority = "critical" | "high" | "medium" | "low";

export interface AcceptanceCriterion {
  id: string;
  description: string;
  completed: boolean;
  completed_at?: string;
  completed_by?: string;
}

export interface UserStory {
  id: string;
  key: string;
  title: string;
  as_a: string;
  i_want: string;
  so_that?: string;
  description?: string;
  acceptance_criteria: AcceptanceCriterion[];
  acceptance_criteria_completed?:number;
  acceptance_criteria_count?:number;
  story_points?: number;
  priority: StoryPriority;
  status: StoryStatus;
  workspace_id: string;
  project_id?: string;
  epic_id?: string;
  release_id?: string;
  reporter_id: string;
  assignee_id?: string;
  design_links?: string[];
  labels?: string[];
  custom_fields?: Record<string, unknown>;
  ready_at?: string;
  accepted_at?: string;
  rejected_at?: string;
  cycle_time_hours?: number;
  lead_time_hours?: number;
  created_at: string;
  updated_at: string;
}

export interface UserStoryCreate {
  title: string;
  as_a: string;
  i_want: string;
  so_that?: string;
  description?: string;
  acceptance_criteria?: AcceptanceCriterion[];
  story_points?: number;
  priority?: StoryPriority;
  epic_id?: string;
  release_id?: string;
  assignee_id?: string;
  design_links?: string[];
  labels?: string[];
}

export interface UserStoryUpdate {
  title?: string;
  as_a?: string;
  i_want?: string;
  so_that?: string;
  description?: string;
  story_points?: number;
  priority?: StoryPriority;
  status?: StoryStatus;
  epic_id?: string;
  release_id?: string;
  assignee_id?: string;
  design_links?: string[];
  labels?: string[];
}

// User Stories API
export const storiesApi = {
  list: async (
    workspaceId: string,
    params?: {
      project_id?: string;
      epic_id?: string;
      release_id?: string;
      status?: StoryStatus;
      priority?: StoryPriority;
      assignee_id?: string;
      skip?: number;
      limit?: number;
    }
  ): Promise<{ items: UserStory[]; total: number }> => {
    const response = await api.get(`/workspaces/${workspaceId}/stories`, { params });
    return response.data;
  },

  get: async (workspaceId: string, storyId: string): Promise<UserStory> => {
    const response = await api.get(`/workspaces/${workspaceId}/stories/${storyId}`);
    return response.data;
  },

  create: async (workspaceId: string, data: UserStoryCreate): Promise<UserStory> => {
    const response = await api.post(`/workspaces/${workspaceId}/stories`, data);
    return response.data;
  },

  update: async (workspaceId: string, storyId: string, data: UserStoryUpdate): Promise<UserStory> => {
    const response = await api.patch(`/workspaces/${workspaceId}/stories/${storyId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, storyId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/stories/${storyId}`);
  },

  // Status transitions
  markReady: async (workspaceId: string, storyId: string): Promise<UserStory> => {
    const response = await api.post(`/workspaces/${workspaceId}/stories/${storyId}/ready`);
    return response.data;
  },

  accept: async (workspaceId: string, storyId: string): Promise<UserStory> => {
    const response = await api.post(`/workspaces/${workspaceId}/stories/${storyId}/accept`);
    return response.data;
  },

  reject: async (workspaceId: string, storyId: string, reason?: string): Promise<UserStory> => {
    const response = await api.post(`/workspaces/${workspaceId}/stories/${storyId}/reject`, { reason });
    return response.data;
  },

  // Acceptance criteria
  updateAcceptanceCriterion: async (
    workspaceId: string,
    storyId: string,
    criterionId: string,
    completed: boolean
  ): Promise<UserStory> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/stories/${storyId}/acceptance-criteria/${criterionId}`,
      { completed }
    );
    return response.data;
  },

  // Tasks
  getTasks: async (workspaceId: string, storyId: string): Promise<{ items: unknown[]; total: number }> => {
    const response = await api.get(`/workspaces/${workspaceId}/stories/${storyId}/tasks`);
    return response.data;
  },
};

// ============ Releases Types ============

export type ReleaseStatus = "planning" | "in_progress" | "code_freeze" | "testing" | "released" | "cancelled";
export type ReleaseRiskLevel = "low" | "medium" | "high" | "critical";

export interface ReadinessChecklistItem {
  id: string;
  item: string;
  completed: boolean;
  required: boolean;
  completed_at?: string;
  completed_by?: string;
}

export interface Release {
  id: string;
  name: string;
  version?: string;
  description?: string;
  target_date?: string;
  actual_release_date?: string;
  status: ReleaseStatus;
  risk_level: ReleaseRiskLevel;
  readiness_checklist: ReadinessChecklistItem[];
  workspace_id: string;
  project_id?: string;
  owner_id?: string;
  release_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ReleaseCreate {
  name: string;
  version?: string;
  description?: string;
  target_date?: string;
  project_id?: string;
  owner_id?: string;
  risk_level?: ReleaseRiskLevel;
  readiness_checklist?: ReadinessChecklistItem[];
}

export interface ReleaseUpdate {
  name?: string;
  version?: string;
  description?: string;
  target_date?: string;
  status?: ReleaseStatus;
  risk_level?: ReleaseRiskLevel;
  owner_id?: string;
  release_notes?: string;
}

// Releases API
export const releasesApi = {
  list: async (
    workspaceId: string,
    params?: {
      project_id?: string;
      status?: ReleaseStatus;
      skip?: number;
      limit?: number;
    }
  ): Promise<{ items: Release[]; total: number }> => {
    const response = await api.get(`/workspaces/${workspaceId}/releases`, { params });
    return response.data;
  },

  get: async (workspaceId: string, releaseId: string): Promise<Release> => {
    const response = await api.get(`/workspaces/${workspaceId}/releases/${releaseId}`);
    return response.data;
  },

  create: async (workspaceId: string, data: ReleaseCreate): Promise<Release> => {
    const response = await api.post(`/workspaces/${workspaceId}/releases`, data);
    return response.data;
  },

  update: async (workspaceId: string, releaseId: string, data: ReleaseUpdate): Promise<Release> => {
    const response = await api.patch(`/workspaces/${workspaceId}/releases/${releaseId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, releaseId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/releases/${releaseId}`);
  },

  // Lifecycle actions
  freeze: async (workspaceId: string, releaseId: string): Promise<Release> => {
    const response = await api.post(`/workspaces/${workspaceId}/releases/${releaseId}/freeze`);
    return response.data;
  },

  publish: async (workspaceId: string, releaseId: string, releaseNotes?: string): Promise<Release> => {
    const response = await api.post(`/workspaces/${workspaceId}/releases/${releaseId}/publish`, { release_notes: releaseNotes });
    return response.data;
  },

  // Readiness
  getReadiness: async (workspaceId: string, releaseId: string): Promise<{
    total_items: number;
    completed_items: number;
    required_items: number;
    required_completed: number;
    is_ready: boolean;
    story_readiness_percentage: number;
  }> => {
    const response = await api.get(`/workspaces/${workspaceId}/releases/${releaseId}/readiness`);
    return response.data;
  },

  updateChecklistItem: async (
    workspaceId: string,
    releaseId: string,
    itemId: string,
    completed: boolean
  ): Promise<Release> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/releases/${releaseId}/checklist/${itemId}`,
      { completed }
    );
    return response.data;
  },

  // Stories in release
  getStories: async (workspaceId: string, releaseId: string): Promise<{ items: UserStory[]; total: number }> => {
    const response = await api.get(`/workspaces/${workspaceId}/releases/${releaseId}/stories`);
    return response.data;
  },
};

// ============ OKR Goals Types ============

export type OKRGoalType = "objective" | "key_result" | "initiative";
export type OKRGoalStatus = "not_started" | "draft" | "active" | "on_track" | "at_risk" | "behind" | "achieved" | "missed" | "cancelled";
export type OKRPeriodType = "quarter" | "year" | "half_year" | "custom";
export type OKRMetricType = "percentage" | "number" | "currency" | "boolean";

export interface OKRGoal {
  id: string;
  key: string;
  title: string;
  description?: string;
  goal_type: OKRGoalType;
  parent_goal_id?: string;
  workspace_id: string;
  owner_id?: string;
  period_type: OKRPeriodType;
  period_start?: string;
  period_end?: string;
  metric_type: OKRMetricType;
  target_value: number;
  current_value: number;
  starting_value: number;
  unit?: string;
  status: OKRGoalStatus;
  confidence_level: number;
  progress_percentage: number;
  created_at: string;
  updated_at: string;
}

export interface OKRGoalCreate {
  title: string;
  description?: string;
  goal_type?: OKRGoalType;
  parent_goal_id?: string;
  owner_id?: string;
  period_type?: OKRPeriodType;
  start_date: string;  // Required: YYYY-MM-DD format
  end_date: string;    // Required: YYYY-MM-DD format
  metric_type?: OKRMetricType;
  target_value?: number;
  starting_value?: number;
  unit?: string;
}

export interface OKRGoalUpdate {
  title?: string;
  description?: string;
  owner_id?: string;
  start_date?: string;
  end_date?: string;
  target_value?: number;
  unit?: string;
  status?: OKRGoalStatus;
  confidence_level?: number;
  comment?: string;  // Optional comment for activity timeline
}

export interface OKRProgressUpdate {
  current_value: number;
  notes?: string;
}

// OKR Goals API
export const okrGoalsApi = {
  list: async (
    workspaceId: string,
    params?: {
      goal_type?: OKRGoalType;
      status?: OKRGoalStatus;
      owner_id?: string;
      parent_goal_id?: string;
      period_type?: OKRPeriodType;
      skip?: number;
      limit?: number;
    }
  ): Promise<{ items: OKRGoal[]; total: number }> => {
    const response = await api.get(`/workspaces/${workspaceId}/goals`, { params });
    // Backend returns an array, transform to expected format
    const items = Array.isArray(response.data) ? response.data : response.data.items || [];
    return { items, total: items.length };
  },

  get: async (workspaceId: string, goalId: string): Promise<OKRGoal> => {
    const response = await api.get(`/workspaces/${workspaceId}/goals/${goalId}`);
    return response.data;
  },

  create: async (workspaceId: string, data: OKRGoalCreate): Promise<OKRGoal> => {
    const response = await api.post(`/workspaces/${workspaceId}/goals`, data);
    return response.data;
  },

  update: async (workspaceId: string, goalId: string, data: OKRGoalUpdate): Promise<OKRGoal> => {
    const response = await api.patch(`/workspaces/${workspaceId}/goals/${goalId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, goalId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/goals/${goalId}`);
  },

  // Key Results
  getKeyResults: async (workspaceId: string, goalId: string): Promise<{ items: OKRGoal[]; total: number }> => {
    const response = await api.get(`/workspaces/${workspaceId}/goals`, {
      params: { parent_goal_id: goalId, goal_type: 'key_result' }
    });
    // Backend returns an array, transform to expected format
    const items = Array.isArray(response.data) ? response.data : response.data.items || [];
    return { items, total: items.length };
  },

  addKeyResult: async (workspaceId: string, goalId: string, data: OKRGoalCreate): Promise<OKRGoal> => {
    const response = await api.post(`/workspaces/${workspaceId}/goals/${goalId}/key-results`, data);
    return response.data;
  },

  // Progress
  updateProgress: async (workspaceId: string, goalId: string, data: OKRProgressUpdate): Promise<OKRGoal> => {
    const response = await api.post(`/workspaces/${workspaceId}/goals/${goalId}/progress`, data);
    return response.data;
  },

  // Linking
  linkEpic: async (workspaceId: string, goalId: string, epicId: string): Promise<void> => {
    await api.post(`/workspaces/${workspaceId}/goals/${goalId}/link-epic`, { epic_id: epicId });
  },

  unlinkEpic: async (workspaceId: string, goalId: string, epicId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/goals/${goalId}/link-epic/${epicId}`);
  },

  linkProject: async (workspaceId: string, goalId: string, projectId: string): Promise<void> => {
    await api.post(`/workspaces/${workspaceId}/goals/${goalId}/link-project`, { project_id: projectId });
  },

  unlinkProject: async (workspaceId: string, goalId: string, projectId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/goals/${goalId}/link-project/${projectId}`);
  },

  // Dashboard
  getDashboard: async (workspaceId: string): Promise<{
    objectives: OKRGoal[];
    summary: {
      total_objectives: number;
      on_track: number;
      at_risk: number;
      behind: number;
      achieved: number;
      average_progress: number;
    };
  }> => {
    const response = await api.get(`/workspaces/${workspaceId}/goals/dashboard`);
    const data = response.data;
    // Transform backend response to expected format
    return {
      objectives: data.objectives || [],
      summary: {
        total_objectives: data.total_objectives || 0,
        on_track: data.on_track_count || 0,
        at_risk: data.at_risk_count || 0,
        behind: data.behind_count || 0,
        achieved: data.achieved_count || 0,
        average_progress: data.avg_progress || 0,
      },
    };
  },
};

// ============ Entity Activity Types ============

export type EntityActivityType = "goal" | "task" | "backlog" | "story" | "release" | "roadmap" | "epic" | "bug";
export type ActivityActionType = "created" | "updated" | "comment" | "status_changed" | "assigned" | "progress_updated" | "linked" | "unlinked";

export interface ActorInfo {
  id: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

export interface EntityActivity {
  id: string;
  workspace_id: string;
  entity_type: EntityActivityType;
  entity_id: string;
  activity_type: ActivityActionType;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
  actor_avatar_url?: string;
  title?: string;
  content?: string;
  changes?: Record<string, { old?: string; new?: string }>;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface TimelineEntry {
  id: string;
  activity_type: ActivityActionType;
  actor?: ActorInfo;
  title?: string;
  content?: string;
  changes?: Record<string, { old?: string; new?: string }>;
  metadata?: Record<string, unknown>;
  created_at: string;
  display_text?: string;
  icon?: string;
}

export interface EntityActivityListResponse {
  items: EntityActivity[];
  total: number;
  has_more: boolean;
}

export interface TimelineResponse {
  entity_type: EntityActivityType;
  entity_id: string;
  entries: TimelineEntry[];
  total: number;
}

export interface EntityCommentCreate {
  content: string;
}

// Entity Activity API
export const entityActivityApi = {
  // List activities for a workspace
  list: async (
    workspaceId: string,
    params?: {
      entity_type?: EntityActivityType;
      entity_id?: string;
      activity_type?: ActivityActionType;
      actor_id?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<EntityActivityListResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/activities`, { params });
    return response.data;
  },

  // Get timeline for a specific entity
  getTimeline: async (
    workspaceId: string,
    entityType: EntityActivityType,
    entityId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<TimelineResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/activities/timeline/${entityType}/${entityId}`,
      { params }
    );
    return response.data;
  },

  // Add a comment to an entity
  addComment: async (
    workspaceId: string,
    entityType: EntityActivityType,
    entityId: string,
    content: string
  ): Promise<EntityActivity> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/activities/${entityType}/${entityId}/comment`,
      { content }
    );
    return response.data;
  },

  // Delete a comment (only own comments)
  deleteComment: async (workspaceId: string, activityId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/activities/${activityId}`);
  },
};

// ============ Bugs Types ============

export type BugSeverity = "blocker" | "critical" | "major" | "minor" | "trivial";
export type BugPriority = "critical" | "high" | "medium" | "low";
export type BugType = "functional" | "performance" | "security" | "ui" | "data" | "integration" | "other";
export type BugStatus = "new" | "confirmed" | "in_progress" | "fixed" | "verified" | "closed" | "wont_fix" | "duplicate" | "cannot_reproduce";

export interface ReproductionStep {
  step_number: number;
  description: string;
}

export interface Bug {
  id: string;
  key: string;
  title: string;
  description?: string;
  severity: BugSeverity;
  priority: BugPriority;
  bug_type: BugType;
  status: BugStatus;
  steps_to_reproduce: ReproductionStep[];
  expected_behavior?: string;
  actual_behavior?: string;
  environment?: string;
  affected_version?: string;
  fixed_version?: string;
  workspace_id: string;
  project_id?: string;
  story_id?: string;
  release_id?: string;
  reporter_id: string;
  assignee_id?: string;
  is_regression: boolean;
  labels?: string[];
  attachments?: string[];
  confirmed_at?: string;
  fixed_at?: string;
  verified_at?: string;
  closed_at?: string;
  resolution?: string;
  created_at: string;
  updated_at: string;
}

export interface BugCreate {
  title: string;
  description?: string;
  severity?: BugSeverity;
  priority?: BugPriority;
  bug_type?: BugType;
  steps_to_reproduce?: ReproductionStep[];
  expected_behavior?: string;
  actual_behavior?: string;
  environment?: string;
  affected_version?: string;
  project_id?: string;
  story_id?: string;
  release_id?: string;
  assignee_id?: string;
  is_regression?: boolean;
  labels?: string[];
}

export interface BugUpdate {
  title?: string;
  description?: string;
  severity?: BugSeverity;
  priority?: BugPriority;
  bug_type?: BugType;
  steps_to_reproduce?: ReproductionStep[];
  expected_behavior?: string;
  actual_behavior?: string;
  environment?: string;
  affected_version?: string;
  fixed_version?: string;
  story_id?: string;
  release_id?: string;
  assignee_id?: string;
  is_regression?: boolean;
  labels?: string[];
}

export type BugActivityAction =
  | "created"
  | "updated"
  | "status_changed"
  | "assigned"
  | "comment"
  | "verified"
  | "reopened";

export interface BugActivity {
  id: string;
  bug_id: string;
  action: BugActivityAction;
  actor_id?: string;
  actor_name?: string;
  actor_avatar_url?: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  comment?: string;
  activity_metadata?: Record<string, unknown>;
  created_at: string;
}

// Bugs API
export const bugsApi = {
  list: async (
    workspaceId: string,
    params?: {
      project_id?: string;
      story_id?: string;
      release_id?: string;
      status?: BugStatus;
      severity?: BugSeverity;
      priority?: BugPriority;
      assignee_id?: string;
      is_regression?: boolean;
      include_closed?: boolean;
      skip?: number;
      limit?: number;
    }
  ): Promise<{ items: Bug[]; total: number }> => {
    const response = await api.get(`/workspaces/${workspaceId}/bugs`, { params });
    // Backend returns array directly, wrap it for frontend compatibility
    const items = Array.isArray(response.data) ? response.data : response.data.items || [];
    return { items, total: items.length };
  },

  get: async (workspaceId: string, bugId: string): Promise<Bug> => {
    const response = await api.get(`/workspaces/${workspaceId}/bugs/${bugId}`);
    return response.data;
  },

  create: async (workspaceId: string, data: BugCreate): Promise<Bug> => {
    const response = await api.post(`/workspaces/${workspaceId}/bugs`, data);
    return response.data;
  },

  update: async (workspaceId: string, bugId: string, data: BugUpdate): Promise<Bug> => {
    const response = await api.patch(`/workspaces/${workspaceId}/bugs/${bugId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, bugId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/bugs/${bugId}`);
  },

  // Status transitions
  confirm: async (workspaceId: string, bugId: string): Promise<Bug> => {
    const response = await api.post(`/workspaces/${workspaceId}/bugs/${bugId}/confirm`);
    return response.data;
  },

  fix: async (workspaceId: string, bugId: string, data?: {
    fixed_in_version?: string;
    root_cause?: string;
    resolution_notes?: string;
  }): Promise<Bug> => {
    const response = await api.post(`/workspaces/${workspaceId}/bugs/${bugId}/fix`, data || {});
    return response.data;
  },

  verify: async (workspaceId: string, bugId: string): Promise<Bug> => {
    const response = await api.post(`/workspaces/${workspaceId}/bugs/${bugId}/verify`);
    return response.data;
  },

  close: async (workspaceId: string, bugId: string, resolution?: "fixed" | "wont_fix" | "duplicate" | "cannot_reproduce", notes?: string): Promise<Bug> => {
    const response = await api.post(`/workspaces/${workspaceId}/bugs/${bugId}/close`, {
      resolution: resolution || "fixed",
      notes
    });
    return response.data;
  },

  reopen: async (workspaceId: string, bugId: string, reason?: string): Promise<Bug> => {
    const response = await api.post(`/workspaces/${workspaceId}/bugs/${bugId}/reopen`, { reason });
    return response.data;
  },

  // Statistics
  getStats: async (workspaceId: string, projectId?: string): Promise<{
    total: number;
    by_status: Record<BugStatus, number>;
    by_severity: Record<BugSeverity, number>;
    by_priority: Record<BugPriority, number>;
    regressions: number;
    avg_resolution_hours?: number;
  }> => {
    const response = await api.get(`/workspaces/${workspaceId}/bugs/stats`, {
      params: { project_id: projectId },
    });
    // Map backend response to frontend expected format
    const data = response.data;
    return {
      total: data.total_bugs || 0,
      by_status: {
        new: data.new_bugs || 0,
        confirmed: data.confirmed_bugs || 0,
        in_progress: data.in_progress_bugs || 0,
        fixed: data.fixed_bugs || 0,
        verified: data.verified_bugs || 0,
        closed: data.closed_bugs || 0,
        wont_fix: 0,
        duplicate: 0,
        cannot_reproduce: 0,
      },
      by_severity: {
        blocker: data.blocker_bugs || 0,
        critical: data.critical_bugs || 0,
        major: data.major_bugs || 0,
        minor: data.minor_bugs || 0,
        trivial: data.trivial_bugs || 0,
      },
      by_priority: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      regressions: data.regression_count || 0,
      avg_resolution_hours: data.avg_time_to_fix_hours,
    };
  },

  // Activities / Timeline
  getActivities: async (
    workspaceId: string,
    bugId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<BugActivity[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/bugs/${bugId}/activities`,
      { params }
    );
    return response.data;
  },

  addComment: async (
    workspaceId: string,
    bugId: string,
    comment: string
  ): Promise<BugActivity> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/bugs/${bugId}/comments`,
      { comment }
    );
    return response.data;
  },
};

// ============ Dependencies Types ============

export type DependencyType = "blocks" | "is_blocked_by" | "relates_to" | "duplicates" | "is_child_of" | "is_parent_of";
export type DependencyStatus = "active" | "resolved";

export interface StoryDependency {
  id: string;
  dependent_story_id: string;
  blocking_story_id: string;
  dependency_type: DependencyType;
  description?: string;
  is_cross_project: boolean;
  status: DependencyStatus;
  resolved_at?: string;
  resolved_by?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskDependency {
  id: string;
  dependent_task_id: string;
  blocking_task_id: string;
  dependency_type: DependencyType;
  description?: string;
  is_cross_sprint: boolean;
  status: DependencyStatus;
  resolved_at?: string;
  resolved_by?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DependencyCreate {
  blocking_story_id?: string;
  blocking_task_id?: string;
  dependency_type?: DependencyType;
  description?: string;
}

export interface DependencyGraphNode {
  id: string;
  type: "story" | "task";
  key: string;
  title: string;
  status: string;
}

export interface DependencyGraphEdge {
  id: string;
  source: string;
  target: string;
  type: DependencyType;
  status: DependencyStatus;
}

export interface BlockedItem {
  id: string;
  key: string;
  title: string;
  status: string;
  blocked_by: {
    id: string;
    key: string;
    title: string;
    status: string;
  };
}

// Dependencies API
export const dependenciesApi = {
  // Story dependencies
  createStoryDependency: async (storyId: string, data: DependencyCreate): Promise<StoryDependency> => {
    const response = await api.post(`/dependencies/stories/${storyId}`, data);
    return response.data;
  },

  listStoryDependencies: async (
    storyId: string,
    params?: {
      direction?: "all" | "blocking" | "blocked_by";
      include_resolved?: boolean;
    }
  ): Promise<{ items: StoryDependency[]; total: number }> => {
    const response = await api.get(`/dependencies/stories/${storyId}`, { params });
    return response.data;
  },

  updateStoryDependency: async (
    dependencyId: string,
    data: { dependency_type?: DependencyType; description?: string }
  ): Promise<StoryDependency> => {
    const response = await api.patch(`/dependencies/stories/dependency/${dependencyId}`, data);
    return response.data;
  },

  deleteStoryDependency: async (dependencyId: string): Promise<void> => {
    await api.delete(`/dependencies/stories/dependency/${dependencyId}`);
  },

  resolveStoryDependency: async (dependencyId: string): Promise<StoryDependency> => {
    const response = await api.post(`/dependencies/stories/dependency/${dependencyId}/resolve`);
    return response.data;
  },

  // Task dependencies
  createTaskDependency: async (taskId: string, data: DependencyCreate): Promise<TaskDependency> => {
    const response = await api.post(`/dependencies/tasks/${taskId}`, data);
    return response.data;
  },

  listTaskDependencies: async (
    taskId: string,
    params?: {
      direction?: "all" | "blocking" | "blocked_by";
      include_resolved?: boolean;
    }
  ): Promise<{ items: TaskDependency[]; total: number }> => {
    const response = await api.get(`/dependencies/tasks/${taskId}`, { params });
    return response.data;
  },

  updateTaskDependency: async (
    dependencyId: string,
    data: { dependency_type?: DependencyType; description?: string }
  ): Promise<TaskDependency> => {
    const response = await api.patch(`/dependencies/tasks/dependency/${dependencyId}`, data);
    return response.data;
  },

  deleteTaskDependency: async (dependencyId: string): Promise<void> => {
    await api.delete(`/dependencies/tasks/dependency/${dependencyId}`);
  },

  resolveTaskDependency: async (dependencyId: string): Promise<TaskDependency> => {
    const response = await api.post(`/dependencies/tasks/dependency/${dependencyId}/resolve`);
    return response.data;
  },

  // Graph & blocked items
  getGraph: async (
    workspaceId: string,
    params?: {
      entity_type?: "stories" | "tasks" | "all";
      include_resolved?: boolean;
    }
  ): Promise<{ nodes: DependencyGraphNode[]; edges: DependencyGraphEdge[] }> => {
    const response = await api.get(`/dependencies/workspaces/${workspaceId}/graph`, { params });
    return response.data;
  },

  getBlockedItems: async (workspaceId: string): Promise<{
    blocked_stories: BlockedItem[];
    blocked_tasks: BlockedItem[];
    total_blocked: number;
  }> => {
    const response = await api.get(`/dependencies/workspaces/${workspaceId}/blocked`);
    return response.data;
  },
};

// ==================== Email Marketing Types ====================

export type EmailTemplateType = "code" | "visual" | "mjml";
export type EmailTemplateCategory = "general" | "marketing" | "onboarding" | "release" | "transactional" | "newsletter";
export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "paused" | "cancelled" | "completed";
export type CampaignType = "one_time" | "recurring" | "triggered";
export type RecipientStatus = "pending" | "sent" | "delivered" | "opened" | "clicked" | "bounced" | "failed" | "unsubscribed" | "complained";
export type DomainStatus = "pending" | "verified" | "failed" | "suspended";
export type WarmingStatus = "not_started" | "in_progress" | "completed" | "paused";

export interface EmailTemplate {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  template_type: EmailTemplateType;
  category: EmailTemplateCategory;
  subject_template: string;
  body_html: string;
  body_text: string | null;
  preview_text: string | null;
  variables: Array<{ name: string; description?: string; default_value?: string; required?: boolean }>;
  visual_definition: Record<string, unknown> | null;
  is_active: boolean;
  version: number;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplateCreate {
  name: string;
  slug?: string;
  description?: string;
  template_type?: EmailTemplateType;
  category?: EmailTemplateCategory;
  subject_template: string;
  body_html: string;
  body_text?: string;
  preview_text?: string;
  variables?: Array<{ name: string; description?: string; default_value?: string; required?: boolean }>;
  visual_definition?: Record<string, unknown>;
}

export interface EmailTemplateUpdate {
  name?: string;
  description?: string;
  category?: EmailTemplateCategory;
  subject_template?: string;
  body_html?: string;
  body_text?: string;
  preview_text?: string;
  variables?: Array<{ name: string; description?: string; default_value?: string; required?: boolean }>;
  visual_definition?: Record<string, unknown>;
  is_active?: boolean;
}

export interface EmailCampaign {
  id: string;
  workspace_id: string;
  name: string;
  subject?: string;
  template_id?: string | null;
  template_name?: string;
  html_content?: string | null;
  text_content?: string | null;
  from_name?: string | null;
  from_email?: string | null;
  reply_to?: string | null;
  campaign_type: CampaignType;
  status: CampaignStatus;
  audience_filter?: Record<string, unknown> | null;
  scheduled_at: string | null;
  sent_at?: string | null;
  completed_at?: string | null;
  total_recipients: number;
  sent_count: number;
  delivered_count?: number;
  open_count: number;
  click_count: number;
  bounce_count?: number;
  unsubscribe_count?: number;
  complaint_count?: number;
  created_at: string;
  updated_at?: string;
}

export interface EmailCampaignCreate {
  name: string;
  subject: string;
  template_id?: string;
  html_content?: string;
  text_content?: string;
  from_name: string;
  from_email: string;
  reply_to?: string;
  campaign_type?: CampaignType;
  preview_text?: string;
  scheduled_at?: string;
  list_id?: string;
  audience_filters?: FilterCondition[];
  recipient_emails?: string[];  // For manual upload list
}

export interface EmailCampaignUpdate {
  name?: string;
  subject?: string;
  template_id?: string;
  html_content?: string;
  text_content?: string;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  audience_filter?: Record<string, unknown>;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  email: string;
  name: string | null;
  status: RecipientStatus;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  open_count: number;
  click_count: number;
}

export interface CampaignAnalytics {
  campaign_id: string;
  sent_count: number;
  delivered_count: number;
  open_count: number;
  unique_open_count: number;
  click_count: number;
  unique_click_count: number;
  bounce_count: number;
  soft_bounce_count: number;
  hard_bounce_count: number;
  unsubscribe_count: number;
  complaint_count: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  click_to_open_rate: number;
  bounce_rate: number;
  unsubscribe_rate: number;
}

export interface AnalyticsOverview {
  total_sent: number;
  total_delivered: number;
  total_opens: number;
  total_clicks: number;
  total_bounces: number;
  total_unsubscribes: number;
  avg_open_rate: number;
  avg_click_rate: number;
  avg_bounce_rate: number;
  campaigns_sent: number;
  active_subscribers: number;
}

export interface DNSRecord {
  record_type: string;
  name: string;
  value: string;
  verified: boolean;
  note?: string;
}

export interface DNSRecords {
  verification?: DNSRecord;
  spf?: DNSRecord;
  dkim?: DNSRecord[];
  dmarc?: DNSRecord;
}

export interface SendingDomain {
  id: string;
  workspace_id: string;
  domain: string;
  subdomain?: string;
  status: DomainStatus;
  dns_records: DNSRecords;
  dns_last_checked_at?: string;
  verification_token?: string;
  verified_at?: string;
  is_verified: boolean;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_verified: boolean;
  health_score: number;
  health_status: string;
  daily_limit: number;
  daily_sent: number;
  warming_status: WarmingStatus;
  warming_day: number | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailProvider {
  id: string;
  workspace_id: string;
  name: string;
  provider_type: "ses" | "sendgrid" | "mailgun" | "postmark" | "smtp";
  description?: string;
  credentials?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  is_active: boolean;
  is_default: boolean;
  has_credentials: boolean;
  rate_limit_per_second: number | null;
  rate_limit_per_day: number | null;
  last_check_at?: string;
  last_check_status?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface VisualBlock {
  id: string;
  workspace_id: string | null;
  block_type: string;
  name: string;
  description: string | null;
  default_props: Record<string, unknown>;
  schema: Record<string, unknown>;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
}

export interface SavedDesign {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  design_json: Record<string, unknown>;
  thumbnail_url: string | null;
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

export type SubscriberStatus = "active" | "unsubscribed" | "bounced" | "complained";
export type FilterOperator = "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "gt" | "gte" | "lt" | "lte" | "between" | "is_empty" | "is_not_empty" | "in" | "not_in";

export interface FilterCondition {
  attribute: string;
  operator: FilterOperator;
  value: unknown;
  conjunction?: "and" | "or";
}

export interface SubscriptionCategory {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  default_subscribed: boolean;
  required: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailSubscriber {
  id: string;
  workspace_id: string;
  record_id: string | null;
  email: string;
  status: SubscriberStatus;
  status_changed_at: string | null;
  status_reason: string | null;
  is_verified: boolean;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriberImportRequest {
  subscribers: Array<{ email: string; first_name?: string; last_name?: string }>;
  category_ids?: string[];
  skip_verification?: boolean;
}

export interface SubscriberImportResponse {
  imported: number;
  skipped: number;
  errors: string[];
}

// ==================== Email Marketing API ====================

export const emailMarketingApi = {
  // Templates
  templates: {
    list: async (workspaceId: string, params?: { template_type?: EmailTemplateType; is_active?: boolean }): Promise<EmailTemplate[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/templates`, { params });
      return response.data;
    },

    get: async (workspaceId: string, templateId: string): Promise<EmailTemplate> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/templates/${templateId}`);
      return response.data;
    },

    create: async (workspaceId: string, data: EmailTemplateCreate): Promise<EmailTemplate> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-marketing/templates`, data);
      return response.data;
    },

    update: async (workspaceId: string, templateId: string, data: EmailTemplateUpdate): Promise<EmailTemplate> => {
      const response = await api.patch(`/workspaces/${workspaceId}/email-marketing/templates/${templateId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, templateId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/email-marketing/templates/${templateId}`);
    },

    duplicate: async (workspaceId: string, templateId: string, name?: string): Promise<EmailTemplate> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-marketing/templates/${templateId}/duplicate`, { name });
      return response.data;
    },

    preview: async (workspaceId: string, templateId: string, context?: Record<string, unknown>): Promise<{ html: string; subject: string }> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-marketing/templates/${templateId}/preview`, { context });
      return response.data;
    },
  },

  // Campaigns
  campaigns: {
    list: async (workspaceId: string, params?: { status?: CampaignStatus; campaign_type?: CampaignType; skip?: number; limit?: number }): Promise<{ items: EmailCampaign[]; total: number }> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/campaigns`, { params });
      return response.data;
    },

    get: async (workspaceId: string, campaignId: string): Promise<EmailCampaign> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}`);
      return response.data;
    },

    create: async (workspaceId: string, data: EmailCampaignCreate): Promise<EmailCampaign> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-marketing/campaigns`, data);
      return response.data;
    },

    update: async (workspaceId: string, campaignId: string, data: EmailCampaignUpdate): Promise<EmailCampaign> => {
      const response = await api.patch(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, campaignId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}`);
    },

    send: async (workspaceId: string, campaignId: string): Promise<EmailCampaign> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/send`);
      return response.data;
    },

    pause: async (workspaceId: string, campaignId: string): Promise<EmailCampaign> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/pause`);
      return response.data;
    },

    resume: async (workspaceId: string, campaignId: string): Promise<EmailCampaign> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/resume`);
      return response.data;
    },

    cancel: async (workspaceId: string, campaignId: string): Promise<EmailCampaign> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/cancel`);
      return response.data;
    },

    schedule: async (workspaceId: string, campaignId: string, scheduledAt: string): Promise<EmailCampaign> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/schedule`, { scheduled_at: scheduledAt });
      return response.data;
    },

    duplicate: async (workspaceId: string, campaignId: string, name?: string): Promise<EmailCampaign> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/duplicate`, { name });
      return response.data;
    },

    test: async (workspaceId: string, campaignId: string, emails: string[]): Promise<{ sent_to: string[] }> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/test`, { emails });
      return response.data;
    },

    getAudienceCount: async (workspaceId: string, campaignId: string): Promise<{ count: number }> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/audience-count`);
      return response.data;
    },

    getRecipients: async (workspaceId: string, campaignId: string, params?: { status?: RecipientStatus; skip?: number; limit?: number }): Promise<{ items: CampaignRecipient[]; total: number }> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/recipients`, { params });
      return response.data;
    },
  },

  // Analytics
  analytics: {
    getCampaignAnalytics: async (workspaceId: string, campaignId: string): Promise<CampaignAnalytics> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/analytics`);
      return response.data;
    },

    getCampaignTimeline: async (workspaceId: string, campaignId: string, params?: { interval?: "hour" | "day" }): Promise<{ timeline: { timestamp: string; opens: number; clicks: number }[] }> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/analytics/timeline`, { params });
      return response.data;
    },

    getCampaignLinks: async (workspaceId: string, campaignId: string): Promise<{ links: { url: string; clicks: number; unique_clicks: number }[] }> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/analytics/links`);
      return response.data;
    },

    getCampaignDevices: async (workspaceId: string, campaignId: string): Promise<{ devices: { device_type: string; count: number; percentage: number }[] }> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/campaigns/${campaignId}/analytics/devices`);
      return response.data;
    },

    getOverview: async (workspaceId: string, params?: { days?: number }): Promise<AnalyticsOverview> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/analytics/overview`, { params });
      return response.data;
    },

    getBestSendTimes: async (workspaceId: string): Promise<{ send_times: { day: string; hour: number; open_rate: number }[] }> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/analytics/best-send-times`);
      return response.data;
    },

    getTopCampaigns: async (workspaceId: string, params?: { metric?: "opens" | "clicks" | "conversions"; limit?: number }): Promise<{ campaigns: { id: string; name: string; value: number }[] }> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/analytics/top-campaigns`, { params });
      return response.data;
    },

    getTrends: async (workspaceId: string, params?: { days?: number }): Promise<{ trends: { date: string; sent: number; opens: number; clicks: number }[] }> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-marketing/analytics/trends`, { params });
      return response.data;
    },
  },

  // Subscription Categories
  categories: {
    list: async (workspaceId: string): Promise<SubscriptionCategory[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/subscriptions/categories`);
      return response.data;
    },

    get: async (workspaceId: string, categoryId: string): Promise<SubscriptionCategory> => {
      const response = await api.get(`/workspaces/${workspaceId}/subscriptions/categories/${categoryId}`);
      return response.data;
    },

    create: async (workspaceId: string, data: { name: string; slug?: string; description?: string; default_subscribed?: boolean }): Promise<SubscriptionCategory> => {
      const response = await api.post(`/workspaces/${workspaceId}/subscriptions/categories`, data);
      return response.data;
    },

    update: async (workspaceId: string, categoryId: string, data: { name?: string; description?: string; is_active?: boolean }): Promise<SubscriptionCategory> => {
      const response = await api.patch(`/workspaces/${workspaceId}/subscriptions/categories/${categoryId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, categoryId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/subscriptions/categories/${categoryId}`);
    },
  },

  // Subscribers
  subscribers: {
    list: async (workspaceId: string, params?: { status?: SubscriberStatus; limit?: number; offset?: number }): Promise<EmailSubscriber[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/subscriptions/subscribers`, { params });
      return response.data;
    },

    get: async (workspaceId: string, subscriberId: string): Promise<EmailSubscriber> => {
      const response = await api.get(`/workspaces/${workspaceId}/subscriptions/subscribers/${subscriberId}`);
      return response.data;
    },

    delete: async (workspaceId: string, subscriberId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/subscriptions/subscribers/${subscriberId}`);
    },

    import: async (workspaceId: string, data: SubscriberImportRequest): Promise<SubscriberImportResponse> => {
      const response = await api.post(`/workspaces/${workspaceId}/subscriptions/subscribers/import`, data);
      return response.data;
    },

    export: async (workspaceId: string, params?: { status?: SubscriberStatus }): Promise<{ subscribers: EmailSubscriber[]; total: number }> => {
      const response = await api.get(`/workspaces/${workspaceId}/subscriptions/subscribers/export`, { params });
      return response.data;
    },

    unsubscribe: async (workspaceId: string, subscriberId: string, reason?: string): Promise<{ status: string; subscriber_id: string }> => {
      const response = await api.post(`/workspaces/${workspaceId}/subscriptions/subscribers/${subscriberId}/unsubscribe`, { reason });
      return response.data;
    },

    resubscribe: async (workspaceId: string, subscriberId: string): Promise<{ status: string; subscriber_id: string }> => {
      const response = await api.post(`/workspaces/${workspaceId}/subscriptions/subscribers/${subscriberId}/resubscribe`);
      return response.data;
    },
  },
};

// ==================== Email Infrastructure API ====================

export const emailInfrastructureApi = {
  // Domains
  domains: {
    list: async (workspaceId: string): Promise<SendingDomain[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-infrastructure/domains`);
      return response.data;
    },

    get: async (workspaceId: string, domainId: string): Promise<SendingDomain> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-infrastructure/domains/${domainId}`);
      return response.data;
    },

    create: async (workspaceId: string, data: { domain: string; daily_limit?: number }): Promise<SendingDomain> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-infrastructure/domains`, data);
      return response.data;
    },

    delete: async (workspaceId: string, domainId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/email-infrastructure/domains/${domainId}`);
    },

    verify: async (workspaceId: string, domainId: string): Promise<SendingDomain> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-infrastructure/domains/${domainId}/verify`);
      return response.data;
    },

    pause: async (workspaceId: string, domainId: string): Promise<SendingDomain> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-infrastructure/domains/${domainId}/pause`);
      return response.data;
    },

    resume: async (workspaceId: string, domainId: string): Promise<SendingDomain> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-infrastructure/domains/${domainId}/resume`);
      return response.data;
    },

    getHealth: async (workspaceId: string, domainId: string): Promise<{ health_score: number; metrics: Record<string, number> }> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-infrastructure/domains/${domainId}/health`);
      return response.data;
    },

    startWarming: async (workspaceId: string, domainId: string, schedule?: string): Promise<SendingDomain> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-infrastructure/domains/${domainId}/warming/start`, { schedule });
      return response.data;
    },

    pauseWarming: async (workspaceId: string, domainId: string): Promise<SendingDomain> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-infrastructure/domains/${domainId}/warming/pause`);
      return response.data;
    },

    resumeWarming: async (workspaceId: string, domainId: string): Promise<SendingDomain> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-infrastructure/domains/${domainId}/warming/resume`);
      return response.data;
    },

    getWarmingProgress: async (workspaceId: string, domainId: string): Promise<{ day: number; target_volume: number; actual_volume: number; status: WarmingStatus }> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-infrastructure/domains/${domainId}/warming/progress`);
      return response.data;
    },
  },

  // Providers
  providers: {
    list: async (workspaceId: string): Promise<EmailProvider[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-infrastructure/providers`);
      return response.data;
    },

    get: async (workspaceId: string, providerId: string): Promise<EmailProvider> => {
      const response = await api.get(`/workspaces/${workspaceId}/email-infrastructure/providers/${providerId}`);
      return response.data;
    },

    create: async (workspaceId: string, data: { name: string; provider_type: string; credentials: Record<string, string> }): Promise<EmailProvider> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-infrastructure/providers`, data);
      return response.data;
    },

    update: async (workspaceId: string, providerId: string, data: { name?: string; description?: string; credentials?: Record<string, unknown>; is_active?: boolean; is_default?: boolean }): Promise<EmailProvider> => {
      const response = await api.patch(`/workspaces/${workspaceId}/email-infrastructure/providers/${providerId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, providerId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/email-infrastructure/providers/${providerId}`);
    },

    test: async (workspaceId: string, providerId: string): Promise<{ success: boolean; message: string }> => {
      const response = await api.post(`/workspaces/${workspaceId}/email-infrastructure/providers/${providerId}/test`);
      return response.data;
    },
  },
};

// ==================== Visual Builder API ====================

export const visualBuilderApi = {
  blocks: {
    list: async (workspaceId: string): Promise<VisualBlock[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/visual-builder/blocks`);
      return response.data;
    },

    getTypes: async (workspaceId: string): Promise<{ block_types: string[] }> => {
      const response = await api.get(`/workspaces/${workspaceId}/visual-builder/block-types`);
      return response.data;
    },

    create: async (workspaceId: string, data: { block_type: string; name: string; description?: string; default_props?: Record<string, unknown>; schema?: Record<string, unknown> }): Promise<VisualBlock> => {
      const response = await api.post(`/workspaces/${workspaceId}/visual-builder/blocks`, data);
      return response.data;
    },

    update: async (workspaceId: string, blockId: string, data: { name?: string; description?: string; default_props?: Record<string, unknown>; is_active?: boolean }): Promise<VisualBlock> => {
      const response = await api.patch(`/workspaces/${workspaceId}/visual-builder/blocks/${blockId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, blockId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/visual-builder/blocks/${blockId}`);
    },
  },

  designs: {
    list: async (workspaceId: string): Promise<SavedDesign[]> => {
      const response = await api.get(`/workspaces/${workspaceId}/visual-builder/designs`);
      return response.data;
    },

    get: async (workspaceId: string, designId: string): Promise<SavedDesign> => {
      const response = await api.get(`/workspaces/${workspaceId}/visual-builder/designs/${designId}`);
      return response.data;
    },

    create: async (workspaceId: string, data: { name: string; description?: string; design_json: Record<string, unknown> }): Promise<SavedDesign> => {
      const response = await api.post(`/workspaces/${workspaceId}/visual-builder/designs`, data);
      return response.data;
    },

    update: async (workspaceId: string, designId: string, data: { name?: string; description?: string; design_json?: Record<string, unknown> }): Promise<SavedDesign> => {
      const response = await api.patch(`/workspaces/${workspaceId}/visual-builder/designs/${designId}`, data);
      return response.data;
    },

    delete: async (workspaceId: string, designId: string): Promise<void> => {
      await api.delete(`/workspaces/${workspaceId}/visual-builder/designs/${designId}`);
    },

    render: async (workspaceId: string, designJson: Record<string, unknown>): Promise<{ html: string }> => {
      const response = await api.post(`/workspaces/${workspaceId}/visual-builder/render`, { design_json: designJson });
      return response.data;
    },

    convertToTemplate: async (workspaceId: string, designId: string, data: { name: string; subject: string }): Promise<EmailTemplate> => {
      const response = await api.post(`/workspaces/${workspaceId}/visual-builder/designs/${designId}/convert-to-template`, data);
      return response.data;
    },
  },
};

// ==================== Compliance & Certifications API ====================

// Types
export type AssignmentStatus = "pending" | "in_progress" | "completed" | "overdue" | "waived";
export type CertificationStatus = "active" | "expired" | "expiring_soon" | "revoked";
export type AppliesTo = "all" | "team" | "role" | "individual";
export type AuditActionType =
  | "training_created" | "training_updated" | "training_deleted" | "training_assigned"
  | "training_completed" | "training_waived" | "training_acknowledged"
  | "certification_added" | "certification_updated" | "certification_expired"
  | "certification_renewed" | "certification_revoked"
  | "goal_created" | "goal_updated" | "goal_completed"
  | "approval_requested" | "approval_approved" | "approval_rejected";

export interface MandatoryTraining {
  id: string;
  workspace_id: string;
  learning_path_id: string | null;
  name: string;
  description: string | null;
  applies_to_type: AppliesTo;
  applies_to_ids: string[];
  due_days_after_assignment: number;
  recurring_months: number | null;
  fixed_due_date: string | null;
  is_active: boolean;
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
}

export interface MandatoryTrainingWithStats extends MandatoryTraining {
  total_assignments: number;
  completed_assignments: number;
  overdue_assignments: number;
  in_progress_assignments: number;
  completion_rate: number;
}

export interface TrainingAssignment {
  id: string;
  mandatory_training_id: string;
  developer_id: string;
  workspace_id: string;
  due_date: string;
  status: AssignmentStatus;
  progress_percentage: number;
  started_at: string | null;
  completed_at: string | null;
  acknowledged_at: string | null;
  waived_by_id: string | null;
  waived_at: string | null;
  waiver_reason: string | null;
  extra_data: Record<string, unknown>;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingAssignmentWithDetails extends TrainingAssignment {
  training_name: string;
  training_description: string | null;
  developer_name: string;
  developer_email: string;
  learning_path_id: string | null;
  days_until_due: number | null;
  is_overdue: boolean;
}

export interface Certification {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  issuing_authority: string;
  validity_months: number | null;
  renewal_required: boolean;
  category: string | null;
  skill_tags: string[];
  prerequisites: string[];
  is_required: boolean;
  external_url: string | null;
  logo_url: string | null;
  extra_data: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
}

export interface CertificationWithStats extends Certification {
  total_holders: number;
  active_holders: number;
  expiring_soon_count: number;
  expired_count: number;
}

export interface DeveloperCertification {
  id: string;
  developer_id: string;
  certification_id: string;
  workspace_id: string;
  issued_date: string;
  expiry_date: string | null;
  status: CertificationStatus;
  credential_id: string | null;
  verification_url: string | null;
  certificate_url: string | null;
  verified_at: string | null;
  verified_by_id: string | null;
  score: number | null;
  extra_data: Record<string, unknown>;
  notes: string | null;
  renewal_reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeveloperCertificationWithDetails extends DeveloperCertification {
  certification_name: string;
  certification_issuing_authority: string;
  developer_name: string;
  developer_email: string;
  days_until_expiry: number | null;
  is_expired: boolean;
  is_expiring_soon: boolean;
}

export interface ComplianceOverview {
  total_mandatory_trainings: number;
  active_mandatory_trainings: number;
  total_assignments: number;
  completed_assignments: number;
  overdue_assignments: number;
  in_progress_assignments: number;
  pending_assignments: number;
  waived_assignments: number;
  overall_completion_rate: number;
  total_certifications: number;
  active_certifications: number;
  expired_certifications: number;
  expiring_soon_certifications: number;
}

export interface DeveloperComplianceStatus {
  developer_id: string;
  developer_name: string;
  developer_email: string;
  total_assignments: number;
  completed_assignments: number;
  overdue_assignments: number;
  in_progress_assignments: number;
  pending_assignments: number;
  completion_rate: number;
  total_certifications: number;
  active_certifications: number;
  expired_certifications: number;
  expiring_soon_certifications: number;
  is_compliant: boolean;
}

export interface LearningAuditLog {
  id: string;
  workspace_id: string;
  actor_id: string;
  action_type: AuditActionType;
  target_type: string;
  target_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  description: string | null;
  ip_address: string | null;
  user_agent: string | null;
  extra_data: Record<string, unknown>;
  created_at: string;
  actor_name?: string;
  actor_email?: string;
}

export interface OverdueReport {
  assignments: TrainingAssignmentWithDetails[];
  total: number;
  by_training: Record<string, number>;
  by_team: Record<string, number>;
}

export interface ExpiringCertificationsReport {
  certifications: DeveloperCertificationWithDetails[];
  total: number;
  by_certification: Record<string, number>;
  by_days_until_expiry: Record<string, number>;
}

export interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export const complianceApi = {
  // Mandatory Training
  training: {
    list: async (workspaceId: string, options?: {
      is_active?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<MandatoryTrainingWithStats>> => {
      const response = await api.get("/compliance/mandatory-training", {
        params: { workspace_id: workspaceId, ...options },
      });
      return response.data;
    },

    get: async (trainingId: string, workspaceId: string): Promise<MandatoryTrainingWithStats> => {
      const response = await api.get(`/compliance/mandatory-training/${trainingId}`, {
        params: { workspace_id: workspaceId },
      });
      return response.data;
    },

    create: async (workspaceId: string, developerId: string, data: {
      name: string;
      description?: string;
      learning_path_id?: string;
      applies_to_type?: AppliesTo;
      applies_to_ids?: string[];
      due_days_after_assignment?: number;
      recurring_months?: number;
      fixed_due_date?: string;
      extra_data?: Record<string, unknown>;
    }): Promise<MandatoryTraining> => {
      const response = await api.post("/compliance/mandatory-training", data, {
        params: { workspace_id: workspaceId, developer_id: developerId },
      });
      return response.data;
    },

    update: async (trainingId: string, workspaceId: string, developerId: string, data: {
      name?: string;
      description?: string;
      applies_to_type?: AppliesTo;
      applies_to_ids?: string[];
      due_days_after_assignment?: number;
      recurring_months?: number;
      fixed_due_date?: string;
      learning_path_id?: string;
      is_active?: boolean;
      extra_data?: Record<string, unknown>;
    }): Promise<MandatoryTraining> => {
      const response = await api.patch(`/compliance/mandatory-training/${trainingId}`, data, {
        params: { workspace_id: workspaceId, developer_id: developerId },
      });
      return response.data;
    },

    delete: async (trainingId: string, workspaceId: string, developerId: string): Promise<void> => {
      await api.delete(`/compliance/mandatory-training/${trainingId}`, {
        params: { workspace_id: workspaceId, developer_id: developerId },
      });
    },
  },

  // Training Assignments
  assignments: {
    list: async (workspaceId: string, options?: {
      mandatory_training_id?: string;
      developer_id?: string;
      status?: AssignmentStatus;
      is_overdue?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<TrainingAssignmentWithDetails>> => {
      const response = await api.get("/compliance/assignments", {
        params: { workspace_id: workspaceId, ...options },
      });
      return response.data;
    },

    get: async (assignmentId: string, workspaceId: string): Promise<TrainingAssignmentWithDetails> => {
      const response = await api.get(`/compliance/assignments/${assignmentId}`, {
        params: { workspace_id: workspaceId },
      });
      return response.data;
    },

    create: async (workspaceId: string, developerId: string, data: {
      mandatory_training_id: string;
      developer_id: string;
      due_date: string;
      extra_data?: Record<string, unknown>;
    }): Promise<TrainingAssignment> => {
      const response = await api.post("/compliance/assignments", data, {
        params: { workspace_id: workspaceId, developer_id: developerId },
      });
      return response.data;
    },

    bulkCreate: async (workspaceId: string, actorId: string, data: {
      mandatory_training_id: string;
      developer_ids: string[];
      due_date?: string;
    }): Promise<TrainingAssignment[]> => {
      const response = await api.post("/compliance/assignments/bulk", data, {
        params: { workspace_id: workspaceId, developer_id: actorId },
      });
      return response.data;
    },

    update: async (assignmentId: string, workspaceId: string, developerId: string, data: {
      due_date?: string;
      status?: AssignmentStatus;
      progress_percentage?: number;
      extra_data?: Record<string, unknown>;
    }): Promise<TrainingAssignment> => {
      const response = await api.patch(`/compliance/assignments/${assignmentId}`, data, {
        params: { workspace_id: workspaceId, developer_id: developerId },
      });
      return response.data;
    },

    acknowledge: async (assignmentId: string, workspaceId: string, developerId: string): Promise<TrainingAssignment> => {
      const response = await api.post(`/compliance/assignments/${assignmentId}/acknowledge`, {}, {
        params: { workspace_id: workspaceId, developer_id: developerId },
      });
      return response.data;
    },

    start: async (assignmentId: string, workspaceId: string, developerId: string): Promise<TrainingAssignment> => {
      const response = await api.post(`/compliance/assignments/${assignmentId}/start`, {}, {
        params: { workspace_id: workspaceId, developer_id: developerId },
      });
      return response.data;
    },

    complete: async (assignmentId: string, workspaceId: string, developerId: string): Promise<TrainingAssignment> => {
      const response = await api.post(`/compliance/assignments/${assignmentId}/complete`, {}, {
        params: { workspace_id: workspaceId, developer_id: developerId },
      });
      return response.data;
    },

    waive: async (assignmentId: string, workspaceId: string, managerId: string, reason: string): Promise<TrainingAssignment> => {
      const response = await api.post(`/compliance/assignments/${assignmentId}/waive`, { reason }, {
        params: { workspace_id: workspaceId, developer_id: managerId },
      });
      return response.data;
    },
  },

  // Certifications
  certifications: {
    list: async (workspaceId: string, options?: {
      is_active?: boolean;
      category?: string;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<CertificationWithStats>> => {
      const response = await api.get("/compliance/certifications", {
        params: { workspace_id: workspaceId, ...options },
      });
      return response.data;
    },

    get: async (certificationId: string, workspaceId: string): Promise<CertificationWithStats> => {
      const response = await api.get(`/compliance/certifications/${certificationId}`, {
        params: { workspace_id: workspaceId },
      });
      return response.data;
    },

    create: async (workspaceId: string, developerId: string, data: {
      name: string;
      description?: string;
      issuing_authority: string;
      validity_months?: number;
      renewal_required?: boolean;
      category?: string;
      skill_tags?: string[];
      prerequisites?: string[];
      is_required?: boolean;
      external_url?: string;
      logo_url?: string;
      extra_data?: Record<string, unknown>;
    }): Promise<Certification> => {
      const response = await api.post("/compliance/certifications", data, {
        params: { workspace_id: workspaceId, developer_id: developerId },
      });
      return response.data;
    },

    update: async (certificationId: string, workspaceId: string, data: {
      name?: string;
      description?: string;
      issuing_authority?: string;
      validity_months?: number;
      renewal_required?: boolean;
      category?: string;
      skill_tags?: string[];
      prerequisites?: string[];
      is_required?: boolean;
      external_url?: string;
      logo_url?: string;
      is_active?: boolean;
      extra_data?: Record<string, unknown>;
    }): Promise<Certification> => {
      const response = await api.patch(`/compliance/certifications/${certificationId}`, data, {
        params: { workspace_id: workspaceId },
      });
      return response.data;
    },
  },

  // Developer Certifications
  developerCertifications: {
    list: async (workspaceId: string, options?: {
      certification_id?: string;
      developer_id?: string;
      status?: CertificationStatus;
      is_expiring_soon?: boolean;
      is_expired?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<DeveloperCertificationWithDetails>> => {
      const response = await api.get("/compliance/developer-certifications", {
        params: { workspace_id: workspaceId, ...options },
      });
      return response.data;
    },

    get: async (devCertId: string, workspaceId: string): Promise<DeveloperCertificationWithDetails> => {
      const response = await api.get(`/compliance/developer-certifications/${devCertId}`, {
        params: { workspace_id: workspaceId },
      });
      return response.data;
    },

    add: async (workspaceId: string, actorId: string, data: {
      certification_id: string;
      developer_id: string;
      issued_date: string;
      expiry_date?: string;
      credential_id?: string;
      verification_url?: string;
      certificate_url?: string;
      score?: number;
      notes?: string;
      extra_data?: Record<string, unknown>;
    }): Promise<DeveloperCertification> => {
      const response = await api.post("/compliance/developer-certifications", data, {
        params: { workspace_id: workspaceId, actor_id: actorId },
      });
      return response.data;
    },

    update: async (devCertId: string, workspaceId: string, actorId: string, data: {
      issued_date?: string;
      expiry_date?: string;
      credential_id?: string;
      verification_url?: string;
      certificate_url?: string;
      status?: CertificationStatus;
      score?: number;
      notes?: string;
      extra_data?: Record<string, unknown>;
    }): Promise<DeveloperCertification> => {
      const response = await api.patch(`/compliance/developer-certifications/${devCertId}`, data, {
        params: { workspace_id: workspaceId, actor_id: actorId },
      });
      return response.data;
    },

    verify: async (devCertId: string, workspaceId: string, developerId: string, verificationUrl?: string): Promise<DeveloperCertification> => {
      const response = await api.post(`/compliance/developer-certifications/${devCertId}/verify`,
        verificationUrl ? { verification_url: verificationUrl } : {},
        { params: { workspace_id: workspaceId, developer_id: developerId } }
      );
      return response.data;
    },

    renew: async (devCertId: string, workspaceId: string, actorId: string, data: {
      new_issued_date: string;
      new_expiry_date?: string;
      new_credential_id?: string;
      new_verification_url?: string;
      new_certificate_url?: string;
      score?: number;
    }): Promise<DeveloperCertification> => {
      const response = await api.post(`/compliance/developer-certifications/${devCertId}/renew`, data, {
        params: { workspace_id: workspaceId, actor_id: actorId },
      });
      return response.data;
    },

    revoke: async (devCertId: string, workspaceId: string, actorId: string, reason?: string): Promise<DeveloperCertification> => {
      const response = await api.post(`/compliance/developer-certifications/${devCertId}/revoke`, {}, {
        params: { workspace_id: workspaceId, actor_id: actorId, reason },
      });
      return response.data;
    },
  },

  // Reports
  reports: {
    getOverview: async (workspaceId: string): Promise<ComplianceOverview> => {
      const response = await api.get("/compliance/reports/overview", {
        params: { workspace_id: workspaceId },
      });
      return response.data;
    },

    getDeveloperStatus: async (developerId: string, workspaceId: string): Promise<DeveloperComplianceStatus> => {
      const response = await api.get(`/compliance/reports/developer/${developerId}`, {
        params: { workspace_id: workspaceId },
      });
      return response.data;
    },

    getOverdue: async (workspaceId: string): Promise<OverdueReport> => {
      const response = await api.get("/compliance/reports/overdue", {
        params: { workspace_id: workspaceId },
      });
      return response.data;
    },

    getExpiringCertifications: async (workspaceId: string, daysAhead?: number): Promise<ExpiringCertificationsReport> => {
      const response = await api.get("/compliance/reports/expiring-certifications", {
        params: { workspace_id: workspaceId, days_ahead: daysAhead },
      });
      return response.data;
    },
  },

  // Audit Logs
  auditLogs: {
    list: async (workspaceId: string, options?: {
      action_type?: AuditActionType;
      target_type?: string;
      target_id?: string;
      actor_id?: string;
      from_date?: string;
      to_date?: string;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<LearningAuditLog>> => {
      const response = await api.get("/compliance/audit-logs", {
        params: { workspace_id: workspaceId, ...options },
      });
      return response.data;
    },
  },
};

// ==================== Learning Management (Manager Controls) ====================

// Enums
export type LearningGoalStatus = "pending" | "in_progress" | "completed" | "cancelled" | "overdue";
export type LearningGoalType = "course_completion" | "hours_spent" | "skill_acquisition" | "certification" | "path_completion" | "custom";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ApprovalRequestType = "course" | "certification" | "conference" | "training" | "other";
export type TransactionType = "allocation" | "adjustment" | "expense" | "refund" | "transfer_in" | "transfer_out";

// Learning Goal Types
export interface LearningGoal {
  id: string;
  workspace_id: string;
  developer_id: string;
  set_by_id: string;
  title: string;
  description: string | null;
  goal_type: LearningGoalType;
  target_config: Record<string, unknown>;
  progress_percentage: number;
  progress_data: Record<string, unknown>;
  current_value: number;
  target_value: number;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: LearningGoalStatus;
  priority: number;
  is_visible_to_developer: boolean;
  notes: string | null;
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LearningGoalWithDetails extends LearningGoal {
  developer_name: string;
  developer_email: string;
  set_by_name: string;
  set_by_email: string;
  days_until_due: number | null;
  is_overdue: boolean;
}

export interface LearningGoalCreate {
  developer_id: string;
  title: string;
  description?: string;
  goal_type?: LearningGoalType;
  target_config?: Record<string, unknown>;
  target_value?: number;
  due_date?: string;
  priority?: number;
  is_visible_to_developer?: boolean;
  notes?: string;
  extra_data?: Record<string, unknown>;
}

export interface LearningGoalUpdate {
  title?: string;
  description?: string;
  goal_type?: LearningGoalType;
  target_config?: Record<string, unknown>;
  target_value?: number;
  due_date?: string;
  priority?: number;
  is_visible_to_developer?: boolean;
  status?: LearningGoalStatus;
  notes?: string;
  extra_data?: Record<string, unknown>;
}

export interface LearningGoalProgressUpdate {
  current_value: number;
  progress_data?: Record<string, unknown>;
  notes?: string;
}

// Course Approval Request Types
export interface CourseApprovalRequest {
  id: string;
  workspace_id: string;
  requester_id: string;
  approver_id: string | null;
  request_type: ApprovalRequestType;
  course_title: string;
  course_provider: string | null;
  course_url: string | null;
  course_description: string | null;
  estimated_cost_cents: number;
  currency: string;
  estimated_hours: number | null;
  justification: string | null;
  skills_to_gain: string[];
  status: ApprovalStatus;
  approved_at: string | null;
  rejected_at: string | null;
  decision_reason: string | null;
  decided_by_id: string | null;
  actual_cost_cents: number | null;
  linked_goal_id: string | null;
  budget_transaction_id: string | null;
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CourseApprovalRequestWithDetails extends CourseApprovalRequest {
  requester_name: string;
  requester_email: string;
  approver_name: string | null;
  approver_email: string | null;
  decided_by_name: string | null;
  decided_by_email: string | null;
  linked_goal_title: string | null;
  days_pending: number | null;
}

export interface CourseApprovalRequestCreate {
  request_type?: ApprovalRequestType;
  course_title: string;
  course_provider?: string;
  course_url?: string;
  course_description?: string;
  estimated_cost_cents?: number;
  currency?: string;
  estimated_hours?: number;
  justification?: string;
  skills_to_gain?: string[];
  approver_id?: string;
  linked_goal_id?: string;
  extra_data?: Record<string, unknown>;
}

export interface CourseApprovalDecision {
  approved: boolean;
  reason?: string;
  actual_cost_cents?: number;
}

export interface ApprovalQueueItem {
  request: CourseApprovalRequestWithDetails;
  budget_available: boolean;
  budget_remaining_cents: number | null;
  auto_approve_eligible: boolean;
}

export interface ApprovalQueue {
  items: ApprovalQueueItem[];
  total: number;
  total_pending_cost_cents: number;
}

// Learning Budget Types
export interface LearningBudget {
  id: string;
  workspace_id: string;
  developer_id: string | null;
  team_id: string | null;
  name: string;
  description: string | null;
  fiscal_year: number;
  fiscal_quarter: number | null;
  budget_cents: number;
  spent_cents: number;
  reserved_cents: number;
  currency: string;
  allow_overspend: boolean;
  overspend_limit_cents: number | null;
  auto_approve_under_cents: number | null;
  requires_manager_approval: boolean;
  is_active: boolean;
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
}

export interface LearningBudgetWithDetails extends LearningBudget {
  remaining_cents: number;
  utilization_percentage: number;
  developer_name: string | null;
  developer_email: string | null;
  team_name: string | null;
  created_by_name: string | null;
  total_transactions: number;
  pending_approvals_count: number;
  pending_approvals_total_cents: number;
}

export interface LearningBudgetCreate {
  name: string;
  description?: string;
  developer_id?: string;
  team_id?: string;
  fiscal_year: number;
  fiscal_quarter?: number;
  budget_cents: number;
  currency?: string;
  allow_overspend?: boolean;
  overspend_limit_cents?: number;
  auto_approve_under_cents?: number;
  requires_manager_approval?: boolean;
  extra_data?: Record<string, unknown>;
}

export interface LearningBudgetUpdate {
  name?: string;
  description?: string;
  budget_cents?: number;
  allow_overspend?: boolean;
  overspend_limit_cents?: number;
  auto_approve_under_cents?: number;
  requires_manager_approval?: boolean;
  is_active?: boolean;
  extra_data?: Record<string, unknown>;
}

export interface LearningBudgetAdjustment {
  amount_cents: number;
  reason: string;
}

export interface LearningBudgetTransfer {
  source_budget_id: string;
  target_budget_id: string;
  amount_cents: number;
  reason: string;
}

export interface LearningBudgetTransaction {
  id: string;
  budget_id: string;
  workspace_id: string;
  transaction_type: TransactionType;
  amount_cents: number;
  currency: string;
  description: string | null;
  approval_request_id: string | null;
  related_transaction_id: string | null;
  created_by_id: string | null;
  balance_after_cents: number;
  extra_data: Record<string, unknown>;
  created_at: string;
}

export interface LearningBudgetTransactionWithDetails extends LearningBudgetTransaction {
  created_by_name: string | null;
  created_by_email: string | null;
  approval_request_title: string | null;
}

// Manager Dashboard Types
export interface TeamLearningProgress {
  team_id: string;
  team_name: string;
  total_members: number;
  members_with_goals: number;
  total_goals: number;
  completed_goals: number;
  in_progress_goals: number;
  overdue_goals: number;
  goal_completion_rate: number;
  total_hours_spent: number;
  avg_hours_per_member: number;
  total_certifications_earned: number;
  compliance_rate: number;
}

export interface DeveloperLearningProgress {
  developer_id: string;
  developer_name: string;
  developer_email: string;
  total_goals: number;
  completed_goals: number;
  in_progress_goals: number;
  overdue_goals: number;
  goal_completion_rate: number;
  hours_spent_this_period: number;
  certifications_earned: number;
  active_certifications: number;
  pending_approval_requests: number;
  budget_utilization_percentage: number;
  is_compliant: boolean;
}

export interface ManagerDashboardOverview {
  total_team_members: number;
  total_active_goals: number;
  goals_completed_this_period: number;
  goals_overdue: number;
  overall_goal_completion_rate: number;
  pending_approval_requests: number;
  total_budget_cents: number;
  spent_budget_cents: number;
  reserved_budget_cents: number;
  budget_utilization_percentage: number;
  team_compliance_rate: number;
  certifications_expiring_soon: number;
}

// Learning Management API
export const learningManagementApi = {
  // Learning Goals
  goals: {
    list: async (options?: {
      developer_id?: string;
      set_by_id?: string;
      goal_type?: LearningGoalType;
      status?: LearningGoalStatus;
      is_overdue?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<LearningGoalWithDetails>> => {
      const response = await api.get("/learning/manager/goals", { params: options });
      return response.data;
    },

    get: async (goalId: string): Promise<LearningGoalWithDetails> => {
      const response = await api.get(`/learning/manager/goals/${goalId}`);
      return response.data;
    },

    create: async (data: LearningGoalCreate): Promise<LearningGoal> => {
      const response = await api.post("/learning/manager/goals", data);
      return response.data;
    },

    update: async (goalId: string, data: LearningGoalUpdate): Promise<LearningGoal> => {
      const response = await api.put(`/learning/manager/goals/${goalId}`, data);
      return response.data;
    },

    updateProgress: async (goalId: string, data: LearningGoalProgressUpdate): Promise<LearningGoal> => {
      const response = await api.put(`/learning/manager/goals/${goalId}/progress`, data);
      return response.data;
    },

    delete: async (goalId: string): Promise<void> => {
      await api.delete(`/learning/manager/goals/${goalId}`);
    },
  },

  // Course Approval Requests
  approvals: {
    list: async (options?: {
      requester_id?: string;
      approver_id?: string;
      status?: ApprovalStatus;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<CourseApprovalRequestWithDetails>> => {
      const response = await api.get("/learning/manager/approvals", { params: options });
      return response.data;
    },

    getQueue: async (options?: {
      page?: number;
      page_size?: number;
    }): Promise<ApprovalQueue> => {
      const response = await api.get("/learning/manager/approvals/queue", { params: options });
      return response.data;
    },

    get: async (requestId: string): Promise<CourseApprovalRequestWithDetails> => {
      const response = await api.get(`/learning/manager/approvals/${requestId}`);
      return response.data;
    },

    create: async (data: CourseApprovalRequestCreate): Promise<CourseApprovalRequest> => {
      const response = await api.post("/learning/manager/approvals", data);
      return response.data;
    },

    update: async (requestId: string, data: Partial<CourseApprovalRequestCreate>): Promise<CourseApprovalRequest> => {
      const response = await api.put(`/learning/manager/approvals/${requestId}`, data);
      return response.data;
    },

    decide: async (requestId: string, data: CourseApprovalDecision): Promise<CourseApprovalRequest> => {
      const response = await api.post(`/learning/manager/approvals/${requestId}/decide`, data);
      return response.data;
    },

    cancel: async (requestId: string): Promise<CourseApprovalRequest> => {
      const response = await api.post(`/learning/manager/approvals/${requestId}/cancel`);
      return response.data;
    },
  },

  // Learning Budgets
  budgets: {
    list: async (options?: {
      developer_id?: string;
      team_id?: string;
      fiscal_year?: number;
      is_active?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<LearningBudgetWithDetails>> => {
      const response = await api.get("/learning/manager/budgets", { params: options });
      return response.data;
    },

    get: async (budgetId: string): Promise<LearningBudgetWithDetails> => {
      const response = await api.get(`/learning/manager/budgets/${budgetId}`);
      return response.data;
    },

    create: async (data: LearningBudgetCreate): Promise<LearningBudget> => {
      const response = await api.post("/learning/manager/budgets", data);
      return response.data;
    },

    update: async (budgetId: string, data: LearningBudgetUpdate): Promise<LearningBudget> => {
      const response = await api.put(`/learning/manager/budgets/${budgetId}`, data);
      return response.data;
    },

    adjust: async (budgetId: string, data: LearningBudgetAdjustment): Promise<LearningBudget> => {
      const response = await api.post(`/learning/manager/budgets/${budgetId}/adjust`, data);
      return response.data;
    },

    transfer: async (data: LearningBudgetTransfer): Promise<{ source: LearningBudget; target: LearningBudget }> => {
      const response = await api.post("/learning/manager/budgets/transfer", data);
      return response.data;
    },

    listTransactions: async (budgetId: string, options?: {
      transaction_type?: TransactionType;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<LearningBudgetTransactionWithDetails>> => {
      const response = await api.get(`/learning/manager/budgets/${budgetId}/transactions`, { params: options });
      return response.data;
    },
  },

  // Manager Dashboard
  dashboard: {
    getOverview: async (teamIds?: string[]): Promise<ManagerDashboardOverview> => {
      const response = await api.get("/learning/manager/dashboard", {
        params: teamIds ? { team_ids: teamIds } : undefined,
      });
      return response.data;
    },

    getTeamProgress: async (teamId: string): Promise<TeamLearningProgress> => {
      const response = await api.get(`/learning/manager/team/${teamId}/progress`);
      return response.data;
    },

    getDeveloperProgress: async (developerId: string): Promise<DeveloperLearningProgress> => {
      const response = await api.get(`/learning/manager/developer/${developerId}/progress`);
      return response.data;
    },
  },
};

// ========================
// Learning Analytics Types
// ========================

export type ReportType =
  | "executive_summary"
  | "team_progress"
  | "individual_progress"
  | "compliance_status"
  | "budget_utilization"
  | "skill_gap_analysis"
  | "roi_analysis"
  | "certification_tracking"
  | "custom";

export type ReportScheduleFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly";

export type ReportRunStatus = "pending" | "running" | "completed" | "failed";

export type ExportFormat = "pdf" | "csv" | "xlsx";

// Executive Dashboard
export interface ExecutiveDashboardMetrics {
  total_learning_hours: number;
  learning_hours_change: number;
  active_learners: number;
  active_learners_change: number;
  courses_completed: number;
  courses_completed_change: number;
  certifications_earned: number;
  certifications_earned_change: number;
  total_goals: number;
  completed_goals: number;
  goal_completion_rate: number;
  overdue_goals: number;
  compliance_rate: number;
  compliance_rate_change: number;
  non_compliant_count: number;
  total_budget_cents: number;
  spent_budget_cents: number;
  budget_utilization: number;
}

export interface TrendDataPoint {
  date: string;
  value: number;
}

export interface LearningTrends {
  learning_hours: TrendDataPoint[];
  courses_completed: TrendDataPoint[];
  active_learners: TrendDataPoint[];
  goal_completion_rate: TrendDataPoint[];
}

export interface SkillGapEntry {
  skill_name: string;
  required_count: number;
  current_count: number;
  gap_percentage: number;
  in_progress_count: number;
}

export interface SkillGapAnalysis {
  skills: SkillGapEntry[];
  total_gaps: number;
  critical_gaps: number;
}

export interface TeamPerformanceEntry {
  team_id: string;
  team_name: string;
  learning_hours: number;
  courses_completed: number;
  goal_completion_rate: number;
  compliance_rate: number;
  budget_utilization: number;
}

export interface TeamPerformanceComparison {
  teams: TeamPerformanceEntry[];
  workspace_average: Record<string, number>;
}

export interface ROIMetrics {
  total_investment_cents: number;
  total_courses_completed: number;
  total_certifications_earned: number;
  cost_per_course_cents: number;
  cost_per_certification_cents: number;
  estimated_value_generated_cents: number;
  roi_percentage: number;
}

export interface ExecutiveDashboard {
  metrics: ExecutiveDashboardMetrics;
  trends: LearningTrends;
  skill_gaps: SkillGapAnalysis;
  team_comparison: TeamPerformanceComparison;
  roi: ROIMetrics;
  period_start: string;
  period_end: string;
}

// Completion Rates
export interface CompletionRateEntry {
  period: string;
  total: number;
  completed: number;
  rate: number;
}

export interface CompletionRateReport {
  entries: CompletionRateEntry[];
  overall_rate: number;
  period_type: string;
}

// Report Definition Types
export interface ReportDateRange {
  type: string;
  start_date?: string;
  end_date?: string;
}

export interface LearningReportFilters {
  team_ids: string[];
  developer_ids: string[];
  goal_types: string[];
  include_inactive: boolean;
}

export interface ReportConfig {
  date_range: ReportDateRange;
  filters: LearningReportFilters;
  metrics: string[];
  group_by?: string;
  include_charts: boolean;
  include_raw_data: boolean;
}

export interface ReportDefinition {
  id: string;
  workspace_id: string;
  created_by_id: string | null;
  name: string;
  description: string | null;
  report_type: ReportType;
  config: Record<string, unknown>;
  is_scheduled: boolean;
  schedule_frequency: ReportScheduleFrequency | null;
  schedule_day: number | null;
  schedule_time: string | null;
  next_run_at: string | null;
  recipients: string[];
  export_format: string;
  is_active: boolean;
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ReportDefinitionWithDetails extends ReportDefinition {
  created_by_name: string | null;
  created_by_email: string | null;
  last_run_at: string | null;
  last_run_status: ReportRunStatus | null;
  total_runs: number;
}

export interface ReportDefinitionCreate {
  name: string;
  description?: string;
  report_type: ReportType;
  config?: Partial<ReportConfig>;
  is_scheduled?: boolean;
  schedule_frequency?: ReportScheduleFrequency;
  schedule_day?: number;
  schedule_time?: string;
  recipients?: string[];
  export_format?: ExportFormat;
  extra_data?: Record<string, unknown>;
}

export interface ReportDefinitionUpdate {
  name?: string;
  description?: string;
  report_type?: ReportType;
  config?: Partial<ReportConfig>;
  is_scheduled?: boolean;
  schedule_frequency?: ReportScheduleFrequency;
  schedule_day?: number;
  schedule_time?: string;
  recipients?: string[];
  export_format?: ExportFormat;
  is_active?: boolean;
  extra_data?: Record<string, unknown>;
}

// Report Run Types
export interface ReportRun {
  id: string;
  report_definition_id: string;
  workspace_id: string;
  status: ReportRunStatus;
  triggered_by: string;
  started_at: string | null;
  completed_at: string | null;
  result_file_path: string | null;
  result_file_size_bytes: number | null;
  result_file_format: string | null;
  metrics_summary: Record<string, unknown> | null;
  error_message: string | null;
  extra_data: Record<string, unknown>;
  created_at: string;
}

export interface ReportRunWithDetails extends ReportRun {
  report_name: string;
  report_type: ReportType | null;
  duration_seconds: number | null;
}

// Learning Analytics API
export const learningAnalyticsApi = {
  // Executive Dashboard
  getExecutiveDashboard: async (options?: {
    period_days?: number;
    team_ids?: string[];
  }): Promise<ExecutiveDashboard> => {
    const response = await api.get("/learning/analytics/executive-dashboard", {
      params: options,
    });
    return response.data;
  },

  // Completion Rates
  getCompletionRates: async (options?: {
    period_type?: "daily" | "weekly" | "monthly";
    periods?: number;
  }): Promise<CompletionRateReport> => {
    const response = await api.get("/learning/analytics/completion-rates", {
      params: options,
    });
    return response.data;
  },

  // Report Definitions
  reports: {
    list: async (options?: {
      report_type?: ReportType;
      is_scheduled?: boolean;
      is_active?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<ReportDefinitionWithDetails>> => {
      const response = await api.get("/learning/analytics/reports", { params: options });
      return response.data;
    },

    get: async (definitionId: string): Promise<ReportDefinitionWithDetails> => {
      const response = await api.get(`/learning/analytics/reports/${definitionId}`);
      return response.data;
    },

    create: async (data: ReportDefinitionCreate): Promise<ReportDefinition> => {
      const response = await api.post("/learning/analytics/reports", data);
      return response.data;
    },

    update: async (definitionId: string, data: ReportDefinitionUpdate): Promise<ReportDefinition> => {
      const response = await api.put(`/learning/analytics/reports/${definitionId}`, data);
      return response.data;
    },

    delete: async (definitionId: string): Promise<void> => {
      await api.delete(`/learning/analytics/reports/${definitionId}`);
    },

    triggerRun: async (definitionId: string): Promise<ReportRun> => {
      const response = await api.post(`/learning/analytics/reports/${definitionId}/run`);
      return response.data;
    },
  },

  // Report Runs
  runs: {
    list: async (options?: {
      report_definition_id?: string;
      status?: ReportRunStatus;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<ReportRunWithDetails>> => {
      const response = await api.get("/learning/analytics/runs", { params: options });
      return response.data;
    },
  },
};

// ============================
// Learning Integrations Types
// ============================

export type HRProviderType = "workday" | "bamboohr" | "sap_successfactors" | "adp" | "custom_api";
export type LMSProviderType = "scorm_cloud" | "cornerstone" | "linkedin_learning" | "udemy_business" | "coursera" | "custom";
export type IntegrationStatus = "active" | "inactive" | "error" | "pending_setup";
export type SyncStatus = "pending" | "in_progress" | "completed" | "failed" | "partial";
export type SCORMVersion = "scorm_1.2" | "scorm_2004_2nd" | "scorm_2004_3rd" | "scorm_2004_4th";
export type SCORMCompletionStatus = "not_attempted" | "incomplete" | "completed" | "passed" | "failed" | "unknown";
export type CalendarProviderType = "google_calendar" | "outlook" | "apple";

// HR Integration Types
export interface HRIntegration {
  id: string;
  workspace_id: string;
  provider: HRProviderType;
  name: string;
  description: string | null;
  api_base_url: string | null;
  sync_employees: boolean;
  sync_departments: boolean;
  sync_managers: boolean;
  sync_terminations: boolean;
  sync_frequency_hours: number;
  field_mappings: Record<string, string>;
  status: IntegrationStatus;
  last_sync_at: string | null;
  last_sync_status: SyncStatus | null;
  last_sync_error: string | null;
  last_sync_stats: Record<string, number>;
  is_active: boolean;
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
}

export interface HRIntegrationCreate {
  provider: HRProviderType;
  name: string;
  description?: string;
  api_base_url?: string;
  api_key?: string;
  sync_employees?: boolean;
  sync_departments?: boolean;
  sync_managers?: boolean;
  sync_terminations?: boolean;
  sync_frequency_hours?: number;
  field_mappings?: Record<string, string>;
}

export interface HRSyncLog {
  id: string;
  integration_id: string;
  workspace_id: string;
  status: SyncStatus;
  started_at: string;
  completed_at: string | null;
  employees_created: number;
  employees_updated: number;
  employees_deactivated: number;
  errors_count: number;
  error_details: unknown[];
}

// LMS Integration Types
export interface LMSIntegration {
  id: string;
  workspace_id: string;
  provider: LMSProviderType;
  name: string;
  description: string | null;
  api_base_url: string | null;
  scorm_support: boolean;
  scorm_versions: string[];
  xapi_support: boolean;
  xapi_endpoint: string | null;
  sync_completions: boolean;
  sync_progress: boolean;
  sync_frequency_hours: number;
  status: IntegrationStatus;
  last_sync_at: string | null;
  last_sync_error: string | null;
  is_active: boolean;
  extra_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
}

export interface LMSIntegrationCreate {
  provider: LMSProviderType;
  name: string;
  description?: string;
  api_base_url?: string;
  api_key?: string;
  scorm_support?: boolean;
  scorm_versions?: string[];
  xapi_support?: boolean;
  xapi_endpoint?: string;
  sync_completions?: boolean;
  sync_progress?: boolean;
  sync_frequency_hours?: number;
}

// SCORM Package Types
export interface SCORMPackage {
  id: string;
  workspace_id: string;
  integration_id: string | null;
  title: string;
  description: string | null;
  version: SCORMVersion;
  package_url: string | null;
  package_size_bytes: number | null;
  launch_url: string | null;
  manifest_data: Record<string, unknown>;
  passing_score: number | null;
  max_attempts: number | null;
  time_limit_minutes: number | null;
  learning_path_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SCORMPackageWithStats extends SCORMPackage {
  total_enrollments: number;
  completed_count: number;
  passed_count: number;
  failed_count: number;
  in_progress_count: number;
  average_score: number | null;
  average_time_seconds: number | null;
}

export interface SCORMPackageCreate {
  title: string;
  description?: string;
  version?: SCORMVersion;
  package_url?: string;
  launch_url?: string;
  passing_score?: number;
  max_attempts?: number;
  time_limit_minutes?: number;
  integration_id?: string;
  learning_path_id?: string;
}

// SCORM Tracking Types
export interface SCORMTracking {
  id: string;
  package_id: string;
  developer_id: string;
  workspace_id: string;
  cmi_data: Record<string, unknown>;
  completion_status: SCORMCompletionStatus;
  success_status: string | null;
  score_raw: number | null;
  score_min: number | null;
  score_max: number | null;
  score_scaled: number | null;
  total_time_seconds: number;
  session_time_seconds: number;
  progress_measure: number | null;
  attempt_number: number;
  first_accessed_at: string | null;
  last_accessed_at: string | null;
  completed_at: string | null;
  suspend_data: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

export interface SCORMTrackingWithDetails extends SCORMTracking {
  package_title: string;
  developer_name: string | null;
  developer_email: string | null;
}

// Calendar Integration Types
export interface CalendarIntegration {
  id: string;
  workspace_id: string;
  developer_id: string;
  provider: CalendarProviderType;
  calendar_id: string | null;
  sync_learning_sessions: boolean;
  sync_deadlines: boolean;
  sync_certifications: boolean;
  status: IntegrationStatus;
  last_sync_at: string | null;
  last_sync_error: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalendarIntegrationCreate {
  provider: CalendarProviderType;
  calendar_id?: string;
  sync_learning_sessions?: boolean;
  sync_deadlines?: boolean;
  sync_certifications?: boolean;
}

// Integrations Overview
export interface IntegrationsOverview {
  hr_integrations_count: number;
  hr_integrations_active: number;
  lms_integrations_count: number;
  lms_integrations_active: number;
  scorm_packages_count: number;
  scorm_packages_active: number;
  calendar_integrations_count: number;
  calendar_integrations_active: number;
  total_xapi_statements: number;
  last_hr_sync_at: string | null;
  last_lms_sync_at: string | null;
}

// Learning Integrations API
export const learningIntegrationsApi = {
  // Overview
  getOverview: async (): Promise<IntegrationsOverview> => {
    const response = await api.get("/learning/integrations/overview");
    return response.data;
  },

  // HR Integrations
  hr: {
    list: async (options?: {
      provider?: HRProviderType;
      status?: IntegrationStatus;
      is_active?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<HRIntegration>> => {
      const response = await api.get("/learning/integrations/hr", { params: options });
      return response.data;
    },

    create: async (data: HRIntegrationCreate): Promise<HRIntegration> => {
      const response = await api.post("/learning/integrations/hr", data);
      return response.data;
    },

    update: async (integrationId: string, data: Partial<HRIntegrationCreate>): Promise<HRIntegration> => {
      const response = await api.put(`/learning/integrations/hr/${integrationId}`, data);
      return response.data;
    },

    delete: async (integrationId: string): Promise<void> => {
      await api.delete(`/learning/integrations/hr/${integrationId}`);
    },

    triggerSync: async (integrationId: string): Promise<HRSyncLog> => {
      const response = await api.post(`/learning/integrations/hr/${integrationId}/sync`);
      return response.data;
    },
  },

  // LMS Integrations
  lms: {
    list: async (options?: {
      provider?: LMSProviderType;
      scorm_support?: boolean;
      xapi_support?: boolean;
      status?: IntegrationStatus;
      is_active?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<LMSIntegration>> => {
      const response = await api.get("/learning/integrations/lms", { params: options });
      return response.data;
    },

    create: async (data: LMSIntegrationCreate): Promise<LMSIntegration> => {
      const response = await api.post("/learning/integrations/lms", data);
      return response.data;
    },

    update: async (integrationId: string, data: Partial<LMSIntegrationCreate>): Promise<LMSIntegration> => {
      const response = await api.put(`/learning/integrations/lms/${integrationId}`, data);
      return response.data;
    },

    delete: async (integrationId: string): Promise<void> => {
      await api.delete(`/learning/integrations/lms/${integrationId}`);
    },
  },

  // SCORM Packages
  scorm: {
    listPackages: async (options?: {
      integration_id?: string;
      version?: SCORMVersion;
      is_active?: boolean;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<SCORMPackageWithStats>> => {
      const response = await api.get("/learning/integrations/scorm/packages", { params: options });
      return response.data;
    },

    createPackage: async (data: SCORMPackageCreate): Promise<SCORMPackage> => {
      const response = await api.post("/learning/integrations/scorm/packages", data);
      return response.data;
    },

    updatePackage: async (packageId: string, data: Partial<SCORMPackageCreate>): Promise<SCORMPackage> => {
      const response = await api.put(`/learning/integrations/scorm/packages/${packageId}`, data);
      return response.data;
    },

    deletePackage: async (packageId: string): Promise<void> => {
      await api.delete(`/learning/integrations/scorm/packages/${packageId}`);
    },

    launchPackage: async (packageId: string): Promise<SCORMTracking> => {
      const response = await api.post(`/learning/integrations/scorm/packages/${packageId}/launch`);
      return response.data;
    },

    listTracking: async (options?: {
      package_id?: string;
      developer_id?: string;
      completion_status?: SCORMCompletionStatus;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<SCORMTrackingWithDetails>> => {
      const response = await api.get("/learning/integrations/scorm/tracking", { params: options });
      return response.data;
    },
  },

  // Calendar Integrations
  calendar: {
    list: async (options?: {
      page?: number;
      page_size?: number;
    }): Promise<PaginatedList<CalendarIntegration>> => {
      const response = await api.get("/learning/integrations/calendar", { params: options });
      return response.data;
    },

    create: async (data: CalendarIntegrationCreate): Promise<CalendarIntegration> => {
      const response = await api.post("/learning/integrations/calendar", data);
      return response.data;
    },

    update: async (integrationId: string, data: Partial<CalendarIntegrationCreate>): Promise<CalendarIntegration> => {
      const response = await api.put(`/learning/integrations/calendar/${integrationId}`, data);
      return response.data;
    },

    delete: async (integrationId: string): Promise<void> => {
      await api.delete(`/learning/integrations/calendar/${integrationId}`);
    },
  },
};

// ============================================================================
// Platform Admin API
// ============================================================================

export interface AdminCheckResponse {
  is_admin: boolean;
}

export interface AdminDashboardStats {
  total_workspaces: number;
  total_users: number;
  total_emails_sent: number;
  total_notifications: number;
  active_workspaces_30d: number;
  email_delivery_rate: number;
  emails_sent_today: number;
  emails_sent_this_week: number;
  emails_failed_today: number;
}

export interface AdminEmailLog {
  id: string;
  notification_id: string | null;
  recipient_email: string;
  subject: string;
  template_name: string | null;
  body_preview: string | null;
  ses_message_id: string | null;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  workspace_id: string | null;
  workspace_name: string | null;
  notification_type: string | null;
}

export interface PaginatedAdminEmailLogs {
  items: AdminEmailLog[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export interface AdminNotification {
  id: string;
  recipient_id: string;
  recipient_email: string | null;
  recipient_name: string | null;
  event_type: string;
  title: string;
  body: string;
  context: Record<string, unknown>;
  is_read: boolean;
  email_sent: boolean;
  created_at: string;
}

export interface PaginatedAdminNotifications {
  items: AdminNotification[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  owner_id: string;
  owner_email: string | null;
  owner_name: string | null;
  plan_tier: string | null;
  member_count: number;
  is_active: boolean;
  created_at: string;
}

export interface PaginatedAdminWorkspaces {
  items: AdminWorkspace[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  has_github: boolean;
  has_google: boolean;
  workspace_count: number;
  created_at: string;
}

export interface PaginatedAdminUsers {
  items: AdminUser[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export interface ResendEmailResponse {
  success: boolean;
  message: string;
  new_email_log_id: string | null;
}

export interface EmailListParams {
  page?: number;
  per_page?: number;
  status_filter?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

export const platformAdminApi = {
  checkAdmin: async (): Promise<AdminCheckResponse> => {
    const response = await api.get("/platform-admin/check");
    return response.data;
  },

  getDashboardStats: async (): Promise<AdminDashboardStats> => {
    const response = await api.get("/platform-admin/dashboard/stats");
    return response.data;
  },

  // Email Logs
  getEmailLogs: async (params?: EmailListParams): Promise<PaginatedAdminEmailLogs> => {
    const response = await api.get("/platform-admin/emails", { params });
    return response.data;
  },

  getEmailLog: async (emailId: string): Promise<AdminEmailLog> => {
    const response = await api.get(`/platform-admin/emails/${emailId}`);
    return response.data;
  },

  resendEmail: async (emailId: string): Promise<ResendEmailResponse> => {
    const response = await api.post(`/platform-admin/emails/${emailId}/resend`);
    return response.data;
  },

  // Notifications
  getNotifications: async (params?: {
    page?: number;
    per_page?: number;
    event_type?: string;
    search?: string;
  }): Promise<PaginatedAdminNotifications> => {
    const response = await api.get("/platform-admin/notifications", { params });
    return response.data;
  },

  // Workspaces
  getWorkspaces: async (params?: {
    page?: number;
    per_page?: number;
    search?: string;
    plan_tier?: string;
  }): Promise<PaginatedAdminWorkspaces> => {
    const response = await api.get("/platform-admin/workspaces", { params });
    return response.data;
  },

  // Users
  getUsers: async (params?: {
    page?: number;
    per_page?: number;
    search?: string;
  }): Promise<PaginatedAdminUsers> => {
    const response = await api.get("/platform-admin/users", { params });
    return response.data;
  },
};

// ============================================================================
// Workspace Email Delivery API (Enterprise Only)
// ============================================================================

export interface WorkspaceEmailStats {
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  total_bounced: number;
  total_pending: number;
  delivery_rate: number;
  bounce_rate: number;
  sent_today: number;
  sent_this_week: number;
  sent_this_month: number;
}

export interface WorkspaceEmailLog {
  id: string;
  notification_id: string | null;
  recipient_email: string;
  subject: string;
  template_name: string | null;
  ses_message_id: string | null;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  notification_type: string | null;
}

export interface PaginatedWorkspaceEmailLogs {
  items: WorkspaceEmailLog[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export const workspaceEmailApi = {
  getEmailLogs: async (
    workspaceId: string,
    developerId: string,
    params?: {
      page?: number;
      per_page?: number;
      status_filter?: string;
    }
  ): Promise<PaginatedWorkspaceEmailLogs> => {
    const response = await api.get(`/notifications/workspace/${workspaceId}/emails`, {
      params: { developer_id: developerId, ...params },
    });
    return response.data;
  },

  getEmailStats: async (
    workspaceId: string,
    developerId: string
  ): Promise<WorkspaceEmailStats> => {
    const response = await api.get(`/notifications/workspace/${workspaceId}/email-stats`, {
      params: { developer_id: developerId },
    });
    return response.data;
  },
};

// ============================================================================
// App Access Control API
// ============================================================================

export interface AppModuleInfo {
  id: string;
  name: string;
  description: string;
  route: string;
}

export interface AppInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  base_route: string;
  required_permission: string | null;
  modules: AppModuleInfo[];
}

export interface AppAccessTemplate {
  id: string;
  workspace_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  app_config: Record<string, AppAccessConfig>;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppAccessConfig {
  enabled: boolean;
  modules?: Record<string, boolean>;
}

export interface EffectiveAppAccess {
  app_id: string;
  enabled: boolean;
  modules: Record<string, boolean>;
}

export interface MemberEffectiveAccess {
  apps: Record<string, EffectiveAppAccess>;
  applied_template_id: string | null;
  applied_template_name: string | null;
  has_custom_overrides: boolean;
  is_admin: boolean;
}

export interface MemberAccessMatrixEntry {
  developer_id: string;
  developer_name: string | null;
  developer_email: string | null;
  role_name: string | null;
  applied_template_id: string | null;
  applied_template_name: string | null;
  has_custom_overrides: boolean;
  is_admin: boolean;
  apps: Record<string, "full" | "partial" | "none">;
}

export interface AccessMatrixResponse {
  members: MemberAccessMatrixEntry[];
  apps: AppInfo[];
}

export interface SystemBundleInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  app_config: Record<string, AppAccessConfig>;
}

export interface AccessCheckResponse {
  allowed: boolean;
  app_id: string;
  module_id: string | null;
  reason: string | null;
}

export const appAccessApi = {
  // App catalog
  getCatalog: async (workspaceId: string): Promise<{ apps: AppInfo[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/app-access/catalog`);
    return response.data;
  },

  // System bundles
  getBundles: async (workspaceId: string): Promise<{ bundles: SystemBundleInfo[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/app-access/bundles`);
    return response.data;
  },

  // Templates
  listTemplates: async (
    workspaceId: string,
    includeSystem = true
  ): Promise<{ templates: AppAccessTemplate[] }> => {
    const response = await api.get(`/workspaces/${workspaceId}/app-access/templates`, {
      params: { include_system: includeSystem },
    });
    return response.data;
  },

  getTemplate: async (workspaceId: string, templateId: string): Promise<AppAccessTemplate> => {
    const response = await api.get(`/workspaces/${workspaceId}/app-access/templates/${templateId}`);
    return response.data;
  },

  createTemplate: async (
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      app_config: Record<string, AppAccessConfig>;
    }
  ): Promise<AppAccessTemplate> => {
    const response = await api.post(`/workspaces/${workspaceId}/app-access/templates`, data);
    return response.data;
  },

  updateTemplate: async (
    workspaceId: string,
    templateId: string,
    data: {
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
      app_config?: Record<string, AppAccessConfig>;
    }
  ): Promise<AppAccessTemplate> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/app-access/templates/${templateId}`,
      data
    );
    return response.data;
  },

  deleteTemplate: async (workspaceId: string, templateId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/app-access/templates/${templateId}`);
  },

  // Member access
  getMemberEffectiveAccess: async (
    workspaceId: string,
    developerId: string
  ): Promise<MemberEffectiveAccess> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/app-access/members/${developerId}/effective`
    );
    return response.data;
  },

  updateMemberAccess: async (
    workspaceId: string,
    developerId: string,
    data: {
      app_config: Record<string, AppAccessConfig>;
      applied_template_id?: string | null;
    }
  ): Promise<{ success: boolean; developer_id: string }> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/app-access/members/${developerId}`,
      data
    );
    return response.data;
  },

  applyTemplateToMember: async (
    workspaceId: string,
    developerId: string,
    templateId: string
  ): Promise<{ success: boolean; developer_id: string }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/app-access/members/${developerId}/apply-template`,
      { template_id: templateId }
    );
    return response.data;
  },

  resetMemberToDefaults: async (
    workspaceId: string,
    developerId: string
  ): Promise<{ success: boolean; developer_id: string }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/app-access/members/${developerId}/reset`
    );
    return response.data;
  },

  bulkApplyTemplate: async (
    workspaceId: string,
    developerIds: string[],
    templateId: string
  ): Promise<{
    success_count: number;
    failed_count: number;
    applied_developer_ids: string[];
  }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/app-access/members/bulk-apply-template`,
      {
        developer_ids: developerIds,
        template_id: templateId,
      }
    );
    return response.data;
  },

  // Access matrix
  getAccessMatrix: async (workspaceId: string): Promise<AccessMatrixResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/app-access/matrix`);
    return response.data;
  },

  // Access check
  checkAccess: async (
    workspaceId: string,
    appId: string,
    moduleId?: string
  ): Promise<AccessCheckResponse> => {
    const response = await api.post(`/workspaces/${workspaceId}/app-access/check`, {
      app_id: appId,
      module_id: moduleId,
    });
    return response.data;
  },

  // Access logs (Enterprise feature)
  getAccessLogs: async (
    workspaceId: string,
    params?: {
      action?: string;
      target_type?: string;
      target_id?: string;
      actor_id?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<AppAccessLogsResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/app-access/logs`, {
      params,
    });
    return response.data;
  },

  getAccessLogsSummary: async (
    workspaceId: string,
    days?: number
  ): Promise<AppAccessLogsSummary> => {
    const response = await api.get(`/workspaces/${workspaceId}/app-access/logs/summary`, {
      params: { days },
    });
    return response.data;
  },
};

// Access Log types
export interface AppAccessLog {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  description: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  extra_data: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AppAccessLogsResponse {
  logs: AppAccessLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface AppAccessLogsSummary {
  action_counts: Record<string, number>;
  daily_counts: Array<{ date: string; count: number }>;
  recent_denials: Array<{
    id: string;
    actor_id: string | null;
    target_id: string | null;
    extra_data: Record<string, unknown>;
    created_at: string;
  }>;
  total_events: number;
  period_days: number;
}

// ============================================================================
// Knowledge Graph Types
// ============================================================================

export type KnowledgeEntityType =
  | "person"
  | "concept"
  | "technology"
  | "project"
  | "organization"
  | "code"
  | "external";

export type KnowledgeRelationType =
  | "mentions"
  | "related_to"
  | "depends_on"
  | "authored_by"
  | "implements"
  | "references"
  | "links_to"
  | "shares_entity"
  | "mentioned_in";

export type KnowledgeExtractionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface KnowledgeGraphFilters {
  entity_types?: KnowledgeEntityType[];
  relationship_types?: KnowledgeRelationType[];
  space_ids?: string[];
  date_from?: string;
  date_to?: string;
  min_confidence?: number;
  include_documents?: boolean;
  include_entities?: boolean;
  max_nodes?: number;
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  node_type: string;
  metadata: {
    created_at?: string;
    updated_at?: string;
    activity_score?: number;
    occurrence_count?: number;
    confidence_score?: number;
    description?: string;
    aliases?: string[];
    first_seen_at?: string;
    last_seen_at?: string;
  };
  color: string;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
  strength: number;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeGraphStatistics {
  total_entities: number;
  total_documents: number;
  total_relationships: number;
  entity_type_counts: Record<string, number>;
  relationship_type_counts?: Record<string, number>;
}

export interface KnowledgeGraphTemporalData {
  activity_heatmap: Array<{
    date: string;
    count: number;
  }>;
  entity_timeline: Array<{
    entity_id: string;
    first_seen: string;
    last_seen: string;
  }>;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  statistics: KnowledgeGraphStatistics;
  temporal?: KnowledgeGraphTemporalData;
}

export interface KnowledgeEntity {
  id: string;
  workspace_id: string;
  name: string;
  entity_type: KnowledgeEntityType;
  description: string | null;
  aliases: string[];
  metadata: Record<string, unknown>;
  confidence_score: number;
  occurrence_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeEntityDetails extends KnowledgeEntity {
  documents: Array<{
    id: string;
    title: string;
    updated_at?: string;
  }>;
  related_entities: Array<{
    id: string;
    name: string;
    entity_type: string;
    relationship_type: string;
    strength: number;
  }>;
}

export interface KnowledgeDocumentConnections {
  document: {
    id: string;
    title: string;
  } | null;
  entities: Array<{
    id: string;
    name: string;
    type: string;
    confidence: number;
    context?: string;
  }>;
  related_documents: Array<{
    id: string;
    title: string;
    strength: number;
    updated_at?: string;
  }>;
}

export interface KnowledgeExtractionJob {
  id: string;
  workspace_id: string;
  document_id: string | null;
  status: KnowledgeExtractionStatus;
  job_type: string;
  entities_found: number;
  relationships_found: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface KnowledgeSearchResult {
  id: string;
  name: string;
  type: string;
  description?: string;
  occurrence_count: number;
}

export interface KnowledgePathNode {
  id: string;
  name: string;
  node_type: string;
  relationship_to_next?: string;
}

// ============================================================================
// Knowledge Graph API
// ============================================================================

export const knowledgeGraphApi = {
  // Graph data
  getGraph: async (
    workspaceId: string,
    filters?: KnowledgeGraphFilters
  ): Promise<KnowledgeGraphData> => {
    const response = await api.get(`/workspaces/${workspaceId}/knowledge-graph/graph`, {
      params: filters,
    });
    return response.data;
  },

  getDocumentGraph: async (
    workspaceId: string,
    documentId: string,
    depth?: number
  ): Promise<KnowledgeGraphData> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/knowledge-graph/graph/document/${documentId}`,
      { params: { depth } }
    );
    return response.data;
  },

  getEntityNeighborhood: async (
    workspaceId: string,
    entityId: string,
    depth?: number
  ): Promise<KnowledgeGraphData> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/knowledge-graph/graph/entity/${entityId}`,
      { params: { depth } }
    );
    return response.data;
  },

  // Entities
  listEntities: async (
    workspaceId: string,
    params?: {
      entity_type?: KnowledgeEntityType;
      search?: string;
      min_confidence?: number;
      skip?: number;
      limit?: number;
    }
  ): Promise<{ entities: KnowledgeEntity[]; total: number }> => {
    const response = await api.get(`/workspaces/${workspaceId}/knowledge-graph/entities`, {
      params,
    });
    return response.data;
  },

  getEntity: async (workspaceId: string, entityId: string): Promise<KnowledgeEntityDetails> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/knowledge-graph/entities/${entityId}`
    );
    return response.data;
  },

  getDocumentConnections: async (
    workspaceId: string,
    documentId: string
  ): Promise<KnowledgeDocumentConnections> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/knowledge-graph/graph/document/${documentId}`
    );
    return response.data;
  },

  // Search and path finding
  searchEntities: async (
    workspaceId: string,
    query: string,
    entityType?: KnowledgeEntityType
  ): Promise<KnowledgeSearchResult[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/knowledge-graph/entities`, {
      params: { search: query, entity_type: entityType, limit: 20 },
    });
    return response.data.entities.map((e: KnowledgeEntity) => ({
      id: e.id,
      name: e.name,
      type: e.entity_type,
      description: e.description,
      occurrence_count: e.occurrence_count,
    }));
  },

  findPath: async (
    workspaceId: string,
    sourceId: string,
    targetId: string,
    maxDepth?: number
  ): Promise<{ path: KnowledgePathNode[]; found: boolean }> => {
    const response = await api.get(`/workspaces/${workspaceId}/knowledge-graph/path`, {
      params: { source_id: sourceId, target_id: targetId, max_depth: maxDepth },
    });
    return response.data;
  },

  // Statistics and temporal
  getStatistics: async (workspaceId: string): Promise<KnowledgeGraphStatistics> => {
    const response = await api.get(`/workspaces/${workspaceId}/knowledge-graph/statistics`);
    return response.data;
  },

  getTemporalData: async (
    workspaceId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<KnowledgeGraphTemporalData> => {
    const response = await api.get(`/workspaces/${workspaceId}/knowledge-graph/temporal`, {
      params: { date_from: dateFrom, date_to: dateTo },
    });
    return response.data;
  },

  // Extraction
  triggerExtraction: async (
    workspaceId: string,
    documentId?: string
  ): Promise<KnowledgeExtractionJob> => {
    if (documentId) {
      const response = await api.post(
        `/workspaces/${workspaceId}/knowledge-graph/extract/document/${documentId}`
      );
      return response.data;
    }
    const response = await api.post(`/workspaces/${workspaceId}/knowledge-graph/extract`);
    return response.data;
  },

  getExtractionJobs: async (
    workspaceId: string,
    params?: { status?: KnowledgeExtractionStatus; skip?: number; limit?: number }
  ): Promise<{ jobs: KnowledgeExtractionJob[]; total: number }> => {
    const response = await api.get(`/workspaces/${workspaceId}/knowledge-graph/jobs`, {
      params,
    });
    return response.data;
  },

  getExtractionJob: async (
    workspaceId: string,
    jobId: string
  ): Promise<KnowledgeExtractionJob> => {
    const response = await api.get(`/workspaces/${workspaceId}/knowledge-graph/jobs/${jobId}`);
    return response.data;
  },
};

// =============================================================================
// Developer Insights API
// =============================================================================

export interface VelocityMetrics {
  commits_count: number;
  prs_merged: number;
  lines_added: number;
  lines_removed: number;
  net_lines: number;
  commit_frequency: number;
  pr_throughput: number;
  avg_commit_size: number;
}

export interface EfficiencyMetrics {
  avg_pr_cycle_time_hours: number;
  avg_time_to_first_review_hours: number;
  avg_pr_size: number;
  pr_merge_rate: number;
  first_commit_to_merge_hours: number;
  rework_ratio: number;
}

export interface QualityMetrics {
  review_participation_rate: number;
  avg_review_depth: number;
  review_turnaround_hours: number;
  self_merge_rate: number;
}

export interface SustainabilityMetrics {
  weekend_commit_ratio: number;
  late_night_commit_ratio: number;
  longest_streak_days: number;
  avg_daily_active_hours: number;
  focus_score: number;
}

export interface CollaborationMetrics {
  unique_collaborators: number;
  cross_team_pr_ratio: number;
  review_given_count: number;
  review_received_count: number;
  knowledge_sharing_score: number;
}

export interface SprintProductivityMetrics {
  tasks_assigned: number;
  tasks_completed: number;
  story_points_committed: number;
  story_points_completed: number;
  task_completion_rate: number;
  avg_cycle_time_hours: number;
  avg_lead_time_hours: number;
  sprints_participated: number;
  carry_over_tasks: number;
  task_type_distribution: Record<string, number>;
}

export interface DeveloperInsightsResponse {
  developer_id: string;
  workspace_id: string;
  period_start: string;
  period_end: string;
  period_type: string;
  velocity: VelocityMetrics;
  efficiency: EfficiencyMetrics;
  quality: QualityMetrics;
  sustainability: SustainabilityMetrics;
  collaboration: CollaborationMetrics;
  sprint?: SprintProductivityMetrics | null;
  raw_counts?: Record<string, any>;
  computed_at?: string;
  previous?: DeveloperInsightsResponse | null;
}

export interface DeveloperSnapshotResponse {
  id: string;
  developer_id: string;
  workspace_id: string;
  period_start: string;
  period_end: string;
  period_type: string;
  velocity_metrics?: VelocityMetrics;
  efficiency_metrics?: EfficiencyMetrics;
  quality_metrics?: QualityMetrics;
  sustainability_metrics?: SustainabilityMetrics;
  collaboration_metrics?: CollaborationMetrics;
  raw_counts?: Record<string, number>;
  computed_at?: string;
}

export interface MemberSummary {
  developer_id: string;
  developer_name?: string | null;
  commits_count: number;
  prs_merged: number;
  lines_changed: number;
  reviews_given: number;
}

export interface TeamDistribution {
  gini_coefficient: number;
  top_contributor_share: number;
  member_metrics: MemberSummary[];
  bottleneck_developers: string[];
}

export interface TeamAggregate {
  total_commits: number;
  total_prs_merged: number;
  total_lines_changed: number;
  total_reviews: number;
  avg_commits_per_member: number;
  avg_prs_per_member: number;
}

export interface TeamInsightsResponse {
  workspace_id: string;
  team_id?: string | null;
  period_start: string;
  period_end: string;
  period_type: string;
  member_count: number;
  aggregate: TeamAggregate;
  distribution: TeamDistribution;
  computed_at?: string;
}

export interface LeaderboardEntry {
  developer_id: string;
  developer_name?: string | null;
  value: number;
  rank: number;
}

export interface LeaderboardResponse {
  metric: string;
  period_type: string;
  period_start: string;
  period_end: string;
  entries: LeaderboardEntry[];
}

export interface SnapshotGenerateResponse {
  developer_snapshots_created: number;
  team_snapshot_created: boolean;
}

export interface InsightSettingsData {
  id: string;
  workspace_id: string;
  team_id?: string | null;
  working_hours?: {
    start_hour: number;
    end_hour: number;
    timezone: string;
    late_night_threshold_hour: number;
  } | null;
  health_score_weights?: {
    velocity: number;
    efficiency: number;
    quality: number;
    sustainability: number;
    collaboration: number;
  } | null;
  bottleneck_multiplier: number;
  auto_generate_snapshots: boolean;
  snapshot_frequency: string;
  created_at?: string;
  updated_at?: string;
}

export interface AlertRuleData {
  id: string;
  workspace_id: string;
  created_by_id: string;
  name: string;
  description?: string | null;
  metric_category: string;
  metric_name: string;
  condition_operator: string;
  condition_value: number;
  scope_type: string;
  scope_id?: string | null;
  severity: string;
  notification_channels?: string[] | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AlertHistoryData {
  id: string;
  rule_id: string;
  workspace_id: string;
  developer_id?: string | null;
  team_id?: string | null;
  metric_value: number;
  threshold_value: number;
  severity: string;
  status: string;
  message?: string | null;
  acknowledged_by_id?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  triggered_at?: string;
}

export type InsightsPeriodType = "daily" | "weekly" | "sprint" | "monthly";

// Repository Insights types
export interface RepositoryContributor {
  developer_id: string;
  developer_name?: string | null;
  commits_count: number;
  lines_added: number;
  lines_removed: number;
  is_workspace_member: boolean;
}

export interface RepositoryInsightsSummary {
  repository: string;
  commits_count: number;
  lines_added: number;
  lines_removed: number;
  prs_count: number;
  prs_merged: number;
  reviews_count: number;
  unique_contributors: number;
  top_contributors: RepositoryContributor[];
  language?: string | null;
  is_private: boolean;
}

export interface RepositoryInsightsListResponse {
  repositories: RepositoryInsightsSummary[];
  total_repositories: number;
  period_type: string;
  period_start: string;
  period_end: string;
}

export interface RepositoryDeveloperBreakdown {
  developer_id: string;
  developer_name?: string | null;
  commits_count: number;
  prs_merged: number;
  lines_added: number;
  lines_removed: number;
  lines_changed: number;
  reviews_given: number;
  is_workspace_member: boolean;
}

export interface RepositoryDetailResponse {
  repository: string;
  aggregate: RepositoryInsightsSummary;
  developer_breakdown: RepositoryDeveloperBreakdown[];
  period_type: string;
  period_start: string;
  period_end: string;
}

export interface RepositorySyncInfo {
  repository_id: string;
  repository_full_name: string;
  is_enabled: boolean;
  sync_status: string;
  last_sync_at?: string | null;
  sync_error?: string | null;
  commits_synced: number;
  prs_synced: number;
  reviews_synced: number;
}

export interface DeveloperSyncStatusData {
  developer_id: string;
  developer_name?: string | null;
  repositories: RepositorySyncInfo[];
  is_workspace_member: boolean;
}

export interface SyncStatusResponse {
  developers: DeveloperSyncStatusData[];
  total_developers: number;
}

export interface PRSizeDistribution {
  distribution: { trivial: number; small: number; medium: number; large: number; massive: number };
  avg_size: number;
  median_size: number;
  total_prs: number;
  prs: { id: string; title: string; additions: number; deletions: number; size: number; category: string; state: string }[];
}

export interface CodeChurnResponse {
  developer_id: string;
  workspace_id: string;
  period_start: string;
  period_end: string;
  churn_window_days: number;
  churn_rate: number;
  total_additions: number;
  total_deletions: number;
  churn_deletions: number;
  per_repo: { repository: string; additions: number; deletions: number; churn_deletions: number; churn_rate: number }[];
}

export interface HealthScoreBreakdown {
  score: number;
  weight: number;
}

export interface HealthScoreResponse {
  developer_id: string;
  workspace_id: string;
  period_start: string;
  period_end: string;
  score: number;
  breakdown: {
    velocity: HealthScoreBreakdown;
    efficiency: HealthScoreBreakdown;
    quality: HealthScoreBreakdown;
    sustainability: HealthScoreBreakdown;
    collaboration: HealthScoreBreakdown;
  };
}

export interface PercentileRankingEntry {
  value: number;
  percentile: number;
  rank: number;
  total: number;
}

export interface PercentileRankingsResponse {
  developer_id: string;
  workspace_id: string;
  team_id: string | null;
  period_start: string;
  period_end: string;
  peer_count: number;
  rankings: Record<string, PercentileRankingEntry>;
}

export interface VelocityForecastResponse {
  developer_id: string;
  workspace_id: string;
  period_type: string;
  data_points: number;
  confidence: number;
  forecast: {
    commits: number;
    prs_merged: number;
    lines_added: number;
  };
}

export interface GamingFlag {
  pattern: string;
  severity: "low" | "medium" | "high";
  evidence: string;
  value?: number;
}

export interface GamingFlagsResponse {
  developer_id: string;
  workspace_id: string;
  period_start: string;
  period_end: string;
  risk_level: "none" | "low" | "medium" | "high";
  flags: GamingFlag[];
}

export interface AlertEvaluationResponse {
  workspace_id: string;
  period_start: string;
  period_end: string;
  rules_evaluated: boolean;
  alerts_triggered: number;
  triggered: {
    rule_id: string;
    rule_name: string;
    developer_id: string;
    metric_value: number;
    threshold_value: number;
    severity: string;
  }[];
}

export interface RoleBenchmarkEntry {
  value: number;
  median: number;
  percentile: number;
  rank: number;
  total: number;
}

export interface RoleBenchmarkResponse {
  developer_id: string;
  workspace_id: string;
  period_start: string;
  period_end: string;
  engineering_role: string | null;
  peer_count: number;
  benchmarks: Record<string, RoleBenchmarkEntry>;
}

export interface SprintCapacityDeveloper {
  developer_id: string;
  developer_name?: string;
  forecast: {
    commits: number;
    prs_merged: number;
    lines_added: number;
    story_points: number;
  };
  confidence: number;
  data_points: number;
}

export interface SprintCapacityResponse {
  workspace_id: string;
  team_id: string | null;
  sprint_length_days: number;
  member_count: number;
  team_forecast: {
    commits: number;
    prs_merged: number;
    lines_added: number;
    story_points: number;
  };
  team_confidence: number;
  per_developer: SprintCapacityDeveloper[];
}

export interface ExecutiveSummaryResponse {
  workspace_id: string;
  period_start: string;
  period_end: string;
  total_developers: number;
  activity: {
    total_commits: number;
    total_prs_merged: number;
    total_reviews: number;
    total_lines_changed: number;
    avg_commits_per_dev: number;
    avg_prs_per_dev: number;
  };
  health: {
    gini_coefficient: number;
    workload_balance: "good" | "moderate" | "poor";
    burnout_risk_count: number;
    bottleneck_count: number;
  };
  risks: {
    burnout: { developer_id: string; developer_name?: string; weekend_ratio: number; late_night_ratio: number }[];
    bottlenecks: { developer_id: string; developer_name?: string; commits: number; ratio_vs_avg: number }[];
  };
  top_contributors: { developer_id: string; developer_name?: string; commits: number; prs_merged: number; lines_changed: number }[];
}

export interface RotationImpactResponse {
  workspace_id: string;
  team_id: string | null;
  period_start: string;
  period_end: string;
  team_size: number;
  rotating_count: number;
  remaining_count: number;
  current: { commits: number; prs_merged: number; lines_changed: number };
  impact: { commit_loss_pct: number; pr_loss_pct: number; lines_loss_pct: number };
  forecast_without_replacement: { commits: number; prs_merged: number };
  forecast_with_replacement: { commits: number; prs_merged: number; ramp_up_factor: number; note: string };
  departing_developers: { developer_id: string; commits: number; prs_merged: number; lines_changed: number; commit_share: number }[];
}

export interface DeveloperDataExport {
  developer_id: string;
  workspace_id: string;
  exported_at: string;
  snapshots: Record<string, unknown>[];
  working_schedule: Record<string, unknown> | null;
  alert_history: Record<string, unknown>[];
}

export const insightsApi = {
  getDeveloperInsights: async (
    workspaceId: string,
    developerId: string,
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
      compare_previous?: boolean;
    }
  ): Promise<DeveloperInsightsResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/developers/${developerId}`,
      { params }
    );
    return response.data;
  },

  getDeveloperTrends: async (
    workspaceId: string,
    developerId: string,
    params?: { period_type?: InsightsPeriodType; limit?: number }
  ): Promise<DeveloperSnapshotResponse[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/developers/${developerId}/trends`,
      { params }
    );
    return response.data;
  },

  getDeveloperCodeChurn: async (
    workspaceId: string,
    developerId: string,
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
      churn_window_days?: number;
    }
  ): Promise<CodeChurnResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/developers/${developerId}/code-churn`,
      { params }
    );
    return response.data;
  },

  getDeveloperPRSizes: async (
    workspaceId: string,
    developerId: string,
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<PRSizeDistribution> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/developers/${developerId}/pr-sizes`,
      { params }
    );
    return response.data;
  },

  getDeveloperHealthScore: async (
    workspaceId: string,
    developerId: string,
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<HealthScoreResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/developers/${developerId}/health-score`,
      { params }
    );
    return response.data;
  },

  getDeveloperPercentile: async (
    workspaceId: string,
    developerId: string,
    params?: {
      team_id?: string;
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<PercentileRankingsResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/developers/${developerId}/percentile`,
      { params }
    );
    return response.data;
  },

  getTeamInsights: async (
    workspaceId: string,
    params?: {
      team_id?: string;
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<TeamInsightsResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/insights/team`, {
      params,
    });
    return response.data;
  },

  compareDevs: async (
    workspaceId: string,
    developerIds: string[],
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<DeveloperInsightsResponse[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/insights/team/compare`, {
      params: { ...params, developer_ids: developerIds.join(",") },
    });
    return response.data;
  },

  getLeaderboard: async (
    workspaceId: string,
    params?: {
      metric?: string;
      team_id?: string;
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
      limit?: number;
    }
  ): Promise<LeaderboardResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/team/leaderboard`,
      { params }
    );
    return response.data;
  },

  generateSnapshots: async (
    workspaceId: string,
    data: {
      period_type?: InsightsPeriodType;
      start_date: string;
      end_date: string;
      developer_ids?: string[];
      team_id?: string;
    }
  ): Promise<SnapshotGenerateResponse> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/insights/snapshots/generate`,
      data
    );
    return response.data;
  },

  // Project-level insights
  getProjectInsights: async (
    workspaceId: string,
    projectId: string,
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<TeamInsightsResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/projects/${projectId}`,
      { params }
    );
    return response.data;
  },

  getProjectLeaderboard: async (
    workspaceId: string,
    projectId: string,
    params?: {
      metric?: string;
      period_type?: InsightsPeriodType;
      limit?: number;
    }
  ): Promise<LeaderboardResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/projects/${projectId}/leaderboard`,
      { params }
    );
    return response.data;
  },

  // Settings
  getSettings: async (
    workspaceId: string,
    teamId?: string
  ): Promise<InsightSettingsData> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/settings`,
      { params: teamId ? { team_id: teamId } : undefined }
    );
    return response.data;
  },

  saveSettings: async (
    workspaceId: string,
    data: Partial<InsightSettingsData> & { team_id?: string | null }
  ): Promise<InsightSettingsData> => {
    const response = await api.put(
      `/workspaces/${workspaceId}/insights/settings`,
      data
    );
    return response.data;
  },

  // Alert Rules
  listAlertRules: async (
    workspaceId: string,
    activeOnly?: boolean
  ): Promise<AlertRuleData[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/alerts/rules`,
      { params: { active_only: activeOnly ?? true } }
    );
    return response.data;
  },

  createAlertRule: async (
    workspaceId: string,
    data: Omit<AlertRuleData, "id" | "workspace_id" | "created_by_id" | "created_at" | "updated_at">
  ): Promise<AlertRuleData> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/insights/alerts/rules`,
      data
    );
    return response.data;
  },

  deleteAlertRule: async (workspaceId: string, ruleId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/insights/alerts/rules/${ruleId}`);
  },

  // Alert History
  listAlertHistory: async (
    workspaceId: string,
    params?: { status?: string; limit?: number }
  ): Promise<AlertHistoryData[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/alerts/history`,
      { params }
    );
    return response.data;
  },

  acknowledgeAlert: async (workspaceId: string, alertId: string): Promise<void> => {
    await api.patch(
      `/workspaces/${workspaceId}/insights/alerts/history/${alertId}/acknowledge`
    );
  },

  evaluateAlerts: async (
    workspaceId: string,
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<AlertEvaluationResponse> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/insights/alerts/evaluate`,
      null,
      { params }
    );
    return response.data;
  },

  getDeveloperForecast: async (
    workspaceId: string,
    developerId: string,
    params?: {
      period_type?: InsightsPeriodType;
      periods_back?: number;
    }
  ): Promise<VelocityForecastResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/developers/${developerId}/forecast`,
      { params }
    );
    return response.data;
  },

  getDeveloperGamingFlags: async (
    workspaceId: string,
    developerId: string,
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<GamingFlagsResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/developers/${developerId}/gaming-flags`,
      { params }
    );
    return response.data;
  },

  seedAlertTemplates: async (workspaceId: string): Promise<{ created: number; templates: AlertRuleData[] }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/insights/alerts/templates/seed`
    );
    return response.data;
  },

  updateAlertRule: async (
    workspaceId: string,
    ruleId: string,
    data: Partial<Omit<AlertRuleData, "id" | "workspace_id" | "created_by_id" | "created_at" | "updated_at">>
  ): Promise<AlertRuleData> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/insights/alerts/rules/${ruleId}`,
      data
    );
    return response.data;
  },

  getSprintCapacity: async (
    workspaceId: string,
    params?: {
      team_id?: string;
      sprint_length_days?: number;
      periods_back?: number;
    }
  ): Promise<SprintCapacityResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/team/sprint-capacity`,
      { params }
    );
    return response.data;
  },

  getExecutiveSummary: async (
    workspaceId: string,
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<ExecutiveSummaryResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/executive/summary`,
      { params }
    );
    return response.data;
  },

  getDeveloperRoleBenchmark: async (
    workspaceId: string,
    developerId: string,
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<RoleBenchmarkResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/developers/${developerId}/role-benchmark`,
      { params }
    );
    return response.data;
  },

  getRotationImpact: async (
    workspaceId: string,
    rotatingDeveloperIds: string[],
    params?: {
      team_id?: string;
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<RotationImpactResponse> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/insights/team/rotation-impact`,
      null,
      { params: { ...params, rotating_developer_ids: rotatingDeveloperIds.join(",") } }
    );
    return response.data;
  },

  exportDeveloperData: async (
    workspaceId: string,
    developerId: string
  ): Promise<DeveloperDataExport> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/developers/${developerId}/export`
    );
    return response.data;
  },

  // AI-Powered Insights
  getTeamNarrative: async (
    workspaceId: string,
    params?: { team_id?: string; period_type?: InsightsPeriodType }
  ): Promise<{ narrative: string; generated: boolean; tokens_used?: number }> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/ai/team/narrative`,
      { params }
    );
    return response.data;
  },

  getDeveloperNarrative: async (
    workspaceId: string,
    developerId: string,
    params?: { period_type?: InsightsPeriodType }
  ): Promise<{ narrative: string; generated: boolean; tokens_used?: number }> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/ai/developers/${developerId}/narrative`,
      { params }
    );
    return response.data;
  },

  getDeveloperAnomalies: async (
    workspaceId: string,
    developerId: string,
    params?: { period_type?: InsightsPeriodType; threshold?: number }
  ): Promise<{ anomalies: Array<{ metric: string; current_value: number; historical_mean: number; z_score: number; direction: string }>; explanation: string; generated: boolean }> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/ai/developers/${developerId}/anomalies`,
      { params }
    );
    return response.data;
  },

  getRootCauseAnalysis: async (
    workspaceId: string,
    params?: { team_id?: string; period_type?: InsightsPeriodType }
  ): Promise<{ analysis: string; metrics_summary?: Record<string, unknown>; generated: boolean }> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/ai/team/root-cause-analysis`,
      { params }
    );
    return response.data;
  },

  getOneOnOnePrep: async (
    workspaceId: string,
    developerId: string,
    params?: { period_type?: InsightsPeriodType }
  ): Promise<{ notes: string; health_score?: number; generated: boolean }> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/ai/developers/${developerId}/one-on-one-prep`,
      { params }
    );
    return response.data;
  },

  getSprintRetro: async (
    workspaceId: string,
    params?: { team_id?: string; period_type?: InsightsPeriodType }
  ): Promise<{ retro: string; metrics_summary?: Record<string, unknown>; generated: boolean }> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/ai/team/sprint-retro`,
      { params }
    );
    return response.data;
  },

  getTeamTrajectory: async (
    workspaceId: string,
    params?: { team_id?: string; period_type?: InsightsPeriodType }
  ): Promise<{ trajectory: string; trends?: Record<string, unknown>; generated: boolean }> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/ai/team/trajectory`,
      { params }
    );
    return response.data;
  },

  getCompositionRecommendations: async (
    workspaceId: string,
    params?: { team_id?: string; period_type?: InsightsPeriodType }
  ): Promise<{ recommendations: string; team_health?: Record<string, unknown>; generated: boolean }> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/ai/team/composition-recommendations`,
      { params }
    );
    return response.data;
  },

  getHiringForecast: async (
    workspaceId: string,
    params?: { team_id?: string; period_type?: InsightsPeriodType }
  ): Promise<{ forecast: string; indicators?: Record<string, unknown>; generated: boolean }> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/ai/team/hiring-forecast`,
      { params }
    );
    return response.data;
  },

  // Repository Insights
  getRepositoryInsights: async (
    workspaceId: string,
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<RepositoryInsightsListResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/repositories`,
      { params }
    );
    return response.data;
  },

  getRepositoryDetail: async (
    workspaceId: string,
    repoFullName: string,
    params?: {
      period_type?: InsightsPeriodType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<RepositoryDetailResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/repositories/${repoFullName}`,
      { params }
    );
    return response.data;
  },

  getSyncStatus: async (
    workspaceId: string,
  ): Promise<SyncStatusResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/insights/sync-status`
    );
    return response.data;
  },
};

// ============================================================================
// Recurring Reminders Types
// ============================================================================

export type ReminderStatus = "active" | "paused" | "archived";
export type ReminderPriority = "low" | "medium" | "high" | "critical";
export type ReminderFrequency = "once" | "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly" | "custom";
export type ReminderInstanceStatus = "pending" | "notified" | "acknowledged" | "completed" | "skipped" | "escalated" | "overdue";
export type ReminderEscalationLevel = "l1" | "l2" | "l3" | "l4";
export type ReminderAssignmentStrategy = "fixed" | "round_robin" | "on_call" | "domain_mapping" | "custom_rule";
export type ReminderCategory = "compliance" | "review" | "audit" | "security" | "training" | "maintenance" | "reporting" | "custom";

export interface EscalationLevelConfig {
  level: ReminderEscalationLevel;
  delay_hours: number;
  notify_via: string[];
  notify_user_id?: string;
  notify_team_id?: string;
}

export interface EscalationConfig {
  enabled: boolean;
  levels: EscalationLevelConfig[];
}

export interface NotificationConfig {
  channels: string[];
  advance_notice_hours: number;
  include_instructions: boolean;
  custom_message?: string;
}

export interface Reminder {
  id: string;
  workspace_id: string;
  title: string;
  description?: string;
  category: ReminderCategory;
  priority: ReminderPriority;
  status: ReminderStatus;
  frequency: ReminderFrequency;
  cron_expression?: string;
  timezone: string;
  start_date: string;
  end_date?: string;
  next_occurrence?: string;
  assignment_strategy: ReminderAssignmentStrategy;
  default_owner_id?: string;
  default_team_id?: string;
  escalation_config?: EscalationConfig;
  notification_config?: NotificationConfig;
  requires_acknowledgment: boolean;
  extra_data?: Record<string, unknown>;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  // Nested
  default_owner?: { id: string; name: string; email: string };
  default_team?: { id: string; name: string };
  created_by?: { id: string; name: string; email: string };
}

export interface ReminderCreate {
  title: string;
  description?: string;
  category: ReminderCategory;
  priority?: ReminderPriority;
  frequency: ReminderFrequency;
  cron_expression?: string;
  timezone?: string;
  start_date: string;
  end_date?: string;
  assignment_strategy?: ReminderAssignmentStrategy;
  default_owner_id?: string;
  default_team_id?: string;
  escalation_config?: EscalationConfig;
  notification_config?: NotificationConfig;
  requires_acknowledgment?: boolean;
  extra_data?: Record<string, unknown>;
}

export interface ReminderUpdate {
  title?: string;
  description?: string;
  category?: ReminderCategory;
  priority?: ReminderPriority;
  status?: ReminderStatus;
  frequency?: ReminderFrequency;
  cron_expression?: string;
  timezone?: string;
  start_date?: string;
  end_date?: string;
  assignment_strategy?: ReminderAssignmentStrategy;
  default_owner_id?: string;
  default_team_id?: string;
  escalation_config?: EscalationConfig;
  notification_config?: NotificationConfig;
  requires_acknowledgment?: boolean;
  extra_data?: Record<string, unknown>;
}

export interface ReminderInstance {
  id: string;
  reminder_id: string;
  due_date: string;
  status: ReminderInstanceStatus;
  current_escalation_level?: ReminderEscalationLevel;
  assigned_owner_id?: string;
  assigned_team_id?: string;
  initial_notified_at?: string;
  last_notified_at?: string;
  notification_count: number;
  acknowledged_at?: string;
  acknowledged_by_id?: string;
  completed_at?: string;
  completed_by_id?: string;
  completion_notes?: string;
  skipped_at?: string;
  skipped_by_id?: string;
  skip_reason?: string;
  created_at: string;
  updated_at: string;
  // Nested
  reminder?: Reminder;
  assigned_owner?: { id: string; name: string; email: string };
  assigned_team?: { id: string; name: string };
  acknowledged_by?: { id: string; name: string; email: string };
  completed_by?: { id: string; name: string; email: string };
  skipped_by?: { id: string; name: string; email: string };
}

export interface ReminderEscalation {
  id: string;
  instance_id: string;
  level: ReminderEscalationLevel;
  escalated_to_id: string;
  notified_at: string;
  notification_channels: string[];
  created_at: string;
  // Nested
  escalated_to?: { id: string; name: string; email: string };
}

export interface ControlOwner {
  id: string;
  workspace_id: string;
  control_id: string;
  control_name: string;
  domain?: string;
  primary_owner_id: string;
  backup_owner_id?: string;
  team_id?: string;
  created_at: string;
  updated_at: string;
  // Nested
  primary_owner?: { id: string; name: string; email: string };
  backup_owner?: { id: string; name: string; email: string };
  team?: { id: string; name: string };
}

export interface ControlOwnerCreate {
  control_id: string;
  control_name: string;
  domain?: string;
  primary_owner_id: string;
  backup_owner_id?: string;
  team_id?: string;
}

export interface ControlOwnerUpdate {
  control_name?: string;
  domain?: string;
  primary_owner_id?: string;
  backup_owner_id?: string;
  team_id?: string;
}

export interface DomainTeamMapping {
  id: string;
  workspace_id: string;
  domain: string;
  team_id: string;
  priority: number;
  created_at: string;
  updated_at: string;
  // Nested
  team?: { id: string; name: string };
}

export interface DomainTeamMappingCreate {
  domain: string;
  team_id: string;
  priority?: number;
}

export interface AssignmentRule {
  id: string;
  workspace_id: string;
  name: string;
  rule_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentRuleCreate {
  name: string;
  rule_config: Record<string, unknown>;
  is_active?: boolean;
}

export interface ReminderSuggestion {
  id: string;
  workspace_id: string;
  questionnaire_response_id?: string;
  question_id?: string;
  answer_text?: string;
  suggested_title: string;
  suggested_description?: string;
  suggested_frequency: ReminderFrequency;
  suggested_category: ReminderCategory;
  inferred_domain?: string;
  confidence_score: number;
  status: "pending" | "accepted" | "rejected";
  reminder_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ReminderListResponse {
  reminders: Reminder[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReminderInstanceListResponse {
  instances: ReminderInstance[];
  total: number;
  page: number;
  page_size: number;
}

export interface CategoryStats {
  category: string;
  total: number;
  pending: number;
  completed: number;
  overdue: number;
}

export interface ReminderDashboardStats {
  total_reminders: number;
  active_reminders: number;
  paused_reminders: number;
  archived_reminders: number;
  total_pending_instances: number;
  total_overdue_instances: number;
  completed_this_week: number;
  completed_this_month: number;
  by_category: CategoryStats[];
  critical_overdue: number;
  high_overdue: number;
}

export interface MyRemindersResponse {
  assigned_to_me: ReminderInstance[];
  my_team_reminders: ReminderInstance[];
  overdue: ReminderInstance[];
  due_today: ReminderInstance[];
  due_this_week: ReminderInstance[];
}

export interface ReminderCalendarEvent {
  id: string;
  title: string;
  date: string;
  due_date: string;
  status: ReminderInstanceStatus;
  priority: ReminderPriority;
  category: ReminderCategory;
  reminder_id: string;
  instance_id: string;
}

// ============================================================================
// Recurring Reminders API
// ============================================================================

export const remindersApi = {
  // Reminder CRUD
  list: async (
    workspaceId: string,
    params?: {
      status?: ReminderStatus;
      category?: ReminderCategory;
      priority?: ReminderPriority;
      search?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<ReminderListResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/reminders`, { params });
    return response.data;
  },

  get: async (workspaceId: string, reminderId: string): Promise<Reminder> => {
    const response = await api.get(`/workspaces/${workspaceId}/reminders/${reminderId}`);
    return response.data;
  },

  create: async (workspaceId: string, data: ReminderCreate): Promise<Reminder> => {
    const response = await api.post(`/workspaces/${workspaceId}/reminders`, data);
    return response.data;
  },

  update: async (workspaceId: string, reminderId: string, data: ReminderUpdate): Promise<Reminder> => {
    const response = await api.patch(`/workspaces/${workspaceId}/reminders/${reminderId}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, reminderId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/reminders/${reminderId}`);
  },

  // Instance Management
  listInstances: async (
    workspaceId: string,
    reminderId: string,
    params?: {
      status?: ReminderInstanceStatus;
      page?: number;
      page_size?: number;
    }
  ): Promise<ReminderInstanceListResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/reminders/${reminderId}/instances`, { params });
    return response.data;
  },

  getInstance: async (workspaceId: string, instanceId: string): Promise<ReminderInstance> => {
    const response = await api.get(`/workspaces/${workspaceId}/reminders/instances/${instanceId}`);
    return response.data;
  },

  acknowledgeInstance: async (
    workspaceId: string,
    instanceId: string,
    notes?: string
  ): Promise<ReminderInstance> => {
    const response = await api.post(`/workspaces/${workspaceId}/reminders/instances/${instanceId}/acknowledge`, {
      notes,
    });
    return response.data;
  },

  completeInstance: async (
    workspaceId: string,
    instanceId: string,
    data: { notes?: string; evidence_url?: string }
  ): Promise<ReminderInstance> => {
    const response = await api.post(`/workspaces/${workspaceId}/reminders/instances/${instanceId}/complete`, data);
    return response.data;
  },

  skipInstance: async (
    workspaceId: string,
    instanceId: string,
    reason: string
  ): Promise<ReminderInstance> => {
    const response = await api.post(`/workspaces/${workspaceId}/reminders/instances/${instanceId}/skip`, {
      reason,
    });
    return response.data;
  },

  reassignInstance: async (
    workspaceId: string,
    instanceId: string,
    data: { owner_id?: string; team_id?: string }
  ): Promise<ReminderInstance> => {
    const response = await api.post(`/workspaces/${workspaceId}/reminders/instances/${instanceId}/reassign`, data);
    return response.data;
  },

  // Dashboard
  getDashboardStats: async (workspaceId: string): Promise<ReminderDashboardStats> => {
    const response = await api.get(`/workspaces/${workspaceId}/reminders/dashboard/stats`);
    return response.data;
  },

  getMyReminders: async (workspaceId: string): Promise<MyRemindersResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/reminders/my-reminders`);
    return response.data;
  },

  getCalendarView: async (
    workspaceId: string,
    startDate: string,
    endDate: string
  ): Promise<ReminderCalendarEvent[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/reminders/calendar`, {
      params: { start_date: startDate, end_date: endDate },
    });
    return response.data.events || [];
  },

  // Control Owners
  listControlOwners: async (
    workspaceId: string,
    domain?: string
  ): Promise<ControlOwner[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/reminders/control-owners`, {
      params: domain ? { domain } : undefined,
    });
    return response.data;
  },

  createControlOwner: async (
    workspaceId: string,
    data: ControlOwnerCreate
  ): Promise<ControlOwner> => {
    const response = await api.post(`/workspaces/${workspaceId}/reminders/control-owners`, data);
    return response.data;
  },

  updateControlOwner: async (
    workspaceId: string,
    controlOwnerId: string,
    data: ControlOwnerUpdate
  ): Promise<ControlOwner> => {
    const response = await api.patch(`/workspaces/${workspaceId}/reminders/control-owners/${controlOwnerId}`, data);
    return response.data;
  },

  deleteControlOwner: async (workspaceId: string, controlOwnerId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/reminders/control-owners/${controlOwnerId}`);
  },

  // Domain Team Mappings
  listDomainMappings: async (workspaceId: string): Promise<DomainTeamMapping[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/reminders/domain-mappings`);
    return response.data;
  },

  createDomainMapping: async (
    workspaceId: string,
    data: DomainTeamMappingCreate
  ): Promise<DomainTeamMapping> => {
    const response = await api.post(`/workspaces/${workspaceId}/reminders/domain-mappings`, data);
    return response.data;
  },

  deleteDomainMapping: async (workspaceId: string, mappingId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/reminders/domain-mappings/${mappingId}`);
  },

  // Assignment Rules
  listAssignmentRules: async (workspaceId: string): Promise<AssignmentRule[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/reminders/assignment-rules`);
    return response.data;
  },

  createAssignmentRule: async (
    workspaceId: string,
    data: AssignmentRuleCreate
  ): Promise<AssignmentRule> => {
    const response = await api.post(`/workspaces/${workspaceId}/reminders/assignment-rules`, data);
    return response.data;
  },

  updateAssignmentRule: async (
    workspaceId: string,
    ruleId: string,
    data: Partial<AssignmentRuleCreate>
  ): Promise<AssignmentRule> => {
    const response = await api.patch(`/workspaces/${workspaceId}/reminders/assignment-rules/${ruleId}`, data);
    return response.data;
  },

  deleteAssignmentRule: async (workspaceId: string, ruleId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/reminders/assignment-rules/${ruleId}`);
  },

  // Suggestions (from questionnaire)
  listSuggestions: async (
    workspaceId: string,
    questionnaireResponseId?: string
  ): Promise<ReminderSuggestion[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/reminders/suggestions`, {
      params: questionnaireResponseId ? { questionnaire_response_id: questionnaireResponseId } : undefined,
    });
    return response.data.suggestions;
  },

  acceptSuggestion: async (
    workspaceId: string,
    suggestionId: string,
    overrides?: Partial<ReminderCreate>
  ): Promise<Reminder> => {
    const response = await api.post(`/workspaces/${workspaceId}/reminders/suggestions/${suggestionId}/accept`, overrides || {});
    return response.data;
  },

  rejectSuggestion: async (workspaceId: string, suggestionId: string): Promise<void> => {
    await api.post(`/workspaces/${workspaceId}/reminders/suggestions/${suggestionId}/reject`);
  },

  // Bulk Operations
  bulkAssign: async (
    workspaceId: string,
    data: { instance_ids: string[]; owner_id?: string; team_id?: string }
  ): Promise<{ updated_count: number }> => {
    const response = await api.post(`/workspaces/${workspaceId}/reminders/bulk/assign`, data);
    return response.data;
  },

  bulkComplete: async (
    workspaceId: string,
    data: { instance_ids: string[]; notes?: string }
  ): Promise<{ updated_count: number }> => {
    const response = await api.post(`/workspaces/${workspaceId}/reminders/bulk/complete`, data);
    return response.data;
  },
};

// ============================================================================
// Questionnaire Import Types
// ============================================================================

export interface QuestionnaireResponse {
  id: string;
  workspace_id: string;
  title: string;
  partner_name?: string;
  assessment_year?: string;
  source_filename: string;
  total_questions: number;
  total_suggestions_generated: number;
  status: "uploaded" | "analyzed" | "reviewed";
  extra_metadata: Record<string, unknown>;
  uploaded_by_id?: string;
  created_at: string;
  updated_at: string;
}

export interface QuestionnaireQuestion {
  id: string;
  questionnaire_response_id: string;
  serial_number?: string;
  domain?: string;
  question_text: string;
  response_text?: string;
  possible_responses?: string;
  explanation?: string;
  is_section_header: boolean;
  response_type: "yes_no" | "frequency" | "text" | "multi_choice";
  source_row?: number;
  created_at: string;
}

export interface QuestionnaireImportResult {
  questionnaire: QuestionnaireResponse;
  questions_count: number;
  domains: string[];
  domain_counts: Record<string, number>;
}

export interface SkipSummary {
  duplicates: number;
  negatives: number;
  blanks: number;
  headers: number;
  other: number;
}

export interface SkippedDuplicate {
  question_text: string;
  domain?: string;
  reason: string;
  duplicate_of_id?: string;
  duplicate_of_type?: string; // "suggestion" | "reminder" | "question"
  duplicate_of_title?: string;
}

export interface QuestionnaireAnalyzeResult {
  questionnaire_id: string;
  suggestions_generated: number;
  skipped_questions: number;
  domains_covered: string[];
  skip_summary?: SkipSummary;
  skipped_duplicates?: SkippedDuplicate[];
}

export interface QuestionnaireListResponse {
  questionnaires: QuestionnaireResponse[];
  total: number;
}

// ============================================================================
// Questionnaire Import API
// ============================================================================

export const questionnairesApi = {
  upload: async (
    workspaceId: string,
    file: File
  ): Promise<QuestionnaireImportResult> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(
      `/workspaces/${workspaceId}/questionnaires/upload`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return response.data;
  },

  analyze: async (
    workspaceId: string,
    questionnaireId: string
  ): Promise<QuestionnaireAnalyzeResult> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/questionnaires/${questionnaireId}/analyze`
    );
    return response.data;
  },

  list: async (workspaceId: string): Promise<QuestionnaireListResponse> => {
    const response = await api.get(`/workspaces/${workspaceId}/questionnaires/`);
    return response.data;
  },

  get: async (
    workspaceId: string,
    questionnaireId: string
  ): Promise<QuestionnaireResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/questionnaires/${questionnaireId}`
    );
    return response.data;
  },

  getQuestions: async (
    workspaceId: string,
    questionnaireId: string
  ): Promise<QuestionnaireQuestion[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/questionnaires/${questionnaireId}/questions`
    );
    return response.data;
  },

  delete: async (
    workspaceId: string,
    questionnaireId: string
  ): Promise<void> => {
    await api.delete(
      `/workspaces/${workspaceId}/questionnaires/${questionnaireId}`
    );
  },
};

// ==========================================
// Compliance Document Center
// ==========================================

export type ComplianceDocumentStatus = "active" | "archived" | "deleted";
export type ComplianceEntityType = "reminder" | "reminder_instance" | "certification" | "training" | "control";
export type ComplianceLinkType = "evidence" | "reference" | "attachment";

export interface ComplianceFolder {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  path: string;
  depth: number;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceFolderTreeNode {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  depth: number;
  sort_order: number;
  children: ComplianceFolderTreeNode[];
  document_count: number;
}

export interface ComplianceDocument {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  name: string;
  description: string | null;
  file_key: string;
  file_size: number;
  mime_type: string;
  status: ComplianceDocumentStatus;
  version: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  tags: string[];
  download_url: string | null;
}

export interface ComplianceDocumentListResponse {
  items: ComplianceDocument[];
  total: number;
  page: number;
  page_size: number;
}

export interface ComplianceDocumentLink {
  id: string;
  document_id: string;
  entity_type: string;
  entity_id: string;
  link_type: string;
  notes: string | null;
  linked_by: string | null;
  created_at: string;
}

export interface ComplianceEntityDocumentsResponse {
  documents: ComplianceDocument[];
  links: ComplianceDocumentLink[];
}

export interface ComplianceUploadUrlResponse {
  presigned_url: string;
  file_key: string;
  expires_in: number;
}

export interface ComplianceDocumentCreate {
  name: string;
  description?: string;
  folder_id?: string;
  file_key: string;
  file_size: number;
  mime_type: string;
  tags?: string[];
}

export interface ComplianceDocumentUpdate {
  name?: string;
  description?: string;
  folder_id?: string;
}

export interface ComplianceFolderCreate {
  name: string;
  description?: string;
  parent_id?: string;
}

export interface ComplianceFolderUpdate {
  name?: string;
  description?: string;
  sort_order?: number;
}

export const complianceDocumentsApi = {
  // Upload URL
  getUploadUrl: async (
    workspaceId: string,
    data: { filename: string; content_type: string; file_size: number }
  ): Promise<ComplianceUploadUrlResponse> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/compliance/documents/upload-url`,
      data
    );
    return response.data;
  },

  // Direct upload (file goes through backend, no presigned URL needed)
  uploadDirect: async (
    workspaceId: string,
    file: File,
    metadata: { name?: string; description?: string; folder_id?: string; tags?: string[] }
  ): Promise<ComplianceDocument> => {
    const formData = new FormData();
    formData.append("file", file);
    if (metadata.name) formData.append("name", metadata.name);
    if (metadata.description) formData.append("description", metadata.description);
    if (metadata.folder_id) formData.append("folder_id", metadata.folder_id);
    if (metadata.tags && metadata.tags.length > 0) formData.append("tags", metadata.tags.join(","));
    const response = await api.post(
      `/workspaces/${workspaceId}/compliance/documents/upload`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return response.data;
  },

  // Document CRUD
  list: async (
    workspaceId: string,
    params?: {
      folder_id?: string;
      status?: ComplianceDocumentStatus;
      mime_type?: string;
      tags?: string;
      search?: string;
      uploaded_by?: string;
      page?: number;
      page_size?: number;
      sort_by?: string;
      sort_order?: string;
    }
  ): Promise<ComplianceDocumentListResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/compliance/documents`,
      { params }
    );
    return response.data;
  },

  get: async (workspaceId: string, documentId: string): Promise<ComplianceDocument> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/compliance/documents/${documentId}`
    );
    return response.data;
  },

  create: async (workspaceId: string, data: ComplianceDocumentCreate): Promise<ComplianceDocument> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/compliance/documents`,
      data
    );
    return response.data;
  },

  update: async (
    workspaceId: string,
    documentId: string,
    data: ComplianceDocumentUpdate
  ): Promise<ComplianceDocument> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/compliance/documents/${documentId}`,
      data
    );
    return response.data;
  },

  move: async (
    workspaceId: string,
    documentId: string,
    folderId: string | null
  ): Promise<ComplianceDocument> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/compliance/documents/${documentId}/move`,
      { folder_id: folderId }
    );
    return response.data;
  },

  archive: async (workspaceId: string, documentId: string): Promise<ComplianceDocument> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/compliance/documents/${documentId}/archive`
    );
    return response.data;
  },

  delete: async (workspaceId: string, documentId: string): Promise<void> => {
    await api.delete(
      `/workspaces/${workspaceId}/compliance/documents/${documentId}`
    );
  },

  // Tags
  addTags: async (
    workspaceId: string,
    documentId: string,
    tags: string[]
  ): Promise<{ tags: string[] }> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/compliance/documents/${documentId}/tags`,
      { tags }
    );
    return response.data;
  },

  removeTag: async (
    workspaceId: string,
    documentId: string,
    tag: string
  ): Promise<void> => {
    await api.delete(
      `/workspaces/${workspaceId}/compliance/documents/${documentId}/tags/${encodeURIComponent(tag)}`
    );
  },

  listWorkspaceTags: async (workspaceId: string): Promise<{ tags: string[] }> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/compliance/documents/tags/all`
    );
    return response.data;
  },

  // Links
  linkDocument: async (
    workspaceId: string,
    documentId: string,
    data: {
      entity_type: ComplianceEntityType;
      entity_id: string;
      link_type?: ComplianceLinkType;
      notes?: string;
    }
  ): Promise<ComplianceDocumentLink> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/compliance/documents/${documentId}/links`,
      data
    );
    return response.data;
  },

  getDocumentLinks: async (
    workspaceId: string,
    documentId: string
  ): Promise<ComplianceDocumentLink[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/compliance/documents/${documentId}/links`
    );
    return response.data;
  },

  unlinkDocument: async (
    workspaceId: string,
    documentId: string,
    linkId: string
  ): Promise<void> => {
    await api.delete(
      `/workspaces/${workspaceId}/compliance/documents/${documentId}/links/${linkId}`
    );
  },

  getEntityDocuments: async (
    workspaceId: string,
    entityType: ComplianceEntityType,
    entityId: string
  ): Promise<ComplianceEntityDocumentsResponse> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/compliance/documents/by-entity/${entityType}/${entityId}`
    );
    return response.data;
  },
};

export const complianceFoldersApi = {
  list: async (workspaceId: string): Promise<ComplianceFolder[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/compliance/folders`
    );
    return response.data;
  },

  get: async (workspaceId: string, folderId: string): Promise<ComplianceFolder> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/compliance/folders/${folderId}`
    );
    return response.data;
  },

  getTree: async (workspaceId: string): Promise<ComplianceFolderTreeNode[]> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/compliance/folders/tree`
    );
    return response.data;
  },

  create: async (workspaceId: string, data: ComplianceFolderCreate): Promise<ComplianceFolder> => {
    const response = await api.post(
      `/workspaces/${workspaceId}/compliance/folders`,
      data
    );
    return response.data;
  },

  update: async (
    workspaceId: string,
    folderId: string,
    data: ComplianceFolderUpdate
  ): Promise<ComplianceFolder> => {
    const response = await api.patch(
      `/workspaces/${workspaceId}/compliance/folders/${folderId}`,
      data
    );
    return response.data;
  },

  delete: async (workspaceId: string, folderId: string): Promise<void> => {
    await api.delete(
      `/workspaces/${workspaceId}/compliance/folders/${folderId}`
    );
  },
};
