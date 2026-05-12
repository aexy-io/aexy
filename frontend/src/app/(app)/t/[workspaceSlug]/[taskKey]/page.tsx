"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface TaskLinkResolution {
  task_id: string;
  workspace_id: string;
  workspace_slug: string;
  task_key: number;
  sprint_id: string | null;
  team_id: string | null;
  project_id: string | null;
  is_archived: boolean;
}

interface PageProps {
  params: Promise<{ workspaceSlug: string; taskKey: string }>;
}

export default function TaskShortLinkPage({ params }: PageProps) {
  const router = useRouter();
  const { workspaceSlug, taskKey } = use(params);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        const { data } = await api.get<TaskLinkResolution>(
          `/tasks/by-key/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(taskKey)}`
        );
        if (cancelled) return;

        // Prefer sprint board if the task is on a sprint and we know the project.
        // Fallback to the project backlog when there's no sprint. Final fallback
        // is the workspace dashboard since we can't render a usable destination.
        let url: string;
        if (data.project_id && data.sprint_id) {
          url = `/sprints/${data.project_id}/${data.sprint_id}?task=${data.task_id}`;
        } else if (data.project_id) {
          url = `/sprints/${data.project_id}/backlog?task=${data.task_id}`;
        } else {
          url = `/dashboard?task=${data.task_id}`;
        }
        router.replace(url);
      } catch (err: any) {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 404) {
          setError(`No task found for [${workspaceSlug}:${taskKey}].`);
        } else if (status === 403) {
          setError("You don't have access to this task.");
        } else {
          setError("Could not open this task link.");
        }
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, taskKey, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
        {error ? (
          <>
            <AlertCircle className="mx-auto h-8 w-8 text-rose-400 mb-3" />
            <p className="text-white/85 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="mt-5 inline-flex items-center px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80 hover:text-white hover:bg-white/[0.04] transition"
            >
              Back to dashboard
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-6 w-6 text-white/60 animate-spin mb-3" />
            <p className="text-white/65 text-sm font-mono">
              Opening [{workspaceSlug}:{taskKey}]…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
