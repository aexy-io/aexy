"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import {
  GitBranch,
  LogOut,
  Plus,
  Trash2,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Users,
  BarChart3,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";

interface Task {
  id: string;
  title: string;
  description?: string;
  signals?: {
    required_skills: string[];
    complexity: string;
    domain?: string;
  };
}

interface Developer {
  id: string;
  name: string | null;
  avatar_url?: string | null;
  skill_fingerprint?: {
    languages: { name: string; proficiency_score: number }[];
    frameworks: { name: string; proficiency_score: number }[];
  };
}

interface Assignment {
  task_id: string;
  developer_id: string;
  match_score?: number;
  skill_match?: number;
  growth_opportunity?: number;
}

interface WhatIfResult {
  scenario_id: string;
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
    warnings: string[];
  };
  recommendations: string[];
}

export default function SprintPlanningPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");

  // Fetch developers on mount
  useEffect(() => {
    const fetchDevelopers = async () => {
      try {
        const response = await api.get("/developers/");
        setDevelopers(response.data || []);
      } catch (error) {
        console.error("Failed to fetch developers:", error);
      }
    };
    fetchDevelopers();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const addTask = () => {
    if (!newTaskTitle.trim()) return;

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: newTaskTitle,
      description: newTaskDescription || undefined,
    };

    setTasks([...tasks, newTask]);
    setNewTaskTitle("");
    setNewTaskDescription("");
  };

  const removeTask = (taskId: string) => {
    setTasks(tasks.filter((t) => t.id !== taskId));
    setAssignments(assignments.filter((a) => a.task_id !== taskId));
  };

  const handleDragStart = (taskId: string) => {
    setDraggedTask(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (developerId: string) => {
    if (!draggedTask) return;

    // Remove existing assignment for this task
    const filtered = assignments.filter((a) => a.task_id !== draggedTask);

    // Add new assignment
    setAssignments([
      ...filtered,
      { task_id: draggedTask, developer_id: developerId },
    ]);
    setDraggedTask(null);
  };

  const unassignTask = (taskId: string) => {
    setAssignments(assignments.filter((a) => a.task_id !== taskId));
  };

  const getAssignedDeveloper = (taskId: string) => {
    const assignment = assignments.find((a) => a.task_id === taskId);
    if (!assignment) return null;
    return developers.find((d) => d.id === assignment.developer_id);
  };

  const getAssignedTasks = (developerId: string) => {
    return assignments
      .filter((a) => a.developer_id === developerId)
      .map((a) => tasks.find((t) => t.id === a.task_id))
      .filter(Boolean) as Task[];
  };

  const analyzeScenario = async () => {
    if (assignments.length === 0) return;

    setIsAnalyzing(true);
    try {
      const response = await api.post("/analysis/whatif/scenario", {
        scenario_name: "Current Sprint Plan",
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          signals: t.signals || {
            required_skills: [],
            complexity: "medium",
          },
        })),
        proposed_assignments: assignments.map((a) => ({
          task_id: a.task_id,
          developer_id: a.developer_id,
        })),
      });
      setWhatIfResult(response.data);
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const optimizeAssignments = async () => {
    if (tasks.length === 0) return;

    setIsOptimizing(true);
    try {
      const response = await api.post("/analysis/whatif/optimize", {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          signals: t.signals || {
            required_skills: [],
            complexity: "medium",
          },
        })),
        max_per_developer: 5,
      });

      // Update assignments with optimized ones
      const optimized = response.data.assignments.map(
        (a: { task_id: string; developer_id: string }) => ({
          task_id: a.task_id,
          developer_id: a.developer_id,
        })
      );
      setAssignments(optimized);
      setWhatIfResult(response.data);
    } catch (error) {
      console.error("Optimization failed:", error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const getWorkloadColor = (status: string) => {
    switch (status) {
      case "overloaded":
        return "text-red-400 bg-red-900/30";
      case "underloaded":
        return "text-amber-400 bg-amber-900/30";
      default:
        return "text-green-400 bg-green-900/30";
    }
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 0.7) return "text-green-400";
    if (score >= 0.5) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <GitBranch className="h-8 w-8 text-primary-500" />
              <span className="text-2xl font-bold text-white">Gitraki</span>
            </Link>
            <span className="text-slate-500">|</span>
            <span className="text-white font-medium">Sprint Planning</span>
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
            <button
              onClick={logout}
              className="text-slate-400 hover:text-white transition"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Tasks Column */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Add Task
              </h2>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Task title"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <textarea
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
                <button
                  onClick={addTask}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Task
                </button>
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-lg font-semibold text-white mb-4">
                Tasks ({tasks.length})
              </h2>
              {tasks.length === 0 ? (
                <p className="text-slate-400 text-sm">
                  Add tasks to start planning your sprint.
                </p>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => {
                    const assignedDev = getAssignedDeveloper(task.id);
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task.id)}
                        className={`p-3 rounded-lg border cursor-move transition ${
                          assignedDev
                            ? "bg-primary-900/20 border-primary-700"
                            : "bg-slate-700/50 border-slate-600 hover:border-slate-500"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white font-medium truncate">
                              {task.title}
                            </h4>
                            {task.description && (
                              <p className="text-slate-400 text-xs mt-1 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            {assignedDev && (
                              <div className="flex items-center gap-2 mt-2">
                                <ArrowRight className="h-3 w-3 text-slate-500" />
                                <span className="text-primary-400 text-xs">
                                  {assignedDev.name || "Unknown"}
                                </span>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => removeTask(task.id)}
                            className="text-slate-500 hover:text-red-400 transition ml-2"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Developers Column */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  <Users className="inline h-5 w-5 mr-2 text-slate-400" />
                  Team ({developers.length})
                </h2>
              </div>

              {developers.length === 0 ? (
                <p className="text-slate-400 text-sm">
                  No developers found. Connect developers to start assigning
                  tasks.
                </p>
              ) : (
                <div className="space-y-4">
                  {developers.map((dev) => {
                    const assignedTasks = getAssignedTasks(dev.id);
                    const workload = whatIfResult?.workload_impacts.find(
                      (w) => w.developer_id === dev.id
                    );

                    return (
                      <div
                        key={dev.id}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(dev.id)}
                        className="p-4 bg-slate-700/30 rounded-lg border-2 border-dashed border-slate-600 hover:border-primary-500 transition"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          {dev.avatar_url ? (
                            <Image
                              src={dev.avatar_url}
                              alt={dev.name || "Developer"}
                              width={32}
                              height={32}
                              className="rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                              <span className="text-slate-300 text-sm">
                                {(dev.name || "?")[0].toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white font-medium truncate">
                              {dev.name || "Unknown Developer"}
                            </h4>
                            {workload && (
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${getWorkloadColor(workload.workload_status)}`}
                              >
                                {workload.total_tasks} tasks
                              </span>
                            )}
                          </div>
                        </div>

                        {assignedTasks.length > 0 ? (
                          <div className="space-y-2">
                            {assignedTasks.map((task) => {
                              const assignment = whatIfResult?.assignments.find(
                                (a) => a.task_id === task.id
                              );
                              return (
                                <div
                                  key={task.id}
                                  className="flex items-center justify-between bg-slate-800 rounded p-2"
                                >
                                  <span className="text-slate-300 text-sm truncate flex-1">
                                    {task.title}
                                  </span>
                                  <div className="flex items-center gap-2 ml-2">
                                    {assignment && (
                                      <span
                                        className={`text-xs font-medium ${getMatchScoreColor(assignment.match_score)}`}
                                      >
                                        {Math.round(assignment.match_score * 100)}%
                                      </span>
                                    )}
                                    <button
                                      onClick={() => unassignTask(task.id)}
                                      className="text-slate-500 hover:text-red-400"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-slate-500 text-xs text-center py-2">
                            Drop tasks here
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Analysis Column */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                <BarChart3 className="inline h-5 w-5 mr-2 text-slate-400" />
                Actions
              </h2>
              <div className="space-y-3">
                <button
                  onClick={analyzeScenario}
                  disabled={isAnalyzing || assignments.length === 0}
                  className="w-full bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-4 w-4" />
                      Analyze Plan
                    </>
                  )}
                </button>
                <button
                  onClick={optimizeAssignments}
                  disabled={isOptimizing || tasks.length === 0}
                  className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {isOptimizing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Optimizing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Auto-Optimize
                    </>
                  )}
                </button>
              </div>
            </div>

            {whatIfResult && (
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Analysis Results
                </h2>

                {/* Summary */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-white">
                      {whatIfResult.team_impact.assigned_tasks}/
                      {whatIfResult.team_impact.total_tasks}
                    </div>
                    <div className="text-xs text-slate-400">Tasks Assigned</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div
                      className={`text-2xl font-bold ${getMatchScoreColor(whatIfResult.team_impact.average_match_score)}`}
                    >
                      {Math.round(
                        whatIfResult.team_impact.average_match_score * 100
                      )}
                      %
                    </div>
                    <div className="text-xs text-slate-400">Avg Match</div>
                  </div>
                </div>

                {/* Warnings */}
                {whatIfResult.team_impact.warnings.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 text-amber-400 text-sm mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Warnings</span>
                    </div>
                    <ul className="text-xs text-amber-300 space-y-1">
                      {whatIfResult.team_impact.warnings.map((w, i) => (
                        <li key={i}>• {w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {whatIfResult.recommendations.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-green-400 text-sm mb-2">
                      <CheckCircle className="h-4 w-4" />
                      <span>Recommendations</span>
                    </div>
                    <ul className="text-xs text-slate-300 space-y-1">
                      {whatIfResult.recommendations.map((r, i) => (
                        <li key={i}>• {r}</li>
                      ))}
                    </ul>
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
