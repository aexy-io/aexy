import { api } from "./api";

// Types

export interface MemberActivityDay {
  date: string;
  commits: number;
  prs: number;
}

export interface MemberRepoStat {
  repository: string;
  commits: number;
  prs: number;
  additions: number;
  deletions: number;
}

export interface MemberGitHubStats {
  developer_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  commits: number;
  prs_created: number;
  prs_merged: number;
  reviews_given: number;
  additions: number;
  deletions: number;
  top_repositories: MemberRepoStat[];
  last_commit_at: string | null;
  activity_trend: MemberActivityDay[];
}

export interface TeamActivityDay {
  date: string;
  commits: number;
  prs_opened: number;
  prs_merged: number;
  reviews: number;
}

export interface TopRepoStat {
  repository: string;
  commits: number;
  prs: number;
  contributors: number;
}

export interface GitHubAnalyticsSummary {
  total_commits: number;
  total_prs: number;
  total_prs_merged: number;
  total_reviews: number;
  total_additions: number;
  total_deletions: number;
  active_contributors: number;
  top_repositories: TopRepoStat[];
}

export interface WorkspaceGitHubAnalytics {
  summary: GitHubAnalyticsSummary;
  members: MemberGitHubStats[];
  activity_timeline: TeamActivityDay[];
  period_days: number;
  generated_at: string;
}

// API

export const workStatsApi = {
  getGitHubAnalytics: async (
    workspaceId: string,
    days: number = 30
  ): Promise<WorkspaceGitHubAnalytics> => {
    const response = await api.get(
      `/workspaces/${workspaceId}/github-analytics`,
      { params: { days } }
    );
    return response.data;
  },
};
