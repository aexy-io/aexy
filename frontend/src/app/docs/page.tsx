"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Sparkles, BookOpen, Code2, FileCode, X, Loader2 } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDocuments, useTemplates } from "@/hooks/useDocuments";
import { documentApi } from "@/lib/api";

// Initial content for API Documentation
const API_DOC_CONTENT = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "API Documentation" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Document your API endpoints, request/response formats, and authentication." }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Authentication" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Describe your authentication method (API keys, OAuth, JWT, etc.)" }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Endpoints" }],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "GET /api/resource" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Description of the endpoint." }],
    },
    {
      type: "heading",
      attrs: { level: 4 },
      content: [{ type: "text", text: "Parameters" }],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "code" }], text: "param1" }, { type: "text", text: " (required) - Description" }] }],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 4 },
      content: [{ type: "text", text: "Response" }],
    },
    {
      type: "codeBlock",
      attrs: { language: "json" },
      content: [{ type: "text", text: '{\n  "data": [],\n  "status": "success"\n}' }],
    },
  ],
};

// Initial content for README
const README_CONTENT = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Project Name" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "A brief description of what this project does and who it's for." }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Features" }],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Feature 1" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Feature 2" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Feature 3" }] }] },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Installation" }],
    },
    {
      type: "codeBlock",
      attrs: { language: "bash" },
      content: [{ type: "text", text: "npm install my-project\n# or\nyarn add my-project" }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Quick Start" }],
    },
    {
      type: "codeBlock",
      attrs: { language: "javascript" },
      content: [{ type: "text", text: "import { myProject } from 'my-project';\n\n// Example usage\nconst result = myProject.doSomething();" }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Configuration" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Describe configuration options here." }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Contributing" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Contributions are welcome! Please read the contributing guidelines first." }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "License" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "MIT" }],
    },
  ],
};

export default function DocsPage() {
  const router = useRouter();
  const { currentWorkspaceId } = useWorkspace();
  const { createDocument, isCreating } = useDocuments(currentWorkspaceId);
  const { templates, templatesByCategory, isLoading: templatesLoading } = useTemplates(currentWorkspaceId);

  // State for Generate from Code modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("typescript");
  const [docType, setDocType] = useState("function_docs");
  const [isGenerating, setIsGenerating] = useState(false);

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

  const handleCreateAPIDoc = useCallback(async () => {
    if (!currentWorkspaceId) return;
    try {
      const result = await createDocument.mutateAsync({
        title: "API Documentation",
        content: API_DOC_CONTENT,
        icon: "📡",
      });
      router.push(`/docs/${result.id}`);
    } catch (error) {
      console.error("Failed to create API documentation:", error);
    }
  }, [createDocument, currentWorkspaceId, router]);

  const handleCreateREADME = useCallback(async () => {
    if (!currentWorkspaceId) return;
    try {
      const result = await createDocument.mutateAsync({
        title: "README",
        content: README_CONTENT,
        icon: "📖",
      });
      router.push(`/docs/${result.id}`);
    } catch (error) {
      console.error("Failed to create README:", error);
    }
  }, [createDocument, currentWorkspaceId, router]);

  const handleGenerateFromCode = useCallback(async () => {
    if (!currentWorkspaceId || !codeInput.trim()) return;

    setIsGenerating(true);
    try {
      // Generate documentation from code
      const response = await documentApi.generateFromCode(currentWorkspaceId, codeInput, {
        template_category: docType,
        language: codeLanguage,
      });

      // Create document with generated content
      const result = await createDocument.mutateAsync({
        title: "Generated Documentation",
        content: response.content,
        icon: "✨",
      });

      setShowGenerateModal(false);
      setCodeInput("");
      router.push(`/docs/${result.id}`);
    } catch (error) {
      console.error("Failed to generate documentation:", error);
      alert("Failed to generate documentation. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }, [createDocument, currentWorkspaceId, codeInput, codeLanguage, docType, router]);

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
      onClick: handleCreateAPIDoc,
      color: "from-blue-500 to-blue-600",
    },
    {
      icon: BookOpen,
      label: "README",
      description: "Project overview and setup",
      onClick: handleCreateREADME,
      color: "from-green-500 to-green-600",
    },
    {
      icon: Sparkles,
      label: "Generate from Code",
      description: "AI-powered documentation",
      onClick: () => setShowGenerateModal(true),
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

      {/* Generate from Code Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Generate from Code</h2>
                  <p className="text-sm text-slate-400">Paste code to generate documentation</p>
                </div>
              </div>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="p-2 hover:bg-slate-800 rounded-lg transition"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
              {/* Options Row */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Documentation Type
                  </label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                  >
                    <option value="function_docs">Function Documentation</option>
                    <option value="api_docs">API Documentation</option>
                    <option value="readme">README</option>
                    <option value="module_docs">Module Documentation</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Language
                  </label>
                  <select
                    value={codeLanguage}
                    onChange={(e) => setCodeLanguage(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                  >
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                    <option value="python">Python</option>
                    <option value="go">Go</option>
                    <option value="rust">Rust</option>
                    <option value="java">Java</option>
                    <option value="csharp">C#</option>
                    <option value="cpp">C++</option>
                  </select>
                </div>
              </div>

              {/* Code Input */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Source Code
                </label>
                <textarea
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="Paste your code here..."
                  className="w-full h-64 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-800">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 text-slate-300 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateFromCode}
                disabled={isGenerating || !codeInput.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Documentation
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
