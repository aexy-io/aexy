"use client";

/**
 * Reading a Word document for work, and putting it on a board.
 *
 * The two-step shape is the design, not a formality. Step one proposes and
 * writes nothing; step two creates what the person kept. These rows become work
 * a team is measured against, so a model that mistook a heading for a
 * deliverable must not be able to reach a sprint without somebody seeing the
 * list — the same principle the edit path applies with its redline gate.
 *
 * Both pickers are per run. A workspace-level default would be wrong for one of
 * the two obvious uses: "this client's twenty comments become tickets" and "this
 * spec's requirements become sprint tasks" are different asks about the same
 * document.
 *
 * Every row says which source produced it, because that is what tells a reader
 * how much to trust it: a reviewer's own words, a marker the author left, or an
 * inference.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  docxIntakeApi,
  intakeNeeds,
  type IntakeCandidate,
  type IntakeSource,
  type IntakeTarget,
} from "@/lib/docx-intake-api";
import { getApiErrorMessage } from "@/lib/utils";

const SOURCES: IntakeSource[] = ["comments", "markers", "model"];
const TARGETS: IntakeTarget[] = ["sprint_task", "bug", "user_story", "ticket"];

export interface DocxIntakePanelProps {
  workspaceId: string;
  documentId: string;
  /**
   * Offered when the target needs one, qualified by team by the caller — two
   * teams routinely have a "Sprint 24".
   *
   * Only the sprints open to new work, which is the server's default: offering a
   * completed sprint is offering a mistake, since adding a task to it would
   * falsify a velocity figure somebody has already reported. Empty means the
   * workspace has none open, which the panel says rather than showing a dropdown
   * that cannot be satisfied.
   */
  sprints?: { id: string; name: string }[];
  ticketForms?: { id: string; name: string }[];
  className?: string;
}

