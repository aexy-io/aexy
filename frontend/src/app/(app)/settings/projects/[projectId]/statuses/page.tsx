"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Clock, FolderKanban, Layers, Plus, RefreshCw, Shield, Workflow } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { useAuth } from "@/hooks/useAuth";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useProject } from "@/hooks/useProjects";
import { useTaskStatuses, useStatusCategories } from "@/hooks/useTaskConfig";
import { TaskStatusConfig, WorkspaceStatusCategory } from "@/lib/api";
import { SortableStatusItem } from "@/components/settings/SortableStatusItem";
import { StatusModal } from "@/components/settings/StatusModal";
import { DeleteStatusModal } from "@/components/settings/DeleteStatusModal";
import { CategoryModal } from "@/components/settings/CategoryModal";
import { SortableCategoryItem } from "@/components/settings/SortableCategoryItem";
import { useTranslations } from "next-intl";
import { SettingsPage } from "@/components/settings/SettingsPrimitives";

export default function ProjectStatusesPage() {
  const t = useTranslations("settingsProjects");
  const params = useParams();
  const projectId = params.projectId as string;

  const { user } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();
  const { members: workspaceMembers } = useWorkspaceMembers(currentWorkspaceId);
  const { project, isLoading: projectLoading } = useProject(currentWorkspaceId, projectId);

  const {
    statuses,
    isLoading: statusesLoading,
    createStatus,
    updateStatus,
    deleteStatus,
    reorderStatuses,
    cloneFromWorkspace,
    isUsingWorkspaceFallback,
    isCloning,
    isCreating,
    isUpdating,
    isDeleting,
  } = useTaskStatuses(currentWorkspaceId, projectId);

  const {
    categories: statusCategories,
    isLoading: categoriesLoading,
    createCategory,
    updateCategory,
    deleteCategory,
    isCreating: isCreatingCategory,
    isUpdating: isUpdatingCategory,
  } = useStatusCategories(currentWorkspaceId, projectId);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<WorkspaceStatusCategory | null>(null);
  const [editingStatus, setEditingStatus] = useState<TaskStatusConfig | null>(null);
  const [deletingStatus, setDeletingStatus] = useState<TaskStatusConfig | null>(null);

  const currentMember = workspaceMembers.find((m) => m.developer_id === user?.id);
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";
  const readOnly = isUsingWorkspaceFallback;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = statuses.findIndex((s) => s.id === active.id);
    const newIndex = statuses.findIndex((s) => s.id === over.id);
    const newOrder = arrayMove(statuses, oldIndex, newIndex);
    await reorderStatuses(newOrder.map((s) => s.id));
  };

  const handleSaveStatus = async (data: {
    name: string;
    category: string;
    color: string;
    icon?: string;
    is_default?: boolean;
  }) => {
    if (editingStatus) {
      await updateStatus({ statusId: editingStatus.id, data });
      toast.success("Status updated");
    } else {
      await createStatus(data);
      toast.success("Status created");
    }
    setEditingStatus(null);
  };

  const handleSaveCategory = async (data: {
    slug?: string;
    label: string;
    color: string;
    semantics: "open" | "active" | "done" | "cancelled";
  }) => {
    if (editingCategory) {
      await updateCategory({
        categoryId: editingCategory.id,
        data: {
          label: data.label,
          color: data.color,
          semantics: data.semantics,
        },
      });
      toast.success("Category updated");
    } else {
      await createCategory({
        slug: data.slug!,
        label: data.label,
        color: data.color,
        semantics: data.semantics,
      });
      toast.success("Category created");
    }
    setEditingCategory(null);
  };

  const handleDeleteCategory = async (cat: WorkspaceStatusCategory) => {
    const inUse = statuses.some((s) => s.category === cat.slug);
    if (inUse) {
      toast.error(
        `Can't delete "${cat.label}" — statuses still use it. Reassign them first.`,
      );
      return;
    }
    if (!confirm(`Delete category "${cat.label}"?`)) return;
    try {
      await deleteCategory(cat.id);
      toast.success("Category deleted");
    } catch (err) {
      const msg = getApiErrorMessage(err, "Failed to delete");
      toast.error(/category_in_use/i.test(msg)
        ? "This category is still in use by one or more statuses."
        : msg);
    }
  };

  const handleConfirmDelete = async (migrateTo: string | null) => {
    if (!deletingStatus) return;
    try {
      await deleteStatus({
        statusId: deletingStatus.id,
        migrateTo: migrateTo ?? undefined,
      });
      toast.success("Status deleted");
      setDeletingStatus(null);
    } catch (err) {
      const message = getApiErrorMessage(err, "Failed to delete status");
      toast.error(message);
    }
  };

  if (currentWorkspaceLoading || projectLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-5 w-64 bg-accent rounded" />
        <div className="h-10 w-72 bg-accent rounded-lg" />
        <div className="h-48 w-full bg-accent rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <FolderKanban className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-medium text-foreground mb-2">Project Not Found</h3>
          <Link
            href="/settings/projects"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SettingsPage
      title={project.name}
      description={t("statuses.subtitle")}
      width="wide"
      breadcrumbs={[
        { label: "Settings", href: "/settings" },
        { label: "Projects", href: "/settings/projects" },
        { label: project.name, href: `/settings/projects/${projectId}` },
        { label: "Statuses" },
      ]}
    >

      <div>
        <div className="flex gap-2 mb-8">
          <Link
            href={`/settings/projects/${projectId}`}
            className="px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg text-sm font-medium transition"
          >
            General
          </Link>
          <Link
            href={`/settings/projects/${projectId}/permissions`}
            className="px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <Shield className="h-4 w-4" />
            Permissions
          </Link>
          <Link
            href={`/settings/projects/${projectId}/statuses`}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Workflow className="h-4 w-4" />
            Statuses
          </Link>
        </div>

        {/* Categories section — the buckets statuses can belong to. Ships
            with six canonical buckets (backlog, todo, in_progress,
            in_review, done, cancelled) seeded per workspace; admins can
            rename, recolor, or add more. Burndown/velocity branches on
            semantics so renaming a slug is safe. */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-start gap-3">
              <Layers className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <h2 className="text-lg font-medium text-foreground">Categories</h2>
                <p className="text-muted-foreground text-sm">
                  Buckets that statuses belong to. Each carries a semantics
                  flag (Open / Active / Done / Cancelled) used for burndown.
                </p>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setEditingCategory(null);
                  setShowCategoryModal(true);
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent text-foreground rounded-lg transition text-sm"
              >
                <Plus className="h-4 w-4" />
                Add Category
              </button>
            )}
          </div>

          {categoriesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-card rounded-lg animate-pulse" />
              ))}
            </div>
          ) : statusCategories.length > 0 ? (
            <div className="space-y-2">
              {statusCategories.map((cat) => (
                <SortableCategoryItem
                  key={cat.id}
                  category={cat}
                  isAdmin={isAdmin}
                  onEdit={(c) => {
                    setEditingCategory(c);
                    setShowCategoryModal(true);
                  }}
                  onDelete={handleDeleteCategory}
                />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-xl p-8 text-center text-sm text-muted-foreground">
              No categories yet — they&apos;ll seed automatically when you save your first status.
            </div>
          )}
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">Task Statuses</h2>
            <p className="text-muted-foreground text-sm">
              {readOnly
                ? "This project uses the workspace defaults. Customize to give the project its own workflow."
                : "Define this project's workflow columns. Drag to reorder."}
            </p>
          </div>
          {isAdmin && !readOnly && (
            <button
              onClick={() => {
                setEditingStatus(null);
                setShowStatusModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm"
            >
              <Plus className="h-4 w-4" />
              Add Status
            </button>
          )}
        </div>

        {/* Fallback CTA */}
        {readOnly && isAdmin && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary-500/30 bg-primary-500/5 p-4">
            <AlertCircle className="h-5 w-5 text-primary-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-foreground">
                Using workspace defaults
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Customizing here forks the workspace statuses into a
                project-scoped copy. Other projects keep using the workspace
                defaults; future workspace edits won&apos;t reach this project.
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  await cloneFromWorkspace();
                  toast.success("Statuses copied to project");
                } catch (err) {
                  console.error(err);
                  toast.error("Failed to copy statuses");
                }
              }}
              disabled={isCloning}
              className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-md text-sm whitespace-nowrap flex items-center gap-2"
            >
              {isCloning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Copying…
                </>
              ) : (
                "Customize for this project"
              )}
            </button>
          </div>
        )}

        {/* Status list */}
        {statusesLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-card rounded-lg animate-pulse" />
            ))}
          </div>
        ) : statuses.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={statuses.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {statuses.map((status) => (
                  <SortableStatusItem
                    key={status.id}
                    status={status}
                    isAdmin={isAdmin}
                    onEdit={(s) => {
                      setEditingStatus(s);
                      setShowStatusModal(true);
                    }}
                    onDelete={(statusId) => {
                      const target = statuses.find((s) => s.id === statusId) ?? null;
                      setDeletingStatus(target);
                    }}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="bg-card rounded-xl p-12 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Statuses</h3>
            <p className="text-muted-foreground">
              Add the project&apos;s first status to define its workflow.
            </p>
          </div>
        )}
      </div>

      {showStatusModal && (
        <StatusModal
          status={editingStatus}
          categories={statusCategories}
          onClose={() => {
            setShowStatusModal(false);
            setEditingStatus(null);
          }}
          onSave={handleSaveStatus}
          isSaving={isCreating || isUpdating}
        />
      )}

      {showCategoryModal && (
        <CategoryModal
          category={editingCategory}
          onClose={() => {
            setShowCategoryModal(false);
            setEditingCategory(null);
          }}
          onSave={handleSaveCategory}
          isSaving={isCreatingCategory || isUpdatingCategory}
        />
      )}

      {deletingStatus && currentWorkspaceId && (
        <DeleteStatusModal
          workspaceId={currentWorkspaceId}
          status={deletingStatus}
          candidates={statuses}
          onClose={() => setDeletingStatus(null)}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
        />
      )}
    </SettingsPage>
  );
}
