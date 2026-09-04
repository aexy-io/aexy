"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useScorecardConfig, useServiceDeskMutations } from "@/hooks/useServiceDesk";
import type {
  ScorecardBand,
  ScorecardKPIDraft,
  ScorecardMetric,
} from "@/lib/service-desk-api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ScoreCurve } from "./ScoreCurve";
import { ScorecardFormulaDialog } from "./ScorecardFormulaDialog";

/**
 * Edit what the owner scorecard grades on.
 *
 * Every number here is a business's own opinion: the weight of each KPI,
 * what counts as a fast first response, how steeply a miss is punished, the
 * hand-off limit inside "resolved cleanly", and where the rating boundaries
 * sit. They are rows now, which is only true from the desk's point of view if
 * there is a screen to change them on — an endpoint with no UI is a setting
 * nobody can set, and this module has shipped that mistake before.
 *
 * A card per KPI rather than a wide table. The columns fit, but a benchmark is
 * meaningless without knowing what the KPI measures, and prose does not go in a
 * table cell. The description and the calculation come from the server's metric
 * catalogue and are deliberately read-only: they describe what the code
 * computes, so an editable version could be saved into saying something untrue.
 *
 * The set of *metrics* is likewise not editable — each one needs a computation.
 */

type Draft = { kpis: ScorecardKPIDraft[]; bands: ScorecardBand[] };

const NUM = "h-8 w-24 text-xs";

/** How a custom KPI's figure reads, from the shape of its own sentence.
 *
 *  Built-ins get theirs from the server's metric catalogue; a custom one has no
 *  catalogue entry, and a share rendered as hours would be its own small lie. */
function kpiUnit(kpi: ScorecardKPIDraft): string {
  const agg = kpi.definition?.aggregation;
  if (kpi.definition?.relative_to_desk_average) return "ratio";
  if (agg === "share") return "rate";
  if (agg === "count") return "count";
  return kpi.definition?.field === "handshakes" ? "count" : "hours";
}

