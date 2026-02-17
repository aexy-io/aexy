"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  FileText,
  ClipboardCheck,
  Mail,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  Clock,
  User,
  X,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TemplateType = "jd" | "rubric" | "email";

interface Template {
  id: string;
  name: string;
  type: TemplateType;
  description: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

const TYPE_CONFIG: Record<TemplateType, { label: string; icon: any; color: string; bgColor: string }> = {
  jd: { label: "Job Description", icon: FileText, color: "text-blue-400", bgColor: "bg-blue-500/20" },
  rubric: { label: "Interview Rubric", icon: ClipboardCheck, color: "text-purple-400", bgColor: "bg-purple-500/20" },
  email: { label: "Email Template", icon: Mail, color: "text-green-400", bgColor: "bg-green-500/20" },
};

// Mock templates
const MOCK_TEMPLATES: Template[] = [
  { id: "1", name: "Senior Frontend Engineer JD", type: "jd", description: "Standard job description for senior frontend roles with React/TypeScript focus", createdAt: "2024-01-10", updatedAt: "2024-01-15", createdBy: "John Doe" },
  { id: "2", name: "Backend Developer JD", type: "jd", description: "Job description template for backend developers with Go/Python skills", createdAt: "2024-01-08", updatedAt: "2024-01-12", createdBy: "Jane Smith" },
  { id: "3", name: "Technical Interview Rubric", type: "rubric", description: "Scoring rubric for technical interviews with coding and system design sections", createdAt: "2024-01-05", updatedAt: "2024-01-10", createdBy: "John Doe" },
  { id: "4", name: "Behavioral Interview Rubric", type: "rubric", description: "Questions and scoring criteria for behavioral interviews", createdAt: "2024-01-06", updatedAt: "2024-01-06", createdBy: "Jane Smith" },
  { id: "5", name: "Assessment Invitation", type: "email", description: "Email template for inviting candidates to take technical assessments", createdAt: "2024-01-01", updatedAt: "2024-01-08", createdBy: "John Doe" },
  { id: "6", name: "Interview Confirmation", type: "email", description: "Confirmation email for scheduled interviews", createdAt: "2024-01-02", updatedAt: "2024-01-02", createdBy: "Jane Smith" },
  { id: "7", name: "Offer Letter Template", type: "email", description: "Standard offer letter email template with placeholder variables", createdAt: "2024-01-03", updatedAt: "2024-01-09", createdBy: "John Doe" },
];

function TemplateCard({ template, onEdit, onClone, onDelete }: { template: Template; onEdit: () => void; onClone: () => void; onDelete: () => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const config = TYPE_CONFIG[template.type];
  const Icon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative bg-background/50 border border-border rounded-xl p-5 hover:border-border transition"
    >
      {/* Type Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className={cn("flex items-center gap-2 px-2.5 py-1 rounded-lg", config.bgColor)}>
          <Icon className={cn("h-4 w-4", config.color)} />
          <span className={cn("text-xs font-medium", config.color)}>{config.label}</span>
        </div>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition opacity-0 group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <h3 className="text-lg font-semibold text-foreground mb-2">{template.name}</h3>
      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{template.description}</p>

      {/* Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {template.createdBy}
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Updated {template.updatedAt}
        </div>
      </div>

      {/* Menu */}
      {showMenu && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-12 right-4 z-10 w-40 bg-muted border border-border rounded-lg shadow-xl py-1"
        >
          <button
            onClick={() => {
              setShowMenu(false);
              onEdit();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition"
          >
            <Edit className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={() => {
              setShowMenu(false);
              onClone();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition"
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </button>
          <hr className="my-1 border-border" />
          <button
            onClick={() => {
              setShowMenu(false);
              onDelete();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-accent transition"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function TemplatesPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId, currentWorkspace, workspacesLoading, hasWorkspaces } = useWorkspace();
  const [templates, setTemplates] = useState<Template[]>(MOCK_TEMPLATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<TemplateType | "all">("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTemplateType, setNewTemplateType] = useState<TemplateType>("jd");

  // Filter templates
  const filteredTemplates = templates.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query);
    }
    return true;
  });

  // Group by type
  const templatesByType = {
    jd: filteredTemplates.filter((t) => t.type === "jd"),
    rubric: filteredTemplates.filter((t) => t.type === "rubric"),
    email: filteredTemplates.filter((t) => t.type === "email"),
  };

  if (isLoading || workspacesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading templates...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (!hasWorkspaces) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Workspace Required</h2>
          <p className="text-muted-foreground mb-6">
            Create a workspace first to manage templates.
          </p>
          <Link
            href="/settings/organization"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium shadow-lg shadow-primary-500/20"
          >
            <Building2 className="h-5 w-5" />
            Create Workspace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="w-full px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-orange-500/20 to-amber-500/20 rounded-xl">
              <Briefcase className="h-7 w-7 text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Hiring Templates</h1>
              <p className="text-muted-foreground text-sm">
                {templates.length} templates available
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg font-medium transition shadow-lg shadow-primary-500/20"
          >
            <Plus className="h-4 w-4" />
            Create Template
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-muted text-foreground rounded-lg pl-10 pr-4 py-2 border border-border focus:border-primary-500 focus:outline-none text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterType("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition",
                filterType === "all"
                  ? "bg-primary-500 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            {(Object.keys(TYPE_CONFIG) as TemplateType[]).map((type) => {
              const config = TYPE_CONFIG[type];
              const Icon = config.icon;
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition",
                    filterType === type
                      ? cn(config.bgColor, config.color)
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Templates Grid */}
        {filterType === "all" ? (
          <div className="space-y-8">
            {(Object.keys(TYPE_CONFIG) as TemplateType[]).map((type) => {
              const config = TYPE_CONFIG[type];
              const Icon = config.icon;
              const typeTemplates = templatesByType[type];

              if (typeTemplates.length === 0) return null;

              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-4">
                    <Icon className={cn("h-5 w-5", config.color)} />
                    <h2 className="text-lg font-semibold text-foreground">{config.label}s</h2>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {typeTemplates.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {typeTemplates.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onEdit={() => console.log("Edit", template.id)}
                        onClone={() => console.log("Clone", template.id)}
                        onDelete={() => setTemplates(templates.filter((t) => t.id !== template.id))}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={() => console.log("Edit", template.id)}
                onClone={() => console.log("Clone", template.id)}
                onDelete={() => setTemplates(templates.filter((t) => t.id !== template.id))}
              />
            ))}
          </div>
        )}

        {filteredTemplates.length === 0 && (
          <div className="py-16 text-center">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No templates found</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery ? "Try adjusting your search" : "Create your first template to get started"}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg font-medium transition"
            >
              <Plus className="h-4 w-4" />
              Create Template
            </button>
          </div>
        )}

        {/* Create Template Modal */}
        <AnimatePresence>
          {showCreateModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowCreateModal(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-background border border-border rounded-xl w-full max-w-md p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <h2 className="text-xl font-bold text-foreground">Create Template</h2>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Template Type */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Template Type</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(Object.keys(TYPE_CONFIG) as TemplateType[]).map((type) => {
                        const config = TYPE_CONFIG[type];
                        const Icon = config.icon;
                        return (
                          <button
                            key={type}
                            onClick={() => setNewTemplateType(type)}
                            className={cn(
                              "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition",
                              newTemplateType === type
                                ? cn(config.bgColor, config.color, "border-current")
                                : "bg-muted border-border text-muted-foreground hover:border-border"
                            )}
                          >
                            <Icon className="h-6 w-6" />
                            <span className="text-xs font-medium">{config.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Template Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Senior Engineer JD"
                      className="w-full bg-muted text-foreground rounded-lg px-4 py-2 border border-border focus:border-primary-500 focus:outline-none"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                    <textarea
                      placeholder="Brief description of this template..."
                      rows={3}
                      className="w-full bg-muted text-foreground rounded-lg px-4 py-2 border border-border focus:border-primary-500 focus:outline-none resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg font-medium hover:bg-accent transition"
                  >
                    Cancel
                  </button>
                  <button className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-500 transition">
                    Create Template
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </main>
  );
}
