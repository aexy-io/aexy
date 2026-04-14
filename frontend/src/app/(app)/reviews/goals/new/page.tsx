"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { redirect, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import {
  Target,
  Plus,
  Trash2,
  Info,
  Calendar,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGoals } from "@/hooks/useReviews";
import { GoalType, GoalPriority } from "@/lib/api";

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
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();
  const router = useRouter();
  const t = useTranslations("reviews.goals.form");
  const tg = useTranslations("reviews.goals");

  const developerId = user?.id;
  const { createGoal } = useGoals(developerId, {
    workspace_id: currentWorkspaceId || undefined,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState<GoalType>("performance");
  const [priority, setPriority] = useState<GoalPriority>("medium");
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

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);

    if (!currentWorkspaceId) {
      setError("No workspace selected. Please select a workspace first.");
      return;
    }

    if (!developerId) {
      setError("Unable to create goal. User not properly authenticated.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Filter out empty key results and format them properly
      const validKeyResults = keyResults
        .filter(kr => kr.description.trim() && kr.target)
        .map(kr => ({
          description: kr.description,
          target: parseFloat(kr.target) || 0,
          unit: kr.unit || "units",
        }));

      await createGoal(currentWorkspaceId, {
        title,
        description: description || undefined,
        specific: specific || undefined,
        measurable: measurable || undefined,
        achievable: achievable || undefined,
        relevant: relevant || undefined,
        time_bound: timeBound || undefined,
        goal_type: goalType,
        priority: priority,
        is_private: isPrivate,
        key_results: validKeyResults.length > 0 ? validKeyResults : undefined,
        tracking_keywords: trackingKeywords
          .split(",")
          .map(k => k.trim())
          .filter(Boolean),
      });

      toast.success(tg("goalCreated"));
      router.push("/reviews/goals");
    } catch (err) {
      console.error("Failed to create goal:", err);
      setError(err instanceof Error ? err.message : "Failed to create goal. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background">
<main className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Reviews", href: "/reviews" },
            { label: "Goals", href: "/reviews/goals" },
            { label: "New Goal" },
          ]}
          className="mb-6"
        />

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("subtitle")}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
          {/* Basic Info */}
          <div className="bg-muted rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Basic Information</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="goal-title" className="block text-sm font-medium text-foreground mb-2">
                  {t("goalTitle")} *
                </label>
                <input
                  id="goal-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("goalTitlePlaceholder")}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="goal-description" className="block text-sm font-medium text-foreground mb-2">
                  {t("descriptionLabel")}
                </label>
                <textarea
                  id="goal-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("descriptionPlaceholder")}
                  rows={3}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {t("goalType")} *
                  </label>
                  <select
                    value={goalType}
                    onChange={(e) => setGoalType(e.target.value as GoalType)}
                    className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:border-primary-500"
                  >
                    {goalTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label} - {type.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {t("priorityLabel")} *
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as GoalPriority)}
                    className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:border-primary-500"
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
                  <label htmlFor="goal-target-date" className="block text-sm font-medium text-foreground mb-2">
                    <Calendar className="h-4 w-4 inline mr-1" />
                    {t("targetDate")} *
                  </label>
                  <input
                    id="goal-target-date"
                    type="date"
                    value={timeBound}
                    onChange={(e) => setTimeBound(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:border-primary-500"
                    required
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      className="w-5 h-5 rounded border-border bg-background text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-foreground">
                      {t("privateGoal")}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* SMART Framework */}
          <div className="bg-muted rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-foreground">{t("smart.title")}</h2>
              <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">
                {t("smart.recommended")}
              </span>
            </div>
            <p className="text-muted-foreground text-sm mb-6">
              {t("smart.subtitle")}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <span className="text-cyan-400 font-bold">S</span>{t("smart.specific").slice(1)}
                </label>
                <textarea
                  value={specific}
                  onChange={(e) => setSpecific(e.target.value)}
                  placeholder={t("smart.specificPlaceholder")}
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <span className="text-cyan-400 font-bold">M</span>{t("smart.measurable").slice(1)}
                </label>
                <textarea
                  value={measurable}
                  onChange={(e) => setMeasurable(e.target.value)}
                  placeholder={t("smart.measurablePlaceholder")}
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <span className="text-cyan-400 font-bold">A</span>{t("smart.achievable").slice(1)}
                </label>
                <textarea
                  value={achievable}
                  onChange={(e) => setAchievable(e.target.value)}
                  placeholder={t("smart.achievablePlaceholder")}
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <span className="text-cyan-400 font-bold">R</span>{t("smart.relevant").slice(1)}
                </label>
                <textarea
                  value={relevant}
                  onChange={(e) => setRelevant(e.target.value)}
                  placeholder={t("smart.relevantPlaceholder")}
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Key Results */}
          <div className="bg-muted rounded-xl border border-border p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t("keyResults.title")}</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {t("keyResults.subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={addKeyResult}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition"
              >
                <Plus className="h-4 w-4" />
                {t("keyResults.addKeyResult")}
              </button>
            </div>

            <div className="space-y-4">
              {keyResults.map((kr, index) => (
                <div key={kr.id} className="bg-background rounded-lg p-4 border border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                    <span className="text-muted-foreground text-sm">Key Result #{index + 1}</span>
                    {keyResults.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeKeyResult(kr.id)}
                        className="text-muted-foreground hover:text-red-400 transition"
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
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={kr.target}
                        onChange={(e) => updateKeyResult(kr.id, "target", e.target.value)}
                        placeholder="400"
                        className="w-20 bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 text-sm"
                      />
                      <input
                        type="text"
                        value={kr.unit}
                        onChange={(e) => updateKeyResult(kr.id, "unit", e.target.value)}
                        placeholder="ms"
                        className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Auto-Link Settings */}
          <div className="bg-muted rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-foreground">{t("autoLink.title")}</h2>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                {t("autoLink.beta")}
              </span>
            </div>
            <p className="text-muted-foreground text-sm mb-4">
              {t("autoLink.subtitle")}
            </p>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t("autoLink.keywordsLabel")}
              </label>
              <input
                type="text"
                value={trackingKeywords}
                onChange={(e) => setTrackingKeywords(e.target.value)}
                placeholder={t("autoLink.keywordsPlaceholder")}
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
              />
              <p className="text-muted-foreground text-xs mt-2">
                {t("autoLink.keywordsTip")}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <Link
              href="/reviews/goals"
              className="px-6 py-3 text-muted-foreground hover:text-foreground transition"
            >
              Cancel
            </Link>
            <span
              data-testid="create-goal-tooltip"
              title={(!title.trim() || !timeBound) ? t("disabledTooltip") : ""}
            >
              <button
                type="submit"
                disabled={isSubmitting || !title.trim() || !timeBound}
                className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div>
                    {tg("creating")}
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    {tg("createGoal")}
                  </>
                )}
              </button>
            </span>
          </div>
          </div>

          {/* Live Preview */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-8" data-testid="goal-preview">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">{t("preview")}</h3>
              <div className="bg-muted rounded-xl border border-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-cyan-400" />
                    <span className="text-foreground font-medium text-sm">
                      {title.trim() || "Goal title..."}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full capitalize">
                    {goalTypes.find(g => g.value === goalType)?.label || goalType}
                  </span>
                </div>
                {description && (
                  <p className="text-muted-foreground text-xs mb-3 line-clamp-2">{description}</p>
                )}
                <div className="w-full bg-accent rounded-full h-2 mb-3">
                  <div className="bg-cyan-500 h-2 rounded-full" style={{ width: "0%" }} />
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {keyResults.filter(kr => kr.description.trim()).length > 0 && (
                    <span>{keyResults.filter(kr => kr.description.trim()).length} key result{keyResults.filter(kr => kr.description.trim()).length !== 1 ? "s" : ""}</span>
                  )}
                  {timeBound && (
                    <span>Due {new Date(timeBound).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  )}
                  <span className={`capitalize ${
                    priority === "critical" ? "text-red-400" :
                    priority === "high" ? "text-orange-400" :
                    priority === "medium" ? "text-yellow-400" : "text-muted-foreground"
                  }`}>
                    {priority}
                  </span>
                </div>
                {trackingKeywords.trim() && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {trackingKeywords.split(",").filter(k => k.trim()).slice(0, 5).map((kw, i) => (
                      <span key={i} className="px-2 py-0.5 bg-accent text-muted-foreground text-xs rounded">
                        {kw.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
