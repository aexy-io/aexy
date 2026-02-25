"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Plus,
  Filter,
  ChevronLeft,
  Trash2,
  Table2,
  Settings,
} from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useTables, useTableFields, useTableRecords, useTableAccess } from "@/hooks/useTables";
import { DataTable } from "@/components/crm/DataTable";
import { ViewSwitcher, ViewMode } from "@/components/crm/ViewSwitcher";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { ColumnVisibilityMenu } from "@/components/crm/ColumnSelector";
import { FieldEditor } from "@/components/fields";
import type { CRMAttribute, CRMRecord } from "@/lib/api";

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
            <p className="text-muted-foreground text-sm">No fields defined yet. Add fields first.</p>
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

  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { tables } = useTables(workspaceId);
  const table = tables.find((t) => t.id === tableId);

  const { fields, isLoading: fieldsLoading } = useTableFields(workspaceId, tableId);
  const { access } = useTableAccess(workspaceId, tableId);

  // Adapt fields to CRMAttribute shape for DataTable compatibility
  const attributes: CRMAttribute[] = useMemo(() => {
    return fields.map((f) => ({
      id: f.id,
      object_id: f.object_id,
      name: f.name,
      slug: f.slug,
      attribute_type: f.attribute_type,
      is_required: f.is_required,
      is_unique: f.is_unique,
      is_filterable: f.is_filterable,
      is_primary: f.is_primary,
      is_system: false,
      default_value: f.default_value,
      options: f.options,
      display_order: f.display_order,
      description: null,
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

  // Initialize columns
  useEffect(() => {
    if (fields.length > 0) {
      if (visibleColumns.length === 0) {
        setVisibleColumns(fields.slice(0, 6).map((f) => f.slug));
      }
      if (columnOrder.length === 0) {
        setColumnOrder(fields.map((f) => f.slug));
      }
    }
  }, [fields, visibleColumns.length, columnOrder.length]);

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
      values: r.values,
      display_name: null,
      created_by_id: r.created_by_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      is_deleted: false,
      deleted_at: null,
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

          {/* Content */}
          {viewMode === "table" ? (
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
