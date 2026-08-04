"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Ticket,
  Copy,
  Trash2,
  ExternalLink,
  MoreVertical,
  CheckCircle,
  XCircle,
  FileText,
  Bug,
  Lightbulb,
  HelpCircle,
  Loader2,
  Eye,
  Edit3,
  Mail,
  AlertTriangle,
  Star,
  Briefcase,
  RefreshCw,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { FormInput } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTicketForms, useTicketFormTemplates } from "@/hooks/useTicketing";
import { TicketFormTemplateType, FormTemplate } from "@/lib/api";
import { useTranslations } from "next-intl";
import { SettingsPage } from "@/components/settings/SettingsPrimitives";

// Maps the icon *name* returned by the templates API to a lucide component.
// The picker is data-driven off the API, so any new backend template renders
// automatically; unknown icon names fall back to FileText.
const TEMPLATE_ICON_MAP: Record<string, LucideIcon> = {
  Bug,
  Lightbulb,
  HelpCircle,
  Mail,
  AlertTriangle,
  Star,
  Briefcase,
  RefreshCw,
  MessageSquare,
  ShieldAlert,
  FileText,
};

const DEFAULT_TEMPLATE_COLOR = "bg-muted border-border";

function templateIcon(iconName?: string): LucideIcon {
  return (iconName && TEMPLATE_ICON_MAP[iconName]) || FileText;
}

interface FormRowProps {
  form: {
    id: string;
    name: string;
    description?: string;
    template_type?: TicketFormTemplateType;
    is_active: boolean;
    submission_count: number;
    public_url_token: string;
    created_at: string;
  };
  onDuplicate: (formId: string, newName: string) => void;
  onDelete: (formId: string) => void;
  isDuplicating: boolean;
  isDeleting: boolean;
  templateMeta?: FormTemplate;
}

