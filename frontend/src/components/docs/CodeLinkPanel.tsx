"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  Link as LinkIcon,
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  GitBranch,
  Check,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { repositoriesApi, Repository, DocumentLinkType } from "@/lib/api";

interface CodeLinkPanelProps {
  workspaceId: string;
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  onLink: (data: {
    repository_id: string;
    path: string;
    link_type: DocumentLinkType;
    branch: string;
  }) => Promise<void>;
}

interface FileItem {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  sha: string;
}

export function CodeLinkPanel({
  workspaceId,
  documentId,
  isOpen,
  onClose,
  onLink,
}: CodeLinkPanelProps) {
  const [step, setStep] = useState<"repo" | "browse">("repo");
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [currentPath, setCurrentPath] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"file" | "dir" | null>(null);
  const [linkType, setLinkType] = useState<DocumentLinkType>("file");
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch enabled repositories
  const { data: repositories, isLoading: loadingRepos } = useQuery({
    queryKey: ["repositories", "enabled"],
    queryFn: () => repositoriesApi.listRepositories({ enabled_only: true }),
    enabled: isOpen,
  });

  // Fetch branches when repo is selected
  const { data: branches, isLoading: loadingBranches } = useQuery({
    queryKey: ["branches", selectedRepo?.id],
    queryFn: () => repositoriesApi.getBranches(selectedRepo!.id),
    enabled: !!selectedRepo,
  });

  // Fetch contents when browsing
  const { data: contents, isLoading: loadingContents } = useQuery({
    queryKey: ["contents", selectedRepo?.id, currentPath, selectedBranch],
    queryFn: () =>
      repositoriesApi.getContents(selectedRepo!.id, {
        path: currentPath,
        ref: selectedBranch,
      }),
    enabled: !!selectedRepo && step === "browse",
  });

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setStep("repo");
      setSelectedRepo(null);
      setSelectedBranch("main");
      setCurrentPath("");
      setSelectedPath(null);
      setSelectedType(null);
      setError(null);
    }
  }, [isOpen]);

  // Update branch when branches load
  useEffect(() => {
    if (branches && branches.length > 0) {
      const mainBranch = branches.find((b) => b.name === "main" || b.name === "master");
      if (mainBranch) {
        setSelectedBranch(mainBranch.name);
      } else {
        setSelectedBranch(branches[0].name);
      }
    }
  }, [branches]);

  const handleSelectRepo = useCallback((repo: Repository) => {
    setSelectedRepo(repo);
    setStep("browse");
    setCurrentPath("");
    setSelectedPath(null);
  }, []);

  const handleNavigate = useCallback((item: FileItem) => {
    if (item.type === "dir") {
      setCurrentPath(item.path);
      setSelectedPath(null);
      setSelectedType(null);
    } else {
      setSelectedPath(item.path);
      setSelectedType("file");
      setLinkType("file");
    }
  }, []);

  const handleSelectDirectory = useCallback((path: string) => {
    setSelectedPath(path);
    setSelectedType("dir");
    setLinkType("directory");
  }, []);

  const handleGoBack = useCallback(() => {
    if (currentPath) {
      const parts = currentPath.split("/");
      parts.pop();
      setCurrentPath(parts.join("/"));
      setSelectedPath(null);
      setSelectedType(null);
    }
  }, [currentPath]);

  const handleLink = useCallback(async () => {
    if (!selectedRepo || !selectedPath) return;

    setIsLinking(true);
    setError(null);

    try {
      await onLink({
        repository_id: selectedRepo.id,
        path: selectedPath,
        link_type: linkType,
        branch: selectedBranch,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setIsLinking(false);
    }
  }, [selectedRepo, selectedPath, linkType, selectedBranch, onLink, onClose]);

  if (!isOpen) return null;

  const pathParts = currentPath ? currentPath.split("/") : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 rounded-xl">
              <LinkIcon className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Link Source Code</h2>
              <p className="text-sm text-slate-400">
                {step === "repo"
                  ? "Select a repository"
                  : `Browsing ${selectedRepo?.full_name}`}
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

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {step === "repo" ? (
            // Repository Selection
            <div className="flex-1 overflow-y-auto p-4">
              {loadingRepos ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
                </div>
              ) : !repositories || repositories.length === 0 ? (
                <div className="text-center py-12">
                  <Code2 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">
                    No Repositories Found
                  </h3>
                  <p className="text-slate-400 text-sm">
                    Enable some repositories first to link code to your documentation.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {repositories.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => handleSelectRepo(repo)}
                      className="w-full flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 hover:border-slate-600 transition text-left"
                    >
                      <div className="p-2 bg-slate-700 rounded-lg">
                        <Code2 className="h-5 w-5 text-slate-300" />
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">{repo.full_name}</div>
                        {repo.description && (
                          <p className="text-slate-500 text-sm truncate">
                            {repo.description}
                          </p>
                        )}
                      </div>
                      {repo.language && (
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                          {repo.language}
                        </span>
                      )}
                      <ChevronRight className="h-5 w-5 text-slate-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // File Browser
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Branch Selector & Breadcrumb */}
              <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-800 bg-slate-900/50">
                {/* Back Button */}
                <button
                  onClick={() => {
                    if (currentPath) {
                      handleGoBack();
                    } else {
                      setStep("repo");
                      setSelectedRepo(null);
                    }
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                {/* Branch Selector */}
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-slate-500" />
                  <select
                    value={selectedBranch}
                    onChange={(e) => {
                      setSelectedBranch(e.target.value);
                      setSelectedPath(null);
                    }}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  >
                    {branches?.map((branch) => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Breadcrumb */}
                <div className="flex-1 flex items-center gap-1 text-sm overflow-x-auto">
                  <button
                    onClick={() => {
                      setCurrentPath("");
                      setSelectedPath(null);
                    }}
                    className="text-slate-400 hover:text-white shrink-0"
                  >
                    {selectedRepo?.name}
                  </button>
                  {pathParts.map((part, i) => (
                    <span key={i} className="flex items-center gap-1 shrink-0">
                      <span className="text-slate-600">/</span>
                      <button
                        onClick={() => {
                          setCurrentPath(pathParts.slice(0, i + 1).join("/"));
                          setSelectedPath(null);
                        }}
                        className="text-slate-400 hover:text-white"
                      >
                        {part}
                      </button>
                    </span>
                  ))}
                </div>

                {/* Select Current Directory Button */}
                {currentPath && (
                  <button
                    onClick={() => handleSelectDirectory(currentPath)}
                    className={cn(
                      "shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition",
                      selectedPath === currentPath && selectedType === "dir"
                        ? "bg-primary-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    )}
                  >
                    Select Directory
                  </button>
                )}
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto p-2">
                {loadingContents ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
                  </div>
                ) : !contents || contents.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    This directory is empty
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {/* Sort: directories first, then files */}
                    {[...contents]
                      .sort((a, b) => {
                        if (a.type === b.type) return a.name.localeCompare(b.name);
                        return a.type === "dir" ? -1 : 1;
                      })
                      .map((item) => (
                        <button
                          key={item.path}
                          onClick={() => handleNavigate(item)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition text-left",
                            selectedPath === item.path
                              ? "bg-primary-600/20 text-primary-300"
                              : "text-slate-300 hover:bg-slate-800"
                          )}
                        >
                          {item.type === "dir" ? (
                            <Folder className="h-4 w-4 text-blue-400" />
                          ) : (
                            <File className="h-4 w-4 text-slate-500" />
                          )}
                          <span className="flex-1 truncate">{item.name}</span>
                          {selectedPath === item.path && (
                            <Check className="h-4 w-4 text-primary-400" />
                          )}
                          {item.type === "dir" && (
                            <ChevronRight className="h-4 w-4 text-slate-600" />
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mx-4 mb-4 flex items-center gap-3 p-3 bg-red-900/20 border border-red-800 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "browse" && selectedPath && (
          <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-sm text-slate-400 mb-1">Selected:</div>
                <div className="flex items-center gap-2">
                  {selectedType === "dir" ? (
                    <Folder className="h-4 w-4 text-blue-400" />
                  ) : (
                    <File className="h-4 w-4 text-slate-500" />
                  )}
                  <span className="text-white font-mono text-sm truncate">
                    {selectedPath}
                  </span>
                </div>
              </div>
              <button
                onClick={handleLink}
                disabled={isLinking}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLinking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Linking...
                  </>
                ) : (
                  <>
                    <LinkIcon className="h-4 w-4" />
                    Link to Document
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