export function ScorecardSection() {
  const t = useTranslations("serviceDesk.reports.config");
  const config = useScorecardConfig();
  const { saveScorecardConfig } = useServiceDeskMutations();
  const [edits, setEdits] = useState<Draft | null>(null);
  // null = closed; a KPI = editing it; "new" = building one. Note the type is
  // one KPI, not `Draft` — `Draft` here is the whole config.
  const [building, setBuilding] = useState<ScorecardKPIDraft | "new" | null>(null);

  const canManage = config.data?.can_manage === true;

  // The server's config as an editable shape. Derived rather than copied into
  // state by an effect: `setState` in an effect body cascades a second render
  // on every fetch, and the local copy is only needed once somebody types.
  const serverDraft = useMemo<Draft | null>(() => {
    if (!config.data) return null;
    return {
      // `unit` is served for display and is not part of the stored row, so it
      // is dropped rather than sent back as a field the API would reject.
      kpis: config.data.kpis.map(({ unit: _unit, ...kpi }) => ({ ...kpi })),
      bands: config.data.bands.map((band) => ({ ...band })),
    };
  }, [config.data]);

  // Local edits win once there are any, so a refetch mid-edit cannot discard
  // what somebody is halfway through typing.
  const draft = edits ?? serverDraft;

  if (config.isLoading || !draft) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  const metrics = new Map<string, ScorecardMetric>(
    (config.data?.available_metrics ?? []).map((m) => [m.key, m]),
  );

  const total = draft.kpis
    .filter((k) => k.enabled)
    .reduce((sum, k) => sum + (Number(k.weight) || 0), 0);
  // Compared with a tolerance for the same reason the server does: six
  // two-decimal numbers do not add to exactly 1.0 in floating point, and
  // refusing a valid set over the last bit would be its own bug.
  const totalOk = Math.abs(total - 1) < 1e-6;

  const patchKpi = (key: string, patch: Partial<ScorecardKPIDraft>) =>
    setEdits({
      ...draft,
      kpis: draft.kpis.map((k) => (k.metric_key === key ? { ...k, ...patch } : k)),
    });
  const patchBand = (rating: number, patch: Partial<ScorecardBand>) =>
    setEdits({
      ...draft,
      bands: draft.bands.map((b) => (b.rating === rating ? { ...b, ...patch } : b)),
    });

  return (
    <div className="space-y-4">
      {/* No title/description here: the settings page header already renders
          both, and repeating them put the same sentence on screen twice. */}
      {draft.kpis.map((kpi) => {
        const metric = metrics.get(kpi.metric_key);
        const lower = kpi.direction === "lower_is_better";
        return (
          <Card
            key={kpi.metric_key}
            // A disabled KPI carries no weight and is not scored. Dimmed rather
            // than hidden, so turning one back on is a visible option instead of
            // something you have to know exists.
            className={`p-4 space-y-3 ${kpi.enabled ? "" : "opacity-60"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <Input
                  className="h-8 w-64 text-sm font-medium"
                  value={kpi.label}
                  disabled={!canManage}
                  onChange={(e) => patchKpi(kpi.metric_key, { label: e.target.value })}
                />
                <p className="max-w-prose text-xs text-muted-foreground">
                  {kpi.source === "custom" ? t("customKpi") : metric?.description}
                </p>
                {/* Descriptive metadata, so it sits with the description rather
                    than trailing the controls as if it were one. */}
                <p className="text-[11px] text-muted-foreground">
                  {lower ? t("lower") : t("higher")} · {metric?.unit ?? kpiUnit(kpi)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {kpi.status === "draft" && (
                  // A draft is saved but never scored, so it has to be visibly
                  // different from a KPI that is grading people today.
                  <Badge className="border border-amber-500/30 bg-amber-500/10 text-amber-600">
                    {t("draft")}
                  </Badge>
                )}
                {kpi.source === "custom" && canManage && (
                  <>
                    <button
                      type="button"
                      aria-label={t("edit")}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setBuilding(kpi)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("remove")}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setEdits({
                          ...draft,
                          kpis: draft.kpis.filter((k) => k.metric_key !== kpi.metric_key),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={kpi.enabled}
                    disabled={!canManage}
                    onChange={(e) => patchKpi(kpi.metric_key, { enabled: e.target.checked })}
                  />
                  {t("enabled")}
                </label>
              </div>
            </div>

            {kpi.source !== "custom" && metric?.how_calculated && (
              // A disclosure, not a paragraph: the detail matters when somebody
              // is choosing a benchmark and is noise the rest of the time.
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">{t("howCalculated")}</summary>
                <p className="mt-1 max-w-prose pl-4">{metric.how_calculated}</p>
              </details>
            )}

            {/* items-start, not items-end: only some fields carry a hint, and aligning
                  on the bottom edge put their inputs at different heights. */}
            <div className="flex flex-wrap items-start gap-4">
              {/* Drawn next to the numbers that produce it: "benchmark 4,
                  penalty 10" is judgeable as a shape and not as two figures,
                  and a direction set the wrong way is visible here and
                  invisible in a dropdown reading "higher is better". */}
              <ScoreCurve
                direction={kpi.direction}
                benchmark={kpi.benchmark}
                penaltyPerUnit={kpi.penalty_per_unit}
                target={kpi.target}
                unit={metric?.unit}
              />

              <Field label={t("weight")}>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className={NUM}
                  value={kpi.weight}
                  disabled={!canManage}
                  onChange={(e) => patchKpi(kpi.metric_key, { weight: Number(e.target.value) })}
                />
              </Field>

              {/* Only the fields this KPI's curve actually reads are rendered.
                  A box the metric ignores looks set without doing anything,
                  which is worse than one that is absent. */}
              {metric?.uses_threshold && (
                <Field label={metric.threshold_label ?? t("threshold")}>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    className={NUM}
                    value={kpi.threshold ?? ""}
                    disabled={!canManage}
                    onChange={(e) =>
                      patchKpi(kpi.metric_key, { threshold: Number(e.target.value) })
                    }
                  />
                </Field>
              )}

              {lower ? (
                <>
                  <Field label={t("benchmark")} hint={t("benchmarkHint")}>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      className={NUM}
                      value={kpi.benchmark ?? ""}
                      disabled={!canManage}
                      onChange={(e) =>
                        patchKpi(kpi.metric_key, { benchmark: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label={t("penalty")} hint={t("penaltyHint")}>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      className={NUM}
                      value={kpi.penalty_per_unit ?? ""}
                      disabled={!canManage}
                      onChange={(e) =>
                        patchKpi(kpi.metric_key, { penalty_per_unit: Number(e.target.value) })
                      }
                    />
                  </Field>
                </>
              ) : (
                <Field label={t("target")} hint={t("targetHint")}>
                  <Input
                    type="number"
                    step="0.05"
                    min="0.01"
                    className={NUM}
                    value={kpi.target ?? ""}
                    disabled={!canManage}
                    onChange={(e) => patchKpi(kpi.metric_key, { target: Number(e.target.value) })}
                  />
                </Field>
              )}
            </div>
          </Card>
        );
      })}

      {/* The running total, so the validation error is not the first feedback
          somebody gets about a set that does not add up. */}
      <p className={`text-xs ${totalOk ? "text-muted-foreground" : "text-amber-600"}`}>
        {t("total")}: {totalOk ? t("totalOk") : t("totalBad", { pct: Math.round(total * 100) })}
      </p>

      {canManage && (
        <Button variant="outline" size="sm" onClick={() => setBuilding("new")}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("addCustom")}
        </Button>
      )}

      {building !== null && (
        <ScorecardFormulaDialog
          open
          onOpenChange={(o) => !o && setBuilding(null)}
          initial={building === "new" ? null : building}
          siblings={draft.kpis}
          bands={draft.bands}
          onSave={(saved) => {
            const exists = draft.kpis.some((k) => k.metric_key === saved.metric_key);
            setEdits({
              ...draft,
              kpis: exists
                ? draft.kpis.map((k) => (k.metric_key === saved.metric_key ? saved : k))
                : [...draft.kpis, saved],
            });
            setBuilding(null);
          }}
        />
      )}

      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-medium">{t("bands")}</h3>
        <table className="w-full text-xs">
          <thead className="border-b">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">{t("minScore")}</th>
              <th className="px-2 py-1.5 text-left font-medium">{t("label")}</th>
            </tr>
          </thead>
          <tbody>
            {draft.bands.map((band) => (
              <tr key={band.rating} className="border-b last:border-0">
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    className={NUM}
                    value={band.min_score}
                    disabled={!canManage}
                    onChange={(e) => patchBand(band.rating, { min_score: Number(e.target.value) })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 w-56 text-xs"
                    value={band.label}
                    disabled={!canManage}
                    onChange={(e) => patchBand(band.rating, { label: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {canManage && (
        <Button
          size="sm"
          disabled={!totalOk || saveScorecardConfig.isPending}
          onClick={() => saveScorecardConfig.mutate(draft)}
        >
          {t("save")}
        </Button>
      )}
    </div>
  );
}

/** A labelled control. `hint` says what the number does, in four words. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
