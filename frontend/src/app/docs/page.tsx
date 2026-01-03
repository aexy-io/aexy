"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Sparkles, BookOpen, Code2, FileCode } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDocuments, useTemplates } from "@/hooks/useDocuments";

export default function DocsPage() {
  const router = useRouter();
  const { currentWorkspaceId } = useWorkspace();
  const { createDocument, isCreating } = useDocuments(currentWorkspaceId);
  const { templates, templatesByCategory, isLoading: templatesLoading } = useTemplates(currentWorkspaceId);

  const handleCreateBlankDocument = useCallback(async () => {
    if (!currentWorkspaceId) return;
    try {
      const result = await createDocument.mutateAsync({
        title: "Untitled",
      });
      router.push(`/docs/${result.id}`);
    } catch (error) {
      console.error("Failed to create document:", error);
    }
  }, [createDocument, currentWorkspaceId, router]);

  const handleCreateFromTemplate = useCallback(async (templateId: string) => {
    if (!currentWorkspaceId) return;
    try {
      const result = await createDocument.mutateAsync({
        title: "Untitled",
        template_id: templateId,
      });
      router.push(`/docs/${result.id}`);
    } catch (error) {
      console.error("Failed to create document from template:", error);
    }
  }, [createDocument, currentWorkspaceId, router]);

  const quickActions = [
    {
      icon: FileText,
      label: "Blank Document",
      description: "Start with an empty page",
      onClick: handleCreateBlankDocument,
      color: "from-slate-500 to-slate-600",
    },
    {
      icon: Code2,
      label: "API Documentation",
      description: "Document your API endpoints",
      onClick: () => {},
      color: "from-blue-500 to-blue-600",
    },
    {
      icon: BookOpen,
      label: "README",
      description: "Project overview and setup",
      onClick: () => {},
      color: "from-green-500 to-green-600",
    },
    {
      icon: Sparkles,
      label: "Generate from Code",
      description: "AI-powered documentation",
      onClick: () => {},
      color: "from-purple-500 to-purple-600",
    },
  ];

  return (
    <div className="flex items-center justify-center h-full">
      <div className="max-w-2xl mx-auto px-8 py-12 text-center">
        {/* Header */}
        <div className="mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-primary-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Documentation
          </h1>
          <p className="text-slate-400">
            Create, organize, and auto-generate documentation from your code.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={isCreating}
              className="group flex flex-col items-start p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:bg-slate-800/50 hover:border-slate-700 transition text-left disabled:opacity-50"
            >
              <div className={`p-2.5 bg-gradient-to-br ${action.color} rounded-lg mb-3`}>
                <action.icon className="h-5 w-5 text-white" />
              </div>
              <span className="text-white font-medium text-sm mb-1">
                {action.label}
              </span>
              <span className="text-slate-500 text-xs">
                {action.description}
              </span>
            </button>
          ))}
        </div>

        {/* Templates Section */}
        {!templatesLoading && templates && templates.length > 0 && (
          <div className="text-left">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Templates
            </h2>
            <div className="space-y-2">
              {templates.slice(0, 5).map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleCreateFromTemplate(template.id)}
                  disabled={isCreating}
                  className="w-full flex items-center gap-3 p-3 bg-slate-900/30 border border-slate-800/50 rounded-lg hover:bg-slate-800/30 hover:border-slate-700 transition disabled:opacity-50"
                >
                  <span className="text-xl">{template.icon || "📄"}</span>
                  <div className="flex-1 text-left">
                    <span className="text-white text-sm font-medium">
                      {template.name}
                    </span>
                    {template.description && (
                      <p className="text-slate-500 text-xs truncate">
                        {template.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">
                    {template.category}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-8 pt-6 border-t border-slate-800">
          <p className="text-slate-500 text-sm">
            Select a document from the sidebar or create a new one to get started.
          </p>
        </div>
      </div>
    </div>
  );
}
