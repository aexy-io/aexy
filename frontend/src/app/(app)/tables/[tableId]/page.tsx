"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Plus,
  ChevronLeft,
  Trash2,
  Table2,
  Settings,
  Share2,
  History,
  X,
  Columns,
  Loader2,
  Star,
} from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import {
  useTables,
  useTableFields,
  useTableRecords,
  useTableAccess,
  useSavedViews,
  useTableCollaborators,
  useTableShareLinks,
} from "@/hooks/useTables";
import { useTeams } from "@/hooks/useTeams";
import { useRoles } from "@/hooks/useRoles";
import { DataTable } from "@/components/crm/DataTable";
import { ViewSwitcher, ViewMode } from "@/components/crm/ViewSwitcher";
import { SavedViewSwitcher } from "@/components/crm/SavedViewSwitcher";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { ColumnVisibilityMenu } from "@/components/crm/ColumnSelector";
import { FieldEditor } from "@/components/fields";
import { TableShareDialog, TablePermissionBadge, TableAuditLog } from "@/components/tables";
import { TableFilterPanel, FilterRule, matchesFilters } from "@/components/tables/TableFilterPanel";
import { FIELD_TYPE_OPTIONS } from "@/config/fieldTypes";
import { registerCustomFieldTypes, getAllCustomFieldTypes } from "@/components/fields";
import { useCustomFieldTypes } from "@/hooks/useTables";
import type { CRMAttribute, CRMRecord, CRMAttributeType, TableSavedView, ColumnDisplayConfig, WorkspaceFieldType } from "@/lib/api";

