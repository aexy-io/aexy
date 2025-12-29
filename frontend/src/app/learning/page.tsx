"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  GitBranch,
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
  LogOut,
} from "lucide-react";
import {
  learningApi,
  careerApi,
  LearningPath,
  CareerRole,
  LearningMilestone,
  LearningActivity,
} from "@/lib/api";

export default function LearningPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [roles, setRoles] = useState<CareerRole[]>([]);
  const [selectedPath, setSelectedPath] = useState<LearningPath | null>(null);
  const [milestones, setMilestones] = useState<LearningMilestone[]>([]);
  const [activities, setActivities] = useState<LearningActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [showNewPathForm, setShowNewPathForm] = useState(false);

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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
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
        return "text-slate-400";
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
        return <div className="h-5 w-5 rounded-full border-2 border-slate-600" />;
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
                className="px-3 py-2 text-white bg-slate-700 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <GraduationCap className="h-4 w-4" />
                Learning
              </Link>
              <Link
                href="/hiring"
                className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
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
            <GraduationCap className="h-8 w-8 text-primary-500" />
            My Learning Path
          </h1>
          <button
            onClick={() => setShowNewPathForm(!showNewPathForm)}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition"
          >
            Create New Path
          </button>
        </div>

        {/* New Path Form */}
        {showNewPathForm && (
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Create Learning Path</h2>
            <div className="flex flex-col md:flex-row gap-4">
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="flex-1 bg-slate-700 text-white rounded-lg px-4 py-2 border border-slate-600 focus:border-primary-500 focus:outline-none"
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
                className="bg-primary-600 hover:bg-primary-700 disabled:bg-slate-600 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2"
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
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white">Your Paths</h2>
              </div>
              <div className="divide-y divide-slate-700">
                {paths.length === 0 ? (
                  <div className="p-4 text-slate-400 text-center">
                    No learning paths yet. Create one to get started!
                  </div>
                ) : (
                  paths.map((path) => (
                    <button
                      key={path.id}
                      onClick={() => handleSelectPath(path)}
                      className={`w-full p-4 text-left hover:bg-slate-700 transition ${
                        selectedPath?.id === path.id ? "bg-slate-700" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-medium">
                          {path.target_role_name || "Career Path"}
                        </span>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            path.status === "active"
                              ? "bg-green-900/50 text-green-400"
                              : path.status === "paused"
                              ? "bg-yellow-900/50 text-yellow-400"
                              : "bg-slate-600 text-slate-300"
                          }`}
                        >
                          {path.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <div className="flex-1 h-2 bg-slate-600 rounded-full overflow-hidden">
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
                <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-semibold text-white">
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
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                          title="Pause Path"
                        >
                          <Pause className="h-5 w-5" />
                        </button>
                      ) : selectedPath.status === "paused" ? (
                        <button
                          onClick={handleResumePath}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                          title="Resume Path"
                        >
                          <Play className="h-5 w-5" />
                        </button>
                      ) : null}
                      <button
                        onClick={handleRegeneratePath}
                        disabled={generating}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                        title="Regenerate Path"
                      >
                        <RefreshCw className={`h-5 w-5 ${generating ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-6">
                    <div className="flex justify-between text-sm text-slate-400 mb-2">
                      <span>Progress</span>
                      <span>{selectedPath.progress_percentage}%</span>
                    </div>
                    <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all"
                        style={{ width: `${selectedPath.progress_percentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">
                        {Math.round((selectedPath.estimated_success_probability || 0.7) * 100)}%
                      </div>
                      <div className="text-xs text-slate-400">Success Probability</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">
                        {Object.keys(selectedPath.skill_gaps).length}
                      </div>
                      <div className="text-xs text-slate-400">Skills to Develop</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">
                        {selectedPath.phases?.length || 0}
                      </div>
                      <div className="text-xs text-slate-400">Phases</div>
                    </div>
                  </div>
                </div>

                {/* Milestones */}
                <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary-400" />
                    Milestones
                  </h3>
                  <div className="space-y-4">
                    {milestones.length === 0 ? (
                      <p className="text-slate-400 text-center py-4">No milestones defined</p>
                    ) : (
                      milestones.map((milestone) => (
                        <div
                          key={milestone.id}
                          className="flex items-center gap-4 p-4 bg-slate-700/50 rounded-lg"
                        >
                          {getMilestoneStatusIcon(milestone.status)}
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-white font-medium">{milestone.skill_name}</span>
                              <span className="text-sm text-slate-400">
                                {milestone.current_score}/{milestone.target_score}
                              </span>
                            </div>
                            <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary-500 rounded-full transition-all"
                                style={{
                                  width: `${(milestone.current_score / milestone.target_score) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-slate-500" />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Recommended Activities */}
                <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary-400" />
                    Recommended Activities
                  </h3>
                  <div className="space-y-3">
                    {activities.length === 0 ? (
                      <p className="text-slate-400 text-center py-4">
                        No activities recommended yet
                      </p>
                    ) : (
                      activities.map((activity, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3 bg-slate-700/50 rounded-lg"
                        >
                          <div
                            className={`p-2 rounded-lg ${
                              activity.type === "task"
                                ? "bg-blue-900/50"
                                : activity.type === "pairing"
                                ? "bg-purple-900/50"
                                : activity.type === "course"
                                ? "bg-green-900/50"
                                : "bg-slate-600"
                            }`}
                          >
                            {activity.type === "task" ? (
                              <Target className="h-4 w-4 text-blue-400" />
                            ) : activity.type === "pairing" ? (
                              <Users className="h-4 w-4 text-purple-400" />
                            ) : activity.type === "course" ? (
                              <BookOpen className="h-4 w-4 text-green-400" />
                            ) : (
                              <TrendingUp className="h-4 w-4 text-slate-400" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-white">{activity.description}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
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
                  <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-yellow-400" />
                      Risk Factors
                    </h3>
                    <ul className="space-y-2">
                      {selectedPath.risk_factors.map((risk, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-slate-300">
                          <span className="text-yellow-400 mt-1">-</span>
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center">
                <GraduationCap className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No Path Selected</h3>
                <p className="text-slate-400">
                  Select a learning path from the list or create a new one to get started.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
