"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Table2,
  Plus,
  ChevronDown,
  ChevronUp,
  Link2,
  LayoutGrid,
  ExternalLink,
  Users,
  Briefcase,
  DollarSign,
  Ticket,
  UserCheck,
  ClipboardList,
  Type,
  Hash,
  Calendar,
  CheckSquare,
  List,
  Mail,
  Star,
  X,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTables, useTableFields, useTableRecords } from "@/hooks/useTables";
import { DataTable } from "@/components/crm/DataTable";
import type { CRMAttribute, CRMAttributeType, CRMRecord } from "@/lib/api";

// Scope display metadata
const SCOPE_META: Record<string, { label: string; color: string; icon: typeof Table2 }> = {
  standalone: { label: "Table", color: "text-purple-400", icon: Table2 },
  crm: { label: "CRM", color: "text-blue-400", icon: Briefcase },
  document: { label: "Doc Table", color: "text-emerald-400", icon: Table2 },
  project: { label: "Project", color: "text-amber-400", icon: ClipboardList },
};

// Icon lookup for known CRM object types
function getObjectIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("lead") || lower.includes("contact") || lower.includes("person")) return Users;
  if (lower.includes("company") || lower.includes("account")) return Briefcase;
  if (lower.includes("deal") || lower.includes("opportunity")) return DollarSign;
  if (lower.includes("ticket") || lower.includes("issue")) return Ticket;
  if (lower.includes("candidate") || lower.includes("hiring")) return UserCheck;
  return Table2;
}

// TipTap Node Definition
export const InlineDatabase = Node.create({
  name: "inlineDatabase",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      tableId: { default: null },
      scope: { default: null },
      height: { default: 400 },
      collapsed: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-inline-database]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-inline-database": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineDatabaseView);
  },
});

