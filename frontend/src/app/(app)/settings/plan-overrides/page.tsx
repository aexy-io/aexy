"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Settings2,
  Plus,
  Trash2,
  Eye,
  Loader2,
  Building2,
  Percent,
  Save,
} from "lucide-react";
import { api } from "@/lib/api";

interface PlanOverride {
  id: string;
  workspace_id: string;
  billing_model: string | null;
  price_monthly_cents: number | null;
  base_fee_monthly_cents: number | null;
  per_seat_price_monthly_cents: number | null;
  max_repos: number | null;
  llm_requests_per_day: number | null;
  free_llm_tokens_per_month: number | null;
  discount_percent: number | null;
  discount_description: string | null;
  notes: string | null;
  configured_by: string | null;
  created_at: string;
  updated_at: string;
}

// API helpers
const adminApi = {
  listOverrides: async (): Promise<PlanOverride[]> => {
    const response = await api.get("/platform-admin/plan-overrides");
    return response.data;
  },
  getOverride: async (workspaceId: string): Promise<PlanOverride> => {
    const response = await api.get(
      `/platform-admin/workspaces/${workspaceId}/plan-override`
    );
    return response.data;
  },
  createOrUpdateOverride: async (
    workspaceId: string,
    data: Record<string, any>
  ): Promise<PlanOverride> => {
    const response = await api.post(
      `/platform-admin/workspaces/${workspaceId}/plan-override`,
      data
    );
    return response.data;
  },
  deleteOverride: async (workspaceId: string): Promise<void> => {
    await api.delete(
      `/platform-admin/workspaces/${workspaceId}/plan-override`
    );
  },
  getEffectivePlan: async (workspaceId: string): Promise<any> => {
    const response = await api.get(
      `/platform-admin/workspaces/${workspaceId}/effective-plan`
    );
    return response.data;
  },
};

