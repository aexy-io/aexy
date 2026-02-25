"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useState, useMemo, useEffect } from "react";
import { Table2, Plus, ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTables, useTableFields, useTableRecords } from "@/hooks/useTables";
import { DataTable } from "@/components/crm/DataTable";
import type { CRMAttribute, CRMRecord } from "@/lib/api";

// TipTap Node Definition
export const InlineDatabase = Node.create({
  name: "inlineDatabase",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      tableId: { default: null },
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
  onCreated: (id: string) => void;
  onLink: (id: string) => void;
}) {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { tables, createTable, isCreating } = useTables(workspaceId);
  const [mode, setMode] = useState<"choose" | "create" | "link">("choose");
  const [name, setName] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    const table = await createTable({ name, visibility: "workspace" });
    onCreated(table.id);
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
        {tables.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tables available</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {tables.map((t) => (
              <button
                key={t.id}
                onClick={() => onLink(t.id)}
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
          Link Existing
        </button>
      </div>
    </div>
  );
}

// Collapsed view
function CollapsedTableCard({
  tableId,
  onExpand,
}: {
  tableId: string;
  onExpand: () => void;
}) {
  const { currentWorkspace } = useWorkspace();
  const { tables } = useTables(currentWorkspace?.id || null);
  const table = tables.find((t) => t.id === tableId);

  return (
    <button
      onClick={onExpand}
      className="w-full bg-muted/50 border border-border rounded-lg p-3 flex items-center gap-3 hover:border-purple-500/50 transition-colors"
    >
      <Table2 className="h-5 w-5 text-purple-400" />
      <span className="font-medium text-foreground text-sm">{table?.name || "Database"}</span>
      <span className="text-xs text-muted-foreground">{table?.record_count || 0} records</span>
      <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
    </button>
  );
}

// Main inline table view
function InlineTableView({ tableId }: { tableId: string }) {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { fields } = useTableFields(workspaceId, tableId);
  const { records: rawRecords, total, isLoading } = useTableRecords(workspaceId, tableId);

  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  useEffect(() => {
    if (fields.length > 0 && visibleColumns.length === 0) {
      setVisibleColumns(fields.slice(0, 5).map((f) => f.slug));
      setColumnOrder(fields.map((f) => f.slug));
    }
  }, [fields, visibleColumns.length]);

  const attributes: CRMAttribute[] = useMemo(
    () =>
      fields.map((f) => ({
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
      })),
    [fields]
  );

  const records: CRMRecord[] = useMemo(
    () =>
      rawRecords.map((r) => ({
        id: r.id,
        object_id: r.object_id,
        values: r.values,
        display_name: null,
        created_by_id: r.created_by_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
        is_deleted: false,
        deleted_at: null,
      })),
    [rawRecords]
  );

  return (
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
      enableColumnSelector={false}
    />
  );
}

// Node View Component
function InlineDatabaseView({ node, updateAttributes }: {
  node: { attrs: { tableId: string | null; height: number; collapsed: boolean } };
  updateAttributes: (attrs: Record<string, unknown>) => void;
}) {
  const { tableId, height, collapsed } = node.attrs;
  const { currentWorkspace } = useWorkspace();
  const { tables } = useTables(currentWorkspace?.id || null);
  const table = tableId ? tables.find((t) => t.id === tableId) : null;

  if (!tableId) {
    return (
      <NodeViewWrapper>
        <CreateTablePrompt
          onCreated={(id) => updateAttributes({ tableId: id })}
          onLink={(id) => updateAttributes({ tableId: id })}
        />
      </NodeViewWrapper>
    );
  }

  if (collapsed) {
    return (
      <NodeViewWrapper>
        <CollapsedTableCard
          tableId={tableId}
          onExpand={() => updateAttributes({ collapsed: false })}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper>
      <div className="border border-border rounded-lg overflow-hidden my-4">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
          <Table2 className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">{table?.name || "Database"}</span>
          <span className="text-xs text-muted-foreground ml-1">({table?.record_count || 0})</span>
          <div className="flex-1" />
          <button
            onClick={() => updateAttributes({ collapsed: true })}
            className="p-1 hover:bg-accent rounded text-muted-foreground"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
        {/* Table content */}
        <div style={{ height, overflow: "auto" }}>
          <InlineTableView tableId={tableId} />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export default InlineDatabase;
