"use client";

import { useState } from "react";
import { Search, Users, Target, AlertTriangle, Loader2 } from "lucide-react";
import { analysisApi, TaskMatchResult } from "@/lib/api";

export function TaskMatcherCard() {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [isMatching, setIsMatching] = useState(false);
  const [result, setResult] = useState<TaskMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMatch = async () => {
    if (!taskTitle.trim()) {
      setError("Please enter a task title");
      return;
    }

    setIsMatching(true);
    setError(null);
    setResult(null);

    try {
      const data = await analysisApi.matchTask({
        title: taskTitle,
        description: taskDescription,
      });
      setResult(data);
    } catch (err) {
      setError("Failed to find matches. Please try again.");
      console.error("Task matching failed:", err);
    } finally {
      setIsMatching(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "text-green-400";
    if (score >= 0.6) return "text-amber-400";
    return "text-red-400";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 0.8) return "bg-green-500";
    if (score >= 0.6) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center gap-2 mb-6">
        <Target className="h-5 w-5 text-primary-400" />
        <h3 className="text-lg font-semibold text-white">Task Matcher</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="taskTitle"
            className="block text-sm text-slate-300 mb-1"
          >
            Task Title
          </label>
          <input
            id="taskTitle"
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="e.g., Implement OAuth authentication"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label
            htmlFor="taskDescription"
            className="block text-sm text-slate-300 mb-1"
          >
            Description (optional)
          </label>
          <textarea
            id="taskDescription"
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="Add details about requirements, tech stack, complexity..."
            rows={3}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
        </div>

        <button
          onClick={handleMatch}
          disabled={isMatching}
          className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
        >
          {isMatching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding matches...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Find Best Matches
            </>
          )}
        </button>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="mt-6 pt-6 border-t border-slate-700">
          {/* Task Signals */}
          <div className="mb-4">
            <div className="text-xs text-slate-400 mb-2">Detected signals:</div>
            <div className="flex flex-wrap gap-1">
              {result.task_signals.required_skills.map((skill) => (
                <span
                  key={skill}
                  className="bg-primary-900/50 text-primary-300 px-2 py-0.5 rounded text-xs"
                >
                  {skill}
                </span>
              ))}
              {result.task_signals.domain && (
                <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded text-xs">
                  {result.task_signals.domain}
                </span>
              )}
              <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded text-xs capitalize">
                {result.task_signals.complexity} complexity
              </span>
            </div>
          </div>

          {/* Candidates */}
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-300">
              Top Matches ({result.candidates.length})
            </span>
          </div>

          {result.candidates.length === 0 ? (
            <p className="text-slate-400 text-sm">
              No suitable candidates found for this task.
            </p>
          ) : (
            <div className="space-y-3">
              {result.candidates.slice(0, 5).map((candidate) => (
                <div
                  key={candidate.developer_id}
                  className="bg-slate-700/50 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        #{candidate.rank}
                      </span>
                      <span className="text-white font-medium">
                        {candidate.developer_name || "Unknown Developer"}
                      </span>
                    </div>
                    <span
                      className={`text-lg font-bold ${getScoreColor(candidate.match_score.overall_score)}`}
                    >
                      {Math.round(candidate.match_score.overall_score * 100)}%
                    </span>
                  </div>

                  {/* Score breakdown */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div>
                      <div className="text-xs text-slate-400">Skills</div>
                      <div className="h-1.5 bg-slate-600 rounded-full mt-1">
                        <div
                          className={`h-full ${getScoreBgColor(candidate.match_score.skill_match)} rounded-full`}
                          style={{
                            width: `${candidate.match_score.skill_match * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Experience</div>
                      <div className="h-1.5 bg-slate-600 rounded-full mt-1">
                        <div
                          className={`h-full ${getScoreBgColor(candidate.match_score.experience_match)} rounded-full`}
                          style={{
                            width: `${candidate.match_score.experience_match * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Growth</div>
                      <div className="h-1.5 bg-slate-600 rounded-full mt-1">
                        <div
                          className={`h-full ${getScoreBgColor(candidate.match_score.growth_opportunity)} rounded-full`}
                          style={{
                            width: `${candidate.match_score.growth_opportunity * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Strengths & gaps */}
                  {candidate.match_score.strengths.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {candidate.match_score.strengths.slice(0, 3).map((s) => (
                        <span
                          key={s}
                          className="bg-green-900/30 text-green-300 px-1.5 py-0.5 rounded text-xs"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {candidate.match_score.gaps.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {candidate.match_score.gaps.slice(0, 2).map((g) => (
                        <span
                          key={g}
                          className="bg-red-900/30 text-red-300 px-1.5 py-0.5 rounded text-xs"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="mt-4 bg-amber-900/20 border border-amber-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-400 text-sm mb-1">
                <AlertTriangle className="h-4 w-4" />
                <span>Warnings</span>
              </div>
              <ul className="text-xs text-amber-300 space-y-1">
                {result.warnings.map((warning, i) => (
                  <li key={i}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="mt-4 text-xs text-slate-400">
              <span className="font-medium">Recommendations:</span>
              <ul className="mt-1 space-y-1">
                {result.recommendations.slice(0, 2).map((rec, i) => (
                  <li key={i}>• {rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
