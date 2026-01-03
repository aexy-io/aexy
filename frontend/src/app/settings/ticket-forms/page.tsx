"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Ticket,
  Settings,
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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTicketForms, useTicketFormTemplates } from "@/hooks/useTicketing";
import { TicketFormTemplateType } from "@/lib/api";

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  bug_report: <Bug className="h-5 w-5 text-red-400" />,
  feature_request: <Lightbulb className="h-5 w-5 text-yellow-400" />,
  support: <HelpCircle className="h-5 w-5 text-blue-400" />,
};

const TEMPLATE_COLORS: Record<string, string> = {
  bug_report: "bg-red-900/30 border-red-800/50",
  feature_request: "bg-yellow-900/30 border-yellow-800/50",
  support: "bg-blue-900/30 border-blue-800/50",
};

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
}

function FormRow({ form, onDuplicate, onDelete, isDuplicating, isDeleting }: FormRowProps) {
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
      <div className="flex items-center gap-4 p-4 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition group">
        <div className={`p-3 rounded-lg ${form.template_type ? TEMPLATE_COLORS[form.template_type] : "bg-slate-700"}`}>
          {form.template_type ? TEMPLATE_ICONS[form.template_type] : <FileText className="h-5 w-5 text-slate-400" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-medium truncate">{form.name}</h3>
            {form.is_active ? (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-900/30 text-green-400 rounded-full text-xs">
                <CheckCircle className="h-3 w-3" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-700 text-slate-400 rounded-full text-xs">
                <XCircle className="h-3 w-3" />
                Inactive
              </span>
            )}
          </div>
          {form.description && (
            <p className="text-slate-400 text-sm truncate">{form.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
            <span>{form.submission_count} submissions</span>
            <span>Created {new Date(form.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            title="Preview form"
          >
            <Eye className="h-4 w-4" />
          </a>
          <button
            onClick={() => router.push(`/settings/ticket-forms/${form.id}`)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            title="Edit form"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-slate-700 rounded-lg shadow-xl z-20 py-1">
                  <button
                    onClick={handleCopyUrl}
                    className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-600 flex items-center gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Public URL
                  </button>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-600 flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Form
                  </a>
                  <button
                    onClick={() => {
                      setShowDuplicateModal(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-600 flex items-center gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-600 flex items-center gap-2"
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
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-white font-medium mb-4">Duplicate Form</h3>
            <div>
              <label className="block text-sm text-slate-400 mb-1">New Form Name</label>
              <input
                type="text"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white">Loading forms...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/tickets"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-700 rounded-lg">
                <Ticket className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">Ticket Forms</h1>
                <p className="text-slate-400 text-sm">
                  Create and manage public forms for collecting tickets
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Create Button */}
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
          >
            <Plus className="h-4 w-4" />
            Create Form
          </button>
        </div>

        {/* Forms List */}
        {forms.length === 0 ? (
          <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700">
            <Ticket className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No forms yet</h3>
            <p className="text-slate-400 mb-6">
              Create your first ticket form to start collecting submissions
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition font-medium"
            >
              <Plus className="h-5 w-5" />
              Create Your First Form
            </button>
          </div>
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
              />
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-medium text-white mb-4">Create Ticket Form</h3>

            {/* Mode Toggle */}
            <div className="flex gap-1 bg-slate-700 p-1 rounded-lg mb-6">
              <button
                onClick={() => setCreateMode("template")}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${
                  createMode === "template"
                    ? "bg-purple-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                From Template
              </button>
              <button
                onClick={() => setCreateMode("blank")}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${
                  createMode === "blank"
                    ? "bg-purple-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Blank Form
              </button>
            </div>

            {createMode === "template" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Select Template</label>
                  <div className="space-y-2">
                    {(["bug_report", "feature_request", "support"] as TicketFormTemplateType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => setSelectedTemplate(type)}
                        className={`w-full p-4 rounded-lg border transition flex items-center gap-4 ${
                          selectedTemplate === type
                            ? "border-purple-500 bg-purple-900/20"
                            : "border-slate-700 bg-slate-700/50 hover:border-slate-600"
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${TEMPLATE_COLORS[type]}`}>
                          {TEMPLATE_ICONS[type]}
                        </div>
                        <div className="text-left">
                          <p className="text-white font-medium">
                            {templates[type]?.name || type.replace(/_/g, " ")}
                          </p>
                          <p className="text-slate-400 text-sm">
                            {templates[type]?.description || `Template for ${type.replace(/_/g, " ")}`}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Form Name <span className="text-slate-500">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    placeholder={templates[selectedTemplate]?.name || "Leave blank to use template name"}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Form Name</label>
                <input
                  type="text"
                  value={newFormName}
                  onChange={(e) => setNewFormName(e.target.value)}
                  placeholder="Enter form name..."
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  autoFocus
                />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewFormName("");
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm"
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
    </div>
  );
}
