"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Plus,
  Palette,
  Trash2,
  Search,
  Clock,
  Eye,
  Loader2,
  AlertCircle,
  Copy,
  MoreHorizontal,
  Filter,
  Code,
  Wand2,
  FileText,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import {
  useEmailTemplates,
  useDuplicateTemplate,
  useDeleteTemplate,
  usePreviewTemplate,
} from "@/hooks/useEmailMarketing";
import { EmailTemplate } from "@/lib/api";

type TypeFilter = "all" | "code" | "visual" | "mjml";
type SortOption = "newest" | "oldest" | "name";

function TemplateCard({
  template,
  onDuplicate,
  onDelete,
  onPreview,
}: {
  template: EmailTemplate;
  onDuplicate: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "code":
        return <Code className="h-5 w-5 text-emerald-400" />;
      case "visual":
        return <Wand2 className="h-5 w-5 text-purple-400" />;
      case "mjml":
        return <FileText className="h-5 w-5 text-amber-400" />;
      default:
        return <Palette className="h-5 w-5 text-sky-400" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "code":
        return { text: "Code", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
      case "visual":
        return { text: "Visual", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
      case "mjml":
        return { text: "MJML", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
      default:
        return { text: type, color: "bg-slate-500/20 text-slate-400 border-slate-500/30" };
    }
  };

  const typeInfo = getTypeLabel(template.template_type);

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition group">
      <div className="flex items-start justify-between mb-4">
        <Link
          href={`/email-marketing/templates/${template.id}`}
          className="flex items-center gap-3 flex-1"
        >
          <div className="p-2 bg-gradient-to-br from-sky-500/20 to-purple-500/20 rounded-lg">
            {getTypeIcon(template.template_type)}
          </div>
          <div>
            <h3 className="text-white font-medium group-hover:text-sky-400 transition">
              {template.name}
            </h3>
            {template.description && (
              <p className="text-sm text-slate-500 line-clamp-1">{template.description}</p>
            )}
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${typeInfo.color}`}>
            {typeInfo.text}
          </span>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1">
                  <Link
                    href={`/email-marketing/templates/${template.id}`}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
                  >
                    <Palette className="h-4 w-4" />
                    Edit Template
                  </Link>
                  <button
                    onClick={() => { onPreview(); setShowMenu(false); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white w-full"
                  >
                    <Eye className="h-4 w-4" />
                    Preview
                  </button>
                  <button
                    onClick={() => { onDuplicate(); setShowMenu(false); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white w-full"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => { onDelete(); setShowMenu(false); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-slate-700 w-full"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {template.subject_template && (
        <div className="mb-4 p-3 bg-slate-800/50 rounded-lg">
          <p className="text-xs text-slate-500 mb-1">Subject Line</p>
          <p className="text-sm text-slate-300 truncate">{template.subject_template}</p>
        </div>
      )}

      {template.variables && template.variables.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-slate-500 mb-2">Variables</p>
          <div className="flex flex-wrap gap-1">
            {template.variables.slice(0, 5).map((variable) => (
              <span
                key={variable.name}
                className="px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-400"
              >
                {`{{${variable.name}}}`}
              </span>
            ))}
            {template.variables.length > 5 && (
              <span className="px-2 py-0.5 text-xs text-slate-500">
                +{template.variables.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Updated: {new Date(template.updated_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { user, logout } = useAuth();
  const workspaceId = currentWorkspace?.id || null;

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const { templates, isLoading, error, refetch } = useEmailTemplates(workspaceId);
  const duplicateTemplate = useDuplicateTemplate(workspaceId);
  const deleteTemplate = useDeleteTemplate(workspaceId);
  const previewTemplate = usePreviewTemplate(workspaceId);

  const filteredTemplates = templates
    .filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      const matchesType = typeFilter === "all" || t.template_type === typeFilter;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this template?")) {
      await deleteTemplate.mutateAsync(id);
    }
  };

  const handlePreview = async (id: string) => {
    try {
      const result = await previewTemplate.mutateAsync({ templateId: id, data: {} });
      setPreviewHtml(result.html);
    } catch {
      // Error is handled by the mutation
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="min-h-screen bg-slate-950">
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-slate-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No Workspace Selected</h2>
            <p className="text-slate-400">Please select a workspace to view templates.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
<div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.push("/email-marketing")}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Email Templates</h1>
              <p className="text-sm text-slate-400">Create and manage reusable email templates</p>
            </div>
            <Link
              href="/email-marketing/templates/new"
              className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition font-medium"
            >
              <Plus className="h-4 w-4" />
              New Template
            </Link>
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition ${
                showFilters || typeFilter !== "all"
                  ? "bg-sky-500/20 border-sky-500/30 text-sky-400"
                  : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <Filter className="h-4 w-4" />
              Filters
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Type</label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="all">All Types</option>
                    <option value="code">Code</option>
                    <option value="visual">Visual</option>
                    <option value="mjml">MJML</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="name">Name A-Z</option>
                  </select>
                </div>
                {typeFilter !== "all" && (
                  <button
                    onClick={() => setTypeFilter("all")}
                    className="mt-5 px-3 py-2 text-sm text-slate-400 hover:text-white transition"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Template List */}
          {error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-8 text-center">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-white mb-2">Failed to load templates</h3>
              <p className="text-red-400 mb-4">{error.message}</p>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
              >
                Try Again
              </button>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-52 bg-slate-900/50 border border-slate-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-16 text-center">
              <Palette className="h-14 w-14 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-white mb-2">
                {searchQuery || typeFilter !== "all" ? "No templates found" : "No templates yet"}
              </h3>
              <p className="text-slate-400 mb-6 max-w-md mx-auto">
                {searchQuery || typeFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "Create reusable email templates to streamline your campaigns."}
              </p>
              {!searchQuery && typeFilter === "all" && (
                <Link
                  href="/email-marketing/templates/new"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition"
                >
                  <Plus className="h-4 w-4" />
                  Create Template
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onDuplicate={() => duplicateTemplate.mutate(template.id)}
                    onDelete={() => handleDelete(template.id)}
                    onPreview={() => handlePreview(template.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="text-lg font-medium text-white">Template Preview</h3>
              <button
                onClick={() => setPreviewHtml(null)}
                className="p-2 text-slate-400 hover:text-white transition"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-4rem)]">
              <div
                className="bg-white rounded-lg overflow-hidden"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
