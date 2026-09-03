"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useFormulaVocabulary, useServiceDeskMutations } from "@/hooks/useServiceDesk";
import type {
  FieldKind,
  FormulaDefinition,
  FormulaFilter,
  FormulaValue,
  ScorecardBand,
  ScorecardKPIDraft,
  ScorecardPreview,
} from "@/lib/service-desk-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScoreCurve } from "./ScoreCurve";

/**
 * Build a KPI out of the desk's own data.
 *
 * A sentence over a closed vocabulary, never a text box somebody types a
 * formula into. Every slot is a choice from a list the server served, so there
 * is no syntax to get wrong, nothing to parse, and the result reads back as a
 * sentence to whoever opens it in six months — which matters more than usual
 * here, because these ratings are about named colleagues.
 *
 * Three things in this dialog are load-bearing rather than decorative:
 *
 * * **The preview.** A KPI you cannot try is one you discover is wrong at
 *   somebody's review. It scores the proposed config against real tickets.
 * * **The impact diff.** Adding a KPI rescales every other weight and re-grades
 *   people. The dialog says so by name — "Dana 81 → 76" — before anyone saves.
 * * **Draft vs publish.** A half-built KPI must never touch a live score.
 */

const SELECT =
  "h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50";

type Draft = ScorecardKPIDraft;

/**
 * A new filter row, seeded with a value the field's kind can actually hold.
 *
 * The seed used to be `""` for everything. A number input renders `Number("")`
 * as 0, so a duration filter looked filled in while the state still held a
 * string, and the save came back 422 "needs a number". The kind has to come in
 * for the seed to be right — the same reason the field-change handler below
 * re-seeds when the kind changes.
 */
function emptyFilter(field: string, kind: FieldKind, firstOption?: string): FormulaFilter {
  return { field, op: "eq", value: seedValue(kind, firstOption) };
}

function seedValue(kind: FieldKind, firstOption?: string): FormulaValue {
  if (kind === "boolean") return true;
  // A category seeded blank passes server validation and then matches nothing,
  // so prefer a real option; `filterIsComplete` catches it when there is none.
  if (kind === "category") return firstOption ?? "";
  return 0;
}

/** Whether a filter row has been finished. A blank category is the one case
 *  that looks complete and silently matches no ticket at all. */
function filterIsComplete(f: FormulaFilter, kind: FieldKind): boolean {
  if (kind === "category") return typeof f.value === "string" && f.value.trim().length > 0;
  if (kind === "boolean") return typeof f.value === "boolean";
  return typeof f.value === "number" || (typeof f.value === "object" && f.value !== null);
}

