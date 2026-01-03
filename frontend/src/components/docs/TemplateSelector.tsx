"use client";

import { useState } from "react";
import { X, FileText, Code2, BookOpen, Layers, FileCode, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { TemplateListItem, TemplateCategory } from "@/lib/api";
import { useTemplates } from "@/hooks/useDocuments";

interface TemplateSelectorProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: TemplateListItem | null) => void;
}

const categoryIcons: Record<TemplateCategory, React.ElementType> = {
  api_docs: Code2,
  readme: BookOpen,
  function_docs: FileCode,
  module_docs: Layers,
  guides: FileText,
  general: FileText,
};

const categoryLabels: Record<TemplateCategory, string> = {
  api_docs: "API Documentation",
  readme: "README",
  function_docs: "Function Documentation",
  module_docs: "Module Documentation",
  guides: "Guides & Tutorials",
  general: "General",
};

const categoryDescriptions: Record<TemplateCategory, string> = {
  api_docs: "Document REST APIs, endpoints, and responses",
  readme: "Project overview, setup, and usage",
  function_docs: "Detailed function/method documentation",
  module_docs: "Architecture and module overviews",
  guides: "Step-by-step tutorials and how-tos",
  general: "General purpose documentation",
};

export function TemplateSelector({
  workspaceId,
  isOpen,
  onClose,
  onSelect,
}: TemplateSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(null);
  const { templates, templatesByCategory, isLoading } = useTemplates(workspaceId);

  if (!isOpen) return null;

  const categories = Object.keys(templatesByCategory) as TemplateCategory[];

  const handleSelectBlank = () => {
    onSelect(null);
    onClose();
  };

  const handleSelectTemplate = (template: TemplateListItem) => {
    onSelect(template);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[80vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-white">Create New Document</h2>
            <p className="text-sm text-slate-400">
              Choose a template or start with a blank document
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Blank Document Option */}
          <div className="mb-6">
            <button
              onClick={handleSelectBlank}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 hover:border-slate-600 transition group"
            >
              <div className="p-3 bg-slate-700 rounded-xl group-hover:bg-slate-600 transition">
                <FileText className="h-6 w-6 text-slate-300" />
              </div>
              <div className="text-left">
                <h3 className="text-white font-medium">Blank Document</h3>
                <p className="text-sm text-slate-400">Start with an empty page</p>
              </div>
            </button>
          </div>

          {/* AI Generation Option */}
          <div className="mb-6">
            <button
              onClick={() => setSelectedCategory(null)}
              className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-700/50 rounded-xl hover:from-purple-900/50 hover:to-blue-900/50 transition group"
            >
              <div className="p-3 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div className="text-left flex-1">
                <h3 className="text-white font-medium">Generate from Code</h3>
                <p className="text-sm text-slate-400">
                  Use AI to generate documentation from your source code
                </p>
              </div>
              <span className="px-2 py-1 text-xs font-medium text-purple-300 bg-purple-900/50 rounded-full">
                AI Powered
              </span>
            </button>
          </div>

          {/* Template Categories */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500" />
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Templates
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(categoryLabels).map(([category, label]) => {
                  const Icon = categoryIcons[category as TemplateCategory];
                  const description = categoryDescriptions[category as TemplateCategory];
                  const categoryTemplates = templatesByCategory[category as TemplateCategory] || [];

                  return (
                    <button
                      key={category}
                      onClick={() => {
                        if (categoryTemplates.length > 0) {
                          handleSelectTemplate(categoryTemplates[0]);
                        }
                      }}
                      disabled={categoryTemplates.length === 0}
                      className={cn(
                        "flex flex-col items-start p-4 rounded-xl border transition text-left",
                        categoryTemplates.length > 0
                          ? "bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600"
                          : "bg-slate-900/50 border-slate-800 opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-slate-700 rounded-lg">
                          <Icon className="h-4 w-4 text-primary-400" />
                        </div>
                        <span className="text-white font-medium">{label}</span>
                      </div>
                      <p className="text-xs text-slate-500">{description}</p>
                      {categoryTemplates.length > 0 && (
                        <span className="mt-2 text-xs text-slate-500">
                          {categoryTemplates.length} template{categoryTemplates.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Templates */}
          {templates && templates.filter(t => !t.is_system).length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Custom Templates
              </h3>
              <div className="space-y-2">
                {templates
                  .filter(t => !t.is_system)
                  .map((template) => {
                    const Icon = categoryIcons[template.category] || FileText;
                    return (
                      <button
                        key={template.id}
                        onClick={() => handleSelectTemplate(template)}
                        className="w-full flex items-center gap-3 p-3 bg-slate-800/30 border border-slate-700/50 rounded-lg hover:bg-slate-800 hover:border-slate-600 transition"
                      >
                        <span className="text-xl">{template.icon || "📄"}</span>
                        <div className="text-left flex-1">
                          <span className="text-white text-sm font-medium">
                            {template.name}
                          </span>
                          {template.description && (
                            <p className="text-xs text-slate-500 truncate">
                              {template.description}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">
                          {categoryLabels[template.category]}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
