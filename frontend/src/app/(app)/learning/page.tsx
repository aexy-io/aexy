"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  GraduationCap,
  Target,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  RefreshCw,
  ChevronRight,
  BookOpen,
  Users,
  Calendar,
} from "lucide-react";
import {
  learningApi,
  careerApi,
  teamApi,
  LearningPath,
  CareerRole,
  LearningMilestone,
  LearningActivity,
  CreateActivityData,
  TeamListItem,
  TeamLearningOverview,
  TeamLearningRecommendations,
} from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLearningActivities, useActivityStats, useDailySummaries } from "@/hooks/useLearningActivities";
import { ActivityList } from "@/components/learning/ActivityList";
import { CourseSearch } from "@/components/learning/CourseSearch";
import { Award, Flame, Timer, Search as SearchIcon, Zap } from "lucide-react";
import { courseApi, ExternalCourse } from "@/lib/api";
import { useGamification, formatPoints } from "@/hooks/useGamification";
import { ProgressRing } from "@/components/learning/ProgressRing";
import { BadgeGrid } from "@/components/learning/BadgeGrid";
import { LearningCalendar, StreakCalendar } from "@/components/learning/LearningCalendar";

export default function LearningPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [roles, setRoles] = useState<CareerRole[]>([]);
  const [selectedPath, setSelectedPath] = useState<LearningPath | null>(null);
  const [milestones, setMilestones] = useState<LearningMilestone[]>([]);
  const [activities, setActivities] = useState<LearningActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [showNewPathForm, setShowNewPathForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"path" | "activities">("path");
  const [activeSessionActivityId, setActiveSessionActivityId] = useState<string | null>(null);

  // Team learning state
  const [viewMode, setViewMode] = useState<"my_learning" | "team">("my_learning");
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamOverview, setTeamOverview] = useState<TeamLearningOverview | null>(null);
  const [teamRecommendations, setTeamRecommendations] = useState<TeamLearningRecommendations | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);

  // Activity tracking hooks
  const {
    activities: trackedActivities,
    isLoading: activitiesLoading,
    createActivity,
    deleteActivity,
  } = useLearningActivities(user?.id || null, {
    learning_path_id: selectedPath?.id,
  });

  void useActivityStats(user?.id || null); // Stats are shown in gamification section
  const { summaries: dailySummaries } = useDailySummaries(user?.id || null, 90);

  // Gamification hooks
  const { profile, streak, levelProgress, allBadges } = useGamification();

  // Helper functions for activity actions
  const handleCreateActivity = async (data: CreateActivityData) => {
    const activityData: CreateActivityData = {
      ...data,
      learning_path_id: selectedPath?.id,
    };
    await createActivity(activityData);
  };

  const handleStartActivity = async (activityId: string) => {
    const { learningActivityApi } = await import("@/lib/api");
    await learningActivityApi.startActivity(activityId, user!.id);
  };

  const handleCompleteActivity = async (activityId: string, data?: { rating?: number; notes?: string }) => {
    const { learningActivityApi } = await import("@/lib/api");
    await learningActivityApi.completeActivity(activityId, user!.id, data);
  };

  const handleStartSession = async (activityId: string) => {
    const { learningActivityApi } = await import("@/lib/api");
    await learningActivityApi.startTimeSession(activityId, user!.id);
    setActiveSessionActivityId(activityId);
  };

  const handleEndSession = async (activityId: string) => {
    const { learningActivityApi } = await import("@/lib/api");
    await learningActivityApi.endTimeSession(activityId, user!.id);
    setActiveSessionActivityId(null);
  };

  const handleImportCourse = async (course: ExternalCourse) => {
    if (!user?.id) return;
    await courseApi.importCourse(
      user.id,
      course,
      selectedPath?.id,
      undefined
    );
    // Refetch activities to show the imported course
    // The useLearningActivities hook will auto-refresh
  };

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [pathsData, rolesData] = await Promise.all([
        learningApi.listPaths(user.id),
        careerApi.listRoles(),
      ]);
      setPaths(pathsData);
      setRoles(rolesData);

      // Select active path if exists
      const activePath = pathsData.find((p) => p.status === "active");
      if (activePath) {
        setSelectedPath(activePath);
        const [ms, acts] = await Promise.all([
          learningApi.getMilestones(activePath.id),
          learningApi.getActivities(activePath.id),
        ]);
        setMilestones(ms);
        setActivities(acts);
      }
    } catch (error) {
      console.error("Failed to fetch learning data:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch teams when workspace changes
  useEffect(() => {
    const fetchTeams = async () => {
      if (!currentWorkspaceId) {
        setTeams([]);
        return;
      }
      try {
        const teamsList = await teamApi.list(currentWorkspaceId);
        setTeams(teamsList);
      } catch (error) {
        console.error("Failed to fetch teams:", error);
        setTeams([]);
      }
    };
    fetchTeams();
  }, [currentWorkspaceId]);

  // Fetch team learning data when team is selected
  const handleSelectTeam = async (teamId: string | null) => {
    setSelectedTeamId(teamId);
    if (!teamId) {
      setTeamOverview(null);
      setTeamRecommendations(null);
      setViewMode("my_learning");
      return;
    }

    setLoadingTeam(true);
    setViewMode("team");
    try {
      const [overview, recommendations] = await Promise.all([
        learningApi.getTeamOverview(teamId),
        learningApi.getTeamRecommendations(teamId),
      ]);
      setTeamOverview(overview);
      setTeamRecommendations(recommendations);
    } catch (error) {
      console.error("Failed to fetch team learning data:", error);
      setTeamOverview(null);
      setTeamRecommendations(null);
    } finally {
      setLoadingTeam(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "bg-red-50 text-red-600 dark:bg-red-900/50 dark:text-red-400 border-red-200 dark:border-red-700";
      case "high":
        return "bg-orange-50 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400 border-orange-200 dark:border-orange-700";
      case "medium":
        return "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400 border-yellow-200 dark:border-yellow-700";
      default:
        return "bg-accent text-foreground border-border";
    }
  };

  const handleSelectPath = async (path: LearningPath) => {
    setSelectedPath(path);
    try {
      const [ms, acts] = await Promise.all([
        learningApi.getMilestones(path.id),
        learningApi.getActivities(path.id),
      ]);
      setMilestones(ms);
      setActivities(acts);
    } catch (error) {
      console.error("Failed to fetch path details:", error);
    }
  };

  const handleGeneratePath = async () => {
    if (!user?.id || !selectedRoleId) return;
    setGenerating(true);
    try {
      const newPath = await learningApi.generatePath(user.id, selectedRoleId, 12, false);
      setPaths([newPath, ...paths]);
      setSelectedPath(newPath);
      setShowNewPathForm(false);
      const [ms, acts] = await Promise.all([
        learningApi.getMilestones(newPath.id),
        learningApi.getActivities(newPath.id),
      ]);
      setMilestones(ms);
      setActivities(acts);
    } catch (error) {
      console.error("Failed to generate path:", error);
    } finally {
      setGenerating(false);
    }
  };

  const handlePausePath = async () => {
    if (!selectedPath) return;
    try {
      await learningApi.pausePath(selectedPath.id);
      setSelectedPath({ ...selectedPath, status: "paused" });
      setPaths(paths.map((p) => (p.id === selectedPath.id ? { ...p, status: "paused" } : p)));
    } catch (error) {
      console.error("Failed to pause path:", error);
    }
  };

  const handleResumePath = async () => {
    if (!selectedPath) return;
    try {
      await learningApi.resumePath(selectedPath.id);
      setSelectedPath({ ...selectedPath, status: "active" });
      setPaths(paths.map((p) => (p.id === selectedPath.id ? { ...p, status: "active" } : p)));
    } catch (error) {
      console.error("Failed to resume path:", error);
    }
  };

  const handleRegeneratePath = async () => {
    if (!selectedPath) return;
    setGenerating(true);
    try {
      const updated = await learningApi.regeneratePath(selectedPath.id);
      setSelectedPath(updated);
      setPaths(paths.map((p) => (p.id === selectedPath.id ? updated : p)));
    } catch (error) {
      console.error("Failed to regenerate path:", error);
    } finally {
      setGenerating(false);
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
          <p className="text-muted-foreground text-sm">Loading learning paths...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const getTrajectoryColor = (status: string) => {
    switch (status) {
      case "ahead":
        return "text-green-400";
      case "on_track":
        return "text-blue-400";
      case "behind":
        return "text-yellow-400";
      case "at_risk":
        return "text-red-400";
      default:
        return "text-muted-foreground";
    }
  };

  const getMilestoneStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-400" />;
      case "in_progress":
        return <Clock className="h-5 w-5 text-blue-400" />;
      case "behind":
        return <AlertCircle className="h-5 w-5 text-red-400" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-border" />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
<main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl">
              <GraduationCap className="h-7 w-7 text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {viewMode === "my_learning" ? "My Learning Path" : `Project Learning`}
              </h1>
              <p className="text-muted-foreground text-sm">
                {viewMode === "my_learning" ? "Track your growth and skill development" : teamOverview?.team_name || "Loading..."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* View Mode Selector */}
            <div className="flex items-center gap-2 bg-background/50 rounded-xl p-1 border border-border">
              <button
                onClick={() => handleSelectTeam(null)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  viewMode === "my_learning"
                    ? "bg-primary-600 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                My Learning
              </button>
              {teams.length > 0 && (
                <select
                  value={selectedTeamId || ""}
                  onChange={(e) => handleSelectTeam(e.target.value || null)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium bg-transparent border-0 focus:outline-none cursor-pointer ${
                    viewMode === "team"
                      ? "bg-primary-600 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <option value="" className="bg-muted text-muted-foreground">Select Project</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id} className="bg-muted text-foreground">
                      {team.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {viewMode === "my_learning" && (
              <button
                onClick={() => setShowNewPathForm(!showNewPathForm)}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition"
              >
                Create New Path
              </button>
            )}
          </div>
        </div>

        {/* Project Learning View */}
        {viewMode === "team" && (
          <>
            {loadingTeam ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
              </div>
            ) : teamOverview ? (
              <div className="space-y-8">
                {/* Team Stats Overview */}
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="bg-muted rounded-xl p-4 border border-border">
                    <div className="text-muted-foreground text-sm mb-1">Total Members</div>
                    <div className="text-2xl font-bold text-foreground">{teamOverview.total_members}</div>
                  </div>
                  <div className="bg-muted rounded-xl p-4 border border-border">
                    <div className="text-muted-foreground text-sm mb-1">With Learning Paths</div>
                    <div className="text-2xl font-bold text-foreground">{teamOverview.members_with_paths}</div>
                  </div>
                  <div className="bg-muted rounded-xl p-4 border border-border">
                    <div className="text-muted-foreground text-sm mb-1">Average Progress</div>
                    <div className="text-2xl font-bold text-foreground">{teamOverview.average_progress}%</div>
                  </div>
                  <div className="bg-muted rounded-xl p-4 border border-border">
                    <div className="text-muted-foreground text-sm mb-1">Learning Rate</div>
                    <div className="text-2xl font-bold text-foreground">
                      {teamOverview.total_members > 0
                        ? Math.round((teamOverview.members_with_paths / teamOverview.total_members) * 100)
                        : 0}%
                    </div>
                  </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-8">
                  {/* Team Members Learning Status */}
                  <div className="bg-muted rounded-xl border border-border overflow-hidden">
                    <div className="p-4 border-b border-border">
                      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary-400" />
                        Team Members Progress
                      </h2>
                    </div>
                    <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                      {teamOverview.members.length === 0 ? (
                        <div className="p-4 text-muted-foreground text-center">No team members found</div>
                      ) : (
                        teamOverview.members.map((member) => (
                          <div key={member.developer_id} className="p-4 hover:bg-accent/50 transition">
                            <div className="flex items-center gap-3 mb-2">
                              {member.developer_avatar_url ? (
                                <Image
                                  src={member.developer_avatar_url}
                                  alt={member.developer_name || "Member"}
                                  width={36}
                                  height={36}
                                  className="rounded-full"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-foreground font-medium truncate">
                                  {member.developer_name || "Unknown"}
                                </div>
                                {member.has_active_path ? (
                                  <div className="text-sm text-muted-foreground truncate">
                                    {member.active_path_target_role || "Learning in progress"}
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground">No active learning path</div>
                                )}
                              </div>
                              {member.has_active_path && (
                                <span
                                  className={`text-xs px-2 py-1 rounded ${
                                    member.trajectory_status === "ahead"
                                      ? "bg-green-50 text-green-600 dark:bg-green-900/50 dark:text-green-400"
                                      : member.trajectory_status === "on_track"
                                      ? "bg-blue-50 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400"
                                      : member.trajectory_status === "behind"
                                      ? "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400"
                                      : "bg-muted text-foreground"
                                  }`}
                                >
                                  {member.trajectory_status?.replace("_", " ") || "N/A"}
                                </span>
                              )}
                            </div>
                            {member.has_active_path && (
                              <>
                                <div className="flex items-center gap-2 text-sm mb-2">
                                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary-500 rounded-full transition-all"
                                      style={{ width: `${member.progress_percentage}%` }}
                                    />
                                  </div>
                                  <span className="text-muted-foreground">{member.progress_percentage}%</span>
                                </div>
                                {member.skills_in_progress.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {member.skills_in_progress.slice(0, 3).map((skill) => (
                                      <span
                                        key={skill}
                                        className="text-xs px-2 py-0.5 bg-accent text-foreground rounded"
                                      >
                                        {skill}
                                      </span>
                                    ))}
                                    {member.skills_in_progress.length > 3 && (
                                      <span className="text-xs text-muted-foreground">
                                        +{member.skills_in_progress.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Skill Recommendations */}
                  <div className="bg-muted rounded-xl border border-border overflow-hidden">
                    <div className="p-4 border-b border-border">
                      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary-400" />
                        Recommended Skills to Develop
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Based on team&apos;s current skill gaps
                      </p>
                    </div>
                    <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                      {!teamRecommendations || teamRecommendations.recommended_skills.length === 0 ? (
                        <div className="p-4 text-muted-foreground text-center">
                          No skill recommendations available
                        </div>
                      ) : (
                        teamRecommendations.recommended_skills.map((rec) => (
                          <div key={rec.skill} className="p-4 hover:bg-accent/50 transition">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-foreground font-medium">{rec.skill}</span>
                              <span
                                className={`text-xs px-2 py-1 rounded border ${getPriorityColor(rec.priority)}`}
                              >
                                {rec.priority}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                              <div className="text-muted-foreground">
                                Coverage: <span className="text-foreground">{rec.coverage_percentage}%</span>
                              </div>
                              <div className="text-muted-foreground">
                                Proficiency: <span className="text-foreground">{rec.average_proficiency}%</span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">{rec.reason}</p>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {rec.members_lacking} member{rec.members_lacking !== 1 ? "s" : ""} could benefit
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-muted rounded-xl p-12 border border-border text-center">
                <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No Project Data</h3>
                <p className="text-muted-foreground">
                  Unable to load project learning data. Please try again.
                </p>
              </div>
            )}
          </>
        )}

        {/* Personal Learning View */}
        {viewMode === "my_learning" && (
          <>
        {/* Gamification Section */}
        {profile && levelProgress && streak && (
          <div className="grid lg:grid-cols-4 gap-6 mb-8">
            {/* Level Progress */}
            <div className="lg:col-span-1">
              <div className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-xl p-4 border border-purple-700/50">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-purple-300 text-xs font-medium">Level {profile.level}</div>
                    <div className="text-foreground text-lg font-bold">{levelProgress.current_level_name}</div>
                  </div>
                  <ProgressRing
                    progress={levelProgress.progress_percentage}
                    size={56}
                    strokeWidth={5}
                    color="purple"
                    showLabel={false}
                    className="bg-purple-100 dark:bg-purple-900/50 rounded-full"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-purple-300">
                    <span>{levelProgress.points_in_level} pts</span>
                    <span>{levelProgress.points_for_next_level} pts to next</span>
                  </div>
                  <div className="h-1.5 bg-purple-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-400 to-pink-400 rounded-full transition-all"
                      style={{ width: `${levelProgress.progress_percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-muted rounded-xl p-3 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span className="text-xs text-muted-foreground">Points</span>
                </div>
                <div className="text-xl font-bold text-foreground">{formatPoints(profile.total_points)}</div>
              </div>
              <div className="bg-muted rounded-xl p-3 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <Flame className="h-4 w-4 text-orange-400" />
                  <span className="text-xs text-muted-foreground">Streak</span>
                </div>
                <div className="text-xl font-bold text-foreground flex items-center gap-2">
                  {streak.current_streak}
                  {streak.streak_at_risk && (
                    <span className="text-xs text-amber-400 font-normal">At Risk!</span>
                  )}
                </div>
              </div>
              <div className="bg-muted rounded-xl p-3 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="h-4 w-4 text-blue-400" />
                  <span className="text-xs text-muted-foreground">Activities</span>
                </div>
                <div className="text-xl font-bold text-foreground">{profile.activities_completed}</div>
              </div>
              <div className="bg-muted rounded-xl p-3 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <Timer className="h-4 w-4 text-purple-400" />
                  <span className="text-xs text-muted-foreground">Time</span>
                </div>
                <div className="text-xl font-bold text-foreground">
                  {Math.floor(profile.total_learning_minutes / 60)}h
                </div>
              </div>
            </div>

            {/* Weekly Streak Calendar */}
            <div className="lg:col-span-1">
              <div className="bg-muted rounded-xl p-4 border border-border h-full">
                <div className="text-sm font-medium text-foreground mb-3">This Week</div>
                {dailySummaries && dailySummaries.length > 0 ? (
                  <StreakCalendar data={dailySummaries} />
                ) : (
                  <div className="flex gap-1">
                    {[...Array(7)].map((_, i) => (
                      <div key={i} className="w-6 h-6 rounded-full bg-accent" />
                    ))}
                  </div>
                )}
                <div className="mt-3 text-xs text-muted-foreground">
                  {streak.is_active_today ? (
                    <span className="text-green-400">Active today!</span>
                  ) : streak.streak_at_risk ? (
                    <span className="text-amber-400">Learn today to keep your streak!</span>
                  ) : (
                    <span>Start learning to build your streak</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Badges Section */}
        {profile && allBadges && profile.earned_badges.length > 0 && (
          <div className="bg-muted rounded-xl p-6 border border-border mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-400" />
                Your Badges
              </h3>
              <span className="text-sm text-muted-foreground">
                {profile.earned_badges.length} / {allBadges.length} earned
              </span>
            </div>
            <BadgeGrid
              allBadges={allBadges}
              earnedBadges={profile.earned_badges}
              showAll={false}
              maxDisplay={10}
            />
          </div>
        )}

        {/* Learning Activity Calendar */}
        {dailySummaries && dailySummaries.length > 0 && (
          <div className="bg-muted rounded-xl p-6 border border-border mb-8">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-400" />
              Learning Activity
            </h3>
            <LearningCalendar data={dailySummaries} weeks={12} />
          </div>
        )}

        {/* New Path Form */}
        {showNewPathForm && (
          <div className="bg-muted rounded-xl p-6 border border-border mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Create Learning Path</h2>
            <div className="flex flex-col md:flex-row gap-4">
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="flex-1 bg-accent text-foreground rounded-lg px-4 py-2 border border-border focus:border-primary-500 focus:outline-none"
              >
                <option value="">Select Target Role</option>
                {roles.map((role) => (
                  <option key={role.id || role.name} value={role.id || role.name}>
                    {role.name} (Level {role.level})
                  </option>
                ))}
              </select>
              <button
                onClick={handleGeneratePath}
                disabled={!selectedRoleId || generating}
                className="bg-primary-600 hover:bg-primary-700 disabled:bg-muted text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Target className="h-4 w-4" />
                    Generate Path
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Paths List */}
          <div className="lg:col-span-1">
            <div className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Your Paths</h2>
              </div>
              <div className="divide-y divide-border">
                {paths.length === 0 ? (
                  <div className="p-4 text-muted-foreground text-center">
                    No learning paths yet. Create one to get started!
                  </div>
                ) : (
                  paths.map((path) => (
                    <button
                      key={path.id}
                      onClick={() => handleSelectPath(path)}
                      className={`w-full p-4 text-left hover:bg-accent transition ${
                        selectedPath?.id === path.id ? "bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-foreground font-medium">
                          {path.target_role_name || "Career Path"}
                        </span>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            path.status === "active"
                              ? "bg-green-50 text-green-600 dark:bg-green-900/50 dark:text-green-400"
                              : path.status === "paused"
                              ? "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {path.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full transition-all"
                            style={{ width: `${path.progress_percentage}%` }}
                          />
                        </div>
                        <span>{path.progress_percentage}%</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Selected Path Details */}
          <div className="lg:col-span-2 space-y-6">
            {selectedPath ? (
              <>
                {/* Path Overview */}
                <div className="bg-muted rounded-xl p-6 border border-border">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">
                        {selectedPath.target_role_name || "Career Development"}
                      </h2>
                      <p className={`text-sm ${getTrajectoryColor(selectedPath.trajectory_status)}`}>
                        {selectedPath.trajectory_status.replace("_", " ").toUpperCase()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {selectedPath.status === "active" ? (
                        <button
                          onClick={handlePausePath}
                          className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
                          title="Pause Path"
                        >
                          <Pause className="h-5 w-5" />
                        </button>
                      ) : selectedPath.status === "paused" ? (
                        <button
                          onClick={handleResumePath}
                          className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
                          title="Resume Path"
                        >
                          <Play className="h-5 w-5" />
                        </button>
                      ) : null}
                      <button
                        onClick={handleRegeneratePath}
                        disabled={generating}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
                        title="Regenerate Path"
                      >
                        <RefreshCw className={`h-5 w-5 ${generating ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-6">
                    <div className="flex justify-between text-sm text-muted-foreground mb-2">
                      <span>Progress</span>
                      <span>{selectedPath.progress_percentage}%</span>
                    </div>
                    <div className="h-3 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all"
                        style={{ width: `${selectedPath.progress_percentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">
                        {Math.round((selectedPath.estimated_success_probability || 0.7) * 100)}%
                      </div>
                      <div className="text-xs text-muted-foreground">Success Probability</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">
                        {Object.keys(selectedPath.skill_gaps).length}
                      </div>
                      <div className="text-xs text-muted-foreground">Skills to Develop</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">
                        {selectedPath.phases?.length || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Phases</div>
                    </div>
                  </div>
                </div>

                {/* Milestones */}
                <div className="bg-muted rounded-xl p-6 border border-border">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary-400" />
                    Milestones
                  </h3>
                  <div className="space-y-4">
                    {milestones.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No milestones defined</p>
                    ) : (
                      milestones.map((milestone) => (
                        <div
                          key={milestone.id}
                          className="flex items-center gap-4 p-4 bg-accent/50 rounded-lg"
                        >
                          {getMilestoneStatusIcon(milestone.status)}
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-foreground font-medium">{milestone.skill_name}</span>
                              <span className="text-sm text-muted-foreground">
                                {milestone.current_score}/{milestone.target_score}
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary-500 rounded-full transition-all"
                                style={{
                                  width: `${(milestone.current_score / milestone.target_score) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Recommended Activities */}
                <div className="bg-muted rounded-xl p-6 border border-border">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary-400" />
                    Recommended Activities
                  </h3>
                  <div className="space-y-3">
                    {activities.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">
                        No activities recommended yet
                      </p>
                    ) : (
                      activities.map((activity, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3 bg-accent/50 rounded-lg"
                        >
                          <div
                            className={`p-2 rounded-lg ${
                              activity.type === "task"
                                ? "bg-blue-100 dark:bg-blue-900/50"
                                : activity.type === "pairing"
                                ? "bg-purple-100 dark:bg-purple-900/50"
                                : activity.type === "course"
                                ? "bg-green-100 dark:bg-green-900/50"
                                : "bg-muted"
                            }`}
                          >
                            {activity.type === "task" ? (
                              <Target className="h-4 w-4 text-blue-400" />
                            ) : activity.type === "pairing" ? (
                              <Users className="h-4 w-4 text-purple-400" />
                            ) : activity.type === "course" ? (
                              <BookOpen className="h-4 w-4 text-green-400" />
                            ) : (
                              <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-foreground">{activity.description}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span className="capitalize">{activity.source}</span>
                              {activity.estimated_hours && (
                                <span>{activity.estimated_hours} hours</span>
                              )}
                            </div>
                          </div>
                          {activity.url && (
                            <a
                              href={activity.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary-400 hover:text-primary-300"
                            >
                              <ChevronRight className="h-5 w-5" />
                            </a>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Risk Factors */}
                {selectedPath.risk_factors && selectedPath.risk_factors.length > 0 && (
                  <div className="bg-muted rounded-xl p-6 border border-border">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-yellow-400" />
                      Risk Factors
                    </h3>
                    <ul className="space-y-2">
                      {selectedPath.risk_factors.map((risk, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-foreground">
                          <span className="text-yellow-400 mt-1">-</span>
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Course Search Section */}
                <div className="bg-muted rounded-xl p-6 border border-border">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <SearchIcon className="h-5 w-5 text-primary-400" />
                    Find Courses
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Search for tutorials and courses from YouTube and other platforms to add to your learning activities.
                  </p>
                  <CourseSearch
                    onImportCourse={handleImportCourse}
                    suggestedSkills={Object.keys(selectedPath?.skill_gaps || {})}
                    learningPathId={selectedPath?.id}
                  />
                </div>

                {/* Activity Tracking Section */}
                <div className="bg-muted rounded-xl p-6 border border-border">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary-400" />
                    Track Your Progress
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Log your learning activities to track progress, earn points, and stay motivated!
                  </p>
                  <ActivityList
                    activities={trackedActivities}
                    isLoading={activitiesLoading}
                    onCreateActivity={handleCreateActivity}
                    onStartActivity={handleStartActivity}
                    onCompleteActivity={handleCompleteActivity}
                    onDeleteActivity={deleteActivity}
                    onStartSession={handleStartSession}
                    onEndSession={handleEndSession}
                    activeSessionId={activeSessionActivityId || undefined}
                    emptyMessage="No activities tracked yet. Add your first learning activity!"
                  />
                </div>
              </>
            ) : (
              <div className="bg-muted rounded-xl p-12 border border-border text-center">
                <GraduationCap className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No Path Selected</h3>
                <p className="text-muted-foreground">
                  Select a learning path from the list or create a new one to get started.
                </p>
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
