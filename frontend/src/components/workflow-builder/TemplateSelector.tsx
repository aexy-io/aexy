"use client";

import { useState, useEffect } from "react";
import {
  X,
  Search,
  FileText,
  Loader2,
  TrendingUp,
  Megaphone,
  UserPlus,
  MessageSquare,
  Bell,
  Sparkles,
  Mail,
  RefreshCw,
  Brain,
  Calendar,
  Database,
  Send,
  ChevronRight,
  Zap,
} from "lucide-react";
import { workflowTemplatesApi, WorkflowTemplateListItem, WorkflowTemplateCategory } from "@/lib/api";

interface TemplateSelectorProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => Promise<void>;
  onStartFromScratch: () => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  sales: <TrendingUp className="h-5 w-5" />,
  marketing: <Megaphone className="h-5 w-5" />,
  onboarding: <UserPlus className="h-5 w-5" />,
  engagement: <MessageSquare className="h-5 w-5" />,
  notifications: <Bell className="h-5 w-5" />,
  custom: <Sparkles className="h-5 w-5" />,
};

const templateIcons: Record<string, React.ReactNode> = {
  UserPlus: <UserPlus className="h-5 w-5" />,
  Mail: <Mail className="h-5 w-5" />,
  Bell: <Bell className="h-5 w-5" />,
  RefreshCw: <RefreshCw className="h-5 w-5" />,
  Brain: <Brain className="h-5 w-5" />,
  Calendar: <Calendar className="h-5 w-5" />,
  Database: <Database className="h-5 w-5" />,
  Send: <Send className="h-5 w-5" />,
  Sparkles: <Sparkles className="h-5 w-5" />,
};

export function TemplateSelector({
  workspaceId,
  isOpen,
  onClose,
  onSelectTemplate,
  onStartFromScratch,
}: TemplateSelectorProps) {
  const [categories, setCategories] = useState<WorkflowTemplateCategory[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateListItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      loadTemplates();
    }
  }, [isOpen, workspaceId]);

  useEffect(() => {
    if (isOpen) {
      loadTemplates(selectedCategory || undefined);
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    try {
      const data = await workflowTemplatesApi.getCategories(workspaceId);
      setCategories(data);
    } catch (error) {
      console.error("Failed to load categories:", error);
    }
  };

  const loadTemplates = async (category?: string) => {
    setIsLoading(true);
    try {
      const data = await workflowTemplatesApi.list(workspaceId, category);
      setTemplates(data);
    } catch (error) {
      console.error("Failed to load templates:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTemplate = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    setIsApplying(true);
    try {
      await onSelectTemplate(templateId);
      onClose();
    } catch (error) {
      console.error("Failed to apply template:", error);
    } finally {
      setIsApplying(false);
      setSelectedTemplateId(null);
    }
  };

  const filteredTemplates = templates.filter((template) =>
    searchQuery
      ? template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      : true
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Create Automation</h2>
            <p className="text-sm text-slate-400 mt-1">
              Start from a template or build from scratch
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - Categories */}
          <div className="w-56 border-r border-slate-700 p-4 overflow-y-auto">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Categories
            </h3>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategory === null
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-slate-300 hover:bg-slate-700"
                }`}
              >
                <Zap className="h-4 w-4" />
                <span>All Templates</span>
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedCategory === category.id
                      ? "bg-blue-500/20 text-blue-400"
                      : "text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {categoryIcons[category.id] || <FileText className="h-4 w-4" />}
                    <span>{category.label}</span>
                  </div>
                  <span className="text-xs text-slate-500">{category.template_count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Main - Templates */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Start from scratch */}
            <button
              onClick={onStartFromScratch}
              className="w-full flex items-center justify-between p-4 mb-6 border-2 border-dashed border-slate-600 rounded-xl hover:border-blue-500 hover:bg-blue-500/5 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-700 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                  <FileText className="h-6 w-6 text-slate-400 group-hover:text-blue-400 transition-colors" />
                </div>
                <div className="text-left">
                  <h4 className="font-medium text-white">Start from scratch</h4>
                  <p className="text-sm text-slate-400">Build your own custom workflow</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-blue-400 transition-colors" />
            </button>

            {/* Templates grid */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No templates found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template.id)}
                    disabled={isApplying}
                    className={`flex flex-col items-start p-4 border border-slate-700 rounded-xl hover:border-blue-500 hover:bg-blue-500/5 transition-all text-left group ${
                      isApplying && selectedTemplateId === template.id
                        ? "opacity-70 cursor-wait"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between w-full mb-3">
                      <div className="p-2.5 bg-slate-700 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                        {template.icon && templateIcons[template.icon] ? (
                          <span className="text-slate-400 group-hover:text-blue-400 transition-colors">
                            {templateIcons[template.icon]}
                          </span>
                        ) : (
                          <FileText className="h-5 w-5 text-slate-400 group-hover:text-blue-400 transition-colors" />
                        )}
                      </div>
                      {template.is_system && (
                        <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">
                          Built-in
                        </span>
                      )}
                    </div>
                    <h4 className="font-medium text-white mb-1 group-hover:text-blue-400 transition-colors">
                      {template.name}
                    </h4>
                    <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                      {template.description || "No description"}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{template.node_count} nodes</span>
                      {template.use_count > 0 && (
                        <>
                          <span className="text-slate-600">|</span>
                          <span>{template.use_count} uses</span>
                        </>
                      )}
                    </div>
                    {isApplying && selectedTemplateId === template.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 rounded-xl">
                        <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