function FormRow({ form, onDuplicate, onDelete, isDuplicating, isDeleting, templateMeta }: FormRowProps) {
  const RowIcon = templateIcon(templateMeta?.icon);
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateName, setDuplicateName] = useState(`${form.name} (Copy)`);

  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/public/forms/${form.public_url_token}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    setShowMenu(false);
  };

  const handleDuplicate = async () => {
    await onDuplicate(form.id, duplicateName);
    setShowDuplicateModal(false);
    setShowMenu(false);
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete "${form.name}"? This will also delete all associated tickets.`)) {
      await onDelete(form.id);
    }
    setShowMenu(false);
  };

  return (
    <>
      <div className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-border transition group">
        <div className={`p-3 rounded-lg ${templateMeta?.color || "bg-muted"}`}>
          <RowIcon className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-foreground font-medium truncate">{form.name}</h3>
            {form.is_active ? (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-full text-xs">
                <CheckCircle className="h-3 w-3" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-xs">
                <XCircle className="h-3 w-3" />
                Inactive
              </span>
            )}
          </div>
          {form.description && (
            <p className="text-muted-foreground text-sm truncate">{form.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>{form.submission_count} submissions</span>
            <span>Created {new Date(form.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
            title="Preview form"
          >
            <Eye className="h-4 w-4" />
          </a>
          <button
            onClick={() => router.push(`/settings/ticket-forms/${form.id}`)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
            title="Edit form"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-muted rounded-lg shadow-xl z-20 py-1">
                  <button
                    onClick={handleCopyUrl}
                    className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Public URL
                  </button>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Form
                  </a>
                  <button
                    onClick={() => {
                      setShowDuplicateModal(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-accent flex items-center gap-2"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Duplicate Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 w-full max-w-md">
            <h3 className="text-foreground font-medium mb-4">Duplicate Form</h3>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">New Form Name</label>
              <input
                type="text"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-purple-500"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicate}
                disabled={isDuplicating || !duplicateName.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isDuplicating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Duplicate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function TicketFormsPage() {
  const t = useTranslations("settingsTicketForms");
  const router = useRouter();
  const { user } = useAuth();
  const { currentWorkspace, currentWorkspaceId } = useWorkspace();

  const {
    forms,
    isLoading,
    createForm,
    createFromTemplate,
    deleteForm,
    duplicateForm,
    isCreating,
    isDeleting,
    isDuplicating,
  } = useTicketForms(currentWorkspaceId);

  const { templates } = useTicketFormTemplates(currentWorkspaceId);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<"blank" | "template">("template");
  const [newFormName, setNewFormName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<TicketFormTemplateType>("bug_report");

  const handleCreateForm = async () => {
    if (createMode === "blank") {
      if (!newFormName.trim()) return;
      const form = await createForm({ name: newFormName });
      setShowCreateModal(false);
      setNewFormName("");
      router.push(`/settings/ticket-forms/${form.id}`);
    } else {
      const form = await createFromTemplate({
        templateType: selectedTemplate,
        name: newFormName || undefined,
      });
      setShowCreateModal(false);
      setNewFormName("");
      router.push(`/settings/ticket-forms/${form.id}`);
    }
  };

  const handleDuplicate = async (formId: string, newName: string) => {
    await duplicateForm({ formId, newName });
  };

  const handleDelete = async (formId: string) => {
    await deleteForm(formId);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-32 bg-accent rounded mb-2" />
            <div className="h-4 w-64 bg-accent rounded" />
          </div>
          <div className="h-9 w-28 bg-accent rounded-lg" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border">
              <div className="h-12 w-12 bg-accent rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-36 bg-accent rounded" />
                  <div className="h-5 w-14 bg-accent rounded-full" />
                </div>
                <div className="h-3 w-48 bg-accent rounded" />
                <div className="flex gap-4">
                  <div className="h-3 w-24 bg-accent rounded" />
                  <div className="h-3 w-28 bg-accent rounded" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-8 w-8 bg-accent rounded-lg" />
                <div className="h-8 w-8 bg-accent rounded-lg" />
                <div className="h-8 w-8 bg-accent rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <SettingsPage
      title={t("title")}
      description={t("description")}
      width="wide"
      actions={
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("create")}
        </button>
      }
    >
      {/* Forms List */}
      <div>
        {forms.length === 0 ? (
          <EmptyState
            icon={FormInput}
            title="No ticket forms yet"
            description="Create custom forms to collect structured information when tickets are submitted."
            actions={[
              { label: "Create Form", onClick: () => setShowCreateModal(true) },
            ]}
          />
        ) : (
          <div className="space-y-3">
            {forms.map((form) => (
              <FormRow
                key={form.id}
                form={form}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                isDuplicating={isDuplicating}
                isDeleting={isDeleting}
                templateMeta={form.template_type ? templates[form.template_type] : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-medium text-foreground mb-4">Create Ticket Form</h3>

            {/* Mode Toggle */}
            <div className="flex gap-1 bg-muted p-1 rounded-lg mb-6">
              <button
                onClick={() => setCreateMode("template")}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${
                  createMode === "template"
                    ? "bg-purple-600 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                From Template
              </button>
              <button
                onClick={() => setCreateMode("blank")}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${
                  createMode === "blank"
                    ? "bg-purple-600 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Blank Form
              </button>
            </div>

            {createMode === "template" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Select Template</label>
                  <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
                    {Object.entries(templates).map(([type, meta]) => {
                      const Icon = templateIcon(meta.icon);
                      return (
                        <button
                          key={type}
                          onClick={() => setSelectedTemplate(type as TicketFormTemplateType)}
                          className={`w-full p-4 rounded-lg border transition flex items-center gap-4 ${
                            selectedTemplate === type
                              ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                              : "border-border bg-muted/50 hover:border-border"
                          }`}
                        >
                          <div className={`p-2 rounded-lg ${meta.color || DEFAULT_TEMPLATE_COLOR}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="text-left">
                            <p className="text-foreground font-medium">
                              {meta.name || type.replace(/_/g, " ")}
                            </p>
                            <p className="text-muted-foreground text-sm">
                              {meta.description || `Template for ${type.replace(/_/g, " ")}`}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">
                    Form Name <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    placeholder={templates[selectedTemplate]?.name || "Leave blank to use template name"}
                    className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Form Name</label>
                <input
                  type="text"
                  value={newFormName}
                  onChange={(e) => setNewFormName(e.target.value)}
                  placeholder="Enter form name..."
                  className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-purple-500"
                  autoFocus
                />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewFormName("");
                }}
                className="px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateForm}
                disabled={isCreating || (createMode === "blank" && !newFormName.trim())}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Create Form
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsPage>
  );
}