export default function PlanOverridesPage() {
  const queryClient = useQueryClient();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [editingOverride, setEditingOverride] =
    useState<Record<string, any> | null>(null);
  const [previewWorkspaceId, setPreviewWorkspaceId] = useState<string | null>(
    null
  );

  const {
    data: overrides,
    isLoading,
    error,
  } = useQuery<PlanOverride[]>({
    queryKey: ["plan-overrides"],
    queryFn: adminApi.listOverrides,
    retry: 1,
  });

  const { data: effectivePlan, isLoading: previewLoading } = useQuery({
    queryKey: ["effective-plan", previewWorkspaceId],
    queryFn: () => adminApi.getEffectivePlan(previewWorkspaceId!),
    enabled: !!previewWorkspaceId,
  });

  const saveMutation = useMutation({
    mutationFn: ({
      workspaceId,
      data,
    }: {
      workspaceId: string;
      data: Record<string, any>;
    }) => adminApi.createOrUpdateOverride(workspaceId, data),
    onSuccess: () => {
      toast.success("Plan override saved");
      queryClient.invalidateQueries({ queryKey: ["plan-overrides"] });
      setEditingOverride(null);
      setSelectedWorkspaceId("");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to save override"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (workspaceId: string) => adminApi.deleteOverride(workspaceId),
    onSuccess: () => {
      toast.success("Override removed");
      queryClient.invalidateQueries({ queryKey: ["plan-overrides"] });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete override"
      );
    },
  });

  const handleSave = () => {
    if (!selectedWorkspaceId || !editingOverride) return;
    // Filter out null/empty values
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(editingOverride)) {
      if (value !== null && value !== "" && value !== undefined) {
        cleaned[key] = value;
      }
    }
    saveMutation.mutate({ workspaceId: selectedWorkspaceId, data: cleaned });
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Plan Overrides
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Platform admin access required
          </p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-400">
          You don&apos;t have permission to access this page. Only platform
          admins can manage plan overrides.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Plan Overrides
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure custom pricing, limits, and billing models per workspace
        </p>
      </div>

      {/* Create Override */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create or Update Override
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Workspace ID
            </label>
            <input
              type="text"
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              placeholder="Enter workspace UUID"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Billing Model
              </label>
              <select
                value={editingOverride?.billing_model || ""}
                onChange={(e) =>
                  setEditingOverride((prev) => ({
                    ...prev,
                    billing_model: e.target.value || null,
                  }))
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
              >
                <option value="">Default (no override)</option>
                <option value="free">Free</option>
                <option value="per_seat">Per Seat</option>
                <option value="flat_plus_usage">Flat + Usage</option>
                <option value="postpaid">Postpaid</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Per Seat Price (cents)
              </label>
              <input
                type="number"
                value={editingOverride?.per_seat_price_monthly_cents ?? ""}
                onChange={(e) =>
                  setEditingOverride((prev) => ({
                    ...prev,
                    per_seat_price_monthly_cents: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  }))
                }
                placeholder="e.g. 2900"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Base Fee (cents)
              </label>
              <input
                type="number"
                value={editingOverride?.base_fee_monthly_cents ?? ""}
                onChange={(e) =>
                  setEditingOverride((prev) => ({
                    ...prev,
                    base_fee_monthly_cents: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  }))
                }
                placeholder="e.g. 4900"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Max Repos
              </label>
              <input
                type="number"
                value={editingOverride?.max_repos ?? ""}
                onChange={(e) =>
                  setEditingOverride((prev) => ({
                    ...prev,
                    max_repos: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  }))
                }
                placeholder="-1 = unlimited"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                LLM Req/Day
              </label>
              <input
                type="number"
                value={editingOverride?.llm_requests_per_day ?? ""}
                onChange={(e) =>
                  setEditingOverride((prev) => ({
                    ...prev,
                    llm_requests_per_day: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  }))
                }
                placeholder="-1 = unlimited"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Discount %
              </label>
              <input
                type="number"
                value={editingOverride?.discount_percent ?? ""}
                onChange={(e) =>
                  setEditingOverride((prev) => ({
                    ...prev,
                    discount_percent: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  }))
                }
                placeholder="e.g. 20"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Notes
            </label>
            <input
              type="text"
              value={editingOverride?.notes ?? ""}
              onChange={(e) =>
                setEditingOverride((prev) => ({
                  ...prev,
                  notes: e.target.value || null,
                }))
              }
              placeholder="Internal notes about this override"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={
                !selectedWorkspaceId ||
                !editingOverride ||
                saveMutation.isPending
              }
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 flex items-center gap-2"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Override
            </button>
            {selectedWorkspaceId && (
              <button
                onClick={() => setPreviewWorkspaceId(selectedWorkspaceId)}
                className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-lg transition flex items-center gap-2"
              >
                <Eye className="h-4 w-4" />
                Preview Effective Plan
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Effective Plan Preview */}
      {previewWorkspaceId && effectivePlan && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Effective Plan Preview
          </h2>
          {previewLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <pre className="text-xs text-muted-foreground bg-background rounded-lg p-3 overflow-auto max-h-64">
              {JSON.stringify(effectivePlan, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Existing Overrides */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Active Overrides
        </h2>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading overrides...
          </div>
        ) : !overrides?.length ? (
          <p className="text-sm text-muted-foreground">
            No custom plan overrides configured yet.
          </p>
        ) : (
          <div className="space-y-3">
            {overrides.map((override) => (
              <div
                key={override.id}
                className="flex items-center justify-between p-3 bg-background border border-border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">
                      {override.workspace_id.slice(0, 8)}...
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {override.billing_model && (
                        <span className="px-1.5 py-0.5 bg-primary-500/10 text-primary-400 rounded">
                          {override.billing_model}
                        </span>
                      )}
                      {override.discount_percent && (
                        <span className="flex items-center gap-0.5">
                          <Percent className="h-3 w-3" />
                          {override.discount_percent}% off
                        </span>
                      )}
                      {override.notes && (
                        <span className="truncate max-w-48">
                          {override.notes}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setPreviewWorkspaceId(override.workspace_id)
                    }
                    className="p-1.5 text-muted-foreground hover:text-foreground transition"
                    title="Preview effective plan"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      deleteMutation.mutate(override.workspace_id)
                    }
                    className="p-1.5 text-muted-foreground hover:text-red-400 transition"
                    title="Remove override"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
