"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Target,
  ChevronRight,
  ArrowLeft,
  Plus,
  Trash2,
  Info,
  Calendar,
  CheckCircle,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";

const goalTypes = [
  { value: "performance", label: "Performance", description: "Delivery & quality targets", color: "cyan" },
  { value: "skill_development", label: "Skill Development", description: "Learning new technologies", color: "purple" },
  { value: "project", label: "Project", description: "Feature & milestone goals", color: "emerald" },
  { value: "leadership", label: "Leadership", description: "Mentoring & team impact", color: "amber" },
  { value: "team_contribution", label: "Team Contribution", description: "Collaboration & support", color: "blue" },
];

const priorities = [
  { value: "critical", label: "Critical", color: "red" },
  { value: "high", label: "High", color: "orange" },
  { value: "medium", label: "Medium", color: "yellow" },
  { value: "low", label: "Low", color: "slate" },
];

interface KeyResult {
  id: string;
  description: string;
  target: string;
  unit: string;
}

export default function NewGoalPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState("performance");
  const [priority, setPriority] = useState("medium");
  const [timeBound, setTimeBound] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  // SMART fields
  const [specific, setSpecific] = useState("");
  const [measurable, setMeasurable] = useState("");
  const [achievable, setAchievable] = useState("");
  const [relevant, setRelevant] = useState("");

  // Key results
  const [keyResults, setKeyResults] = useState<KeyResult[]>([
    { id: "1", description: "", target: "", unit: "" }
  ]);

  // Tracking keywords for auto-linking
  const [trackingKeywords, setTrackingKeywords] = useState("");

  const addKeyResult = () => {
    setKeyResults([
      ...keyResults,
      { id: Date.now().toString(), description: "", target: "", unit: "" }
    ]);
  };

  const removeKeyResult = (id: string) => {
    if (keyResults.length > 1) {
      setKeyResults(keyResults.filter(kr => kr.id !== id));
    }
  };

  const updateKeyResult = (id: string, field: keyof KeyResult, value: string) => {
    setKeyResults(keyResults.map(kr =>
      kr.id === id ? { ...kr, [field]: value } : kr
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement API call to create goal
    console.log("Creating goal:", {
      title,
      description,
      goalType,
      priority,
      timeBound,
      isPrivate,
      specific,
      measurable,
      achievable,
      relevant,
      keyResults,
      trackingKeywords: trackingKeywords.split(",").map(k => k.trim()).filter(Boolean),
    });
    router.push("/reviews/goals");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <AppHeader user={user} logout={logout} />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/reviews" className="text-slate-400 hover:text-white transition">
            Reviews
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <Link href="/reviews/goals" className="text-slate-400 hover:text-white transition">
            Goals
          </Link>
          <ChevronRight className="h-4 w-4 text-slate-600" />
          <span className="text-white">New Goal</span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <Link
            href="/reviews/goals"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Goals
          </Link>
          <h1 className="text-3xl font-bold text-white">Create SMART Goal</h1>
          <p className="text-slate-400 mt-1">
            Define specific, measurable objectives with key results
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Basic Information</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Goal Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Improve API response times by 50%"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your goal in detail..."
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Goal Type *
                  </label>
                  <select
                    value={goalType}
                    onChange={(e) => setGoalType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary-500"
                  >
                    {goalTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label} - {type.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Priority *
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary-500"
                  >
                    {priorities.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    <Calendar className="h-4 w-4 inline mr-1" />
                    Target Date *
                  </label>
                  <input
                    type="date"
                    value={timeBound}
                    onChange={(e) => setTimeBound(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-slate-300">
                      Private goal (only visible to you and manager)
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* SMART Framework */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-white">SMART Framework</h2>
              <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">
                Recommended
              </span>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Break down your goal using the SMART framework for better clarity and tracking.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <span className="text-cyan-400 font-bold">S</span>pecific - What exactly do you want to achieve?
                </label>
                <textarea
                  value={specific}
                  onChange={(e) => setSpecific(e.target.value)}
                  placeholder="e.g., Reduce average API response time from 800ms to 400ms for the /users endpoint"
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <span className="text-cyan-400 font-bold">M</span>easurable - How will you measure progress?
                </label>
                <textarea
                  value={measurable}
                  onChange={(e) => setMeasurable(e.target.value)}
                  placeholder="e.g., Track p95 response times in monitoring dashboard, aim for 50% reduction"
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <span className="text-cyan-400 font-bold">A</span>chievable - Is this realistic with available resources?
                </label>
                <textarea
                  value={achievable}
                  onChange={(e) => setAchievable(e.target.value)}
                  placeholder="e.g., Yes, based on profiling we identified N+1 queries that can be optimized"
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <span className="text-cyan-400 font-bold">R</span>elevant - Why does this matter?
                </label>
                <textarea
                  value={relevant}
                  onChange={(e) => setRelevant(e.target.value)}
                  placeholder="e.g., Improves user experience and reduces server costs by 20%"
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Key Results */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Key Results (OKRs)</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Define measurable outcomes that indicate goal completion
                </p>
              </div>
              <button
                type="button"
                onClick={addKeyResult}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition"
              >
                <Plus className="h-4 w-4" />
                Add Key Result
              </button>
            </div>

            <div className="space-y-4">
              {keyResults.map((kr, index) => (
                <div key={kr.id} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-400 text-sm">Key Result #{index + 1}</span>
                    {keyResults.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeKeyResult(kr.id)}
                        className="text-slate-500 hover:text-red-400 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <input
                        type="text"
                        value={kr.description}
                        onChange={(e) => updateKeyResult(kr.id, "description", e.target.value)}
                        placeholder="e.g., Reduce p95 response time"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={kr.target}
                        onChange={(e) => updateKeyResult(kr.id, "target", e.target.value)}
                        placeholder="400"
                        className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 text-sm"
                      />
                      <input
                        type="text"
                        value={kr.unit}
                        onChange={(e) => updateKeyResult(kr.id, "unit", e.target.value)}
                        placeholder="ms"
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Auto-Link Settings */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-white">Auto-Link GitHub Activity</h2>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                Beta
              </span>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Commits and PRs containing these keywords will be automatically linked to this goal.
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Tracking Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={trackingKeywords}
                onChange={(e) => setTrackingKeywords(e.target.value)}
                placeholder="e.g., performance, api-optimization, response-time"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
              />
              <p className="text-slate-500 text-xs mt-2">
                Tip: Use project codes, feature names, or issue numbers for better matching
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <Link
              href="/reviews/goals"
              className="px-6 py-3 text-slate-400 hover:text-white transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium"
            >
              <CheckCircle className="h-4 w-4" />
              Create Goal
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
