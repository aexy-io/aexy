"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  type SmartView,
  type SmartViewFilter,
  type DriveFileKind,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  useCreateSmartView,
  useDeleteSmartView,
  useUpdateSmartView,
} from "@/hooks/useDrive";

interface Props {
  workspaceId: string | null;
  view?: SmartView | null;        // pass to edit; omit to create
  onClose: () => void;
}

const KINDS: DriveFileKind[] = ["file", "image", "video", "audio", "pdf", "doc"];

export function SmartViewEditor({ workspaceId, view, onClose }: Props) {
  const t = useTranslations("drive.smartView");
  const create = useCreateSmartView(workspaceId);
  const update = useUpdateSmartView(workspaceId);
  const remove = useDeleteSmartView(workspaceId);

  const [name, setName] = useState(view?.name ?? "");
  const [allTags, setAllTags] = useState<string[]>(
    view?.filter_query.all_tags ?? [],
  );
  const [anyTags, setAnyTags] = useState<string[]>(
    view?.filter_query.any_tags ?? [],
  );
  const [anyCategories, setAnyCategories] = useState<string[]>(
    view?.filter_query.any_categories ?? [],
  );
  const [kind, setKind] = useState<DriveFileKind | "">(
    (view?.filter_query.kind as DriveFileKind) ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(t("errorNameRequired"));
      return;
    }
    const filter_query: SmartViewFilter = {};
    if (allTags.length) filter_query.all_tags = allTags;
    if (anyTags.length) filter_query.any_tags = anyTags;
    if (anyCategories.length) filter_query.any_categories = anyCategories;
    if (kind) filter_query.kind = kind as DriveFileKind;

    try {
      if (view) {
        await update.mutateAsync({
          viewId: view.id,
          patch: { name: name.trim(), filter_query },
        });
      } else {
        await create.mutateAsync({ name: name.trim(), filter_query });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorSaveFailed"));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="smart-view-editor"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-muted p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            {view ? t("editTitle") : t("newTitle")}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <Field label={t("fieldName")}>
            <input
              data-testid="smart-view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-foreground"
            />
          </Field>
          <TagListField
            label={t("fieldAllTags")}
            tags={allTags}
            setTags={setAllTags}
            testId="smart-view-all-tags"
          />
          <TagListField
            label={t("fieldAnyTags")}
            tags={anyTags}
            setTags={setAnyTags}
            testId="smart-view-any-tags"
          />
          <TagListField
            label={t("fieldAnyCategories")}
            tags={anyCategories}
            setTags={setAnyCategories}
            testId="smart-view-any-categories"
          />
          <Field label={t("fieldKind")}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as DriveFileKind | "")}
              className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-foreground"
            >
              <option value="">{t("anyKind")}</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="mt-5 flex items-center justify-between">
          {view ? (
            <button
              onClick={async () => {
                await remove.mutateAsync(view.id);
                onClose();
              }}
              className="text-xs text-red-400 hover:underline"
            >
              {t("delete")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleSubmit}
              disabled={create.isPending || update.isPending}
              data-testid="smart-view-save"
              className="rounded-md bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {view ? t("save") : t("create")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function TagListField({
  label,
  tags,
  setTags,
  testId,
}: {
  label: string;
  tags: string[];
  setTags: (t: string[]) => void;
  testId: string;
}) {
  const t = useTranslations("drive.smartView");
  const [draft, setDraft] = useState("");
  return (
    <div data-testid={testId}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-primary-500/15 px-2 py-0.5 text-xs text-primary-300"
          >
            {tag}
            <button
              onClick={() => setTags(tags.filter((x) => x !== tag))}
              className="hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
              e.preventDefault();
              const next = draft.trim().toLowerCase();
              if (!tags.includes(next)) setTags([...tags, next]);
              setDraft("");
            }
          }}
          placeholder={t("tagInputPlaceholder")}
          className={cn(
            "min-w-[8rem] flex-1 bg-transparent text-xs text-foreground outline-none",
          )}
        />
      </div>
    </div>
  );
}
