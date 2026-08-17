"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  FolderTree,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";

import {
  documentApi,
  repositoriesApi,
  type RepositoryChoice,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";

/** Mirrors `_NOISE_DIRECTORIES` in `document_sync_service`. A directory the
 *  sync layer refuses to react to is not one worth writing a page about. */
const NOISE_DIRECTORIES = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  ".git",
  ".github",
  ".idea",
  ".vscode",
  "__pycache__",
  "coverage",
  "target",
  "venv",
  ".venv",
]);

type ModuleState =
  | { status: "waiting" }
  | { status: "writing" }
  | { status: "done"; documentId: string }
  | { status: "failed"; message: string };

interface Unit {
  name: string;
  path: string;
}

interface Props {
  workspaceId: string;
  repository: RepositoryChoice;
  branch: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called with the parent document's id once the run has finished, so the
   *  caller can navigate to the page the run produced. */
  onFinished?: (parentDocumentId: string) => void;
}

/**
 * "Document this whole repository" — for the customer who has no coding agent.
 *
 * Whole-repository generation belongs in the working tree, where the files
 * actually are, so the server-side fan-out was never built. That left a real
 * customer with nothing: somebody evaluating Aexy, with no agent wired up, who
 * wants to see their repository documented rather than write eleven pages by
 * hand.
 *
 * This is the fan-out, run from the browser. It costs the server nothing it did
 * not already do — each unit is one existing `from-repository` call — and it
 * gets three things the single-path generator could not:
 *
 *   * a scope screen, so the run is agreed to before it starts rather than
 *     discovered while it is happening;
 *   * one document per unit under a parent, so a later change to one
 *     directory revises one page instead of the world;
 *   * retry on the unit that failed, not the whole repository. Sequential
 *     for the same reason: a dozen concurrent model calls trip the per-minute
 *     rate limit, and then every unit fails instead of one.
 *
 * No cost estimate. A number here would have to be invented — modules differ by
 * an order of magnitude in size and the price depends on the model a workspace
 * is configured with — and an invented number people plan against is worse than
 * no number. It says how many documents and how many model calls, which are
 * both facts.
 */
