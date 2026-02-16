"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Settings,
  Eye,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Type,
  AlignLeft,
  Mail,
  List,
  CheckSquare,
  Calendar,
  Paperclip,
  ToggleLeft,
  Hash,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTicketForm } from "@/hooks/useTicketing";
import {
  TicketFieldType,
  TicketFormAuthMode,
  FieldOption,
  TicketPriority,
  TicketSeverity,
} from "@/lib/api";

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const SEVERITY_OPTIONS: { value: TicketSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const FIELD_TYPE_CONFIG: Record<TicketFieldType, { icon: React.ReactNode; label: string; description: string }> = {
  text: { icon: <Type className="h-4 w-4" />, label: "Short Text", description: "Single line text input" },
  textarea: { icon: <AlignLeft className="h-4 w-4" />, label: "Long Text", description: "Multi-line text area" },
  email: { icon: <Mail className="h-4 w-4" />, label: "Email", description: "Email address input" },
  select: { icon: <List className="h-4 w-4" />, label: "Dropdown", description: "Single selection dropdown" },
  multiselect: { icon: <CheckSquare className="h-4 w-4" />, label: "Multi-Select", description: "Multiple choice selection" },
  checkbox: { icon: <ToggleLeft className="h-4 w-4" />, label: "Checkbox", description: "Yes/No toggle" },
  date: { icon: <Calendar className="h-4 w-4" />, label: "Date", description: "Date picker" },
  datetime: { icon: <Calendar className="h-4 w-4" />, label: "Date & Time", description: "Date and time picker" },
  file: { icon: <Paperclip className="h-4 w-4" />, label: "File Upload", description: "File attachment" },
  number: { icon: <Hash className="h-4 w-4" />, label: "Number", description: "Numeric input" },
};

interface FieldEditorProps {
  field: {
    id: string;
    name: string;
    field_key: string;
    field_type: TicketFieldType;
    placeholder?: string;
    help_text?: string;
    is_required: boolean;
    options?: FieldOption[];
    position: number;
  };
  onUpdate: (fieldId: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (fieldId: string) => Promise<void>;
  isUpdating: boolean;
  isDeleting: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function FieldEditor({
  field,
  onUpdate,
  onDelete,
  isUpdating,
  isDeleting,
  isExpanded,
  onToggleExpand,
}: FieldEditorProps) {
  const [localField, setLocalField] = useState(field);
  const [hasChanges, setHasChanges] = useState(false);
  const [optionInput, setOptionInput] = useState("");

  const handleChange = (key: string, value: unknown) => {
    setLocalField({ ...localField, [key]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    await onUpdate(field.id, {
      name: localField.name,
      placeholder: localField.placeholder,
      help_text: localField.help_text,
      is_required: localField.is_required,
      options: localField.options,
    });
    setHasChanges(false);
  };

  const handleAddOption = () => {
    if (!optionInput.trim()) return;
    const newOption: FieldOption = {
      value: optionInput.toLowerCase().replace(/\s+/g, "_"),
      label: optionInput,
    };
    handleChange("options", [...(localField.options || []), newOption]);
    setOptionInput("");
  };

  const handleRemoveOption = (index: number) => {
    const newOptions = [...(localField.options || [])];
    newOptions.splice(index, 1);
    handleChange("options", newOptions);
  };

  const handleDelete = async () => {
    if (confirm(`Delete field "${field.name}"?`)) {
      await onDelete(field.id);
    }
  };

  const fieldConfig = FIELD_TYPE_CONFIG[field.field_type];

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-700/50 transition"
        onClick={onToggleExpand}
      >
        <GripVertical className="h-4 w-4 text-slate-500 cursor-grab" />
        <div className="p-2 bg-slate-700 rounded">
          {fieldConfig.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">{field.name}</span>
            {field.is_required && (
              <span className="text-red-400 text-xs">*Required</span>
            )}
          </div>
          <span className="text-slate-500 text-sm">{fieldConfig.label}</span>
        </div>
        {hasChanges && (
          <span className="text-yellow-400 text-xs px-2 py-1 bg-yellow-900/30 rounded">
            Unsaved
          </span>
        )}
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-700 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Label</label>
              <input
                type="text"
                value={localField.name}
                onChange={(e) => handleChange("name", e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Field Key</label>
              <input
                type="text"
                value={field.field_key}
                disabled
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Placeholder</label>
            <input
              type="text"
              value={localField.placeholder || ""}
              onChange={(e) => handleChange("placeholder", e.target.value)}
              placeholder="Enter placeholder text..."
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Help Text</label>
            <input
              type="text"
              value={localField.help_text || ""}
              onChange={(e) => handleChange("help_text", e.target.value)}
              placeholder="Additional instructions for this field..."
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`required-${field.id}`}
              checked={localField.is_required}
              onChange={(e) => handleChange("is_required", e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
            />
            <label htmlFor={`required-${field.id}`} className="text-white text-sm">
              Required field
            </label>
          </div>

          {/* Options for select/multiselect */}
          {(field.field_type === "select" || field.field_type === "multiselect") && (
            <div>
              <label className="block text-sm text-slate-400 mb-2">Options</label>
              <div className="space-y-2 mb-3">
                {(localField.options || []).map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={option.label}
                      onChange={(e) => {
                        const newOptions = [...(localField.options || [])];
                        newOptions[index] = { ...option, label: e.target.value };
                        handleChange("options", newOptions);
                      }}
                      className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={() => handleRemoveOption(index)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddOption()}
                  placeholder="Add option..."
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleAddOption}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-700">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-900/20 rounded-lg transition text-sm"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete Field
            </button>
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={isUpdating}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm"
              >
                {isUpdating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FormBuilderPage() {
  const router = useRouter();
  const params = useParams();
  const formId = params.formId as string;

  const { currentWorkspaceId } = useWorkspace();
  const {
    form,
    isLoading,
    updateForm,
    addField,
    updateField,
    deleteField,
    isUpdating,
    isAddingField,
    isUpdatingField,
    isDeletingField,
  } = useTicketForm(currentWorkspaceId, formId);

  const [activeTab, setActiveTab] = useState<"fields" | "settings">("fields");
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [showAddField, setShowAddField] = useState(false);
  const [formSettings, setFormSettings] = useState({
    name: "",
    description: "",
    is_active: true,
    auth_mode: "anonymous" as TicketFormAuthMode,
    require_email: false,
    success_message: "",
    auto_assign_oncall: false,
    default_priority: undefined as TicketPriority | undefined,
    default_severity: undefined as TicketSeverity | undefined,
  });
  const [settingsHasChanges, setSettingsHasChanges] = useState(false);

  // Update local settings when form loads
  useState(() => {
    if (form) {
      setFormSettings({
        name: form.name,
        description: form.description || "",
        is_active: form.is_active,
        auth_mode: form.auth_mode,
        require_email: form.require_email,
        success_message: form.success_message || "",
        auto_assign_oncall: form.auto_assign_oncall || false,
        default_priority: form.default_priority,
        default_severity: form.default_severity,
      });
    }
  });

  const handleSettingsChange = (key: string, value: unknown) => {
    setFormSettings({ ...formSettings, [key]: value });
    setSettingsHasChanges(true);
  };

  const handleSaveSettings = async () => {
    await updateForm(formSettings);
    setSettingsHasChanges(false);
  };

  const handleAddField = async (fieldType: TicketFieldType) => {
    const fieldConfig = FIELD_TYPE_CONFIG[fieldType];
    const fieldKey = `field_${Date.now()}`;
    await addField({
      name: fieldConfig.label,
      field_key: fieldKey,
      field_type: fieldType,
      is_required: false,
      position: (form?.fields?.length || 0) + 1,
    });
    setShowAddField(false);
  };

  const handleUpdateField = async (fieldId: string, data: Record<string, unknown>) => {
    await updateField({ fieldId, data });
  };

  const handleDeleteField = async (fieldId: string) => {
    await deleteField(fieldId);
  };

  const publicUrl = form
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/public/forms/${form.public_url_token}`
    : "";

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white">Loading form...</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-white mb-4">Form not found</p>
          <Link
            href="/settings/ticket-forms"
            className="text-purple-400 hover:text-purple-300"
          >
            Back to Forms
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings/ticket-forms"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Ticket Forms
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{form.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {form.fields?.length || 0} fields
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyUrl}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
            >
              <Copy className="h-4 w-4" />
              Copy URL
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
            >
              <Eye className="h-4 w-4" />
              Preview
            </a>
          </div>
        </div>
      </div>

      <div>
        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800 p-1 rounded-lg w-fit mb-6">
          <button
            onClick={() => setActiveTab("fields")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === "fields"
                ? "bg-purple-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Fields
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-2 ${
              activeTab === "settings"
                ? "bg-purple-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>

        {/* Fields Tab */}
        {activeTab === "fields" && (
          <div className="space-y-4">
            {/* Fields List */}
            {form.fields && form.fields.length > 0 ? (
              form.fields
                .sort((a, b) => a.position - b.position)
                .map((field) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    onUpdate={handleUpdateField}
                    onDelete={handleDeleteField}
                    isUpdating={isUpdatingField}
                    isDeleting={isDeletingField}
                    isExpanded={expandedField === field.id}
                    onToggleExpand={() =>
                      setExpandedField(expandedField === field.id ? null : field.id)
                    }
                  />
                ))
            ) : (
              <div className="bg-slate-800 rounded-xl p-8 text-center border border-slate-700">
                <p className="text-slate-400 mb-4">No fields yet. Add your first field to get started.</p>
              </div>
            )}

            {/* Add Field Button */}
            <button
              onClick={() => setShowAddField(true)}
              className="w-full p-4 border-2 border-dashed border-slate-700 rounded-xl text-slate-400 hover:text-white hover:border-slate-600 transition flex items-center justify-center gap-2"
            >
              <Plus className="h-5 w-5" />
              Add Field
            </button>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-6">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Form Name</label>
              <input
                type="text"
                value={formSettings.name}
                onChange={(e) => handleSettingsChange("name", e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Description</label>
              <textarea
                value={formSettings.description}
                onChange={(e) => handleSettingsChange("description", e.target.value)}
                rows={3}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formSettings.is_active}
                onChange={(e) => handleSettingsChange("is_active", e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
              />
              <label htmlFor="is_active" className="text-white">
                Form is active and accepting submissions
              </label>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Authentication Mode</label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 bg-slate-700 rounded-lg cursor-pointer hover:bg-slate-600 transition">
                  <input
                    type="radio"
                    name="auth_mode"
                    value="anonymous"
                    checked={formSettings.auth_mode === "anonymous"}
                    onChange={() => handleSettingsChange("auth_mode", "anonymous")}
                    className="text-purple-500 focus:ring-purple-500"
                  />
                  <div>
                    <p className="text-white font-medium">Anonymous</p>
                    <p className="text-slate-400 text-sm">Anyone can submit without verification</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 bg-slate-700 rounded-lg cursor-pointer hover:bg-slate-600 transition">
                  <input
                    type="radio"
                    name="auth_mode"
                    value="email_verification"
                    checked={formSettings.auth_mode === "email_verification"}
                    onChange={() => handleSettingsChange("auth_mode", "email_verification")}
                    className="text-purple-500 focus:ring-purple-500"
                  />
                  <div>
                    <p className="text-white font-medium">Email Verification</p>
                    <p className="text-slate-400 text-sm">Submitters must verify their email before submission</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="require_email"
                checked={formSettings.require_email}
                onChange={(e) => handleSettingsChange("require_email", e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
              />
              <label htmlFor="require_email" className="text-white">
                Require email address (even in anonymous mode)
              </label>
            </div>

            {/* Ticket Defaults Section */}
            <div className="pt-4 border-t border-slate-700">
              <h3 className="text-white font-medium mb-4">Ticket Defaults</h3>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Default Priority</label>
                  <select
                    value={formSettings.default_priority || ""}
                    onChange={(e) => handleSettingsChange("default_priority", e.target.value || undefined)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">No default</option>
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Default Severity</label>
                  <select
                    value={formSettings.default_severity || ""}
                    onChange={(e) => handleSettingsChange("default_severity", e.target.value || undefined)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">No default</option>
                    {SEVERITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 p-4 bg-slate-700 rounded-lg">
                <input
                  type="checkbox"
                  id="auto_assign_oncall"
                  checked={formSettings.auto_assign_oncall}
                  onChange={(e) => handleSettingsChange("auto_assign_oncall", e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                />
                <label htmlFor="auto_assign_oncall" className="text-white">
                  Auto-assign to on-call person
                </label>
                <span className="text-slate-400 text-sm ml-2">
                  Tickets will be automatically assigned to whoever is currently on-call
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Success Message</label>
              <textarea
                value={formSettings.success_message}
                onChange={(e) => handleSettingsChange("success_message", e.target.value)}
                rows={2}
                placeholder="Thank you for your submission!"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Public URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={publicUrl}
                  readOnly
                  className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-400"
                />
                <button
                  onClick={handleCopyUrl}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            {settingsHasChanges && (
              <div className="flex justify-end pt-4 border-t border-slate-700">
                <button
                  onClick={handleSaveSettings}
                  disabled={isUpdating}
                  className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
                >
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Settings
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Field Modal */}
      {showAddField && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-white mb-4">Add Field</h3>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(FIELD_TYPE_CONFIG) as TicketFieldType[]).map((type) => {
                const config = FIELD_TYPE_CONFIG[type];
                return (
                  <button
                    key={type}
                    onClick={() => handleAddField(type)}
                    disabled={isAddingField}
                    className="p-4 bg-slate-700 hover:bg-slate-600 rounded-lg text-left transition flex items-start gap-3"
                  >
                    <div className="p-2 bg-slate-600 rounded">
                      {config.icon}
                    </div>
                    <div>
                      <p className="text-white font-medium">{config.label}</p>
                      <p className="text-slate-400 text-xs">{config.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end mt-6 pt-4 border-t border-slate-700">
              <button
                onClick={() => setShowAddField(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