export function DocxIntakePanel({
  workspaceId,
  documentId,
  sprints = [],
  ticketForms = [],
  className,
}: DocxIntakePanelProps) {
  const t = useTranslations("docs");

  // Comments and markers by default: both are free and neither needs a model
  // call, so the first run costs nothing and shows what is already tagged.
  const [sources, setSources] = useState<IntakeSource[]>(["comments", "markers"]);
  const [target, setTarget] = useState<IntakeTarget>("sprint_task");
  const [sprintId, setSprintId] = useState("");
  const [formId, setFormId] = useState("");
  const [candidates, setCandidates] = useState<IntakeCandidate[] | null>(null);
  // Keyed by index rather than by title: two candidates can legitimately share
  // a title once a person has edited nothing, and dropping one silently would be
  // worse than showing both.
  const [kept, setKept] = useState<Set<number>>(new Set());

  const needs = intakeNeeds(target);

  const preview = useMutation({
    mutationFn: () => docxIntakeApi.preview(workspaceId, documentId, sources),
    onSuccess: (data) => {
      setCandidates(data.candidates);
      // Everything selected to begin with: the person is removing what does not
      // belong, which is a shorter job than picking twenty things out of thirty.
      setKept(new Set(data.candidates.map((_, index) => index)));
    },
    onError: (error) =>
      toast.error(getApiErrorMessage(error, t("docx.intakeReadFailed"))),
  });

  const create = useMutation({
    mutationFn: () =>
      docxIntakeApi.create(workspaceId, documentId, {
        target,
        candidates: (candidates ?? []).filter((_, index) => kept.has(index)),
        sprint_id: needs.sprint ? sprintId || null : null,
        form_id: needs.form ? formId || null : null,
      }),
    onSuccess: (data) => {
      toast.success(
        t("docx.intakeCreated", { count: data.created.length })
      );
      setCandidates(null);
      setKept(new Set());
    },
    onError: (error) =>
      toast.error(getApiErrorMessage(error, t("docx.intakeCreateFailed"))),
  });

  // "You must pick a sprint" is useful. "You must pick a sprint" next to an
  // empty dropdown is a dead end, so the two cases are distinguished: nothing to
  // pick from is a different message, and it points somewhere that works.
  const noSprints = needs.sprint && sprints.length === 0;
  const noForms = needs.form && ticketForms.length === 0;
  const missingContext =
    noSprints || noForms || (needs.sprint && !sprintId) || (needs.form && !formId);

  return (
    <section
      data-testid="docx-intake-panel"
      className={["rounded-lg border border-border bg-surface p-3", className]
        .filter(Boolean)
        .join(" ")}
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        {t("docx.intakeTitle")}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("docx.intakeHint")}
      </p>

      {/* Step one: where to read from. */}
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-foreground">
          {t("docx.intakeSourcesLabel")}
        </legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {SOURCES.map((source) => (
            <label
              key={source}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <input
                type="checkbox"
                data-testid={`docx-intake-source-${source}`}
                checked={sources.includes(source)}
                onChange={(event) =>
                  setSources((prev) =>
                    event.target.checked
                      ? [...prev, source]
                      : prev.filter((s) => s !== source)
                  )
                }
              />
              {t(`docx.intakeSource.${source}`)}
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {sources.includes("model")
            ? t("docx.intakeModelCost")
            : t("docx.intakeNoModelCost")}
        </p>
      </fieldset>

      <button
        type="button"
        data-testid="docx-intake-read"
        disabled={sources.length === 0 || preview.isPending}
        onClick={() => preview.mutate()}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
      >
        {preview.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        {t("docx.intakeRead")}
      </button>

      {/* Step two: what was found, and what to do with it. */}
      {candidates !== null && (
        <div className="mt-4 border-t border-border pt-3">
          {candidates.length === 0 ? (
            // An empty result is an answer, not a failure — a document with no
            // work in it is a normal document.
            <p
              data-testid="docx-intake-empty"
              className="text-xs text-muted-foreground"
            >
              {t("docx.intakeNothingFound")}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t("docx.intakeFound", {
                  count: candidates.length,
                  kept: kept.size,
                })}
              </p>

              <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                {candidates.map((candidate, index) => (
                  <li
                    key={index}
                    data-testid={`docx-intake-row-${index}`}
                    className="flex items-start gap-2 rounded border border-border/60 p-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      data-testid={`docx-intake-keep-${index}`}
                      checked={kept.has(index)}
                      onChange={(event) =>
                        setKept((prev) => {
                          const next = new Set(prev);
                          if (event.target.checked) next.add(index);
                          else next.delete(index);
                          return next;
                        })
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-foreground">{candidate.title}</p>
                      <p className="text-muted-foreground">
                        {/* Where it came from, because that is what says how
                            much to trust it. */}
                        <span data-testid={`docx-intake-origin-${index}`}>
                          {t(`docx.intakeSource.${candidate.source}`)}
                          {candidate.origin ? ` · ${candidate.origin}` : ""}
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-xs">
                  <span className="block text-muted-foreground">
                    {t("docx.intakeTargetLabel")}
                  </span>
                  <select
                    data-testid="docx-intake-target"
                    value={target}
                    onChange={(event) =>
                      setTarget(event.target.value as IntakeTarget)
                    }
                    className="mt-0.5 rounded-md border border-border bg-background px-2 py-1"
                  >
                    {TARGETS.map((option) => (
                      <option key={option} value={option}>
                        {t(`docx.intakeTarget.${option}`)}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Asked for here rather than failing on submit: a task with no
                    sprint, or a ticket with no form, is a row that exists and
                    belongs nowhere. */}
                {needs.sprint && (
                  <label className="text-xs">
                    <span className="block text-muted-foreground">
                      {t("docx.intakeSprintLabel")}
                    </span>
                    <select
                      data-testid="docx-intake-sprint"
                      value={sprintId}
                      onChange={(event) => setSprintId(event.target.value)}
                      className="mt-0.5 rounded-md border border-border bg-background px-2 py-1"
                    >
                      <option value="">{t("docx.intakeChoose")}</option>
                      {sprints.map((sprint) => (
                        <option key={sprint.id} value={sprint.id}>
                          {sprint.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {needs.form && (
                  <label className="text-xs">
                    <span className="block text-muted-foreground">
                      {t("docx.intakeFormLabel")}
                    </span>
                    <select
                      data-testid="docx-intake-form"
                      value={formId}
                      onChange={(event) => setFormId(event.target.value)}
                      className="mt-0.5 rounded-md border border-border bg-background px-2 py-1"
                    >
                      <option value="">{t("docx.intakeChoose")}</option>
                      {ticketForms.map((form) => (
                        <option key={form.id} value={form.id}>
                          {form.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  type="button"
                  data-testid="docx-intake-create"
                  disabled={
                    kept.size === 0 || missingContext || create.isPending
                  }
                  onClick={() => create.mutate()}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {create.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  {t("docx.intakeCreate", { count: kept.size })}
                </button>
              </div>

              {missingContext && (
                <p
                  data-testid="docx-intake-needs-context"
                  className="mt-1 text-[11px] text-muted-foreground"
                >
                  {noSprints
                    ? t("docx.intakeNoSprints")
                    : noForms
                      ? t("docx.intakeNoForms")
                      : needs.sprint
                        ? t("docx.intakeNeedsSprint")
                        : t("docx.intakeNeedsForm")}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
