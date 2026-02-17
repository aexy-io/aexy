"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Search,
  FileText,
  Trash2,
  Edit2,
  Copy,
  MoreVertical,
  Zap,
  Tag,
  CheckSquare,
  List,
  X,
  Loader2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { TaskTemplate, TaskTemplateCreate, TaskPriority, taskTemplatesApi } from "@/lib/api";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge, Skeleton } from "@/components/ui/premium-card";

// Priority configuration
const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bgColor: string }> = {
  critical: { label: "Critical", color: "text-red-400", bgColor: "bg-red-500/20" },
  high: { label: "High", color: "text-orange-400", bgColor: "bg-orange-500/20" },
  medium: { label: "Medium", color: "text-yellow-400", bgColor: "bg-yellow-500/20" },
  low: { label: "Low", color: "text-blue-400", bgColor: "bg-blue-500/20" },
};

interface TemplateCardProps {
  template: TaskTemplate;
  onEdit: (template: TaskTemplate) => void;
  onDelete: (templateId: string) => void;
  onDuplicate: (template: TaskTemplate) => void;
}

function TemplateCard({ template, onEdit, onDelete, onDuplicate }: TemplateCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-muted/50 border border-border/50 rounded-xl p-4 hover:border-border transition group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 bg-primary-500/20 rounded-lg shrink-0">
            <FileText className="h-5 w-5 text-primary-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-foreground truncate">{template.name}</h3>
            {template.description && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
            )}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition opacity-0 group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-36 bg-muted border border-border rounded-lg shadow-xl py-1 z-20">
                <button
                  onClick={() => {
                    onEdit(template);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    onDuplicate(template);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center gap-2"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this template?")) {
                      onDelete(template.id);
                    }
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {/* Title template preview */}
        <div className="text-sm text-foreground bg-background/50 px-3 py-2 rounded-lg font-mono truncate">
          {template.title_template}
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-2">
          {template.category && (
            <Badge variant="outline" size="sm">
              <Tag className="h-3 w-3 mr-1" />
              {template.category}
            </Badge>
          )}
          <Badge
            variant="default"
            size="sm"
            className={cn(PRIORITY_CONFIG[template.default_priority]?.bgColor)}
          >
            {PRIORITY_CONFIG[template.default_priority]?.label || template.default_priority}
          </Badge>
          {template.default_story_points !== null && (
            <Badge variant="default" size="sm">
              {template.default_story_points} SP
            </Badge>
          )}
          {template.subtasks.length > 0 && (
            <Badge variant="default" size="sm">
              <List className="h-3 w-3 mr-1" />
              {template.subtasks.length} subtasks
            </Badge>
          )}
          {template.checklist.length > 0 && (
            <Badge variant="default" size="sm">
              <CheckSquare className="h-3 w-3 mr-1" />
              {template.checklist.length} checklist
            </Badge>
          )}
        </div>

        {/* Usage count */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-border/50 text-xs text-muted-foreground">
          <span>Used {template.usage_count} times</span>
          <span className={template.is_active ? "text-green-400" : "text-muted-foreground"}>
            {template.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

interface TemplateFormModalProps {
  template?: TaskTemplate | null;
  onClose: () => void;
  onSave: (data: TaskTemplateCreate) => Promise<void>;
  isSaving: boolean;
}

function TemplateFormModal({ template, onClose, onSave, isSaving }: TemplateFormModalProps) {
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [category, setCategory] = useState(template?.category || "");
  const [titleTemplate, setTitleTemplate] = useState(template?.title_template || "");
  const [descriptionTemplate, setDescriptionTemplate] = useState(template?.description_template || "");
  const [priority, setPriority] = useState<TaskPriority>(template?.default_priority || "medium");
  const [storyPoints, setStoryPoints] = useState(template?.default_story_points?.toString() || "");
  const [labels, setLabels] = useState(template?.default_labels?.join(", ") || "");
  const [subtasks, setSubtasks] = useState(template?.subtasks?.join("\n") || "");
  const [checklist, setChecklist] = useState(template?.checklist?.join("\n") || "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Template name is required");
      return;
    }
    if (!titleTemplate.trim()) {
      setError("Title template is required");
      return;
    }

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        title_template: titleTemplate.trim(),
        description_template: descriptionTemplate.trim() || undefined,
        default_priority: priority,
        default_story_points: storyPoints ? parseInt(storyPoints) : undefined,
        default_labels: labels.split(",").map((l) => l.trim()).filter(Boolean),
        subtasks: subtasks.split("\n").map((s) => s.trim()).filter(Boolean),
        checklist: checklist.split("\n").map((c) => c.trim()).filter(Boolean),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-muted border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-border">
          <h3 className="text-xl font-semibold text-foreground">
            {template ? "Edit Template" : "Create Template"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-130px)]">
          <div className="p-4 space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Template Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Bug Report"
                  className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Bug, Feature, Chore"
                  className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe when to use this template..."
                rows={2}
                className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 resize-none"
              />
            </div>

            {/* Title Template */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Title Template <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={titleTemplate}
                onChange={(e) => setTitleTemplate(e.target.value)}
                placeholder='e.g., [BUG] {{component}}: {{issue}}'
                className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {"{{variable}}"} for placeholders that users can fill in
              </p>
            </div>

            {/* Description Template */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Description Template
              </label>
              <textarea
                value={descriptionTemplate}
                onChange={(e) => setDescriptionTemplate(e.target.value)}
                placeholder="Enter the default description for tasks created from this template..."
                rows={4}
                className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 resize-none"
              />
            </div>

            {/* Defaults */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Default Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary-500"
                >
                  {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>
                      {cfg.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Story Points
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Labels</label>
                <input
                  type="text"
                  value={labels}
                  onChange={(e) => setLabels(e.target.value)}
                  placeholder="bug, frontend"
                  className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            {/* Subtasks */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Default Subtasks
                <span className="text-muted-foreground font-normal ml-2">(one per line)</span>
              </label>
              <textarea
                value={subtasks}
                onChange={(e) => setSubtasks(e.target.value)}
                placeholder={"Investigate root cause\nWrite fix\nAdd tests\nUpdate documentation"}
                rows={4}
                className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 resize-none font-mono text-sm"
              />
            </div>

            {/* Checklist */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Checklist Items
                <span className="text-muted-foreground font-normal ml-2">(one per line)</span>
              </label>
              <textarea
                value={checklist}
                onChange={(e) => setChecklist(e.target.value)}
                placeholder={"Code reviewed\nTests passing\nDocumentation updated"}
                rows={3}
                className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500 resize-none font-mono text-sm"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-4 border-t border-border bg-muted/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim() || !titleTemplate.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSaving ? "Saving..." : template ? "Update Template" : "Create Template"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function TaskTemplatesPage({
  params,
}: {
  params: { projectId: string };
}) {
  const { projectId } = params;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch templates
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["taskTemplates", currentWorkspaceId],
    queryFn: () => taskTemplatesApi.list(currentWorkspaceId!, { limit: 100 }),
    enabled: !!currentWorkspaceId,
  });

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ["taskTemplateCategories", currentWorkspaceId],
    queryFn: () => taskTemplatesApi.listCategories(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: (data: TaskTemplateCreate) => taskTemplatesApi.create(currentWorkspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskTemplates", currentWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["taskTemplateCategories", currentWorkspaceId] });
      setShowCreateModal(false);
    },
  });

  // Update template mutation
  const updateMutation = useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: TaskTemplateCreate }) =>
      taskTemplatesApi.update(currentWorkspaceId!, templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskTemplates", currentWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["taskTemplateCategories", currentWorkspaceId] });
      setEditingTemplate(null);
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: (templateId: string) => taskTemplatesApi.delete(currentWorkspaceId!, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskTemplates", currentWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["taskTemplateCategories", currentWorkspaceId] });
    },
  });

  const templates = templatesData?.items || [];

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (categoryFilter && t.category !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [templates, search, categoryFilter]);

  const handleDuplicate = async (template: TaskTemplate) => {
    await createMutation.mutateAsync({
      name: `${template.name} (Copy)`,
      description: template.description || undefined,
      category: template.category || undefined,
      title_template: template.title_template,
      description_template: template.description_template || undefined,
      default_priority: template.default_priority,
      default_story_points: template.default_story_points || undefined,
      default_labels: template.default_labels,
      subtasks: template.subtasks,
      checklist: template.checklist,
    });
  };

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-muted/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                href={`/sprints/${projectId}/board`}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary-400" />
                  Task Templates
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Create reusable templates for common task types
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
            >
              <Plus className="h-4 w-4" />
              New Template
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mt-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-10 pr-4 py-2 bg-background/50 border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary-500"
              />
            </div>

            {categories && categories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 bg-background/50 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary-500"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {templatesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-muted/50 border border-border/50 rounded-xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <Skeleton className="w-9 h-9 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton variant="text" className="h-5 w-32" />
                    <Skeleton variant="text" className="h-4 w-48 mt-1" />
                  </div>
                </div>
                <Skeleton className="h-10 w-full rounded-lg" />
                <div className="flex gap-2 mt-3">
                  <Skeleton className="h-5 w-16 rounded" />
                  <Skeleton className="h-5 w-20 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-full mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              {search || categoryFilter ? "No templates found" : "No templates yet"}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {search || categoryFilter
                ? "Try adjusting your search or filters"
                : "Create task templates to speed up task creation and ensure consistency across your team."}
            </p>
            {!search && !categoryFilter && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
              >
                <Plus className="h-4 w-4" />
                Create Your First Template
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onEdit={setEditingTemplate}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onDuplicate={handleDuplicate}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <TemplateFormModal
            onClose={() => setShowCreateModal(false)}
            onSave={async (data) => {
              await createMutation.mutateAsync(data);
            }}
            isSaving={createMutation.isPending}
          />
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingTemplate && (
          <TemplateFormModal
            template={editingTemplate}
            onClose={() => setEditingTemplate(null)}
            onSave={async (data) => {
              await updateMutation.mutateAsync({ templateId: editingTemplate.id, data });
            }}
            isSaving={updateMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
