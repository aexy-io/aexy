"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { reportsApi, CustomReport, WidgetConfig } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

const WIDGET_TYPES = ["line_chart", "bar_chart", "heatmap", "kpi", "table", "network"];
const METRICS = [
  "commits",
  "prs_merged",
  "reviews",
  "velocity",
  "skill_coverage",
  "activity",
  "workload",
  "collaboration",
];

export default function ReportEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const reportId = params.id as string;

  const [report, setReport] = useState<CustomReport | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await reportsApi.getReport(reportId);
      setReport(r);
      setName(r.name);
      setDescription(r.description || "");
      setIsPublic(r.is_public);
      setWidgets(r.widgets || []);
    } catch (e) {
      console.error("Failed to load report:", e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const updateWidget = (idx: number, patch: Partial<WidgetConfig>) => {
    setWidgets((prev) => prev.map((w, i) => (i === idx ? { ...w, ...patch } : w)));
  };

  const addWidget = () => {
    setWidgets((prev) => [
      ...prev,
      {
        id: `w${Date.now()}`,
        type: "line_chart",
        metric: "commits",
        title: "New Widget",
        config: {},
        // Match the backend template convention ({width,height}).
        position: { x: 0, y: 0, width: 6, height: 4 },
      },
    ]);
  };

  const removeWidget = (idx: number) => {
    setWidgets((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Report name is required.");
      return;
    }
    setSaving(true);
    try {
      const updated = await reportsApi.updateReport(reportId, {
        name: name.trim(),
        description,
        is_public: isPublic,
        widgets,
      });
      setReport(updated);
      toast.success("Report saved");
    } catch (e) {
      console.error("Failed to save report:", e);
      toast.error("Failed to save report.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Link href="/reports" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Reports
        </Link>
        <p className="text-muted-foreground">Report not found or you don&apos;t have access.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link href="/reports" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Reports
        </Link>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>

      {/* Metadata */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6 space-y-4">
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Public (visible to your organization)
        </label>
      </div>

      {/* Widgets */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-foreground">Widgets</h2>
        <button
          onClick={addWidget}
          className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-muted text-foreground text-sm rounded-lg transition"
        >
          <Plus className="h-4 w-4" /> Add Widget
        </button>
      </div>

      <div className="space-y-3">
        {widgets.length === 0 && (
          <p className="text-muted-foreground text-sm">No widgets. Add one to get started.</p>
        )}
        {widgets.map((widget, idx) => (
          <div key={widget.id || idx} className="bg-card border border-border rounded-xl p-4">
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Title</label>
                <input
                  value={widget.title}
                  onChange={(e) => updateWidget(idx, { title: e.target.value })}
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Type</label>
                <select
                  value={widget.type}
                  onChange={(e) => updateWidget(idx, { type: e.target.value })}
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                >
                  {WIDGET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-muted-foreground mb-1">Metric</label>
                  <select
                    value={widget.metric}
                    onChange={(e) => updateWidget(idx, { metric: e.target.value })}
                    className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                  >
                    {METRICS.map((m) => (
                      <option key={m} value={m}>
                        {m.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => removeWidget(idx)}
                  className="p-2 bg-accent hover:bg-muted text-muted-foreground hover:text-red-400 rounded-lg transition"
                  title="Remove widget"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
