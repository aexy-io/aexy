"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  ExternalLink,
  Copy,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  Ticket,
  Users,
  DollarSign,
  Zap,
  LayoutTemplate,
  Clock,
  BarChart3,
  Code,
  Power,
  Eye,
  Send,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useForms, useFormTemplates } from "@/hooks/useForms";
import type { FormListItem, FormTemplateType } from "@/lib/formsApi";

const TEMPLATE_LABELS: Record<FormTemplateType, { label: string; color: string; bg: string }> = {
  bug_report: { label: "Bug Report", color: "text-red-400", bg: "bg-red-900/30" },
  feature_request: { label: "Feature Request", color: "text-blue-400", bg: "bg-blue-900/30" },
  support: { label: "Support", color: "text-purple-400", bg: "bg-purple-900/30" },
  contact: { label: "Contact", color: "text-green-400", bg: "bg-green-900/30" },
  lead_capture: { label: "Lead Capture", color: "text-orange-400", bg: "bg-orange-900/30" },
  feedback: { label: "Feedback", color: "text-cyan-400", bg: "bg-cyan-900/30" },
  custom: { label: "Custom", color: "text-slate-400", bg: "bg-slate-700" },
};

function FormCard({
  form,
  onEdit,
  onDuplicate,
  onDelete,
  onCopyLink,
  onToggleActive,
  onViewSubmissions,
  onCopyEmbed,
}: {
  form: FormListItem;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onToggleActive: () => void;
  onViewSubmissions: () => void;
  onCopyEmbed: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const templateInfo = form.template_type
    ? TEMPLATE_LABELS[form.template_type]
    : TEMPLATE_LABELS.custom;

  const publicUrl = `${window.location.origin}/public/forms/${form.public_url_token}`;

  return (
    <div
      onClick={onEdit}
      className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-purple-500/50 transition-colors cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${form.is_active ? "bg-purple-500/20 text-purple-400" : "bg-slate-700 text-slate-400"}`}>
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-white font-medium group-hover:text-purple-400 transition-colors">
              {form.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${templateInfo.bg} ${templateInfo.color}`}>
                {templateInfo.label}
              </span>
              {form.is_active ? (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <CheckCircle className="h-3 w-3" /> Active
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <XCircle className="h-3 w-3" /> Inactive
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-10 z-20 w-52 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1">
                {/* View & Edit Section */}
                <button
                  onClick={() => {
                    onEdit();
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <Edit2 className="h-4 w-4" /> Edit Form
                </button>
                <button
                  onClick={() => {
                    onViewSubmissions();
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <BarChart3 className="h-4 w-4" /> View Submissions
                  {form.submission_count > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                      {form.submission_count}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    window.open(publicUrl, "_blank");
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <Eye className="h-4 w-4" /> Preview Form
                </button>

                <div className="border-t border-slate-700 my-1" />

                {/* Share Section */}
                <button
                  onClick={() => {
                    onCopyLink();
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" /> Copy Link
                </button>
                <button
                  onClick={() => {
                    onCopyEmbed();
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <Code className="h-4 w-4" /> Copy Embed Code
                </button>
                <button
                  onClick={() => {
                    window.open(publicUrl, "_blank");
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" /> Open in New Tab
                </button>

                <div className="border-t border-slate-700 my-1" />

                {/* Actions Section */}
                <button
                  onClick={() => {
                    onToggleActive();
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <Power className="h-4 w-4" />
                  {form.is_active ? "Deactivate Form" : "Activate Form"}
                </button>
                <button
                  onClick={() => {
                    onDuplicate();
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" /> Duplicate Form
                </button>

                <div className="border-t border-slate-700 my-1" />

                {/* Danger Zone */}
                <button
                  onClick={() => {
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" /> Delete Form
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {form.description && (
        <p className="text-sm text-slate-400 mb-3 line-clamp-2">{form.description}</p>
      )}

      {/* Submission Count - Prominent Display */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-900/20 rounded-lg">
          <Send className="h-4 w-4 text-purple-400" />
          <span className="text-lg font-semibold text-purple-400">{form.submission_count}</span>
          <span className="text-xs text-purple-400/70">submissions</span>
        </div>
      </div>

      {/* Destination indicators */}
      <div className="flex items-center gap-2 mb-3">
        {form.auto_create_ticket && (
          <div className="flex items-center gap-1 px-2 py-1 bg-blue-900/20 rounded text-xs text-blue-400">
            <Ticket className="h-3 w-3" />
            Tickets
          </div>
        )}
        {form.auto_create_record && (
          <div className="flex items-center gap-1 px-2 py-1 bg-green-900/20 rounded text-xs text-green-400">
            <Users className="h-3 w-3" />
            CRM
          </div>
        )}
        {form.auto_create_deal && (
          <div className="flex items-center gap-1 px-2 py-1 bg-orange-900/20 rounded text-xs text-orange-400">
            <DollarSign className="h-3 w-3" />
            Deals
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-slate-500 pt-3 border-t border-slate-700">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Created {new Date(form.created_at).toLocaleDateString()}
        </span>
        {form.updated_at && form.updated_at !== form.created_at && (
          <span className="flex items-center gap-1">
            <Edit2 className="h-3 w-3" />
            Updated {new Date(form.updated_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

function CreateFormModal({
  isOpen,
  onClose,
  templates,
  onCreateFromTemplate,
  onCreateBlank,
  isCreating,
}: {
  isOpen: boolean;
  onClose: () => void;
  templates: Record<string, { name: string; description: string }>;
  onCreateFromTemplate: (templateType: FormTemplateType, name?: string) => void;
  onCreateBlank: (name: string) => void;
  isCreating: boolean;
}) {
  const [formName, setFormName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplateType | null>(null);

  if (!isOpen) return null;

  const handleCreate = () => {
    if (selectedTemplate) {
      onCreateFromTemplate(selectedTemplate, formName || undefined);
    } else if (formName) {
      onCreateBlank(formName);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Create New Form</h2>
          <p className="text-sm text-slate-400 mt-1">Choose a template or start from scratch</p>
        </div>

        <div className="p-6 overflow-y-auto max-h-[50vh]">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">Form Name (optional)</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="My New Form"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">Template</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedTemplate(null)}
                className={`p-4 rounded-lg border text-left transition ${
                  selectedTemplate === null
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-slate-700 bg-slate-800 hover:border-slate-600"
                }`}
              >
                <LayoutTemplate className="h-5 w-5 text-slate-400 mb-2" />
                <div className="text-sm font-medium text-white">Blank Form</div>
                <div className="text-xs text-slate-400">Start from scratch</div>
              </button>
              {Object.entries(templates).map(([key, template]) => {
                const templateType = key as FormTemplateType;
                const info = TEMPLATE_LABELS[templateType] || TEMPLATE_LABELS.custom;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedTemplate(templateType)}
                    className={`p-4 rounded-lg border text-left transition ${
                      selectedTemplate === templateType
                        ? "border-purple-500 bg-purple-500/10"
                        : "border-slate-700 bg-slate-800 hover:border-slate-600"
                    }`}
                  >
                    <div className={`h-5 w-5 rounded ${info.bg} ${info.color} flex items-center justify-center text-xs font-bold mb-2`}>
                      {template.name.charAt(0)}
                    </div>
                    <div className="text-sm font-medium text-white">{template.name}</div>
                    <div className="text-xs text-slate-400 line-clamp-1">{template.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || (!selectedTemplate && !formName)}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCreating && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            Create Form
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FormsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const {
    forms,
    isLoading,
    createForm,
    createFromTemplate,
    deleteForm,
    duplicateForm,
    updateForm,
    isCreating,
  } = useForms(workspaceId);

  const { templates } = useFormTemplates(workspaceId);

  const filteredForms = forms.filter((form) => {
    const matchesSearch =
      form.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      form.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && form.is_active) ||
      (statusFilter === "inactive" && !form.is_active);

    return matchesSearch && matchesStatus;
  });

  const handleCopyLink = (form: FormListItem) => {
    const publicUrl = `${window.location.origin}/public/forms/${form.public_url_token}`;
    navigator.clipboard.writeText(publicUrl);
    // Could add a toast notification here
  };

  const handleDelete = async (formId: string) => {
    if (confirm("Are you sure you want to delete this form? This action cannot be undone.")) {
      await deleteForm(formId);
    }
  };

  const handleDuplicate = async (form: FormListItem) => {
    await duplicateForm({ formId: form.id, newName: `${form.name} (Copy)` });
  };

  const handleToggleActive = async (form: FormListItem) => {
    await updateForm({ formId: form.id, data: { is_active: !form.is_active } });
  };

  const handleViewSubmissions = (form: FormListItem) => {
    router.push(`/forms/${form.id}?tab=submissions`);
  };

  const handleCopyEmbed = (form: FormListItem) => {
    const publicUrl = `${window.location.origin}/public/forms/${form.public_url_token}`;
    const embedCode = `<iframe src="${publicUrl}" width="100%" height="600" frameborder="0" style="border: none; border-radius: 8px;"></iframe>`;
    navigator.clipboard.writeText(embedCode);
    // Could add a toast notification here
  };

  const handleCreateFromTemplate = async (templateType: FormTemplateType, name?: string) => {
    const newForm = await createFromTemplate({ templateType, name });
    setShowCreateModal(false);
    router.push(`/forms/${newForm.id}`);
  };

  const handleCreateBlank = async (name: string) => {
    const newForm = await createForm({ name });
    setShowCreateModal(false);
    router.push(`/forms/${newForm.id}`);
  };

  // Stats
  const activeFormsCount = forms.filter(f => f.is_active).length;
  const totalSubmissions = forms.reduce((sum, f) => sum + f.submission_count, 0);
  const formsWithTickets = forms.filter(f => f.auto_create_ticket).length;
  const formsWithCRM = forms.filter(f => f.auto_create_record).length;

  return (
    <div className="min-h-screen bg-slate-950">
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <FileText className="h-8 w-8 text-purple-400" />
                Forms
              </h1>
              <p className="text-slate-400 mt-2">
                Create forms that connect to Tickets, CRM, and Deals
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition font-medium"
            >
              <Plus className="h-4 w-4" />
              Create Form
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-900/30">
                <FileText className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{activeFormsCount}</p>
                <p className="text-sm text-slate-400">Active Forms</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-900/30">
                <Zap className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{totalSubmissions}</p>
                <p className="text-sm text-slate-400">Total Submissions</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-900/30">
                <Ticket className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formsWithTickets}</p>
                <p className="text-sm text-slate-400">Ticket Forms</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-900/30">
                <Users className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formsWithCRM}</p>
                <p className="text-sm text-slate-400">CRM Forms</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search forms..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-400">Status:</span>
              <div className="flex gap-1">
                {(["all", "active", "inactive"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1 rounded text-xs font-medium transition ${
                      statusFilter === status
                        ? "bg-purple-500/30 text-purple-400"
                        : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Forms Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-slate-800/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredForms.length === 0 ? (
          <div className="text-center py-16 bg-slate-800 rounded-xl border border-slate-700">
            <FileText className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              {forms.length === 0 ? "No forms yet" : "No forms match your filters"}
            </h3>
            <p className="text-slate-400 mb-4">
              {forms.length === 0
                ? "Create your first form to start collecting submissions"
                : "Try adjusting your search or filters"}
            </p>
            {forms.length === 0 && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition inline-flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Form
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredForms.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                onEdit={() => router.push(`/forms/${form.id}`)}
                onDuplicate={() => handleDuplicate(form)}
                onDelete={() => handleDelete(form.id)}
                onCopyLink={() => handleCopyLink(form)}
                onToggleActive={() => handleToggleActive(form)}
                onViewSubmissions={() => handleViewSubmissions(form)}
                onCopyEmbed={() => handleCopyEmbed(form)}
              />
            ))}
          </div>
        )}
      </main>

      <CreateFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        templates={templates}
        onCreateFromTemplate={handleCreateFromTemplate}
        onCreateBlank={handleCreateBlank}
        isCreating={isCreating}
      />
    </div>
  );
}