export function RepositoryScopePanel({
  workspaceId,
  repository,
  branch,
  isOpen,
  onClose,
  onFinished,
}: Props) {
  const t = useTranslations("docs.scope");
  const queryClient = useQueryClient();

  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Record<string, ModuleState>>({});
  const [parentId, setParentId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"scope" | "running" | "finished">("scope");

  const { data: topLevel, isLoading: loadingTree, error: treeError } = useQuery({
    queryKey: ["repo-contents", repository.id, branch, ""],
    queryFn: () =>
      repositoriesApi.getContents(repository.id, { path: "", ref: branch }),
    enabled: isOpen,
  });

  const modules: Unit[] = useMemo(
    () =>
      (topLevel ?? [])
        .filter((entry) => entry.type === "dir")
        .filter((entry) => !NOISE_DIRECTORIES.has(entry.name))
        .filter((entry) => !entry.name.startsWith("."))
        .map((entry) => ({ name: entry.name, path: entry.path })),
    [topLevel]
  );

  const selected = useMemo(
    () => modules.filter((unit) => !skipped.has(unit.path)),
    [modules, skipped]
  );

  // One listing per unit, so the scope screen can say how big each one is
  // before anybody commits to it. Cheap — the repository contents endpoint is a
  // GitHub tree read, no model involved — and only while the panel is open.
  const { data: counts = {} } = useQuery({
    queryKey: ["repo-unit-counts", repository.id, branch, modules.map((m) => m.path)],
    enabled: isOpen && modules.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        modules.map(async (unit) => {
          try {
            const listing = await repositoriesApi.getContents(repository.id, {
              path: unit.path,
              ref: branch,
            });
            return [
              unit.path,
              {
                files: listing.filter((e) => e.type === "file").length,
                directories: listing.filter((e) => e.type === "dir").length,
              },
            ] as const;
          } catch {
            // A unit we cannot list is still a unit we can document — the
            // generator reads it server-side with its own credentials.
            return [unit.path, null] as const;
          }
        })
      );
      return Object.fromEntries(entries) as Record<
        string,
        { files: number; directories: number } | null
      >;
    },
  });

  useEffect(() => {
    if (!isOpen) {
      setSkipped(new Set());
      setStates({});
      setParentId(null);
      setPhase("scope");
    }
  }, [isOpen]);

  const writeModule = useCallback(
    async (unit: Unit, parent: string) => {
      setStates((current) => ({ ...current, [unit.path]: { status: "writing" } }));
      try {
        const result = await documentApi.createDocumentFromRepository(workspaceId, {
          repository_id: repository.id,
          path: unit.path,
          link_type: "directory",
          branch,
          title: unit.name,
          parent_id: parent,
        });
        setStates((current) => ({
          ...current,
          [unit.path]: { status: "done", documentId: result.document.id },
        }));
      } catch (error) {
        setStates((current) => ({
          ...current,
          [unit.path]: {
            status: "failed",
            message: getApiErrorMessage(error, t("moduleFailed")),
          },
        }));
      }
    },
    [branch, repository.id, t, workspaceId]
  );

  const start = useCallback(async () => {
    setPhase("running");
    let parent = parentId;
    try {
      if (!parent) {
        // The parent is an ordinary document, not a generated one: it is the
        // place the modules hang from, and its own prose is for a person to
        // write once they have read what the run produced.
        const created = await documentApi.create(workspaceId, {
          title: repository.name,
          icon: "📁",
        });
        parent = created.id;
        setParentId(parent);
      }
    } catch (error) {
      setPhase("scope");
      setStates((current) => ({
        ...current,
        __parent__: {
          status: "failed",
          message: getApiErrorMessage(error, t("parentFailed")),
        },
      }));
      return;
    }

    // Sequential on purpose. See the note on the component.
    for (const unit of selected) {
      if (states[unit.path]?.status === "done") continue;
      await writeModule(unit, parent);
    }

    queryClient.invalidateQueries({ queryKey: ["documents", "tree", workspaceId] });
    setPhase("finished");
    onFinished?.(parent);
  }, [
    onFinished,
    parentId,
    queryClient,
    repository.name,
    selected,
    states,
    t,
    workspaceId,
    writeModule,
  ]);

  if (!isOpen) return null;

  const failed = selected.filter(
    (unit) => states[unit.path]?.status === "failed"
  );
  const done = selected.filter((unit) => states[unit.path]?.status === "done");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div
        data-testid="repository-scope"
        className="relative flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">
              {t("heading", { repository: repository.name })}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loadingTree && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("reading")}
            </div>
          )}

          {treeError && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("treeFailed")}
            </p>
          )}

          {!loadingTree && !treeError && modules.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("noModules")}
            </p>
          )}

          {modules.length > 0 && (
            <ul data-testid="scope-modules" className="space-y-1">
              {modules.map((unit) => {
                const state = states[unit.path];
                const count = counts[unit.path];
                const isSkipped = skipped.has(unit.path);
                return (
                  <li
                    key={unit.path}
                    data-testid={`scope-module-${unit.name}`}
                    className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={!isSkipped}
                      disabled={phase !== "scope"}
                      aria-label={unit.name}
                      onChange={() =>
                        setSkipped((current) => {
                          const next = new Set(current);
                          if (next.has(unit.path)) next.delete(unit.path);
                          else next.add(unit.path);
                          return next;
                        })
                      }
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                      {unit.path}
                    </span>

                    {count && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t("moduleSize", {
                          files: count.files,
                          directories: count.directories,
                        })}
                      </span>
                    )}

                    {state?.status === "writing" && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    {state?.status === "done" && (
                      <Check
                        data-testid={`scope-done-${unit.name}`}
                        className="h-3.5 w-3.5 shrink-0 text-success"
                      />
                    )}
                    {state?.status === "failed" && (
                      <>
                        <span
                          title={state.message}
                          className="shrink-0 text-xs text-warning"
                        >
                          {t("failedShort")}
                        </span>
                        {/* The point of doing this unit by unit: one
                            failure is one retry, not a repeat of the eleven
                            modules that worked. */}
                        <button
                          type="button"
                          data-testid={`scope-retry-${unit.name}`}
                          disabled={phase === "running" || !parentId}
                          onClick={() => writeModule(unit, parentId!)}
                          className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          {t("retry")}
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {states.__parent__?.status === "failed" && (
            <p className="mt-3 text-xs text-warning">
              {(states.__parent__ as { message: string }).message}
            </p>
          )}
        </div>

        <div className="space-y-2 border-t border-border px-5 py-3">
          {/* Two facts, no invented third one. Withheld when there is nothing
              to write: "writes 0 documents" under a message saying the
              repository could not be read is noise on top of the real answer. */}
          {(phase === "finished" || selected.length > 0) && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              {phase === "finished"
                ? t("finished", { done: done.length, failed: failed.length })
                : t("willWrite", { count: selected.length })}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              {phase === "finished" ? t("closeDone") : t("cancel")}
            </button>
            {phase !== "finished" && (
              <button
                type="button"
                data-testid="scope-start"
                disabled={phase === "running" || selected.length === 0}
                onClick={start}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50"
              >
                {phase === "running" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {phase === "running" ? t("writing") : t("start")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
