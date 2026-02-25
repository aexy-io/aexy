"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronLeft,
  Table2,
  Trash2,
  GripVertical,
  Save,
  History,
  AlertTriangle,
  Loader2,
  Lock,
  Globe,
  Eye,
  Users,
  Shield,
  Type,
} from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTables, useTableFields } from "@/hooks/useTables";
import { getFieldTypeOption } from "@/config/fieldTypes";
import type { TableVisibility, TableRowAccessMode } from "@/lib/api";

const VISIBILITY_OPTIONS: { value: TableVisibility; label: string; description: string; icon: typeof Globe }[] = [
  { value: "private", label: "Private", description: "Only you and collaborators can access", icon: Lock },
  { value: "workspace", label: "Workspace", description: "All workspace members can view", icon: Users },
  { value: "public", label: "Public", description: "Anyone with the link can view", icon: Globe },
];

const ROW_ACCESS_OPTIONS: { value: TableRowAccessMode; label: string; description: string }[] = [
  { value: "all", label: "All rows visible", description: "Everyone sees all records" },
  { value: "owner_only", label: "Owner only", description: "Users only see records they created" },
  { value: "team_filtered", label: "Team filtered", description: "Users see records from their team" },
  { value: "rule_based", label: "Rule based", description: "Custom row-level access rules" },
];

const TABLE_COLORS = [
  "#a855f7", "#3b82f6", "#22c55e", "#ef4444", "#f97316",
  "#eab308", "#ec4899", "#06b6d4", "#8b5cf6", "#6b7280",
];

