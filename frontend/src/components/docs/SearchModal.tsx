"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, File, Clock, ArrowRight, Loader2 } from "lucide-react";
import { documentApi, DocumentListItem } from "@/lib/api";

interface SearchModalProps {
  workspaceId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ workspaceId, isOpen, onClose }: SearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocumentListItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search documents
  useEffect(() => {
    if (!workspaceId || !query.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const docs = await documentApi.list(workspaceId, {
          search: query,
          limit: 10,
        });
        setResults(docs);
        setSelectedIndex(0);
      } catch (error) {
        console.error("Search failed:", error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [workspaceId, query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        router.push(`/docs/${results[selectedIndex].id}`);
        onClose();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, selectedIndex, router, onClose]
  );

  // Global keyboard shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
        <div
          className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
            {isSearching ? (
              <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
            ) : (
              <Search className="h-5 w-5 text-slate-500" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents..."
              className="flex-1 bg-transparent text-white text-lg placeholder-slate-500 outline-none"
            />
            <kbd className="px-2 py-1 text-xs font-mono text-slate-500 bg-slate-800 rounded border border-slate-700">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto">
            {query.trim() === "" ? (
              <div className="px-4 py-8 text-center">
                <Search className="h-10 w-10 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">
                  Start typing to search documents
                </p>
              </div>
            ) : results.length === 0 && !isSearching ? (
              <div className="px-4 py-8 text-center">
                <p className="text-slate-400 text-sm">
                  No documents found for "{query}"
                </p>
              </div>
            ) : (
              <div className="py-2">
                {results.map((doc, index) => (
                  <button
                    key={doc.id}
                    onClick={() => {
                      router.push(`/docs/${doc.id}`);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      index === selectedIndex
                        ? "bg-primary-500/20 text-white"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded bg-slate-800 flex items-center justify-center">
                      {doc.icon ? (
                        <span className="text-base">{doc.icon}</span>
                      ) : (
                        <File className="h-4 w-4 text-slate-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {doc.title || "Untitled"}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {new Date(doc.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    {index === selectedIndex && (
                      <ArrowRight className="h-4 w-4 text-slate-500" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-800 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">↵</kbd>
              Open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px]">ESC</kbd>
              Close
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
