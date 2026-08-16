"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Sparkles,
  Code2,
  X,
  Loader2,
  FolderGit2,
  Folder,
  File,
  ChevronRight,
  Check,
  ArrowLeft,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/utils";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useDocuments, useTemplates } from "@/hooks/useDocuments";
import { documentApi, repositoriesApi, Repository, TemplateListItem } from "@/lib/api";
import { TemplateSelector } from "@/components/docs/TemplateSelector";

export default function DocsPage() {
  const router = useRouter();
  const { currentWorkspaceId } = useWorkspace();
  const { createDocument, isCreating } = useDocuments(currentWorkspaceId);
  const { templates, isLoading: templatesLoading } = useTemplates(currentWorkspaceId);

  // State for Generate from Code modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("typescript");
  const [docType, setDocType] = useState("function_docs");
  const [isGenerating, setIsGenerating] = useState(false);

  // State for source mode (paste code vs repository)
  const [sourceMode, setSourceMode] = useState<"paste" | "repo">("paste");
  const [repoStep, setRepoStep] = useState<"select" | "browse">("select");
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");

  // Fetch repositories when modal is open and in repo mode
  const { data: repositories, isLoading: loadingRepos } = useQuery({
    queryKey: ["repositories", "enabled"],
    queryFn: () => repositoriesApi.listRepositories({ enabled_only: true }),
    enabled: showGenerateModal && sourceMode === "repo",
  });

  // Fetch branches when a repo is selected
  const { data: branches, isLoading: loadingBranches } = useQuery({
    queryKey: ["branches", selectedRepo?.id],
    queryFn: () => repositoriesApi.getBranches(selectedRepo!.id),
    enabled: !!selectedRepo && repoStep === "browse",
  });

  // Fetch directory contents
  const { data: contents, isLoading: loadingContents } = useQuery({
    queryKey: ["contents", selectedRepo?.id, currentPath, selectedBranch],
    queryFn: () =>
      repositoriesApi.getContents(selectedRepo!.id, {
        path: currentPath,
        ref: selectedBranch,
      }),
    enabled: !!selectedRepo && repoStep === "browse",
  });

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

  const handleCreateFromTemplate = useCallback(async (templateId: string, title?: string) => {
    if (!currentWorkspaceId) return;
    try {
      const result = await createDocument.mutateAsync({
        // The template's own name is a better working title than "Untitled" —
        // it is what the person just chose, and it is renameable in the editor.
        title: title || "Untitled",
        template_id: templateId,
      });
      router.push(`/docs/${result.id}`);
    } catch (error) {
      console.error("Failed to create document from template:", error);
    }
  }, [createDocument, currentWorkspaceId, router]);

  /** The picker hands back a template, or null for a plain blank page. */
  const handlePickTemplate = useCallback((template: TemplateListItem | null) => {
    if (!template) {
      void handleCreateBlankDocument();
      return;
    }
    void handleCreateFromTemplate(template.id, template.name);
  }, [handleCreateBlankDocument, handleCreateFromTemplate]);

  const resetModal = useCallback(() => {
    setShowGenerateModal(false);
    setSourceMode("paste");
    setRepoStep("select");
    setSelectedRepo(null);
    setCurrentPath("");
    setSelectedFile(null);
    setCodeInput("");
    setCustomPrompt("");
  }, []);

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

      resetModal();
      router.push(`/docs/${result.id}`);
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Could not generate this document")
      );
    } finally {
      setIsGenerating(false);
    }
  }, [createDocument, currentWorkspaceId, codeInput, codeLanguage, docType, resetModal, router]);

  const handleGenerateFromRepository = useCallback(async () => {
    if (!currentWorkspaceId || !selectedRepo) return;

    setIsGenerating(true);
    try {
      // One call: the server generates, creates the document and records the
      // code link in a single transaction. Doing it as two client calls left
      // a document that looked generated and would never notice its code
      // changing — which is the whole failure this endpoint exists to remove.
      const { document } = await documentApi.createDocumentFromRepository(
        currentWorkspaceId,
        {
          repository_id: selectedRepo.id,
          path: selectedFile ?? currentPath,
          link_type: selectedFile ? "file" : "directory",
          branch: selectedBranch,
          template_category: selectedFile ? docType : undefined,
          custom_prompt: customPrompt || undefined,
        }
      );

      resetModal();
      router.push(`/docs/${document.id}`);
    } catch (error) {
      // The backend distinguishes "install the GitHub App", "rate limited"
      // and "AI unavailable". Collapsing those into "please try again" gave
      // the wrong advice for all three.
      toast.error(
        getApiErrorMessage(error, "Could not generate this document")
      );
    } finally {
      setIsGenerating(false);
    }
  }, [
    currentWorkspaceId,
    selectedRepo,
    selectedFile,
    currentPath,
    selectedBranch,
    docType,
    customPrompt,
    resetModal,
    router,
  ]);

  const handleSelectRepo = useCallback((repo: Repository) => {
    setSelectedRepo(repo);
    setSelectedBranch(repo.sync_status === "synced" ? "main" : "main");
    setCurrentPath("");
    setRepoStep("browse");
  }, []);

  const handleSelectItem = useCallback(
    (item: { name: string; type: string; path: string }) => {
      if (item.type === "dir") {
        setCurrentPath(item.path);
        setSelectedFile(null);
        return;
      }
      // Files were unclickable, which made three of the four documentation
      // types on this screen unreachable by construction — "Function
      // documentation" needs a function, and you could only ever pick a
      // directory.
      setSelectedFile((current) => (current === item.path ? null : item.path));
    },
    []
  );

  const handleBackToRepos = useCallback(() => {
    setRepoStep("select");
    setSelectedRepo(null);
    setCurrentPath("");
  }, []);


  // Sort contents: directories first, then files
  const sortedContents = contents
    ? [...contents].sort((a, b) => {
        if (a.type === "dir" && b.type !== "dir") return -1;
        if (a.type !== "dir" && b.type === "dir") return 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  // Breadcrumb path parts
  const pathParts = currentPath ? currentPath.split("/") : [];

  // Two entry points, not four. "API Documentation" and "README" were cards here
  // because their bodies were hardcoded in this file; they are catalogue templates
  // now and appear in the picker alongside the rest, so a card each would mean
  // this page decided which two of nine templates deserved promoting.
  const quickActions = [
    {
      icon: FileText,
      label: "New document",
      description: "Blank, or from a template",
      onClick: () => setShowTemplates(true),
      color: "from-slate-500 to-slate-600",
    },
    {
      icon: Sparkles,
      label: "Generate from code",
      description: "AI-powered documentation",
      onClick: () => setShowGenerateModal(true),
      color: "from-purple-500 to-purple-600",
    },
  ];

  return (
    <div className="flex items-center justify-center h-full">
      <div className="max-w-2xl mx-auto px-8 py-12 text-center">
        {/* Header — typography-first; the audit's gradient-icon-in-
            rounded-square pattern is gone. Eyebrow ("Docs"), a
            question-shaped headline that invites action, then one
            supporting line. Quick-actions grid below carries the
            visual interest. */}
        <div className="mb-10">
          <p className="text-xs font-medium tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Docs
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight mb-3">
            What do you want to write today?
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Start blank, pick a template, or generate docs from a
            piece of code or a repo path.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={isCreating}
              className="group flex flex-col items-start p-4 bg-background/50 border border-border rounded-xl hover:bg-muted/50 hover:border-border transition text-left disabled:opacity-50"
            >
              <div className={`p-2.5 bg-gradient-to-br ${action.color} rounded-lg mb-3`}>
                <action.icon className="h-5 w-5 text-foreground" />
              </div>
              <span className="text-foreground font-medium text-sm mb-1">
                {action.label}
              </span>
              <span className="text-muted-foreground text-xs">
                {action.description}
              </span>
            </button>
          ))}
        </div>

        {/* Templates Section */}
        {!templatesLoading && templates && templates.length > 0 && (
          <div className="text-left">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Templates
            </h2>
            <div className="space-y-2">
              {templates.slice(0, 5).map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleCreateFromTemplate(template.id, template.name)}
                  disabled={isCreating}
                  className="w-full flex items-center gap-3 p-3 bg-background/30 border border-border/50 rounded-lg hover:bg-muted/30 hover:border-border transition disabled:opacity-50"
                >
                  <span className="text-xl">{template.icon || "📄"}</span>
                  <div className="flex-1 text-left">
                    <span className="text-foreground text-sm font-medium">
                      {template.name}
                    </span>
                    {template.description && (
                      <p className="text-muted-foreground text-xs truncate">
                        {template.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {template.category}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-muted-foreground text-sm">
            Select a document from the sidebar or create a new one to get started.
          </p>
        </div>
      </div>

      {currentWorkspaceId && (
        <TemplateSelector
          workspaceId={currentWorkspaceId}
          isOpen={showTemplates}
          onClose={() => setShowTemplates(false)}
          onSelect={handlePickTemplate}
          onGenerateFromCode={() => setShowGenerateModal(true)}
        />
      )}

      {/* Generate from Code Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-border">
              <div className="flex items-center gap-3">
                {sourceMode === "repo" && repoStep === "browse" ? (
                  <button
                    onClick={handleBackToRepos}
                    className="p-2 hover:bg-muted rounded-lg transition"
                  >
                    <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                  </button>
                ) : (
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg">
                    <Sparkles className="h-5 w-5 text-foreground" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Generate Documentation</h2>
                  <p className="text-sm text-muted-foreground">
                    {sourceMode === "paste"
                      ? "Paste code or select from repository"
                      : repoStep === "select"
                      ? "Select a repository"
                      : `${selectedRepo?.full_name}${currentPath ? `/${currentPath}` : ""}`}
                  </p>
                </div>
              </div>
              <button
                onClick={resetModal}
                className="p-2 hover:bg-muted rounded-lg transition"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => {
                  setSourceMode("paste");
                  setRepoStep("select");
                  setSelectedRepo(null);
                  setCurrentPath("");
                }}
                className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                  sourceMode === "paste"
                    ? "text-primary-400 border-b-2 border-primary-500 bg-muted/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code2 className="h-4 w-4 inline-block mr-2" />
                Paste Code
              </button>
              <button
                onClick={() => setSourceMode("repo")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                  sourceMode === "repo"
                    ? "text-primary-400 border-b-2 border-primary-500 bg-muted/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FolderGit2 className="h-4 w-4 inline-block mr-2" />
                From Repository
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto">
              {sourceMode === "paste" ? (
                /* Paste Code Tab */
                <div className="p-4 space-y-4">
                  {/* Options Row */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Documentation Type
                      </label>
                      <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500"
                      >
                        <option value="function_docs">Function Documentation</option>
                        <option value="api_docs">API Documentation</option>
                        <option value="readme">README</option>
                        <option value="module_docs">Module Documentation</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Language
                      </label>
                      <select
                        value={codeLanguage}
                        onChange={(e) => setCodeLanguage(e.target.value)}
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500"
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
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Source Code
                    </label>
                    <textarea
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      placeholder="Paste your code here..."
                      className="w-full h-64 px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm font-mono focus:outline-none focus:border-primary-500 resize-none"
                    />
                  </div>
                </div>
              ) : repoStep === "select" ? (
                /* Repository Selection */
                <div className="p-4">
                  {loadingRepos ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
                    </div>
                  ) : !repositories || repositories.length === 0 ? (
                    <div className="text-center py-12">
                      <FolderGit2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No repositories connected</p>
                      <p className="text-muted-foreground text-sm mt-1">
                        Connect repositories in Settings to use this feature
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {repositories.map((repo) => (
                        <button
                          key={repo.id}
                          onClick={() => handleSelectRepo(repo)}
                          className="w-full flex items-center gap-3 p-3 bg-muted/50 border border-border/50 rounded-lg hover:bg-muted hover:border-border transition text-left"
                        >
                          <FolderGit2 className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-foreground font-medium truncate">
                              {repo.full_name}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {repo.is_private && <span>Private</span>}
                              {repo.language && (
                                <span className="px-1.5 py-0.5 bg-accent rounded">
                                  {repo.language}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Directory Browser */
                <div className="flex flex-col h-[400px]">
                  {/* Breadcrumb & Branch Selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-2 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-1 text-sm overflow-x-auto">
                      <button
                        onClick={() => setCurrentPath("")}
                        className="text-foreground hover:text-foreground shrink-0"
                      >
                        {selectedRepo?.name}
                      </button>
                      {pathParts.map((part, i) => (
                        <span key={i} className="flex items-center gap-1 shrink-0">
                          <span className="text-muted-foreground">/</span>
                          <button
                            onClick={() =>
                              setCurrentPath(pathParts.slice(0, i + 1).join("/"))
                            }
                            className="text-foreground hover:text-foreground"
                          >
                            {part}
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="px-2 py-1 bg-accent border border-border rounded text-foreground text-xs focus:outline-none"
                      >
                        {branches?.map((branch) => (
                          <option key={branch.name} value={branch.name}>
                            {branch.name}
                          </option>
                        )) || <option value="main">main</option>}
                      </select>
                    </div>
                  </div>

                  {/* Doc type applies to a single file. Documenting a whole
                      directory always produces module documentation, so
                      offering four choices there would be four controls that
                      change nothing — which is what this screen used to do. */}
                  <div className="px-4 py-2 border-b border-border space-y-3">
                    {selectedFile ? (
                      <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500"
                      >
                        <option value="function_docs">Function Documentation</option>
                        <option value="api_docs">API Documentation</option>
                        <option value="readme">README</option>
                        <option value="module_docs">Module Documentation</option>
                      </select>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Documenting the whole of{" "}
                        <span className="text-foreground font-mono">
                          {currentPath || selectedRepo?.name}
                        </span>
                        . Pick a single file to choose a documentation type.
                      </p>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Custom Instructions (optional)
                      </label>
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="E.g., Focus on API usage examples, include error handling patterns, write for beginners..."
                        className="w-full h-16 px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-primary-500 resize-none"
                      />
                    </div>
                  </div>

                  {/* File List */}
                  <div className="flex-1 overflow-y-auto p-2">
                    {loadingContents ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
                      </div>
                    ) : sortedContents.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        This directory is empty
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {sortedContents.map((item) => {
                          const picked = selectedFile === item.path;
                          return (
                            <button
                              key={item.path}
                              onClick={() => handleSelectItem(item)}
                              aria-pressed={item.type === "file" ? picked : undefined}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition text-left ${
                                picked
                                  ? "bg-primary-500/10 text-foreground ring-1 ring-primary-500/40"
                                  : "text-foreground hover:bg-muted"
                              }`}
                            >
                              {item.type === "dir" ? (
                                <Folder className="h-4 w-4 text-blue-400" />
                              ) : (
                                <File className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="flex-1 truncate">{item.name}</span>
                              {item.type === "dir" ? (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              ) : picked ? (
                                <Check className="h-4 w-4 text-primary-400" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                {sourceMode === "repo" && repoStep === "browse" && (
                  <>
                    Documenting{" "}
                    <span className="text-foreground font-mono">
                      {selectedFile || currentPath || "the repository root"}
                    </span>
                    {/* Said plainly, because it is the difference between a
                        page that can be kept current and one that cannot. */}
                    <span className="block text-xs">
                      Linked to this path, so it can be updated when the code
                      changes.
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={resetModal}
                  className="px-4 py-2 text-foreground hover:text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  onClick={sourceMode === "paste" ? handleGenerateFromCode : handleGenerateFromRepository}
                  disabled={
                    isGenerating ||
                    (sourceMode === "paste" && !codeInput.trim()) ||
                    (sourceMode === "repo" && !selectedRepo)
                  }
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
        </div>
      )}
    </div>
  );
}
