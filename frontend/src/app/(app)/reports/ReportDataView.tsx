"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { reportsApi, CustomReport } from "@/lib/api";

interface WidgetResult {
  title: string;
  type: string;
  data?: unknown;
  error?: string;
}

/** Find the first array-of-objects in a widget payload, plus its numeric keys. */
function extractSeries(data: unknown): { rows: Record<string, unknown>[]; labelKey: string; valueKeys: string[] } | null {
  if (!data || typeof data !== "object") return null;

  const findArray = (obj: unknown, depth = 0): Record<string, unknown>[] | null => {
    if (depth > 3 || !obj || typeof obj !== "object") return null;
    if (Array.isArray(obj)) {
      if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
        return obj as Record<string, unknown>[];
      }
      return null;
    }
    for (const v of Object.values(obj as Record<string, unknown>)) {
      const found = findArray(v, depth + 1);
      if (found) return found;
    }
    return null;
  };

  const rows = findArray(data);
  if (!rows || rows.length === 0) return null;

  const keys = Object.keys(rows[0]);
  const numericKeys = keys.filter((k) => typeof rows[0][k] === "number");
  const labelKey =
    keys.find((k) => /date|day|week|month|label|name|period/i.test(k)) ||
    keys.find((k) => typeof rows[0][k] === "string") ||
    keys[0];

  if (numericKeys.length === 0) return null;
  return { rows, labelKey, valueKeys: numericKeys.slice(0, 3) };
}

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b"];

function WidgetCard({ id, widget }: { id: string; widget: WidgetResult }) {
  // The backend surfaces per-widget problems either as a top-level `error`
  // or nested inside `data.error` (e.g. "Developer IDs required").
  const nestedError =
    widget.data && typeof widget.data === "object" && "error" in (widget.data as Record<string, unknown>)
      ? String((widget.data as Record<string, unknown>).error)
      : undefined;
  const errorMessage = widget.error || nestedError;
  const series = errorMessage ? null : extractSeries(widget.data);
  const isBar = widget.type?.includes("bar");

  return (
    <div className="bg-accent rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-foreground font-medium">{widget.title}</h4>
        <span className="text-xs text-muted-foreground uppercase">
          {widget.type?.replace(/_/g, " ")}
        </span>
      </div>

      {errorMessage ? (
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 mt-0.5 text-orange-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : series ? (
        <ResponsiveContainer width="100%" height={200}>
          {isBar ? (
            <BarChart data={series.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey={series.labelKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              {series.valueKeys.map((k, i) => (
                <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={series.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey={series.labelKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              {series.valueKeys.map((k, i) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={COLORS[i % COLORS.length]}
                  dot={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      ) : (
        <pre className="text-xs text-muted-foreground overflow-x-auto max-h-40">
          {JSON.stringify(widget.data, null, 2)}
        </pre>
      )}
      <span className="sr-only">{id}</span>
    </div>
  );
}

export function ReportDataView({
  report,
  workspaceId,
}: {
  report: CustomReport;
  /** Passed down rather than read here: the parent already knows it, and a
      second `useWorkspace` in a child is a second source of truth. */
  workspaceId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<Record<string, WidgetResult>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const developerIds = report.filters?.developer_ids;
        const result = await reportsApi.getReportData(workspaceId, report.id, developerIds);
        if (!active) return;
        setWidgets((result?.widgets as Record<string, WidgetResult>) || {});
      } catch (e) {
        console.error("Failed to load report data:", e);
        if (active) setError("Failed to load report data.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [report.id, report.filters, workspaceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading report data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-400 py-6">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  const entries = Object.entries(widgets);
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm py-6">This report has no widgets yet.</p>;
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {entries.map(([id, widget]) => (
        <WidgetCard key={id} id={id} widget={widget} />
      ))}
    </div>
  );
}
