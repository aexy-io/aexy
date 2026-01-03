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
  sprint_id: string;
  source_type: TaskSourceType;
  source_id: string;
  source_url: string | null;
  title: string;
  description: string | null;
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
  created_at: string;
  updated_at: string;
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
    story_points?: number;
    priority?: TaskPriority;
    labels?: string[];
    assignee_id?: string;
    status?: TaskStatus;
    epic_id?: string;
    parent_task_id?: string;
  }): Promise<SprintTask> => {
    const response = await api.post(`/sprints/${sprintId}/tasks`, data);
    return response.data;
  },

  updateTask: async (sprintId: string, taskId: string, data: {
    title?: string;
    description?: string;
    story_points?: number;
    priority?: TaskPriority;
    status?: TaskStatus;
    labels?: string[];
    epic_id?: string | null;
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
export type TemplateCategory = "api_docs" | "readme" | "function_docs" | "module_docs" | "guides" | "changelog" | "custom";

export interface DocumentTreeItem {
  id: string;
  title: string;
  icon: string | null;
  parent_id: string | null;
  position: number;
  has_children: boolean;
  children: DocumentTreeItem[];
  created_at: string;
  updated_at: string;
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
  icon?: string;
  cover_image?: string;
}

export interface DocumentUpdate {
  title?: string;
  content?: Record<string, unknown>;
  icon?: string;
  cover_image?: string;
  is_auto_save?: boolean;
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
    options?: { parent_id?: string; include_templates?: boolean }
  ): Promise<DocumentTreeItem[]> => {
    const response = await api.get(`/workspaces/${workspaceId}/documents/tree`, { params: options });
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
  weekly_summary: WeeklySummary;
  activity_pattern: Record<string, unknown> | null;
}

export interface TeamMemberStandupStatus {
  developer_id: string;
  developer_name: string;
  developer_avatar: string | null;
  submitted: boolean;
  submitted_at: string | null;
}

export interface TeamDashboard {
  team_id: string;
  team_name: string | null;
  today_date: string;
  standup_completion: TeamMemberStandupStatus[];
  participation_rate: number;
  active_blockers: Blocker[];
  blockers_by_severity: Record<string, number>;
  sprint_progress: Record<string, unknown> | null;
  total_time_logged_today: number;
  recent_work_logs: WorkLog[];
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
export type TicketFieldType = "text" | "textarea" | "email" | "select" | "multiselect" | "checkbox" | "file" | "date";

export interface FieldOption {
  value: string;
  label: string;
}

export interface ValidationRules {
  min_length?: number;
  max_length?: number;
  pattern?: string;
  allowed_file_types?: string[];
  max_file_size_mb?: number;
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
    fields: TicketFormField[];
    conditional_rules: ConditionalRule[];
  }> => {
    const response = await api.get(`/forms/${publicToken}`);
    return response.data;
  },

  // Submit ticket
  submit: async (
    publicToken: string,
    data: {
      submitter_email?: string;
      submitter_name?: string;
      field_values: Record<string, unknown>;
    }
  ): Promise<{
    ticket_id: string;
    ticket_number: number;
    success_message?: string;
    redirect_url?: string;
    requires_email_verification: boolean;
  }> => {
    const response = await api.post(`/forms/${publicToken}/submit`, data);
    return response.data;
  },

  // Verify email
  verifyEmail: async (
    publicToken: string,
    token: string
  ): Promise<{ verified: boolean; ticket_number: number }> => {
    const response = await api.post(`/forms/${publicToken}/verify-email`, { token });
    return response.data;
  },
};