// Create Table Prompt (when no table is linked)
function CreateTablePrompt({
  onCreated,
  onLink,
}: {
  onCreated: (id: string, scope?: string) => void;
  onLink: (id: string, scope?: string) => void;
}) {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { tables, createTable, isCreating } = useTables(workspaceId);
  const [mode, setMode] = useState<"choose" | "create" | "link" | "modules">("choose");
  const [name, setName] = useState("");

  // Split tables by scope
  const standaloneTables = useMemo(
    () => tables.filter((t) => t.scope === "standalone" || t.scope === "document"),
    [tables]
  );
  const moduleTables = useMemo(
    () => tables.filter((t) => t.scope === "crm" || t.scope === "project"),
    [tables]
  );

  const handleCreate = async () => {
    if (!name.trim()) return;
    const table = await createTable({ name, visibility: "workspace" });
    onCreated(table.id, "document");
  };

  if (mode === "create") {
    return (
      <div className="bg-muted/50 border border-border rounded-lg p-4">
        <p className="text-sm font-medium text-foreground mb-2">New Inline Database</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Table name..."
            autoFocus
            className="flex-1 px-3 py-1.5 bg-accent border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white text-sm rounded-lg"
          >
            {isCreating ? "..." : "Create"}
          </button>
          <button
            onClick={() => setMode("choose")}
            className="px-3 py-1.5 border border-border text-foreground text-sm rounded-lg hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === "link") {
    return (
      <div className="bg-muted/50 border border-border rounded-lg p-4">
        <p className="text-sm font-medium text-foreground mb-2">Link Existing Table</p>
        {standaloneTables.length === 0 ? (
          <p className="text-sm text-muted-foreground">No standalone tables available</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {standaloneTables.map((t) => (
              <button
                key={t.id}
                onClick={() => onLink(t.id, t.scope)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent rounded-lg text-left"
              >
                <Table2 className="h-4 w-4 text-purple-400" />
                {t.name}
                <span className="ml-auto text-xs text-muted-foreground">{t.record_count} records</span>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setMode("choose")}
          className="mt-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Back
        </button>
      </div>
    );
  }

  if (mode === "modules") {
    return (
      <div className="bg-muted/50 border border-border rounded-lg p-4">
        <p className="text-sm font-medium text-foreground mb-2">Embed Module Data</p>
        <p className="text-xs text-muted-foreground mb-3">
          Embed a live view of data from CRM, Projects, or other modules
        </p>
        {moduleTables.length === 0 ? (
          <p className="text-sm text-muted-foreground">No module data available. Create CRM objects or project tables first.</p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {moduleTables.map((t) => {
              const Icon = getObjectIcon(t.name);
              const scopeMeta = SCOPE_META[t.scope] || SCOPE_META.standalone;
              return (
                <button
                  key={t.id}
                  onClick={() => onLink(t.id, t.scope)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent rounded-lg text-left"
                >
                  <Icon className={`h-4 w-4 ${scopeMeta.color}`} />
                  <span>{t.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-accent ${scopeMeta.color}`}>
                    {scopeMeta.label}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">{t.record_count} records</span>
                </button>
              );
            })}
          </div>
        )}
        <button
          onClick={() => setMode("choose")}
          className="mt-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="bg-muted/50 border border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-3">
      <Table2 className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Add an inline database</p>
      <div className="flex gap-2">
        <button
          onClick={() => setMode("create")}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg"
        >
          <Plus className="h-3.5 w-3.5" />
          Create New
        </button>
        <button
          onClick={() => setMode("link")}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-foreground text-sm rounded-lg hover:bg-accent"
        >
          <Link2 className="h-3.5 w-3.5" />
          Link Table
        </button>
        <button
          onClick={() => setMode("modules")}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-foreground text-sm rounded-lg hover:bg-accent"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Embed Module
        </button>
      </div>
    </div>
  );
}

// Collapsed view
function CollapsedTableCard({
  tableId,
  scope,
  onExpand,
}: {
  tableId: string;
  scope?: string | null;
  onExpand: () => void;
}) {
  const { currentWorkspace } = useWorkspace();
  const { tables } = useTables(currentWorkspace?.id || null);
  const table = tables.find((t) => t.id === tableId);
  const scopeMeta = SCOPE_META[scope || table?.scope || "standalone"] || SCOPE_META.standalone;
  const Icon = table ? getObjectIcon(table.name) : scopeMeta.icon;

  return (
    <button
      onClick={onExpand}
      className="w-full bg-muted/50 border border-border rounded-lg p-3 flex items-center gap-3 hover:border-purple-500/50 transition-colors"
    >
      <Icon className={`h-5 w-5 ${scopeMeta.color}`} />
      <span className="font-medium text-foreground text-sm">{table?.name || "Database"}</span>
      {scope && scope !== "standalone" && scope !== "document" && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-accent ${scopeMeta.color}`}>
          {scopeMeta.label}
        </span>
      )}
      <span className="text-xs text-muted-foreground">{table?.record_count || 0} records</span>
      <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
    </button>
  );
}

// Quick column type options for inline add
const QUICK_COLUMN_TYPES: { value: string; label: string; icon: React.ReactNode }[] = [
  { value: "text", label: "Text", icon: <Type className="h-4 w-4" /> },
  { value: "number", label: "Number", icon: <Hash className="h-4 w-4" /> },
  { value: "date", label: "Date", icon: <Calendar className="h-4 w-4" /> },
  { value: "checkbox", label: "Checkbox", icon: <CheckSquare className="h-4 w-4" /> },
  { value: "select", label: "Select", icon: <List className="h-4 w-4" /> },
  { value: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  { value: "rating", label: "Rating", icon: <Star className="h-4 w-4" /> },
];

// Lightweight add-column popover for inline databases
function AddColumnPopover({
  onAdd,
  onClose,
  isAdding,
}: {
  onAdd: (name: string, type: string) => void;
  onClose: () => void;
  isAdding: boolean;
}) {
  const [name, setName] = useState("");
  const [selectedType, setSelectedType] = useState("text");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), selectedType);
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 w-72 bg-muted border border-border rounded-lg shadow-xl p-3 space-y-3"
      style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Add column</span>
        <button onClick={onClose} className="p-0.5 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Column name..."
        autoFocus
        className="w-full px-3 py-1.5 bg-accent border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />

      <div className="grid grid-cols-4 gap-1">
        {QUICK_COLUMN_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setSelectedType(t.value)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-colors ${
              selectedType === t.value
                ? "bg-purple-500/20 text-purple-400 border border-purple-500/50"
                : "text-muted-foreground hover:bg-accent border border-transparent"
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!name.trim() || isAdding}
        className="w-full px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white text-sm rounded-lg transition-colors"
      >
        {isAdding ? "Adding..." : "Add Column"}
      </button>
    </div>
  );
}

// Main inline table view
function InlineTableView({ tableId }: { tableId: string }) {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { fields, addField, deleteField, isAdding } = useTableFields(workspaceId, tableId);
  const { records: rawRecords, total, isLoading, createRecord, updateRecord, deleteRecord, bulkDeleteRecords, isCreating } = useTableRecords(workspaceId, tableId);

  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);

  // Initialize columns on first load, and auto-show newly added fields
  useEffect(() => {
    if (fields.length === 0) return;

    if (visibleColumns.length === 0 && columnOrder.length === 0) {
      // First load: show up to 5 columns
      setVisibleColumns(fields.slice(0, 5).map((f) => f.slug));
      setColumnOrder(fields.map((f) => f.slug));
    } else if (columnOrder.length > 0) {
      // Detect newly added fields and auto-show them
      const fieldSlugs = fields.map((f) => f.slug);
      const newSlugs = fieldSlugs.filter((s) => !columnOrder.includes(s));
      if (newSlugs.length > 0) {
        setColumnOrder((prev) => [...prev, ...newSlugs]);
        setVisibleColumns((prev) => {
          const combined = [...prev, ...newSlugs];
          return [...new Set(combined)];
        });
      }
    }
  }, [fields, visibleColumns.length, columnOrder]);

  const handleAddColumn = useCallback(async (name: string, type: string) => {
    await addField({ name, attribute_type: type });
    setShowAddColumn(false);
  }, [addField]);

  const handleDeleteColumn = useCallback(async (slug: string) => {
    const field = fields.find((f) => f.slug === slug);
    if (!field) return;
    if (field.is_system) return;
    await deleteField(field.id);
    setVisibleColumns((prev) => prev.filter((s) => s !== slug));
    setColumnOrder((prev) => prev.filter((s) => s !== slug));
  }, [fields, deleteField]);

  const handleAddRecord = useCallback(async () => {
    await createRecord({});
  }, [createRecord]);

  const handleCellSave = useCallback(async (recordId: string, slug: string, value: unknown) => {
    await updateRecord({ recordId, values: { [slug]: value } });
  }, [updateRecord]);

  const handleSelectRecord = useCallback((recordId: string) => {
    setSelectedRecords((prev) =>
      prev.includes(recordId) ? prev.filter((id) => id !== recordId) : [...prev, recordId]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedRecords((prev) =>
      prev.length === rawRecords.length ? [] : rawRecords.map((r) => r.id)
    );
  }, [rawRecords]);

  const handleBulkDelete = useCallback(async (ids: string[]) => {
    await bulkDeleteRecords(ids);
    setSelectedRecords([]);
  }, [bulkDeleteRecords]);

  const handleDeleteRecord = useCallback(async (recordId: string) => {
    await deleteRecord(recordId);
    setSelectedRecords((prev) => prev.filter((id) => id !== recordId));
  }, [deleteRecord]);

  const attributes: CRMAttribute[] = useMemo(
    () =>
      fields.map((f, i) => ({
        id: f.id,
        object_id: f.object_id,
        name: f.name,
        slug: f.slug,
        attribute_type: f.attribute_type as CRMAttributeType,
        description: f.description ?? null,
        is_required: f.is_required,
        is_unique: f.is_unique,
        is_searchable: false,
        is_filterable: f.is_filterable,
        is_sortable: f.is_sortable ?? true,
        is_system: f.is_system ?? false,
        config: f.config || {},
        default_value: f.default_value,
        order: f.position ?? i,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })),
    [fields]
  );

  const records: CRMRecord[] = useMemo(
    () =>
      rawRecords.map((r) => ({
        id: r.id,
        object_id: r.object_id,
        workspace_id: tableId || "",
        values: r.values,
        display_name: null,
        owner_id: r.created_by_id || null,
        created_by_id: r.created_by_id,
        is_archived: false,
        archived_at: null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    [rawRecords, tableId]
  );

  return (
    <>
      <DataTable
        records={records}
        attributes={attributes}
        isLoading={isLoading}
        emptyMessage="No records yet"
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={setVisibleColumns}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        enableColumnReorder={true}
        enableColumnSelector={true}
        enableInlineEdit={true}
        onCellSave={handleCellSave}
        onAddColumn={() => setShowAddColumn(true)}
        onDeleteColumn={handleDeleteColumn}
        selectedRecords={selectedRecords}
        onSelectRecord={handleSelectRecord}
        onSelectAll={handleSelectAll}
        onRecordDelete={handleDeleteRecord}
        onBulkDelete={handleBulkDelete}
        showNameColumn={false}
      />
      <button
        onClick={handleAddRecord}
        disabled={isCreating}
        className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full border-t border-border"
      >
        <Plus className="h-3.5 w-3.5" />
        {isCreating ? "Adding..." : "New row"}
      </button>
      {showAddColumn && (
        <AddColumnPopover
          onAdd={handleAddColumn}
          onClose={() => setShowAddColumn(false)}
          isAdding={isAdding}
        />
      )}
    </>
  );
}

// Node View Component
function InlineDatabaseView(props: ReactNodeViewProps) {
  const { node, updateAttributes } = props;
  const tableId = node.attrs.tableId as string | null;
  const scope = node.attrs.scope as string | null;
  const height = (node.attrs.height as number) || 400;
  const collapsed = (node.attrs.collapsed as boolean) || false;
  const { currentWorkspace } = useWorkspace();
  const { tables } = useTables(currentWorkspace?.id || null);
  const table = tableId ? tables.find((t) => t.id === tableId) : null;

  if (!tableId) {
    return (
      <NodeViewWrapper>
        <CreateTablePrompt
          onCreated={(id, s) => updateAttributes({ tableId: id, scope: s || "document" })}
          onLink={(id, s) => updateAttributes({ tableId: id, scope: s || "standalone" })}
        />
      </NodeViewWrapper>
    );
  }

  if (collapsed) {
    return (
      <NodeViewWrapper>
        <CollapsedTableCard
          tableId={tableId}
          scope={scope}
          onExpand={() => updateAttributes({ collapsed: false })}
        />
      </NodeViewWrapper>
    );
  }

  const effectiveScope = scope || table?.scope || "standalone";
  const scopeMeta = SCOPE_META[effectiveScope] || SCOPE_META.standalone;
  const Icon = table ? getObjectIcon(table.name) : scopeMeta.icon;
  const isModuleEmbed = effectiveScope === "crm" || effectiveScope === "project";

  return (
    <NodeViewWrapper>
      <div className="border border-border rounded-lg overflow-hidden my-4">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
          <Icon className={`h-4 w-4 ${scopeMeta.color}`} />
          <span className="text-sm font-medium text-foreground">{table?.name || "Database"}</span>
          {isModuleEmbed && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-accent ${scopeMeta.color}`}>
              {scopeMeta.label}
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-1">({table?.record_count || 0})</span>
          <div className="flex-1" />
          {isModuleEmbed && (
            <a
              href={effectiveScope === "crm" ? `/crm/${tableId}` : `/tables/${tableId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 hover:bg-accent rounded text-muted-foreground"
              title="Open in module"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={() => updateAttributes({ collapsed: true })}
            className="p-1 hover:bg-accent rounded text-muted-foreground"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
        {/* Table content */}
        <div style={{ maxHeight: height, overflow: "auto" }}>
          <InlineTableView tableId={tableId} />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export default InlineDatabase;