export default function TableSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const tableId = params.tableId as string;

  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { tables, updateTable, deleteTable, isUpdating, isDeleting } = useTables(workspaceId);
  const table = tables.find((t) => t.id === tableId);

  const { fields, isLoading: fieldsLoading, updateField, deleteField } = useTableFields(workspaceId, tableId);

  // Form state
  const [name, setName] = useState("");
  const [pluralName, setPluralName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#a855f7");
  const [visibility, setVisibility] = useState<TableVisibility>("workspace");
  const [rowAccessMode, setRowAccessMode] = useState<TableRowAccessMode>("all");
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [auditRetentionDays, setAuditRetentionDays] = useState(90);
  const [hasChanges, setHasChanges] = useState(false);

  // Field editing
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingFieldName, setEditingFieldName] = useState("");

  // Danger zone
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // Load table data into form
  useEffect(() => {
    if (table) {
      setName(table.name);
      setPluralName(table.plural_name || "");
      setDescription(table.description || "");
      setColor(table.color || "#a855f7");
      setVisibility(table.visibility);
      setRowAccessMode(table.row_access_mode);
      setAuditEnabled(table.audit_config?.enabled ?? false);
      setAuditRetentionDays(table.audit_config?.retention_days ?? 90);
      setHasChanges(false);
    }
  }, [table]);

  // Track changes
  useEffect(() => {
    if (!table) return;
    const changed =
      name !== table.name ||
      pluralName !== (table.plural_name || "") ||
      description !== (table.description || "") ||
      color !== (table.color || "#a855f7") ||
      visibility !== table.visibility ||
      rowAccessMode !== table.row_access_mode ||
      auditEnabled !== (table.audit_config?.enabled ?? false) ||
      auditRetentionDays !== (table.audit_config?.retention_days ?? 90);
    setHasChanges(changed);
  }, [name, pluralName, description, color, visibility, rowAccessMode, auditEnabled, auditRetentionDays, table]);

  const handleSave = async () => {
    if (!hasChanges) return;
    await updateTable({
      tableId,
      data: {
        name: name.trim(),
        plural_name: pluralName.trim() || undefined,
        description: description.trim() || undefined,
        color,
        visibility,
        row_access_mode: rowAccessMode,
        audit_config: { enabled: auditEnabled, retention_days: auditRetentionDays },
      },
    });
    setHasChanges(false);
  };

  const handleDeleteTable = async () => {
    if (deleteConfirmName !== table?.name) return;
    await deleteTable(tableId);
    router.push("/tables");
  };

  const handleFieldRename = async (fieldId: string) => {
    if (!editingFieldName.trim()) return;
    await updateField({ fieldId, data: { name: editingFieldName.trim() } });
    setEditingFieldId(null);
    setEditingFieldName("");
  };

  const handleFieldDelete = async (fieldId: string, fieldName: string) => {
    if (confirm(`Delete field "${fieldName}"? This will permanently remove all data in this column.`)) {
      await deleteField(fieldId);
    }
  };

  const handleToggleRequired = async (fieldId: string, currentRequired: boolean) => {
    await updateField({ fieldId, data: { is_required: !currentRequired } });
  };

  const handleToggleFilterable = async (fieldId: string, currentFilterable: boolean) => {
    await updateField({ fieldId, data: { is_filterable: !currentFilterable } });
  };

  if (!table) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sortedFields = [...fields].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <div className="min-h-screen bg-background">
      <div className="p-8">
        <div className="max-w-3xl mx-auto">
          <Breadcrumb
            items={[
              { label: "Tables", href: "/tables" },
              { label: table.name, href: `/tables/${tableId}` },
              { label: "Settings" },
            ]}
          />

          {/* Header */}
          <div className="flex items-center gap-4 mb-8 mt-4">
            <button
              onClick={() => router.push(`/tables/${tableId}`)}
              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${color}20` }}
              >
                <Table2 className="h-5 w-5" style={{ color }} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Table Settings</h1>
                <p className="text-sm text-muted-foreground">{table.name}</p>
              </div>
            </div>
            <div className="flex-1" />
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={isUpdating || !name.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors"
              >
                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </button>
            )}
          </div>

          {/* General Settings */}
          <section className="bg-muted border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">General</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Table Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm"
                  placeholder="Table name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Plural Name</label>
                <input
                  type="text"
                  value={pluralName}
                  onChange={(e) => setPluralName(e.target.value)}
                  className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm"
                  placeholder="e.g. Employees, Projects"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm resize-none"
                  placeholder="Describe what this table is for..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Color</label>
                <div className="flex items-center gap-2">
                  {TABLE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Visibility & Access */}
          <section className="bg-muted border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Visibility & Access</h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">Who can access this table?</label>
              <div className="space-y-2">
                {VISIBILITY_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        visibility === opt.value
                          ? "border-purple-500 bg-purple-500/5"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        value={opt.value}
                        checked={visibility === opt.value}
                        onChange={() => setVisibility(opt.value)}
                        className="sr-only"
                      />
                      <Icon className={`h-4 w-4 ${visibility === opt.value ? "text-purple-500" : "text-muted-foreground"}`} />
                      <div>
                        <div className="text-sm font-medium text-foreground">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Row-level access</label>
              <div className="space-y-2">
                {ROW_ACCESS_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      rowAccessMode === opt.value
                        ? "border-purple-500 bg-purple-500/5"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <input
                      type="radio"
                      name="rowAccess"
                      value={opt.value}
                      checked={rowAccessMode === opt.value}
                      onChange={() => setRowAccessMode(opt.value)}
                      className="sr-only"
                    />
                    <Shield className={`h-4 w-4 ${rowAccessMode === opt.value ? "text-purple-500" : "text-muted-foreground"}`} />
                    <div>
                      <div className="text-sm font-medium text-foreground">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </section>

          {/* Audit Trail */}
          <section className="bg-muted border border-border rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <History className="h-5 w-5 text-purple-400" />
              <h2 className="text-lg font-semibold text-foreground">Audit Trail</h2>
            </div>
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={auditEnabled}
                  onChange={(e) => setAuditEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
                />
                <div>
                  <div className="text-sm font-medium text-foreground">Enable activity logging</div>
                  <div className="text-xs text-muted-foreground">
                    Track all record creates, updates, deletes, and permission changes
                  </div>
                </div>
              </label>
              {auditEnabled && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Retention period (days)
                  </label>
                  <input
                    type="number"
                    value={auditRetentionDays}
                    onChange={(e) => setAuditRetentionDays(Math.max(1, parseInt(e.target.value) || 90))}
                    min={1}
                    max={365}
                    className="w-32 px-3 py-2 bg-accent border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Audit entries older than this will be automatically cleaned up.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Field Management */}
          <section className="bg-muted border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Fields ({fields.length})
            </h2>

            {fieldsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : sortedFields.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No fields defined. Go to the table view to add fields.
              </p>
            ) : (
              <div className="space-y-1">
                {sortedFields.map((field) => {
                  const typeInfo = getFieldTypeOption(field.attribute_type);
                  const isEditing = editingFieldId === field.id;

                  return (
                    <div
                      key={field.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 group"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground cursor-grab" />
                      <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-500 shrink-0">
                        {typeInfo?.icon || <Type className="h-4 w-4" />}
                      </div>

                      {isEditing ? (
                        <input
                          type="text"
                          value={editingFieldName}
                          onChange={(e) => setEditingFieldName(e.target.value)}
                          onBlur={() => handleFieldRename(field.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleFieldRename(field.id);
                            if (e.key === "Escape") { setEditingFieldId(null); setEditingFieldName(""); }
                          }}
                          className="flex-1 px-2 py-1 bg-accent border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                          autoFocus
                        />
                      ) : (
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => { setEditingFieldId(field.id); setEditingFieldName(field.name); }}
                        >
                          <div className="text-sm font-medium text-foreground truncate">{field.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {typeInfo?.label || field.attribute_type}
                            {field.is_required && " \u00b7 Required"}
                            {field.is_unique && " \u00b7 Unique"}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleToggleRequired(field.id, field.is_required)}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            field.is_required
                              ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                              : "bg-accent text-muted-foreground hover:text-foreground"
                          }`}
                          title={field.is_required ? "Make optional" : "Make required"}
                        >
                          Req
                        </button>
                        <button
                          onClick={() => handleToggleFilterable(field.id, field.is_filterable)}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            field.is_filterable
                              ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                              : "bg-accent text-muted-foreground hover:text-foreground"
                          }`}
                          title={field.is_filterable ? "Disable filtering" : "Enable filtering"}
                        >
                          Filter
                        </button>
                        <button
                          onClick={() => handleFieldDelete(field.id, field.name)}
                          className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Delete field"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Danger Zone */}
          <section className="border border-red-500/30 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete this table and all its records. This action cannot be undone.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">
                  Type <span className="font-medium text-foreground">{table.name}</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  className="w-full px-3 py-2 bg-accent border border-red-500/30 rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder={table.name}
                />
              </div>
              <button
                onClick={handleDeleteTable}
                disabled={deleteConfirmName !== table.name || isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/30 disabled:text-red-300/50 text-white rounded-lg transition-colors whitespace-nowrap"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete Table
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