export function ScorecardFormulaDialog({
  open,
  onOpenChange,
  initial,
  siblings,
  bands,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The KPI being edited, or null to build a new one. */
  initial: Draft | null;
  /** Every other KPI, so the preview can score the whole proposed config. */
  siblings: Draft[];
  bands: ScorecardBand[];
  onSave: (kpi: Draft) => void;
}) {
  const t = useTranslations("serviceDesk.reports.formula");
  const tc = useTranslations("common");
  const vocabulary = useFormulaVocabulary(open);
  const { previewScorecard } = useServiceDeskMutations();
  const [preview, setPreview] = useState<ScorecardPreview | null>(null);

  const [kpi, setKpi] = useState<Draft>(
    () =>
      initial ?? {
        metric_key: "",
        label: "",
        weight: 0.1,
        direction: "higher_is_better",
        benchmark: null,
        penalty_per_unit: null,
        target: 1,
        threshold: null,
        enabled: true,
        source: "custom",
        status: "draft",
        definition: { aggregation: "share", condition: [], population: [] },
      },
  );

  const fields = vocabulary.data?.fields ?? [];
  const kindOf = (key: string): FieldKind =>
    (fields.find((f) => f.key === key)?.kind ?? "number") as FieldKind;
  const numericFields = fields.filter((f) => f.kind === "duration" || f.kind === "number");

  const definition: FormulaDefinition = kpi.definition ?? { aggregation: "share" };
  const aggregation = vocabulary.data?.aggregations.find(
    (a) => a.key === definition.aggregation,
  );
  const takesField = aggregation?.takes_field ?? false;
  const isShare = definition.aggregation === "share";

  const patch = (p: Partial<Draft>) => {
    setKpi((k) => ({ ...k, ...p }));
    // Any edit invalidates the figures on screen. Leaving a stale preview under
    // a changed definition is worse than showing none.
    setPreview(null);
  };
  const patchDefinition = (p: Partial<FormulaDefinition>) =>
    patch({ definition: { ...definition, ...p } });

  // A key is derived from the name so nobody has to invent a slug, but it is
  // frozen once saved: it identifies the row, and changing it would orphan the
  // KPI's stored figures.
  //
  // The slug is ASCII-only, so a name written in any non-Latin script reduces
  // to nothing — and this app ships a Hindi locale. A name that slugifies to
  // nothing falls back to a generated key rather than leaving Save disabled
  // with no way to find out why.
  const derivedKey = useMemo(() => {
    if (initial?.metric_key) return initial.metric_key;
    const slug = kpi.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60);
    if (slug) return slug;
    const taken = new Set(siblings.map((s) => s.metric_key));
    let n = 1;
    while (taken.has(`custom_kpi_${n}`)) n += 1;
    return `custom_kpi_${n}`;
  }, [initial?.metric_key, kpi.label, siblings]);

  // Every filter the server would reject, so the footer can say what is missing
  // instead of the save coming back 422.
  const unfinishedFilters = [
    ...(definition.condition ?? []),
    ...(definition.population ?? []),
  ].filter((f) => !filterIsComplete(f, kindOf(f.field)));

  const complete =
    kpi.label.trim().length > 0 &&
    (!takesField || !!definition.field) &&
    (!isShare || (definition.condition?.length ?? 0) > 0) &&
    unfinishedFilters.length === 0 &&
    // A published KPI with no weight is rejected server-side; catch it here so
    // the button explains itself rather than the save failing.
    kpi.weight > 0 &&
    (kpi.direction === "higher_is_better"
      ? !!kpi.target && kpi.target > 0
      : kpi.benchmark !== null && kpi.penalty_per_unit !== null);

  const proposed = (): Draft => ({ ...kpi, metric_key: derivedKey });

  const runPreview = () => {
    const mine = proposed();
    const others = siblings.filter((s) => s.metric_key !== mine.metric_key);
    previewScorecard.mutate(
      // Previewed as published even while it is a draft — the whole question is
      // "what would this do if it were live".
      { kpis: [...others, { ...mine, status: "published" }], bands },
      { onSuccess: setPreview },
    );
  };

  const renderFilters = (which: "condition" | "population") => {
    const list = definition[which] ?? [];
    const setList = (next: FormulaFilter[]) => patchDefinition({ [which]: next });
    return (
      <div className="space-y-2 pl-4">
        {list.map((f, i) => {
          const kind = kindOf(f.field);
          const ops = vocabulary.data?.operators[kind] ?? ["eq"];
          const options = vocabulary.data?.options[f.field];
          const usesSetting = typeof f.value === "object" && f.value !== null;
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                className={SELECT}
                value={f.field}
                onChange={(e) => {
                  const nextKind = kindOf(e.target.value);
                  setList(
                    list.map((x, j) =>
                      j === i
                        ? {
                            field: e.target.value,
                            // The operator and value belong to the old field's
                            // kind; carrying them over produces a filter the
                            // server will reject.
                            op: (vocabulary.data?.operators[nextKind] ?? ["eq"])[0],
                            value: seedValue(
                              nextKind,
                              vocabulary.data?.options[e.target.value]?.[0]?.value,
                            ),
                          }
                        : x,
                    ),
                  );
                }}
              >
                {fields.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>

              <select
                className={SELECT}
                value={f.op}
                onChange={(e) =>
                  setList(list.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))
                }
              >
                {ops.map((op) => (
                  <option key={op} value={op}>
                    {t(`ops.${op}`)}
                  </option>
                ))}
              </select>

              {kind === "boolean" ? (
                <select
                  className={SELECT}
                  value={String(f.value)}
                  onChange={(e) =>
                    setList(
                      list.map((x, j) =>
                        j === i ? { ...x, value: e.target.value === "true" } : x,
                      ),
                    )
                  }
                >
                  <option value="true">{t("yes")}</option>
                  <option value="false">{t("no")}</option>
                </select>
              ) : kind === "category" ? (
                options ? (
                  <select
                    className={SELECT}
                    value={String(f.value ?? "")}
                    onChange={(e) =>
                      setList(list.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                    }
                  >
                    <option value="">—</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    className="h-8 w-40 text-xs"
                    value={String(f.value ?? "")}
                    onChange={(e) =>
                      setList(list.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                    }
                  />
                )
              ) : (
                <div className="flex items-center gap-1">
                  {usesSetting ? (
                    <select
                      className={SELECT}
                      value={(f.value as { setting: string }).setting}
                      onChange={(e) =>
                        setList(
                          list.map((x, j) =>
                            j === i ? { ...x, value: { setting: e.target.value } } : x,
                          ),
                        )
                      }
                    >
                      {(vocabulary.data?.settings ?? []).map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label} ({s.value}
                          {s.unit === "hours" ? "h" : ""})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type="number"
                      className="h-8 w-24 text-xs"
                      value={Number(f.value ?? 0)}
                      onChange={(e) =>
                        setList(
                          list.map((x, j) =>
                            j === i ? { ...x, value: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  )}
                  {/* Pointing at a setting instead of typing a number is what
                      keeps a threshold from going stale when Ops changes the
                      shift. Worth a visible toggle rather than a hidden mode. */}
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={usesSetting}
                      onChange={(e) =>
                        setList(
                          list.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  value: e.target.checked
                                    ? ({
                                        setting:
                                          vocabulary.data?.settings[0]?.key ??
                                          "breach_target_hours",
                                      } as FormulaValue)
                                    : 0,
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    {t("useSetting")}
                  </label>
                </div>
              )}

              <button
                type="button"
                aria-label={tc("delete")}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setList(list.filter((_, j) => j !== i))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              const key = fields[0]?.key ?? "handshakes";
              setList([
                ...list,
                emptyFilter(key, kindOf(key), vocabulary.data?.options[key]?.[0]?.value),
              ]);
            }}
          >
            <Plus className="mr-1 h-3 w-3" />
            {t("addCondition")}
          </Button>
          {/* An empty population means every ticket, which is easy to read as
              "unfinished" instead. Say which it is. */}
          {list.length === 0 && which === "population" && (
            <span className="text-[11px] text-muted-foreground">{t("allTickets")}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {vocabulary.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner size="sm" />
          </div>
        ) : (
          <div className="space-y-5">
            <label className="block space-y-1">
              <span className="text-xs font-medium">{t("name")}</span>
              <Input
                className="h-9 w-72 text-sm"
                value={kpi.label}
                placeholder={t("namePlaceholder")}
                onChange={(e) => patch({ label: e.target.value })}
              />
            </label>

            {/* The sentence. Connectors are their own strings so a translator
                can word them; the controls sit between them. */}
            <section className="space-y-2 rounded-md border border-input p-3">
              <h4 className="text-xs font-medium">{t("measure")}</h4>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  className={SELECT}
                  value={definition.aggregation}
                  onChange={(e) => {
                    const next = e.target.value as FormulaDefinition["aggregation"];
                    const nextTakesField =
                      vocabulary.data?.aggregations.find((a) => a.key === next)?.takes_field ??
                      false;
                    patchDefinition({
                      aggregation: next,
                      // A field on a ticket-counting aggregation, or a missing
                      // one on a reducing aggregation, is rejected server-side.
                      field: nextTakesField ? definition.field ?? numericFields[0]?.key : null,
                      condition: next === "share" ? definition.condition ?? [] : [],
                    });
                  }}
                >
                  {(vocabulary.data?.aggregations ?? []).map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>

                {takesField ? (
                  <>
                    <span className="text-muted-foreground">{t("of")}</span>
                    <select
                      className={SELECT}
                      value={definition.field ?? ""}
                      onChange={(e) => patchDefinition({ field: e.target.value })}
                    >
                      {numericFields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="text-muted-foreground">{t("ofTickets")}</span>
                )}
              </div>

              {isShare && (
                <>
                  <p className="text-xs text-muted-foreground">{t("thatMatch")}</p>
                  {renderFilters("condition")}
                </>
              )}

              <p className="text-xs text-muted-foreground">
                {isShare ? t("among") : t("overTickets")}
              </p>
              {renderFilters("population")}

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!definition.relative_to_desk_average}
                  onChange={(e) =>
                    patchDefinition({ relative_to_desk_average: e.target.checked })
                  }
                />
                {t("relative")}
              </label>
            </section>

            <section className="flex flex-wrap items-start gap-6 rounded-md border border-input p-3">
              <div className="space-y-2">
                <h4 className="text-xs font-medium">{t("scoring")}</h4>
                <select
                  className={SELECT}
                  value={kpi.direction}
                  onChange={(e) =>
                    patch({
                      direction: e.target.value as Draft["direction"],
                      // Each direction reads one pair and ignores the other;
                      // seeding sensible values beats leaving empty boxes that
                      // fail validation on save.
                      ...(e.target.value === "lower_is_better"
                        ? { benchmark: kpi.benchmark ?? 0, penalty_per_unit: kpi.penalty_per_unit ?? 10, target: null }
                        : { target: kpi.target ?? 1, benchmark: null, penalty_per_unit: null }),
                    })
                  }
                >
                  <option value="higher_is_better">{t("higher")}</option>
                  <option value="lower_is_better">{t("lower")}</option>
                </select>

                <div className="flex flex-wrap gap-3">
                  {kpi.direction === "lower_is_better" ? (
                    <>
                      <label className="space-y-1">
                        <span className="block text-[11px]">{t("benchmark")}</span>
                        <Input
                          type="number"
                          className="h-8 w-24 text-xs"
                          value={kpi.benchmark ?? 0}
                          onChange={(e) => patch({ benchmark: Number(e.target.value) })}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[11px]">{t("penalty")}</span>
                        <Input
                          type="number"
                          className="h-8 w-24 text-xs"
                          value={kpi.penalty_per_unit ?? 0}
                          onChange={(e) => patch({ penalty_per_unit: Number(e.target.value) })}
                        />
                      </label>
                    </>
                  ) : (
                    <label className="space-y-1">
                      <span className="block text-[11px]">{t("target")}</span>
                      <Input
                        type="number"
                        step="0.05"
                        className="h-8 w-24 text-xs"
                        value={kpi.target ?? 1}
                        onChange={(e) => patch({ target: Number(e.target.value) })}
                      />
                    </label>
                  )}
                  <label className="space-y-1">
                    <span className="block text-[11px]">{t("weight")}</span>
                    <Input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      className="h-8 w-24 text-xs"
                      value={kpi.weight}
                      onChange={(e) => patch({ weight: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>

              {/* The curve, so a mis-set direction is visible as a shape rather
                  than hidden behind a correct-looking dropdown. */}
              <ScoreCurve
                direction={kpi.direction}
                benchmark={kpi.benchmark}
                penaltyPerUnit={kpi.penalty_per_unit}
                target={kpi.target}
              />
            </section>

            <section className="space-y-2 rounded-md border border-input p-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-medium">{t("preview")}</h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!complete || previewScorecard.isPending}
                  onClick={runPreview}
                >
                  {previewScorecard.isPending ? t("previewing") : t("runPreview")}
                </Button>
              </div>
              {preview ? (
                <PreviewTable preview={preview} metricKey={derivedKey} />
              ) : (
                <p className="text-xs text-muted-foreground">{t("previewHint")}</p>
              )}
            </section>
          </div>
        )}

        <DialogFooter>
          {!complete && (
            <span className="mr-auto text-xs text-muted-foreground">
              {unfinishedFilters.length > 0 ? t("finishFilters") : t("finishKpi")}
            </span>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            variant="outline"
            disabled={!complete}
            onClick={() => onSave({ ...proposed(), status: "draft" })}
          >
            {t("saveDraft")}
          </Button>
          <Button
            disabled={!complete}
            onClick={() => onSave({ ...proposed(), status: "published" })}
          >
            {t("publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Per-owner figures for the proposed KPI, and what it does to their rating. */
function PreviewTable({
  preview,
  metricKey,
}: {
  preview: ScorecardPreview;
  metricKey: string;
}) {
  const t = useTranslations("serviceDesk.reports.formula");

  const moved = useMemo(
    () =>
      preview.rows.filter(
        (r) => r.previous_score !== null && r.sim_score !== null && r.previous_score !== r.sim_score,
      ),
    [preview.rows],
  );

  if (preview.rows.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("previewEmpty")}</p>;
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-xs">
        <thead className="border-b">
          <tr>
            <th className="py-1 text-left font-medium">{t("owner")}</th>
            <th className="py-1 text-left font-medium">{t("thisKpi")}</th>
            <th className="py-1 text-left font-medium">{t("score")}</th>
            <th className="py-1 text-left font-medium">{t("total")}</th>
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row) => (
            <tr key={row.owner_id ?? row.owner} className="border-b last:border-0">
              <td className="py-1">{row.owner}</td>
              {/* null, never 0 — "no eligible tickets" is not "scored nothing". */}
              <td className="py-1">{row.values[metricKey] ?? "—"}</td>
              <td className="py-1">{row.scores[metricKey] ?? "—"}</td>
              <td className="py-1">
                {row.previous_score !== null && (
                  <span className="text-muted-foreground">{row.previous_score} → </span>
                )}
                {row.sim_score ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* The blast radius, said plainly. Adding a KPI rescales every other
          weight, so this changes people who have nothing to do with it. */}
      {moved.length > 0 && (
        <p className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
          {t("impact", { count: moved.length })}{" "}
          {moved
            .slice(0, 4)
            .map((r) => `${r.owner} ${r.previous_score} → ${r.sim_score}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