function AddFieldPanel({
  onAdd,
  isAdding,
  onClose,
  customFieldTypes,
}: {
  onAdd: (data: { name: string; attribute_type: string; options?: Record<string, unknown> }) => Promise<unknown>;
  isAdding: boolean;
  onClose: () => void;
  customFieldTypes?: WorkspaceFieldType[];
}) {
  const [step, setStep] = useState<"pick" | "configure">("pick");
  const [selectedType, setSelectedType] = useState<CRMAttributeType | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [statusOptions, setStatusOptions] = useState<string[]>(["To Do", "In Progress", "Done"]);
  const [selectOptions, setSelectOptions] = useState<string[]>([""]);
  const [selectedCustomType, setSelectedCustomType] = useState<WorkspaceFieldType | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handlePickType = (type: CRMAttributeType) => {
    setSelectedType(type);
    setSelectedCustomType(null);
    setFieldName("");
    setStep("configure");
  };

  const handlePickCustomType = (cft: WorkspaceFieldType) => {
    setSelectedCustomType(cft);
    setSelectedType(cft.base_type as CRMAttributeType);
    setFieldName(cft.name);
    // Pre-populate select options from preset
    if (cft.preset_options && cft.preset_options.length > 0) {
      setSelectOptions(cft.preset_options.map((o) => o.label));
    }
    setStep("configure");
  };

  const handleCreate = async () => {
    if (!selectedType || !fieldName.trim()) return;
    const attrType = selectedCustomType ? `custom:${selectedCustomType.slug}` : selectedType;
    const options: Record<string, unknown> = {};
    if (selectedCustomType?.preset_options && selectedCustomType.preset_options.length > 0) {
      options.options = selectedCustomType.preset_options;
    } else if (selectedType === "status") {
      options.options = statusOptions.filter(Boolean).map((label) => ({
        value: label.toLowerCase().replace(/\s+/g, "_"),
        label,
        color: label === "Done" ? "#22c55e" : label === "In Progress" ? "#3b82f6" : "#6b7280",
      }));
    } else if (selectedType === "select" || selectedType === "multi_select") {
      const filtered = selectOptions.filter(Boolean);
      if (filtered.length > 0) {
        options.options = filtered.map((label) => ({
          value: label.toLowerCase().replace(/\s+/g, "_"),
          label,
        }));
      }
    } else if (selectedType === "rating") {
      options.max_rating = 5;
    }
    await onAdd({ name: fieldName.trim(), attribute_type: attrType, options: Object.keys(options).length > 0 ? options : undefined });
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 z-50 w-[420px] bg-muted border border-border rounded-xl shadow-xl"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-foreground text-sm">
          {step === "pick" ? "Choose Field Type" : "Configure Field"}
        </h3>
        <button onClick={onClose} className="p-1 hover:bg-accent rounded-lg text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {step === "pick" ? (
        <div className="p-3 max-h-[400px] overflow-y-auto space-y-3">
          {customFieldTypes && customFieldTypes.length > 0 && (
            <>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Custom</div>
              <div className="grid grid-cols-2 gap-2">
                {customFieldTypes.map((cft) => (
                  <button
                    key={cft.id}
                    onClick={() => handlePickCustomType(cft)}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-left transition-colors border border-transparent hover:border-border"
                  >
                    <div className="p-1.5 rounded-md" style={{ backgroundColor: cft.color ? `${cft.color}20` : "rgba(139, 92, 246, 0.1)" }}>
                      <Star className="h-4 w-4" style={{ color: cft.color || "#8b5cf6" }} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{cft.name}</div>
                      <div className="text-xs text-muted-foreground">{FIELD_TYPE_OPTIONS.find((f) => f.type === cft.base_type)?.label || cft.base_type}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Built-in</div>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            {FIELD_TYPE_OPTIONS.map((ft) => (
              <button
                key={ft.type}
                onClick={() => handlePickType(ft.type)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-left transition-colors border border-transparent hover:border-border"
              >
                <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-500">{ft.icon}</div>
                <div>
                  <div className="text-sm font-medium text-foreground">{ft.label}</div>
                  <div className="text-xs text-muted-foreground">{ft.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <button
            onClick={() => setStep("pick")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back to field types
          </button>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Field Name</label>
            <input
              type="text"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              placeholder="e.g. Company Name"
              className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              autoFocus
            />
          </div>

          {(selectedType === "select" || selectedType === "multi_select") && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Options</label>
              <div className="space-y-2">
                {selectOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...selectOptions];
                        next[i] = e.target.value;
                        setSelectOptions(next);
                      }}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 px-3 py-1.5 bg-accent border border-border rounded-lg text-foreground text-sm"
                    />
                    {selectOptions.length > 1 && (
                      <button
                        onClick={() => setSelectOptions(selectOptions.filter((_, j) => j !== i))}
                        className="p-1 text-muted-foreground hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setSelectOptions([...selectOptions, ""])}
                  className="text-xs text-purple-500 hover:text-purple-400"
                >
                  + Add option
                </button>
              </div>
            </div>
          )}

          {selectedType === "status" && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Status Options</label>
              <div className="space-y-2">
                {statusOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...statusOptions];
                        next[i] = e.target.value;
                        setStatusOptions(next);
                      }}
                      placeholder={`Status ${i + 1}`}
                      className="flex-1 px-3 py-1.5 bg-accent border border-border rounded-lg text-foreground text-sm"
                    />
                    {statusOptions.length > 1 && (
                      <button
                        onClick={() => setStatusOptions(statusOptions.filter((_, j) => j !== i))}
                        className="p-1 text-muted-foreground hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setStatusOptions([...statusOptions, ""])}
                  className="text-xs text-purple-500 hover:text-purple-400"
                >
                  + Add status
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={isAdding || !fieldName.trim()}
            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {isAdding ? "Adding..." : "Add Field"}
          </button>
        </div>
      )}
    </div>
  );
}


function CreateRecordModal({
  isOpen,
  onClose,
  onCreate,
  isCreating,
  fields,
  tableName,
  defaultValues,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (values: Record<string, unknown>) => Promise<void>;
  isCreating: boolean;
  fields: CRMAttribute[];
  tableName: string;
  defaultValues?: Record<string, unknown>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(defaultValues || {});

  useEffect(() => {
    if (defaultValues) setValues(defaultValues);
  }, [defaultValues]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate(values);
    setValues({});
    onClose();
  };

  const editableFields = fields.filter((f) => !f.is_system);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-muted rounded-xl p-6 w-full max-w-lg border border-border max-h-[80vh] overflow-y-auto">
        <h3 className="text-xl font-semibold text-foreground mb-4">Add Record to {tableName}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {editableFields.map((field) => (
            <div key={field.id}>
              <label className="block text-sm font-medium text-foreground mb-1">
                {field.name}
                {field.is_required && <span className="text-red-400 ml-1">*</span>}
              </label>
              <FieldEditor
                attribute={field}
                value={values[field.slug]}
                onChange={(val) => setValues({ ...values, [field.slug]: val })}
                required={field.is_required}
                placeholder={`Enter ${field.name.toLowerCase()}`}
                className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          ))}
          {editableFields.length === 0 && (
            <p className="text-muted-foreground text-sm">No fields defined yet. Use the &quot;Add Field&quot; button in the toolbar to create columns first.</p>
          )}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border text-foreground rounded-lg hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || editableFields.length === 0}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors"
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TableDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tableId = params.tableId as string;

  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { tables, updateTable, isUpdating } = useTables(workspaceId);
  const table = tables.find((t) => t.id === tableId);

  const { fields, isLoading: fieldsLoading, addField, isAdding } = useTableFields(workspaceId, tableId);
  const { fieldTypes: customFieldTypes } = useCustomFieldTypes(workspaceId);
  const { access } = useTableAccess(workspaceId, tableId);

  // Register custom field types for the field registry to resolve custom:slug types
  useEffect(() => {
    if (customFieldTypes.length > 0) {
      registerCustomFieldTypes(customFieldTypes);
    }
  }, [customFieldTypes]);
  const {
    collaborators,
    addCollaborator,
    updateCollaborator,
    removeCollaborator,
  } = useTableCollaborators(workspaceId, tableId);
  const {
    shareLinks,
    createShareLink,
    revokeShareLink,
    isCreating: isCreatingLink,
  } = useTableShareLinks(workspaceId, tableId);
  const { members: workspaceMembers } = useWorkspaceMembers(workspaceId);
  const { teams: workspaceTeams } = useTeams(workspaceId);
  const { roles: workspaceRoles } = useRoles(workspaceId);

  // Saved views
  const {
    views: savedViews,
    createView,
    updateView,
    deleteView: deleteViewMutation,
    isCreating: isCreatingView,
    isUpdating: isUpdatingView,
  } = useSavedViews(workspaceId, tableId);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [columnDisplayConfig, setColumnDisplayConfig] = useState<ColumnDisplayConfig[]>([]);

  const [showAddField, setShowAddField] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);

  // Adapt fields to CRMAttribute shape for DataTable compatibility
  const attributes: CRMAttribute[] = useMemo(() => {
    return fields.map((f, i) => ({
      id: f.id,
      object_id: f.object_id,
      name: f.name,
      slug: f.slug,
      attribute_type: f.attribute_type as CRMAttributeType,
      description: null,
      is_required: f.is_required,
      is_unique: f.is_unique,
      is_searchable: false,
      is_filterable: f.is_filterable,
      is_sortable: true,
      is_system: false,
      config: f.config || {},
      default_value: f.default_value,
      order: f.position ?? i,
      created_at: f.created_at,
      updated_at: f.updated_at,
    }));
  }, [fields]);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createDefaultValues, setCreateDefaultValues] = useState<Record<string, unknown>>({});
  const [sortConfig, setSortConfig] = useState<{ attribute: string; direction: "asc" | "desc" } | null>(null);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  // Initialize and sync columns when fields change
  useEffect(() => {
    if (fields.length > 0) {
      const fieldSlugs = fields.map((f) => f.slug);
      if (visibleColumns.length === 0) {
        setVisibleColumns(fieldSlugs.slice(0, 6));
      } else {
        // Add any new fields to visible columns
        const newSlugs = fieldSlugs.filter((s) => !visibleColumns.includes(s));
        if (newSlugs.length > 0) {
          setVisibleColumns((prev) => [...prev, ...newSlugs]);
        }
      }
      // Always keep column order in sync
      setColumnOrder((prev) => {
        const newSlugs = fieldSlugs.filter((s) => !prev.includes(s));
        const validPrev = prev.filter((s) => fieldSlugs.includes(s));
        return newSlugs.length > 0 ? [...validPrev, ...newSlugs] : validPrev;
      });
    }
  }, [fields]);

  const {
    records: rawRecords,
    total,
    isLoading: recordsLoading,
    createRecord,
    updateRecord,
    deleteRecord,
    bulkDeleteRecords,
    isCreating,
  } = useTableRecords(workspaceId, tableId, {
    sort_by: sortConfig?.attribute,
    sort_dir: sortConfig?.direction,
  });

  // Adapt records to CRMRecord shape
  const records: CRMRecord[] = useMemo(() => {
    return rawRecords.map((r) => ({
      id: r.id,
      object_id: r.object_id,
      workspace_id: workspaceId || "",
      values: r.values,
      display_name: null,
      owner_id: r.created_by_id || null,
      created_by_id: r.created_by_id,
      is_archived: false,
      archived_at: null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }, [rawRecords]);

  // Filter by search + filter rules
  const filteredRecords = useMemo(() => {
    let result = records;
    // Apply filter rules
    if (filterRules.length > 0) {
      result = result.filter((r) => matchesFilters(r, filterRules, attributes));
    }
    // Apply search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        Object.values(r.values).some((val) => String(val).toLowerCase().includes(q))
      );
    }
    return result;
  }, [records, searchQuery, filterRules, attributes]);

  const hasStatusField = useMemo(() => {
    return fields.some((f) => f.attribute_type === "status");
  }, [fields]);

  const kanbanHighlightAttributes = useMemo(() => {
    return fields
      .filter((f) => ["currency", "date", "email"].includes(f.attribute_type))
      .slice(0, 2)
      .map((f) => f.slug);
  }, [fields]);

  const isLoading = fieldsLoading || recordsLoading;
  const canEdit = access ? ["edit", "manage", "admin"].includes(access.permission) : true;

  const handleSort = (attribute: string) => {
    if (sortConfig?.attribute === attribute) {
      setSortConfig(sortConfig.direction === "asc" ? { attribute, direction: "desc" } : null);
    } else {
      setSortConfig({ attribute, direction: "asc" });
    }
  };

  const handleSelectAll = () => {
    setSelectedRecords(
      selectedRecords.length === filteredRecords.length ? [] : filteredRecords.map((r) => r.id)
    );
  };

  const handleSelectRecord = (recordId: string) => {
    setSelectedRecords((prev) =>
      prev.includes(recordId) ? prev.filter((id) => id !== recordId) : [...prev, recordId]
    );
  };

  const handleCreate = async (values: Record<string, unknown>) => {
    await createRecord(values);
    setCreateDefaultValues({});
  };

  const handleDelete = async (recordId: string) => {
    if (confirm("Delete this record?")) {
      await deleteRecord(recordId);
    }
  };

  const handleBulkDelete = async () => {
    if (confirm(`Delete ${selectedRecords.length} records?`)) {
      await bulkDeleteRecords(selectedRecords);
      setSelectedRecords([]);
    }
  };

  const handleRecordClick = (record: CRMRecord) => {
    // Could open a sidebar in the future
  };

  const handleRecordUpdate = async (recordId: string, values: Record<string, unknown>) => {
    await updateRecord({ recordId, values });
  };

  const handleCellSave = async (recordId: string, slug: string, value: unknown) => {
    await updateRecord({ recordId, values: { [slug]: value } });
  };

  const handleCreateInStage = (stage: string) => {
    const statusField = fields.find((f) => f.attribute_type === "status");
    if (statusField) {
      setCreateDefaultValues({ [statusField.slug]: stage });
    }
    setShowCreateModal(true);
  };

  const handleToggleColumn = (slug: string) => {
    setVisibleColumns((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  // Saved view handlers
  const handleSelectView = useCallback((view: TableSavedView | null) => {
    if (!view) {
      setActiveViewId(null);
      if (fields.length > 0) {
        setVisibleColumns(fields.map((f) => f.slug).slice(0, 6));
        setColumnOrder(fields.map((f) => f.slug));
      }
      setSortConfig(null);
      setColumnDisplayConfig([]);
      return;
    }
    setActiveViewId(view.id);
    if (view.visible_attributes?.length) {
      setVisibleColumns(view.visible_attributes);
    }
    if (view.column_config?.length) {
      setColumnDisplayConfig(view.column_config);
    } else {
      setColumnDisplayConfig([]);
    }
    if (view.sorts?.length) {
      const first = view.sorts[0] as { attribute?: string; direction?: "asc" | "desc" };
      if (first.attribute) {
        setSortConfig({ attribute: first.attribute, direction: first.direction || "asc" });
      }
    } else {
      setSortConfig(null);
    }
    if (view.view_type === "board" || view.view_type === "table") {
      setViewMode(view.view_type as ViewMode);
    }
  }, [fields]);

  const handleSaveView = useCallback(async (data: Parameters<typeof createView>[0]) => {
    const view = await createView(data);
    setActiveViewId(view.id);
  }, [createView]);

  const handleUpdateView = useCallback(async (viewId: string, data: Parameters<typeof updateView>[0]["data"]) => {
    await updateView({ viewId, data });
  }, [updateView]);

  const handleDeleteView = useCallback(async (viewId: string) => {
    await deleteViewMutation(viewId);
    if (activeViewId === viewId) setActiveViewId(null);
  }, [deleteViewMutation, activeViewId]);

  const availableViews: ViewMode[] = hasStatusField ? ["table", "board"] : ["table"];

  return (
    <div className="min-h-screen bg-background">
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <Breadcrumb
            items={[
              { label: "Tables", href: "/tables" },
              { label: table?.name || "Table" },
            ]}
          />

          {/* Header */}
          <div className="flex items-center gap-4 mb-6 mt-4">
            <button
              onClick={() => router.push("/tables")}
              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: table?.color ? `${table.color}20` : "rgba(147, 51, 234, 0.2)" }}
              >
                <Table2
                  className="h-5 w-5"
                  style={{ color: table?.color || "#a855f7" }}
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{table?.name || "Table"}</h1>
                <p className="text-sm text-muted-foreground">{total} records</p>
              </div>
            </div>
            <div className="flex-1" />

            <SavedViewSwitcher
              views={savedViews}
              activeViewId={activeViewId}
              onSelectView={handleSelectView}
              onSaveView={handleSaveView}
              onUpdateView={handleUpdateView}
              onDeleteView={handleDeleteView}
              currentConfig={{
                visible_attributes: visibleColumns,
                column_config: columnDisplayConfig,
                sorts: sortConfig ? [{ attribute: sortConfig.attribute, direction: sortConfig.direction }] : [],
                view_type: viewMode as "table" | "board",
              }}
              isCreating={isCreatingView}
              isUpdating={isUpdatingView}
            />

            <button
              onClick={() => setShowAuditLog(true)}
              className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-accent border border-border text-foreground rounded-lg transition-colors"
              title="Activity log"
            >
              <History className="h-4 w-4" />
            </button>

            <button
              onClick={() => setShowShareDialog(true)}
              className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-accent border border-border text-foreground rounded-lg transition-colors"
              title="Share table"
            >
              <Share2 className="h-4 w-4" />
              Share
              {access && (
                <TablePermissionBadge permission={access.permission} size="sm" className="ml-0.5" />
              )}
            </button>

            <ViewSwitcher value={viewMode} onChange={setViewMode} availableViews={availableViews} />

            {canEdit && (
              <div className="relative">
                <button
                  onClick={() => setShowAddField(!showAddField)}
                  className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-accent border border-border text-foreground rounded-lg transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Add Field
                </button>
                {showAddField && (
                  <AddFieldPanel
                    onAdd={addField}
                    isAdding={isAdding}
                    onClose={() => setShowAddField(false)}
                    customFieldTypes={customFieldTypes}
                  />
                )}
              </div>
            )}

            {canEdit && (
              <button
                onClick={() => router.push(`/tables/${tableId}/settings`)}
                className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-accent border border-border text-foreground rounded-lg transition-colors"
                title="Table settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}

            {canEdit && (
              <button
                onClick={() => {
                  setCreateDefaultValues({});
                  setShowCreateModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Record
              </button>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-4 mb-4">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={`Search records...`}
              wrapperClassName="flex-1"
            />
            <TableFilterPanel
              attributes={attributes}
              filters={filterRules}
              onChange={setFilterRules}
            />

            {viewMode === "table" && attributes.length > 0 && (
              <ColumnVisibilityMenu
                attributes={attributes}
                visibleColumns={visibleColumns}
                onToggleColumn={handleToggleColumn}
                onShowAll={() => setVisibleColumns(fields.map((f) => f.slug))}
                onHideAll={() => setVisibleColumns([])}
              />
            )}

            {selectedRecords.length > 0 && canEdit && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 text-red-400 rounded-lg transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selectedRecords.length})
              </button>
            )}
          </div>

          {/* Empty state - no fields */}
          {!isLoading && fields.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="p-4 rounded-full bg-purple-500/10 mb-4">
                <Columns className="h-8 w-8 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No fields yet</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                Add fields to define the columns in your table. Fields determine what data you can store in each record.
              </p>
              <button
                onClick={() => setShowAddField(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Your First Field
              </button>
            </div>
          )}

          {/* Content */}
          {fields.length > 0 && (
            viewMode === "table" ? (
              <DataTable
                records={filteredRecords}
                attributes={attributes}
                isLoading={isLoading}
                emptyMessage={searchQuery ? "No records match your search" : "No records yet"}
                visibleColumns={visibleColumns}
                onVisibleColumnsChange={setVisibleColumns}
                columnOrder={columnOrder}
                onColumnOrderChange={setColumnOrder}
                columnDisplayConfig={columnDisplayConfig}
                onColumnDisplayConfigChange={setColumnDisplayConfig}
                sortConfig={sortConfig}
                onSort={handleSort}
                selectedRecords={selectedRecords}
                onSelectRecord={handleSelectRecord}
                onSelectAll={handleSelectAll}
                onRecordClick={handleRecordClick}
                onRecordDelete={canEdit ? handleDelete : undefined}
                showNameColumn={false}
                enableColumnReorder={true}
                enableColumnSelector={true}
                enableInlineEdit={canEdit}
                onCellSave={canEdit ? handleCellSave : undefined}
              />
            ) : (
              <KanbanBoard
                records={filteredRecords}
                attributes={attributes}
                onRecordClick={handleRecordClick}
                onRecordUpdate={handleRecordUpdate}
                onCreateInStage={handleCreateInStage}
                highlightAttributes={kanbanHighlightAttributes}
                isLoading={isLoading}
              />
            )
          )}
        </div>
      </div>

      <CreateRecordModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateDefaultValues({});
        }}
        onCreate={handleCreate}
        isCreating={isCreating}
        fields={attributes}
        tableName={table?.name || "Table"}
        defaultValues={createDefaultValues}
      />

      <TableAuditLog
        workspaceId={workspaceId}
        tableId={tableId}
        open={showAuditLog}
        onClose={() => setShowAuditLog(false)}
      />

      <TableShareDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        tableId={tableId}
        tableName={table?.name || "Table"}
        visibility={table?.visibility || "workspace"}
        rowAccessMode={table?.row_access_mode || "all"}
        myAccess={access}
        fields={fields.map((f) => ({
          id: f.id,
          object_id: f.object_id,
          name: f.name,
          slug: f.slug,
          attribute_type: f.attribute_type,
          description: f.description,
          is_required: f.is_required,
          is_unique: f.is_unique,
          is_filterable: f.is_filterable,
          is_sortable: f.is_sortable ?? true,
          is_visible: f.is_visible ?? true,
          is_system: f.is_system,
          default_value: f.default_value,
          config: f.config,
          position: f.position,
          column_width: f.column_width,
          created_at: f.created_at,
          updated_at: f.updated_at,
        }))}
        collaborators={collaborators}
        onAddCollaborator={addCollaborator}
        onUpdateCollaborator={updateCollaborator}
        onRemoveCollaborator={removeCollaborator}
        shareLinks={shareLinks}
        onCreateShareLink={createShareLink}
        onRevokeShareLink={revokeShareLink}
        isCreatingLink={isCreatingLink}
        onUpdateTable={({ visibility, row_access_mode }) =>
          updateTable({
            tableId,
            data: {
              ...(visibility !== undefined && { visibility }),
              ...(row_access_mode !== undefined && { row_access_mode }),
            },
          })
        }
        isUpdatingTable={isUpdating}
        workspaceMembers={workspaceMembers}
        workspaceTeams={workspaceTeams || []}
        workspaceRoles={workspaceRoles || []}
      />
    </div>
  );
}
