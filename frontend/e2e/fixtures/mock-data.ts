/**
 * Mock data fixtures for dashboard E2E tests
 */

export const mockUser = {
  id: "test-user-123",
  name: "Test Developer",
  email: "test@example.com",
  avatar_url: "",
  github_connection: {
    github_username: "testdev",
    github_id: 12345,
  },
  onboarding_completed: true,
  skill_fingerprint: {
    languages: [
      { name: "TypeScript", proficiency_score: 92, commits_count: 450, trend: "growing" },
      { name: "Python", proficiency_score: 78, commits_count: 280, trend: "stable" },
      { name: "Go", proficiency_score: 45, commits_count: 80, trend: "growing" },
      { name: "Rust", proficiency_score: 30, commits_count: 40, trend: "growing" },
    ],
    frameworks: [
      { name: "React", proficiency_score: 90, category: "frontend", usage_count: 300 },
      { name: "Next.js", proficiency_score: 85, category: "frontend", usage_count: 200 },
      { name: "FastAPI", proficiency_score: 70, category: "backend", usage_count: 100 },
    ],
    domains: [
      { name: "web_development", confidence_score: 95 },
      { name: "api_design", confidence_score: 80 },
      { name: "devops", confidence_score: 45 },
    ],
  },
  work_patterns: {
    preferred_complexity: "high",
    peak_productivity_hours: [10, 11, 14],
    average_review_turnaround_hours: 4.5,
    average_pr_size: 120,
    collaboration_style: "collaborative",
  },
  growth_trajectory: null,
};

export const mockPreferences = {
  id: "pref-123",
  user_id: "test-user-123",
  preset_type: "developer",
  visible_widgets: [
    "welcome", "quickStats", "languageProficiency", "workPatterns",
    "domainExpertise", "frameworksTools", "aiInsights", "softSkills",
    "aiAgents",
  ],
  widget_order: [
    "welcome", "quickStats", "languageProficiency", "workPatterns",
    "domainExpertise", "frameworksTools", "aiInsights", "softSkills",
    "aiAgents",
  ],
  widget_sizes: {},
};

export const mockPreferencesReordered = {
  ...mockPreferences,
  widget_order: [
    "welcome", "quickStats", "workPatterns", "languageProficiency",
    "domainExpertise", "frameworksTools", "aiInsights", "softSkills",
    "aiAgents",
  ],
  preset_type: "custom",
};

export const mockPreferencesManagerPreset = {
  ...mockPreferences,
  preset_type: "manager",
  visible_widgets: [
    "welcome", "quickStats", "teamOverview", "sprintOverview",
    "trackingSummary", "taskMatcher", "aiInsights",
    "aiAgents", "performanceReviews", "myGoals", "upcomingDeadlines", "recentDocs",
  ],
  widget_order: [
    "welcome", "quickStats", "teamOverview", "sprintOverview",
    "trackingSummary", "taskMatcher", "aiInsights",
    "aiAgents", "performanceReviews", "myGoals", "upcomingDeadlines", "recentDocs",
  ],
};

export const mockInsights = {
  developer_id: "test-user-123",
  skill_summary: "Strong full-stack developer with excellent TypeScript skills and consistent PR reviews.",
  strengths: ["Strong TypeScript skills", "Consistent PR reviews"],
  growth_areas: ["Could improve test coverage"],
  recommended_tasks: ["Try contributing to open source"],
  soft_skills: {
    communication: 80,
    collaboration: 85,
    leadership: 60,
    problem_solving: 90,
  },
};

export const mockSoftSkills = {
  communication: 80,
  collaboration: 85,
  leadership: 60,
  problem_solving: 90,
};
