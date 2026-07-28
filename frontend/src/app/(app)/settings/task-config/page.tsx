"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  Clock,
  Edit2,
  GripVertical,
  Hash,
  Link as LinkIcon,
  List,
  MoreVertical,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Type,
  Calendar,
  ListChecks,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useTaskStatuses, useStatusCategories, useCustomFields } from "@/hooks/useTaskConfig";
import { useProjects } from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";
import { DeleteStatusModal } from "@/components/settings/DeleteStatusModal";
import { SortableStatusItem } from "@/components/settings/SortableStatusItem";
import { StatusModal } from "@/components/settings/StatusModal";
import { TaskStatusConfig, CustomField, StatusCategory, CustomFieldType, CustomFieldOption } from "@/lib/api";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type TabType = "statuses" | "fields";

const STATUS_CATEGORIES: { value: StatusCategory; label: string; color: string }[] = [
  { value: "todo", label: "To Do", color: "bg-blue-500" },
  { value: "in_progress", label: "In Progress", color: "bg-yellow-500" },
  { value: "done", label: "Done", color: "bg-green-500" },
];

const FIELD_TYPES: { value: CustomFieldType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "text", label: "Text", icon: <Type className="h-4 w-4" />, description: "Single line text" },
  { value: "number", label: "Number", icon: <Hash className="h-4 w-4" />, description: "Numeric value" },
  { value: "select", label: "Select", icon: <ChevronDown className="h-4 w-4" />, description: "Single choice dropdown" },
  { value: "multiselect", label: "Multi-select", icon: <ListChecks className="h-4 w-4" />, description: "Multiple choices" },
  { value: "date", label: "Date", icon: <Calendar className="h-4 w-4" />, description: "Date picker" },
  { value: "url", label: "URL", icon: <LinkIcon className="h-4 w-4" />, description: "Web link" },
];

const PRESET_COLORS = [
  "#6B7280", "#EF4444", "#F59E0B", "#10B981", "#3B82F6",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#6366F1",
];

