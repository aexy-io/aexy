"use client";

import { useState, useCallback } from "react";
import {
  X,
  Sparkles,
  Code2,
  FileText,
  BookOpen,
  Layers,
  FileCode,
  Loader2,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { documentApi, TemplateCategory } from "@/lib/api";

interface GenerationPanelProps {
  workspaceId: string;
  documentId?: string;
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (content: Record<string, unknown>) => void;
}

type GenerationMode = "from_code" | "from_link" | "improve";

const templateOptions = [
  {
    value: "api_docs",
    label: "API Documentation",
    icon: Code2,
    description: "REST APIs, endpoints, parameters",
  },
  {
    value: "readme",
    label: "README",
    icon: BookOpen,
    description: "Project overview and setup",
  },
  {
    value: "function_docs",
    label: "Function Docs",
    icon: FileCode,
    description: "Function/method documentation",
  },
  {
    value: "module_docs",
    label: "Module Docs",
    icon: Layers,
    description: "Architecture overview",
  },
];

export function GenerationPanel({
  workspaceId,
  documentId,
  isOpen,
  onClose,
  onGenerated,
}: GenerationPanelProps) {
  const [mode, setMode] = useState<GenerationMode>("from_code");
  const [code, setCode] = useState("");
  const [filePath, setFilePath] = useState("");
  const [language, setLanguage] = useState("");
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory>("function_docs");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setSuccess(false);

    try {
      if (mode === "from_code") {
        if (!code.trim()) {
          throw new Error("Please enter some source code to document");
        }

        const result = await documentApi.generateFromCode(workspaceId, code, {
          template_category: templateCategory,
          file_path: filePath || undefined,
          language: language || undefined,
        });

        onGenerated(result.content);
        setSuccess(true);
      } else if (mode === "from_link" && documentId) {
        const result = await documentApi.generate(workspaceId, documentId, templateCategory);
        onGenerated(result.content);
        setSuccess(true);
      } else if (mode === "improve" && documentId) {
        const result = await documentApi.suggestImprovements(workspaceId, documentId);
        // For improvements, we just show the suggestions
        console.log("Improvement suggestions:", result.suggestions);
        setSuccess(true);
      }

      // Close panel after short delay to show success
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate documentation");
    } finally {
      setIsGenerating(false);
    }
  }, [mode, code, filePath, language, templateCategory, workspaceId, documentId, onGenerated, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-purple-900/20 to-blue-900/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI Documentation Generator</h2>
              <p className="text-sm text-slate-400">
                Generate documentation from your source code
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setMode("from_code")}
            className={cn(
              "flex-1 px-4 py-3 text-sm font-medium transition",
              mode === "from_code"
                ? "text-white border-b-2 border-primary-500"
                : "text-slate-400 hover:text-white"
            )}
          >
            <Code2 className="h-4 w-4 inline-block mr-2" />
            From Code
          </button>
          {documentId && (
            <>
              <button
                onClick={() => setMode("from_link")}
                className={cn(
                  "flex-1 px-4 py-3 text-sm font-medium transition",
                  mode === "from_link"
                    ? "text-white border-b-2 border-primary-500"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <LinkIcon className="h-4 w-4 inline-block mr-2" />
                From Code Link
              </button>
              <button
                onClick={() => setMode("improve")}
                className={cn(
                  "flex-1 px-4 py-3 text-sm font-medium transition",
                  mode === "improve"
                    ? "text-white border-b-2 border-primary-500"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <FileText className="h-4 w-4 inline-block mr-2" />
                Improve Existing
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {mode === "from_code" && (
            <>
              {/* Template Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Documentation Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {templateOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setTemplateCategory(option.value as TemplateCategory)}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border transition text-left",
                        templateCategory === option.value
                          ? "bg-primary-600/20 border-primary-500"
                          : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                      )}
                    >
                      <option.icon className={cn(
                        "h-5 w-5 mt-0.5",
                        templateCategory === option.value ? "text-primary-400" : "text-slate-400"
                      )} />
                      <div>
                        <span className={cn(
                          "text-sm font-medium",
                          templateCategory === option.value ? "text-white" : "text-slate-300"
                        )}>
                          {option.label}
                        </span>
                        <p className="text-xs text-slate-500">{option.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Code Input */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Source Code
                </label>
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste your source code here..."
                  rows={12}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 resize-none"
                />
              </div>

              {/* Optional Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    File Path (optional)
                  </label>
                  <input
                    type="text"
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    placeholder="e.g., src/utils/api.ts"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Language (optional)
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  >
                    <option value="">Auto-detect</option>
                    <option value="python">Python</option>
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                    <option value="go">Go</option>
                    <option value="rust">Rust</option>
                    <option value="java">Java</option>
                    <option value="csharp">C#</option>
                    <option value="ruby">Ruby</option>
                    <option value="php">PHP</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {mode === "from_link" && (
            <div className="text-center py-8">
              <LinkIcon className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                Generate from Code Link
              </h3>
              <p className="text-slate-400 text-sm max-w-md mx-auto">
                This will use the linked source code to regenerate the documentation
                for this document. Make sure you have code links set up first.
              </p>

              {/* Template Selection */}
              <div className="mt-6 max-w-sm mx-auto">
                <label className="block text-sm font-medium text-slate-300 mb-2 text-left">
                  Documentation Type
                </label>
                <select
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value as TemplateCategory)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                >
                  {templateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {mode === "improve" && (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 text-purple-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                Get Improvement Suggestions
              </h3>
              <p className="text-slate-400 text-sm max-w-md mx-auto">
                AI will analyze your current documentation and suggest improvements
                for clarity, completeness, and accuracy.
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-900/20 border border-red-800 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center gap-3 p-4 bg-green-900/20 border border-green-800 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
              <p className="text-sm text-green-300">Documentation generated successfully!</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || (mode === "from_code" && !code.trim())}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
