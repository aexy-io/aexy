"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Plus,
  Filter,
  ChevronLeft,
  Trash2,
  Table2,
  Settings,
  X,
  Type,
  Columns,
  Loader2,
} from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTables, useTableFields, useTableRecords, useTableAccess } from "@/hooks/useTables";
import { DataTable } from "@/components/crm/DataTable";
import { ViewSwitcher, ViewMode } from "@/components/crm/ViewSwitcher";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { ColumnVisibilityMenu } from "@/components/crm/ColumnSelector";
import { FieldEditor } from "@/components/fields";
import { FIELD_TYPE_OPTIONS, getFieldTypeOption } from "@/config/fieldTypes";
import type { CRMAttribute, CRMRecord, CRMAttributeType } from "@/lib/api";

function AddFieldPanel({
  onAdd,
  isAdding,
  onClose,
}: {
  onAdd: (data: { name: string; attribute_type: string; options?: Record<string, unknown> }) => Promise<unknown>;
  isAdding: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"pick" | "configure">("pick");
  const [selectedType, setSelectedType] = useState<CRMAttributeType | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [statusOptions, setStatusOptions] = useState<string[]>(["To Do", "In Progress", "Done"]);
  const [selectOptions, setSelectOptions] = useState<string[]>([""]);
  const panelRef = useRef<HTMLDivElement>(null);

  const handlePickType = (type: CRMAttributeType) => {
    setSelectedType(type);
    setFieldName("");
    setStep("configure");
  };

  const handleCreate = async () => {
    if (!selectedType || !fieldName.trim()) return;
    const options: Record<string, unknown> = {};
    if (selectedType === "status") {
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
    await onAdd({ name: fieldName.trim(), attribute_type: selectedType, options: Object.keys(options).length > 0 ? options : undefined });
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
        <div className="p-3 grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
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

function FieldManagerPanel({
  fields,
  onDelete,
  onClose,
}: {
  fields: CRMAttribute[];
  onDelete: (fieldId: string) => Promise<void>;
  onClose: () => void;
}) {
  if (fields.length === 0) {
    return (
      <div className="absolute right-0 top-full mt-2 z-50 w-[340px] bg-muted border border-border rounded-xl shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-foreground text-sm">Manage Fields</h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded-lg text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 text-center text-sm text-muted-foreground">No fields yet.</div>
      </div>
    );
  }

  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-[340px] bg-muted border border-border rounded-xl shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-foreground text-sm">Manage Fields ({fields.length})</h3>
        <button onClick={onClose} className="p-1 hover:bg-accent rounded-lg text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-2 max-h-[400px] overflow-y-auto space-y-1">
        {fields.map((field) => {
          const typeInfo = getFieldTypeOption(field.attribute_type);
          return (
            <div
              key={field.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent group"
            >
              <div className="p-1 rounded bg-purple-500/10 text-purple-500">
                {typeInfo?.icon || <Type className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{field.name}</div>
                <div className="text-xs text-muted-foreground">{typeInfo?.label || field.attribute_type}</div>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Delete field "${field.name}"? This will remove all data in this column.`)) {
                    onDelete(field.id);
                  }
                }}
                className="p-1 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete field"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
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

  const { tables } = useTables(workspaceId);
  const table = tables.find((t) => t.id === tableId);

  const { fields, isLoading: fieldsLoading, addField, deleteField, isAdding } = useTableFields(workspaceId, tableId);
  const { access } = useTableAccess(workspaceId, tableId);

  const [showAddField, setShowAddField] = useState(false);
  const [showFieldManager, setShowFieldManager] = useState(false);

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

  // Filter by search
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    const q = searchQuery.toLowerCase();
    return records.filter((r) =>
      Object.values(r.values).some((val) => String(val).toLowerCase().includes(q))
    );
  }, [records, searchQuery]);

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

            <ViewSwitcher value={viewMode} onChange={setViewMode} availableViews={availableViews} />

            {canEdit && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowAddField(!showAddField);
                    setShowFieldManager(false);
                  }}
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
                  />
                )}
              </div>
            )}

            {canEdit && fields.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowFieldManager(!showFieldManager);
                    setShowAddField(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-accent border border-border text-foreground rounded-lg transition-colors"
                  title="Manage fields"
                >
                  <Settings className="h-4 w-4" />
                </button>
                {showFieldManager && (
                  <FieldManagerPanel
                    fields={attributes}
                    onDelete={deleteField}
                    onClose={() => setShowFieldManager(false)}
                  />
                )}
              </div>
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
            <button className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-accent border border-border text-foreground rounded-lg transition-colors">
              <Filter className="h-4 w-4" />
              Filter
            </button>

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
                onClick={() => {
                  setShowAddField(true);
                  setShowFieldManager(false);
                }}
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
    </div>
  );
}
