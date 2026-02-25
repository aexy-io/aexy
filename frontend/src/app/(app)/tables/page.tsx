"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Table2,
  MoreHorizontal,
  Trash2,
  Settings,
  Lock,
  Globe,
  Eye,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTables } from "@/hooks/useTables";
import { SearchInput } from "@/components/ui/search-input";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import type { StandaloneTable, TableVisibility } from "@/lib/api";

const visibilityConfig: Record<TableVisibility, { label: string; icon: typeof Globe; color: string }> = {
  workspace: { label: "Workspace", icon: Globe, color: "text-blue-400" },
  private: { label: "Private", icon: Lock, color: "text-yellow-400" },
  public: { label: "Public", icon: Eye, color: "text-green-400" },
};

function CreateTableModal({
  isOpen,
  onClose,
  onCreate,
  isCreating,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; description?: string; visibility?: TableVisibility }) => Promise<unknown>;
  isCreating: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<TableVisibility>("workspace");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate({ name, description: description || undefined, visibility });
    setName("");
    setDescription("");
    setVisibility("workspace");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-muted rounded-xl p-6 w-full max-w-lg border border-border">
        <h3 className="text-xl font-semibold text-foreground mb-4">Create Table</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Project Tracker, Inventory..."
              className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this table for?"
              rows={2}
              className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Visibility</label>
            <div className="flex gap-2">
              {(Object.entries(visibilityConfig) as [TableVisibility, typeof visibilityConfig.workspace][]).map(
                ([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setVisibility(key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                      visibility === key
                        ? "border-purple-500 bg-purple-500/10 text-purple-400"
                        : "border-border bg-accent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <config.icon className="h-4 w-4" />
                    {config.label}
                  </button>
                )
              )}
            </div>
          </div>
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
              disabled={isCreating || !name.trim()}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors"
            >
              {isCreating ? "Creating..." : "Create Table"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TableCard({
  table,
  onClick,
  onDelete,
}: {
  table: StandaloneTable;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const vis = visibilityConfig[table.visibility] || visibilityConfig.workspace;
  const VisIcon = vis.icon;

  return (
    <div
      onClick={onClick}
      className="bg-muted/50 border border-border rounded-xl p-5 hover:border-purple-500/50 transition-colors cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: table.color ? `${table.color}20` : "rgba(147, 51, 234, 0.2)" }}
          >
            <Table2
              className="h-5 w-5"
              style={{ color: table.color || "#a855f7" }}
            />
          </div>
          <div>
            <h3 className="font-medium text-foreground">{table.name}</h3>
            {table.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">{table.description}</p>
            )}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 bg-muted border border-border rounded-lg shadow-lg py-1 w-40 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete();
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-accent"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{table.record_count} records</span>
        <span className={`flex items-center gap-1 ${vis.color}`}>
          <VisIcon className="h-3 w-3" />
          {vis.label}
        </span>
      </div>
    </div>
  );
}

export default function TablesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { tables, isLoading, createTable, deleteTable, isCreating } = useTables(workspaceId);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTables = searchQuery
    ? tables.filter(
        (t) =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tables;

  const handleDelete = async (tableId: string) => {
    if (confirm("Are you sure you want to delete this table and all its data?")) {
      await deleteTable(tableId);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <Breadcrumb items={[{ label: "Tables" }]} />

          {/* Header */}
          <div className="flex items-center justify-between mb-6 mt-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Tables</h1>
              <p className="text-sm text-muted-foreground">
                Create and manage standalone data tables
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Table
            </button>
          </div>

          {/* Search */}
          <div className="mb-6">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search tables..."
              wrapperClassName="max-w-md"
            />
          </div>

          {/* Table Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-muted/50 border border-border rounded-xl p-5 animate-pulse">
                  <div className="h-12 bg-accent rounded-lg mb-3" />
                  <div className="h-4 bg-accent rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="text-center py-16">
              <Table2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {searchQuery ? "No tables found" : "No tables yet"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "Try a different search term"
                  : "Create your first table to start organizing data"}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create Table
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  onClick={() => router.push(`/tables/${table.id}`)}
                  onDelete={() => handleDelete(table.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateTableModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={createTable}
        isCreating={isCreating}
      />
    </div>
  );
}
