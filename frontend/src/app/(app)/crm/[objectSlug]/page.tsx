"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Plus,
  Search,
  Filter,
  ChevronLeft,
  Trash2,
  Building2,
  Users,
  DollarSign,
  LayoutGrid,
  Settings,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useCRMObjects, useCRMRecords } from "@/hooks/useCRM";
import { CRMObject, CRMRecord, CRMAttribute, CRMObjectType } from "@/lib/api";
import { ViewSwitcher, ViewMode } from "@/components/crm/ViewSwitcher";
import { DataTable } from "@/components/crm/DataTable";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { ColumnVisibilityMenu } from "@/components/crm/ColumnSelector";

const objectTypeIcons: Record<CRMObjectType, React.ReactNode> = {
  company: <Building2 className="h-5 w-5" />,
  person: <Users className="h-5 w-5" />,
  deal: <DollarSign className="h-5 w-5" />,
  custom: <LayoutGrid className="h-5 w-5" />,
};

function CreateRecordModal({
  isOpen,
  onClose,
  onCreate,
  isCreating,
  object,
  defaultValues,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (values: Record<string, unknown>) => Promise<void>;
  isCreating: boolean;
  object: CRMObject;
  defaultValues?: Record<string, unknown>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(defaultValues || {});

  useEffect(() => {
    if (defaultValues) {
      setValues(defaultValues);
    }
  }, [defaultValues]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate(values);
    setValues({});
    onClose();
  };

  const editableAttributes = object.attributes?.filter((attr) => !attr.is_system) || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-lg border border-slate-700 max-h-[80vh] overflow-y-auto">
        <h3 className="text-xl font-semibold text-white mb-4">Create {object.name}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {editableAttributes.map((attr) => (
            <div key={attr.id}>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                {attr.name}
                {attr.is_required && <span className="text-red-400 ml-1">*</span>}
              </label>
              {attr.attribute_type === "text" || attr.attribute_type === "email" || attr.attribute_type === "url" || attr.attribute_type === "phone" ? (
                <input
                  type={attr.attribute_type === "email" ? "email" : attr.attribute_type === "url" ? "url" : "text"}
                  value={(values[attr.slug] as string) || ""}
                  onChange={(e) => setValues({ ...values, [attr.slug]: e.target.value })}
                  required={attr.is_required}
                  placeholder={attr.description || `Enter ${attr.name.toLowerCase()}`}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              ) : attr.attribute_type === "number" || attr.attribute_type === "currency" ? (
                <input
                  type="number"
                  value={(values[attr.slug] as number) || ""}
                  onChange={(e) => setValues({ ...values, [attr.slug]: parseFloat(e.target.value) || 0 })}
                  required={attr.is_required}
                  placeholder={attr.description || `Enter ${attr.name.toLowerCase()}`}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              ) : attr.attribute_type === "checkbox" ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!values[attr.slug]}
                    onChange={(e) => setValues({ ...values, [attr.slug]: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
                  />
                  <span className="text-slate-300">{attr.description || "Enabled"}</span>
                </label>
              ) : attr.attribute_type === "select" || attr.attribute_type === "status" ? (
                <select
                  value={(values[attr.slug] as string) || ""}
                  onChange={(e) => setValues({ ...values, [attr.slug]: e.target.value })}
                  required={attr.is_required}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select {attr.name.toLowerCase()}</option>
                  {((attr.config as { options?: { value: string; label: string }[] })?.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : attr.attribute_type === "date" || attr.attribute_type === "datetime" ? (
                <input
                  type={attr.attribute_type === "datetime" ? "datetime-local" : "date"}
                  value={(values[attr.slug] as string) || ""}
                  onChange={(e) => setValues({ ...values, [attr.slug]: e.target.value })}
                  required={attr.is_required}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              ) : (
                <input
                  type="text"
                  value={(values[attr.slug] as string) || ""}
                  onChange={(e) => setValues({ ...values, [attr.slug]: e.target.value })}
                  required={attr.is_required}
                  placeholder={attr.description || `Enter ${attr.name.toLowerCase()}`}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              )}
            </div>
          ))}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
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

export default function RecordsPage() {
  const router = useRouter();
  const params = useParams();
  const objectSlug = params.objectSlug as string;

  const { user, logout } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { objects } = useCRMObjects(workspaceId);
  const currentObject = objects.find((obj) => obj.slug === objectSlug);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // Default to board view for deals
    if (objectSlug === "deals") return "board";
    return "table";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createDefaultValues, setCreateDefaultValues] = useState<Record<string, unknown>>({});
  const [sortConfig, setSortConfig] = useState<{ attribute: string; direction: "asc" | "desc" } | null>(null);

  // Column management state
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  // Initialize columns when object loads
  useEffect(() => {
    if (currentObject?.attributes) {
      const nonSystemAttrs = currentObject.attributes.filter((a) => !a.is_system);
      if (visibleColumns.length === 0) {
        setVisibleColumns(nonSystemAttrs.slice(0, 5).map((a) => a.slug));
      }
      if (columnOrder.length === 0) {
        setColumnOrder(nonSystemAttrs.map((a) => a.slug));
      }
    }
  }, [currentObject?.attributes, visibleColumns.length, columnOrder.length]);

  const {
    records,
    total,
    isLoading,
    createRecord,
    updateRecord,
    deleteRecord,
    bulkDeleteRecords,
    isCreating,
    isDeleting,
  } = useCRMRecords(workspaceId, currentObject?.id || null, {
    sorts: sortConfig ? [{ attribute: sortConfig.attribute, direction: sortConfig.direction }] : undefined,
  });

  // Filter records by search
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    const query = searchQuery.toLowerCase();
    return records.filter((record) => {
      if (record.display_name?.toLowerCase().includes(query)) return true;
      return Object.values(record.values).some((val) =>
        String(val).toLowerCase().includes(query)
      );
    });
  }, [records, searchQuery]);

  // Check if object has status attribute (for board view)
  const hasStatusAttribute = useMemo(() => {
    return currentObject?.attributes?.some((a) => a.attribute_type === "status");
  }, [currentObject]);

  // Get attributes that should be highlighted on kanban cards
  const kanbanHighlightAttributes = useMemo(() => {
    if (!currentObject?.attributes) return [];
    // Show currency and date fields on cards
    return currentObject.attributes
      .filter((a) => ["currency", "date", "email"].includes(a.attribute_type) && !a.is_system)
      .slice(0, 2)
      .map((a) => a.slug);
  }, [currentObject]);

  const handleSort = (attribute: string) => {
    if (sortConfig?.attribute === attribute) {
      setSortConfig(sortConfig.direction === "asc" ? { attribute, direction: "desc" } : null);
    } else {
      setSortConfig({ attribute, direction: "asc" });
    }
  };

  const handleSelectAll = () => {
    if (selectedRecords.length === filteredRecords.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(filteredRecords.map((r) => r.id));
    }
  };

  const handleSelectRecord = (recordId: string) => {
    if (selectedRecords.includes(recordId)) {
      setSelectedRecords(selectedRecords.filter((id) => id !== recordId));
    } else {
      setSelectedRecords([...selectedRecords, recordId]);
    }
  };

  const handleCreate = async (values: Record<string, unknown>) => {
    await createRecord({ values });
    setCreateDefaultValues({});
  };

  const handleDelete = async (recordId: string) => {
    if (confirm("Are you sure you want to delete this record?")) {
      await deleteRecord({ recordId });
    }
  };

  const handleBulkDelete = async () => {
    if (confirm(`Are you sure you want to delete ${selectedRecords.length} records?`)) {
      await bulkDeleteRecords({ recordIds: selectedRecords });
      setSelectedRecords([]);
    }
  };

  const handleRecordClick = (record: CRMRecord) => {
    router.push(`/crm/${objectSlug}/${record.id}`);
  };

  const handleRecordUpdate = async (recordId: string, values: Record<string, unknown>) => {
    await updateRecord({ recordId, data: { values } });
  };

  const handleCreateInStage = (stage: string) => {
    const statusAttr = currentObject?.attributes?.find((a) => a.attribute_type === "status");
    if (statusAttr) {
      setCreateDefaultValues({ [statusAttr.slug]: stage });
    }
    setShowCreateModal(true);
  };

  const handleToggleColumn = (slug: string) => {
    if (visibleColumns.includes(slug)) {
      setVisibleColumns(visibleColumns.filter((s) => s !== slug));
    } else {
      setVisibleColumns([...visibleColumns, slug]);
    }
  };

  if (!currentObject && !isLoading) {
    return (
      <div className="min-h-screen bg-slate-950">
<div className="p-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-16">
              <h2 className="text-2xl font-bold text-white mb-2">Object not found</h2>
              <p className="text-slate-400 mb-4">The object you&apos;re looking for doesn&apos;t exist.</p>
              <button
                onClick={() => router.push("/crm")}
                className="text-purple-400 hover:text-purple-300"
              >
                Go back to CRM
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const icon = currentObject ? objectTypeIcons[currentObject.object_type as CRMObjectType] || objectTypeIcons.custom : null;
  const availableViews: ViewMode[] = hasStatusAttribute ? ["table", "board"] : ["table"];

  return (
    <div className="min-h-screen bg-slate-950">
<div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.push("/crm")}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              {icon && <div className="text-purple-400">{icon}</div>}
              <div>
                <h1 className="text-2xl font-bold text-white">{currentObject?.plural_name || "Records"}</h1>
                <p className="text-sm text-slate-400">{total} records</p>
              </div>
            </div>
            <div className="flex-1" />

            {/* View Switcher */}
            <ViewSwitcher
              value={viewMode}
              onChange={setViewMode}
              availableViews={availableViews}
            />

            <button
              onClick={() => {
                setCreateDefaultValues({});
                setShowCreateModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              New {currentObject?.name}
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${currentObject?.plural_name?.toLowerCase() || "records"}...`}
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors">
              <Filter className="h-4 w-4" />
              Filter
            </button>

            {/* Column visibility (table view only) */}
            {viewMode === "table" && currentObject?.attributes && (
              <ColumnVisibilityMenu
                attributes={currentObject.attributes}
                visibleColumns={visibleColumns}
                onToggleColumn={handleToggleColumn}
                onShowAll={() => setVisibleColumns(currentObject.attributes?.filter((a) => !a.is_system).map((a) => a.slug) || [])}
                onHideAll={() => setVisibleColumns([])}
              />
            )}

            {selectedRecords.length > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
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
              attributes={currentObject?.attributes || []}
              isLoading={isLoading}
              emptyMessage={searchQuery ? "No records match your search" : `No ${currentObject?.plural_name?.toLowerCase() || "records"} yet`}
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
              onRecordDelete={handleDelete}
              enableColumnReorder={true}
              enableColumnSelector={true}
            />
          ) : (
            <KanbanBoard
              records={filteredRecords}
              attributes={currentObject?.attributes || []}
              onRecordClick={handleRecordClick}
              onRecordUpdate={handleRecordUpdate}
              onCreateInStage={handleCreateInStage}
              highlightAttributes={kanbanHighlightAttributes}
              isLoading={isLoading}
            />
          )}

          {currentObject && (
            <CreateRecordModal
              isOpen={showCreateModal}
              onClose={() => {
                setShowCreateModal(false);
                setCreateDefaultValues({});
              }}
              onCreate={handleCreate}
              isCreating={isCreating}
              object={currentObject}
              defaultValues={createDefaultValues}
            />
          )}
        </div>
      </div>
    </div>
  );
}
