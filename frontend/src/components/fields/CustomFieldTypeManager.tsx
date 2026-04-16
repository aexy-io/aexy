"use client";

import { useState } from "react";
import {
  Plus, Pencil, Trash2, X, ChevronDown, Palette, Hash, Calendar, CheckSquare,
  List, Mail, Phone, Link2, Star, Type, FileText, ToggleLeft,
} from "lucide-react";
import { useCustomFieldTypes } from "@/hooks/useTables";
import type { WorkspaceFieldType } from "@/lib/api";

const BASE_TYPES = [
  { value: "text", label: "Text", icon: Type },
  { value: "textarea", label: "Long Text", icon: FileText },
  { value: "number", label: "Number", icon: Hash },
  { value: "currency", label: "Currency", icon: Hash },
  { value: "date", label: "Date", icon: Calendar },
  { value: "checkbox", label: "Checkbox", icon: CheckSquare },
  { value: "select", label: "Select", icon: List },
  { value: "multi_select", label: "Multi Select", icon: List },
  { value: "email", label: "Email", icon: Mail },
  { value: "phone", label: "Phone", icon: Phone },
  { value: "url", label: "URL", icon: Link2 },
  { value: "rating", label: "Rating", icon: Star },
] as const;

const VARIANT_OPTIONS: Record<string, { id: string; label: string }[]> = {
  text: [{ id: "plain", label: "Plain" }, { id: "truncated", label: "Truncated" }],
  number: [{ id: "plain", label: "Plain" }, { id: "progress_bar", label: "Progress Bar" }, { id: "colored_badge", label: "Colored Badge" }],
  currency: [{ id: "plain", label: "Plain" }, { id: "colored", label: "Colored +/-" }, { id: "abbreviated", label: "Abbreviated" }],
  date: [{ id: "relative", label: "Relative" }, { id: "absolute", label: "Absolute" }, { id: "short", label: "Short" }],
  checkbox: [{ id: "check_icon", label: "Check Icon" }, { id: "toggle", label: "Toggle" }, { id: "yes_no", label: "Yes/No" }],
  select: [{ id: "pill", label: "Pill" }, { id: "dot_label", label: "Dot + Label" }, { id: "colored_bg", label: "Colored BG" }],
  multi_select: [{ id: "pills", label: "Pills" }, { id: "comma_text", label: "Comma Text" }, { id: "count_badge", label: "Count Badge" }],
  email: [{ id: "link", label: "Link" }, { id: "avatar_chip", label: "Avatar Chip" }],
  phone: [{ id: "plain", label: "Plain" }, { id: "formatted", label: "Formatted" }],
  url: [{ id: "link", label: "Link" }, { id: "favicon_link", label: "Favicon Link" }],
  rating: [{ id: "stars", label: "Stars" }, { id: "hearts", label: "Hearts" }, { id: "dots", label: "Dots" }, { id: "numeric", label: "Numeric" }],
  textarea: [{ id: "plain", label: "Plain" }, { id: "markdown", label: "Markdown" }],
};

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280",
];

function getBaseTypeIcon(baseType: string) {
  const bt = BASE_TYPES.find((b) => b.value === baseType);
  return bt?.icon || Type;
}

interface CreateFormState {
  name: string;
  base_type: string;
  default_variant: string;
  icon: string;
  color: string;
  preset_options: { value: string; label: string; color?: string }[];
  validation_rules: { min?: number; max?: number; required?: boolean };
}

const INITIAL_FORM: CreateFormState = {
  name: "",
  base_type: "text",
  default_variant: "",
  icon: "",
  color: "",
  preset_options: [],
  validation_rules: {},
};

function OptionEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string; color?: string }[];
  onChange: (opts: { value: string; label: string; color?: string }[]) => void;
}) {
  const [newLabel, setNewLabel] = useState("");

  const addOption = () => {
    if (!newLabel.trim()) return;
    const value = newLabel.trim().toLowerCase().replace(/\s+/g, "_");
    onChange([...options, { value, label: newLabel.trim() }]);
    setNewLabel("");
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">Preset Options</label>
      <div className="space-y-1">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <input
              type="color"
              value={opt.color || "#6b7280"}
              onChange={(e) => {
                const updated = [...options];
                updated[i] = { ...opt, color: e.target.value };
                onChange(updated);
              }}
              className="w-5 h-5 rounded cursor-pointer border-0"
            />
            <span className="flex-1 text-foreground">{opt.label}</span>
            <button
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-red-400"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
          placeholder="Add option..."
          className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded text-foreground placeholder-muted-foreground"
        />
        <button
          onClick={addOption}
          disabled={!newLabel.trim()}
          className="px-2 py-1 text-xs bg-accent hover:bg-accent/80 rounded text-foreground disabled:opacity-30"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function CreateEditForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  title,
}: {
  initial: CreateFormState;
  onSubmit: (form: CreateFormState) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  title: string;
}) {
  const [form, setForm] = useState<CreateFormState>(initial);
  const variants = VARIANT_OPTIONS[form.base_type] || [];
  const isSelectBased = ["select", "multi_select", "status"].includes(form.base_type);

  return (
    <div className="border border-border rounded-lg p-4 bg-background space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Name */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Priority Score"
            className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground"
          />
        </div>

        {/* Base Type */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Base Type</label>
          <div className="relative mt-1">
            <select
              value={form.base_type}
              onChange={(e) => setForm({ ...form, base_type: e.target.value, default_variant: "", preset_options: [] })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground appearance-none cursor-pointer"
            >
              {BASE_TYPES.map((bt) => (
                <option key={bt.value} value={bt.value}>{bt.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Default Variant */}
        {variants.length > 0 && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Default Display</label>
            <div className="relative mt-1">
              <select
                value={form.default_variant}
                onChange={(e) => setForm({ ...form, default_variant: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground appearance-none cursor-pointer"
              >
                <option value="">Auto</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        )}

        {/* Color */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Color</label>
          <div className="flex items-center gap-1.5 mt-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setForm({ ...form, color: form.color === c ? "" : c })}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  form.color === c ? "border-foreground scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Number validation */}
      {form.base_type === "number" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Min Value</label>
            <input
              type="number"
              value={form.validation_rules.min ?? ""}
              onChange={(e) => setForm({ ...form, validation_rules: { ...form.validation_rules, min: e.target.value ? Number(e.target.value) : undefined } })}
              className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Max Value</label>
            <input
              type="number"
              value={form.validation_rules.max ?? ""}
              onChange={(e) => setForm({ ...form, validation_rules: { ...form.validation_rules, max: e.target.value ? Number(e.target.value) : undefined } })}
              className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
            />
          </div>
        </div>
      )}

      {/* Preset options for select-based types */}
      {isSelectBased && (
        <OptionEditor
          options={form.preset_options}
          onChange={(opts) => setForm({ ...form, preset_options: opts })}
        />
      )}

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={() => onSubmit(form)}
          disabled={isSubmitting || !form.name.trim()}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg text-sm font-medium"
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function FieldTypeCard({
  fieldType,
  onEdit,
  onDelete,
}: {
  fieldType: WorkspaceFieldType;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = getBaseTypeIcon(fieldType.base_type);
  const baseLabel = BASE_TYPES.find((b) => b.value === fieldType.base_type)?.label || fieldType.base_type;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg bg-background hover:bg-accent/30 transition-colors group">
      <div
        className="p-2 rounded-lg"
        style={{ backgroundColor: fieldType.color ? `${fieldType.color}20` : "rgba(139, 92, 246, 0.1)" }}
      >
        <Icon className="h-4 w-4" style={{ color: fieldType.color || "#8b5cf6" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{fieldType.name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
            custom:{fieldType.slug}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          <span>Based on {baseLabel}</span>
          {fieldType.default_variant && <span>{` \u00b7 ${fieldType.default_variant}`}</span>}
          {fieldType.preset_options && fieldType.preset_options.length > 0 && (
            <span>{` \u00b7 ${fieldType.preset_options.length} options`}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface CustomFieldTypeManagerProps {
  workspaceId: string | null;
}

export function CustomFieldTypeManager({ workspaceId }: CustomFieldTypeManagerProps) {
  const { fieldTypes, isLoading, createFieldType, updateFieldType, deleteFieldType, isCreating } =
    useCustomFieldTypes(workspaceId);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = async (form: CreateFormState) => {
    const hasValidation = form.validation_rules.min !== undefined || form.validation_rules.max !== undefined;
    await createFieldType({
      name: form.name,
      base_type: form.base_type,
      default_variant: form.default_variant || undefined,
      icon: form.icon || undefined,
      color: form.color || undefined,
      validation_rules: hasValidation ? form.validation_rules : undefined,
      preset_options: form.preset_options.length > 0 ? form.preset_options : undefined,
    });
    setShowCreate(false);
  };

  const handleUpdate = async (typeId: string, form: CreateFormState) => {
    const hasValidation = form.validation_rules.min !== undefined || form.validation_rules.max !== undefined;
    await updateFieldType({
      typeId,
      data: {
        name: form.name,
        default_variant: form.default_variant || undefined,
        icon: form.icon || undefined,
        color: form.color || undefined,
        validation_rules: hasValidation ? form.validation_rules : undefined,
        preset_options: form.preset_options.length > 0 ? form.preset_options : undefined,
      },
    });
    setEditingId(null);
  };

  const handleDelete = async (typeId: string) => {
    await deleteFieldType(typeId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Custom Field Types</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define reusable field types that appear alongside built-in types when adding fields to tables
          </p>
        </div>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            New Type
          </button>
        )}
      </div>

      {showCreate && (
        <CreateEditForm
          initial={INITIAL_FORM}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          isSubmitting={isCreating}
          title="Create Custom Field Type"
        />
      )}

      {fieldTypes.length === 0 && !showCreate ? (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <Palette className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No custom field types yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Create a custom type like &quot;Priority Score&quot; or &quot;Status Tag&quot;
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {fieldTypes.map((ft) =>
            editingId === ft.id ? (
              <CreateEditForm
                key={ft.id}
                initial={{
                  name: ft.name,
                  base_type: ft.base_type,
                  default_variant: ft.default_variant || "",
                  icon: ft.icon || "",
                  color: ft.color || "",
                  preset_options: ft.preset_options || [],
                  validation_rules: (ft.validation_rules as CreateFormState["validation_rules"]) || {},
                }}
                onSubmit={(form) => handleUpdate(ft.id, form)}
                onCancel={() => setEditingId(null)}
                isSubmitting={false}
                title="Edit Custom Field Type"
              />
            ) : (
              <FieldTypeCard
                key={ft.id}
                fieldType={ft}
                onEdit={() => setEditingId(ft.id)}
                onDelete={() => handleDelete(ft.id)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