function getCategoryBadgeColor(category: StatusCategory) {
  switch (category) {
    case "todo":
      return "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";
    case "in_progress":
      return "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "done":
      return "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getFieldTypeIcon(type: CustomFieldType) {
  const fieldType = FIELD_TYPES.find((f) => f.value === type);
  return fieldType?.icon || <Type className="h-4 w-4" />;
}

// Sortable Field Item
interface SortableFieldItemProps {
  field: CustomField;
  isAdmin: boolean;
  onEdit: (field: CustomField) => void;
  onDelete: (fieldId: string) => void;
}

function SortableFieldItem({ field, isAdmin, onEdit, onDelete }: SortableFieldItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card rounded-lg p-3 flex items-center gap-3"
    >
      {isAdmin && (
        <button
          {...attributes}
          {...listeners}
          className="p-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
        {getFieldTypeIcon(field.field_type)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-foreground font-medium">{field.name}</span>
          <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
            {field.field_type}
          </span>
          {field.is_required && (
            <span className="px-2 py-0.5 rounded text-xs bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              Required
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-xs">slug: {field.slug}</p>
      </div>
      {isAdmin && (
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-36 bg-muted rounded-lg shadow-xl z-20 py-1">
                <button
                  onClick={() => {
                    onEdit(field);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    onDelete(field.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-accent flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Custom Field Modal
interface FieldModalProps {
  field: CustomField | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    field_type: CustomFieldType;
    options?: CustomFieldOption[];
    is_required?: boolean;
    default_value?: string;
  }) => Promise<void>;
  isSaving: boolean;
}

function FieldModal({ field, onClose, onSave, isSaving }: FieldModalProps) {
  const [name, setName] = useState(field?.name || "");
  const [fieldType, setFieldType] = useState<CustomFieldType>(field?.field_type || "text");
  const [isRequired, setIsRequired] = useState(field?.is_required || false);
  const [defaultValue, setDefaultValue] = useState(field?.default_value || "");
  const [options, setOptions] = useState<CustomFieldOption[]>(field?.options || []);
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const needsOptions = fieldType === "select" || fieldType === "multiselect";

  const handleAddOption = () => {
    if (!newOptionLabel.trim()) return;
    const slug = newOptionLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    setOptions([...options, { value: slug, label: newOptionLabel.trim() }]);
    setNewOptionLabel("");
  };

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Field name is required");
      return;
    }

    if (needsOptions && options.length === 0) {
      setError("At least one option is required for select fields");
      return;
    }

    try {
      await onSave({
        name: name.trim(),
        field_type: fieldType,
        options: needsOptions ? options : undefined,
        is_required: isRequired,
        default_value: defaultValue || undefined,
      });
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to save field"));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold text-foreground mb-4">
          {field ? "Edit Field" : "Create Field"}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sprint Goal"
                className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
              />
            </div>

            {!field && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Field Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {FIELD_TYPES.map((ft) => (
                    <button
                      key={ft.value}
                      type="button"
                      onClick={() => setFieldType(ft.value)}
                      className={`p-2 rounded-lg border text-left transition ${
                        fieldType === ft.value
                          ? "border-primary-500 bg-primary-900/20"
                          : "border-border hover:border-border"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-muted-foreground">{ft.icon}</span>
                        <span className="text-foreground text-sm font-medium">{ft.label}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">{ft.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {needsOptions && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Options</label>
                <div className="space-y-2">
                  {options.map((opt, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => {
                          const newOptions = [...options];
                          newOptions[index] = { ...opt, label: e.target.value };
                          setOptions(newOptions);
                        }}
                        className="flex-1 px-3 py-1.5 bg-muted border border-border rounded text-foreground text-sm focus:outline-none focus:border-primary-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(index)}
                        className="p-1.5 text-muted-foreground hover:text-red-400 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newOptionLabel}
                      onChange={(e) => setNewOptionLabel(e.target.value)}
                      placeholder="Add option..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddOption();
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-muted border border-border rounded text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-primary-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="p-1.5 text-muted-foreground hover:text-primary-400 transition"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!needsOptions && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Default Value (optional)</label>
                <input
                  type={fieldType === "number" ? "number" : fieldType === "date" ? "date" : "text"}
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                  placeholder="Enter default value..."
                  className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="w-4 h-4 rounded border-border bg-muted text-primary-500 focus:ring-primary-500"
              />
              <span className="text-foreground text-sm">Required field</span>
            </label>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Save
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TaskConfigPage() {
  const { user } = useAuth();
  const {
    currentWorkspace,
    currentWorkspaceId,
    currentWorkspaceLoading,
    hasWorkspaces,
  } = useWorkspace();
  const { members: workspaceMembers } = useWorkspaceMembers(currentWorkspaceId);
  const { projects } = useProjects(currentWorkspaceId);

  // Project picker for the Statuses tab. `null` = workspace defaults
  // (legacy behavior); a project id = that project's status set, with the
  // backend falling back to workspace defaults until the admin customizes.
  // Hydrate from `?project=<id>` so deep links from the project board land
  // pre-scoped to the right project.
  const searchParams = useSearchParams();
  const initialProjectFromUrl = searchParams.get("project");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProjectFromUrl,
  );

  // If the projects list arrives after mount and the URL-supplied id matches
  // a real project, keep the selection. If it doesn't match, clear so the
  // dropdown doesn't sit on a dangling value.
  useEffect(() => {
    if (initialProjectFromUrl && projects.length > 0) {
      const exists = projects.some((p) => p.id === initialProjectFromUrl);
      if (!exists) setSelectedProjectId(null);
    }
    // We only react to the projects list resolving — the URL param is
    // captured once via initial state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

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
    isCreating: isCreatingStatus,
    isUpdating: isUpdatingStatus,
    isDeleting: isDeletingStatus,
  } = useTaskStatuses(currentWorkspaceId, selectedProjectId);

  const { categories: statusCategories } = useStatusCategories(
    currentWorkspaceId,
    selectedProjectId,
  );

  const {
    fields,
    isLoading: fieldsLoading,
    createField,
    updateField,
    deleteField,
    reorderFields,
    isCreating: isCreatingField,
    isUpdating: isUpdatingField,
  } = useCustomFields(currentWorkspaceId);

  const [activeTab, setActiveTab] = useState<TabType>("statuses");
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState<TaskStatusConfig | null>(null);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  // The status the operator clicked Delete on — drives the confirm modal.
  const [deletingStatus, setDeletingStatus] = useState<TaskStatusConfig | null>(null);

  const currentMember = workspaceMembers.find((m) => m.developer_id === user?.id);
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleStatusDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = statuses.findIndex((s) => s.id === active.id);
    const newIndex = statuses.findIndex((s) => s.id === over.id);

    const newOrder = arrayMove(statuses, oldIndex, newIndex);
    await reorderStatuses(newOrder.map((s) => s.id));
  };

  const handleFieldDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);

    const newOrder = arrayMove(fields, oldIndex, newIndex);
    await reorderFields(newOrder.map((f) => f.id));
  };

  const handleDeleteStatus = (statusId: string) => {
    const target = statuses.find((s) => s.id === statusId) ?? null;
    setDeletingStatus(target);
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
    } catch (error) {
      console.error("Failed to delete status:", error);
      const message = getApiErrorMessage(error, "Failed to delete status");
      toast.error(message);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (confirm("Are you sure you want to delete this field? Field data will be removed from all tasks.")) {
      try {
        await deleteField(fieldId);
        toast.success("Field deleted");
      } catch (error) {
        console.error("Failed to delete field:", error);
        toast.error("Failed to delete field");
      }
    }
  };

  const handleSaveStatus = async (data: {
    name: string;
    category: StatusCategory;
    color: string;
    icon?: string;
    is_default?: boolean;
  }) => {
    if (editingStatus) {
      await updateStatus({ statusId: editingStatus.id, data });
    } else {
      await createStatus(data);
    }
  };

  const handleSaveField = async (data: {
    name: string;
    field_type: CustomFieldType;
    options?: CustomFieldOption[];
    is_required?: boolean;
    default_value?: string;
  }) => {
    if (editingField) {
      await updateField({
        fieldId: editingField.id,
        data: {
          name: data.name,
          options: data.options,
          is_required: data.is_required,
          default_value: data.default_value,
        },
      });
    } else {
      await createField(data);
    }
  };

  const isLoading = currentWorkspaceLoading || statusesLoading || fieldsLoading;

  if (isLoading) {
    return (
      <div className="py-20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-foreground">Loading task configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Task Configuration</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure custom statuses and fields for sprint tasks</p>
      </div>

      <div>
        {!hasWorkspaces ? (
          <div className="bg-card rounded-xl p-12 text-center">
            <List className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium text-foreground mb-2">No Workspace</h3>
            <p className="text-muted-foreground mb-6">
              Create a workspace first to configure task settings.
            </p>
            <Link
              href="/settings/organization"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
            >
              Go to Organization Settings
            </Link>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-card p-1 rounded-lg w-fit mb-6">
              <button
                onClick={() => setActiveTab("statuses")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                  activeTab === "statuses"
                    ? "bg-primary-600 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Statuses
                </span>
              </button>
              <button
                onClick={() => setActiveTab("fields")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                  activeTab === "fields"
                    ? "bg-primary-600 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-2">
                  <List className="h-4 w-4" />
                  Custom Fields
                </span>
              </button>
            </div>

            {/* Statuses Tab */}
            {activeTab === "statuses" && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-medium text-foreground">Task Statuses</h2>
                    <p className="text-muted-foreground text-sm">
                      Define the workflow statuses for tasks. Drag to reorder.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Scope picker — workspace defaults vs. per-project. The
                        scope drives which rows the rest of this tab edits. */}
                    {projects.length > 0 && (
                      <select
                        value={selectedProjectId ?? ""}
                        onChange={(e) =>
                          setSelectedProjectId(e.target.value || null)
                        }
                        className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                        aria-label="Status scope"
                      >
                        <option value="">Workspace defaults</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {isAdmin && (
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
                </div>

                {/* Per-project mode + fallback: prompt the admin to clone the
                    workspace defaults into the project before customizing. */}
                {selectedProjectId && isUsingWorkspaceFallback && isAdmin && (
                  <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary-500/30 bg-primary-500/5 p-4">
                    <AlertCircle className="h-5 w-5 text-primary-400 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-foreground">
                        This project uses the workspace defaults
                      </h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Customizing here will fork the workspace statuses into a
                        project-scoped copy. Other projects keep using the
                        workspace defaults.
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
                      className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-md text-sm whitespace-nowrap"
                    >
                      {isCloning ? "Copying…" : "Customize for this project"}
                    </button>
                  </div>
                )}

                {statuses.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleStatusDragEnd}
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
                            onDelete={handleDeleteStatus}
                            readOnly={
                              !!selectedProjectId && isUsingWorkspaceFallback
                            }
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="bg-card rounded-xl p-12 text-center">
                    <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Statuses</h3>
                    <p className="text-muted-foreground mb-4">
                      Create your first status to define your task workflow.
                    </p>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setEditingStatus(null);
                          setShowStatusModal(true);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
                      >
                        <Plus className="h-4 w-4" />
                        Add Status
                      </button>
                    )}
                  </div>
                )}

                {/* Category Legend */}
                <div className="mt-6 p-4 bg-card/50 rounded-lg">
                  <h4 className="text-sm font-medium text-foreground mb-2">Status Categories</h4>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {STATUS_CATEGORIES.map((cat) => (
                      <div key={cat.value} className="flex items-center gap-2">
                        <div className={`w-3 h-3 ${cat.color} rounded-full`} />
                        <span className="text-muted-foreground">{cat.label}</span>
                        <span className="text-muted-foreground">-</span>
                        <span className="text-muted-foreground">
                          {cat.value === "todo" && "Not started tasks"}
                          {cat.value === "in_progress" && "Active work in progress"}
                          {cat.value === "done" && "Completed tasks"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Custom Fields Tab */}
            {activeTab === "fields" && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-medium text-foreground">Custom Fields</h2>
                    <p className="text-muted-foreground text-sm">
                      Add custom metadata fields to your tasks. Drag to reorder.
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setEditingField(null);
                        setShowFieldModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm"
                    >
                      <Plus className="h-4 w-4" />
                      Add Field
                    </button>
                  )}
                </div>

                {fields.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleFieldDragEnd}
                  >
                    <SortableContext
                      items={fields.map((f) => f.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {fields.map((field) => (
                          <SortableFieldItem
                            key={field.id}
                            field={field}
                            isAdmin={isAdmin}
                            onEdit={(f) => {
                              setEditingField(f);
                              setShowFieldModal(true);
                            }}
                            onDelete={handleDeleteField}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="bg-card rounded-xl p-12 text-center">
                    <List className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Custom Fields</h3>
                    <p className="text-muted-foreground mb-4">
                      Create custom fields to add extra metadata to your tasks.
                    </p>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setEditingField(null);
                          setShowFieldModal(true);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
                      >
                        <Plus className="h-4 w-4" />
                        Add Field
                      </button>
                    )}
                  </div>
                )}

                {/* Field Types Legend */}
                <div className="mt-6 p-4 bg-card/50 rounded-lg">
                  <h4 className="text-sm font-medium text-foreground mb-2">Available Field Types</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {FIELD_TYPES.map((ft) => (
                      <div key={ft.value} className="flex items-center gap-2">
                        <span className="text-muted-foreground">{ft.icon}</span>
                        <span className="text-foreground">{ft.label}</span>
                        <span className="text-muted-foreground">- {ft.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showStatusModal && (
        <StatusModal
          status={editingStatus}
          categories={statusCategories}
          onClose={() => {
            setShowStatusModal(false);
            setEditingStatus(null);
          }}
          onSave={handleSaveStatus}
          isSaving={isCreatingStatus || isUpdatingStatus}
        />
      )}

      {showFieldModal && (
        <FieldModal
          field={editingField}
          onClose={() => {
            setShowFieldModal(false);
            setEditingField(null);
          }}
          onSave={handleSaveField}
          isSaving={isCreatingField || isUpdatingField}
        />
      )}

      {deletingStatus && currentWorkspaceId && (
        <DeleteStatusModal
          workspaceId={currentWorkspaceId}
          status={deletingStatus}
          candidates={statuses}
          onClose={() => setDeletingStatus(null)}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeletingStatus}
        />
      )}
    </div>
  );
}
