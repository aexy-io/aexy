"use client";

import { useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCRMObjects } from "@/hooks/useCRM";
import { usePipelines } from "@/hooks/usePipelines";
import { PipelineAnalytics } from "@/components/crm/PipelineAnalytics";

export default function PipelineAnalyticsPage() {
  const router = useRouter();
  const params = useParams();
  const objectSlug = params.objectSlug as string;

  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { objects } = useCRMObjects(workspaceId);
  const currentObject = objects.find((o) => o.slug === objectSlug);

  const { pipelines, isLoading } = usePipelines(workspaceId, currentObject?.id || null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activePipeline = useMemo(() => {
    if (!pipelines.length) return null;
    return (
      pipelines.find((p) => p.id === activeId) ||
      pipelines.find((p) => p.is_default) ||
      pipelines[0]
    );
  }, [pipelines, activeId]);

  return (
    <div>
      <div className="px-8 pt-6 pb-4 border-b border-border">
        <button
          onClick={() => router.push(`/crm/${objectSlug}`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {currentObject?.plural_name || "records"}
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-foreground">Pipeline analytics</h1>
          {pipelines.length > 0 && activePipeline && (
            <select
              value={activePipeline.id}
              onChange={(e) => setActiveId(e.target.value)}
              className="h-9 rounded-md border border-border/40 bg-background px-3 text-sm font-medium"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="px-8 py-6">
        {isLoading ? (
          <div className="h-64 animate-pulse bg-accent/40 rounded-lg" />
        ) : !activePipeline || !workspaceId ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
            <p>No pipeline configured for this object.</p>
            <button
              onClick={() => router.push(`/crm/${objectSlug}`)}
              className="text-purple-400 hover:text-purple-300"
            >
              Go to the board to create one
            </button>
          </div>
        ) : (
          <PipelineAnalytics workspaceId={workspaceId} pipeline={activePipeline} />
        )}
      </div>
    </div>
  );
}
