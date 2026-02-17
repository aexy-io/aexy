"use client";

import { useState, useCallback } from "react";
import {
  ChevronRight,
  FileText,
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Copy,
  FolderPlus,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentTreeItem } from "@/lib/api";
import { useDocuments } from "@/hooks/useDocuments";

interface DocumentSidebarProps {
  workspaceId: string;
  selectedDocumentId?: string;
  onSelectDocument: (documentId: string) => void;
}

export function DocumentSidebar({
  workspaceId,
  selectedDocumentId,
  onSelectDocument,
}: DocumentSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const {
    documentTree,
    isLoadingTree,
    createDocument,
    deleteDocument,
    duplicateDocument,
    isCreating,
  } = useDocuments(workspaceId);

  // Toggle expand/collapse
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Create new document
  const handleCreateDocument = useCallback(
    async (parentId?: string) => {
      try {
        const result = await createDocument.mutateAsync({
          title: "Untitled",
          parent_id: parentId,
        });
        onSelectDocument(result.id);
        if (parentId) {
          setExpandedIds((prev) => new Set([...prev, parentId]));
        }
      } catch (error) {
        console.error("Failed to create document:", error);
      }
    },
    [createDocument, onSelectDocument]
  );

  // Delete document
  const handleDeleteDocument = useCallback(
    async (documentId: string) => {
      if (!confirm("Are you sure you want to delete this document?")) return;
      try {
        await deleteDocument.mutateAsync(documentId);
      } catch (error) {
        console.error("Failed to delete document:", error);
      }
    },
    [deleteDocument]
  );

  // Duplicate document
  const handleDuplicateDocument = useCallback(
    async (documentId: string) => {
      try {
        const result = await duplicateDocument.mutateAsync({
          documentId,
          includeChildren: true,
        });
        onSelectDocument(result.id);
      } catch (error) {
        console.error("Failed to duplicate document:", error);
      }
    },
    [duplicateDocument, onSelectDocument]
  );

  // Filter documents by search
  const filterDocuments = useCallback(
    (items: DocumentTreeItem[]): DocumentTreeItem[] => {
      if (!searchQuery) return items;

      return items.reduce<DocumentTreeItem[]>((acc, item) => {
        const matchesSearch = item.title
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const filteredChildren = filterDocuments(item.children || []);

        if (matchesSearch || filteredChildren.length > 0) {
          acc.push({
            ...item,
            children: filteredChildren,
          });
        }
        return acc;
      }, []);
    },
    [searchQuery]
  );

  const filteredTree = documentTree ? filterDocuments(documentTree) : [];

  return (
    <div className="flex flex-col h-full bg-background/50 border-r border-border/50">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary-500"></div>
            <h2 className="text-sm font-semibold text-foreground">Documents</h2>
          </div>
          <button
            onClick={() => handleCreateDocument()}
            disabled={isCreating}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground hover:text-foreground bg-muted/50 hover:bg-accent/50 border border-border/50 transition-all disabled:opacity-50"
            title="New Document"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors",
            isSearchFocused ? "text-primary-400" : "text-muted-foreground"
          )} />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            className={cn(
              "w-full pl-9 pr-8 py-2.5 bg-muted/50 border rounded-xl text-sm text-foreground placeholder-muted-foreground transition-all",
              isSearchFocused
                ? "border-primary-500/50 ring-2 ring-primary-500/20"
                : "border-border/50 hover:border-border/50"
            )}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Document Tree */}
      <div className="flex-1 overflow-auto p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {isLoadingTree ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative mb-3">
              <div className="w-8 h-8 border-3 border-primary-500/20 rounded-full"></div>
              <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
            </div>
            <p className="text-xs text-muted-foreground">Loading documents...</p>
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-14 h-14 bg-gradient-to-br from-muted to-accent rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              {searchQuery ? (
                <Search className="h-6 w-6 text-muted-foreground" />
              ) : (
                <Sparkles className="h-6 w-6 text-primary-400" />
              )}
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              {searchQuery ? "No results found" : "No documents yet"}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {searchQuery
                ? "Try a different search term"
                : "Create your first document to get started"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => handleCreateDocument()}
                disabled={isCreating}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-foreground bg-primary-600 hover:bg-primary-500 rounded-lg transition-colors disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Create document
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredTree.map((item) => (
              <DocumentTreeNode
                key={item.id}
                item={item}
                level={0}
                expandedIds={expandedIds}
                selectedId={selectedDocumentId}
                onToggleExpand={toggleExpanded}
                onSelect={onSelectDocument}
                onCreateChild={handleCreateDocument}
                onDelete={handleDeleteDocument}
                onDuplicate={handleDuplicateDocument}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer with count */}
      {documentTree && documentTree.length > 0 && (
        <div className="px-4 py-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            {documentTree.length} document{documentTree.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// Tree Node Component
interface DocumentTreeNodeProps {
  item: DocumentTreeItem;
  level: number;
  expandedIds: Set<string>;
  selectedId?: string;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  searchQuery: string;
}

function DocumentTreeNode({
  item,
  level,
  expandedIds,
  selectedId,
  onToggleExpand,
  onSelect,
  onCreateChild,
  onDelete,
  onDuplicate,
  searchQuery,
}: DocumentTreeNodeProps) {
  const [showMenu, setShowMenu] = useState(false);
  const isExpanded = expandedIds.has(item.id);
  const isSelected = selectedId === item.id;
  const hasChildren = item.children && item.children.length > 0;

  // Highlight matching text
  const highlightMatch = (text: string) => {
    if (!searchQuery) return text;
    const regex = new RegExp(`(${searchQuery})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="bg-primary-500/20 text-primary-700 dark:text-primary-300 rounded px-0.5">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1.5 px-2 py-2 rounded-lg cursor-pointer transition-all duration-150",
          isSelected
            ? "bg-primary-600/20 text-foreground border border-primary-500/30"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(item.id)}
      >
        {/* Expand/Collapse Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) {
              onToggleExpand(item.id);
            }
          }}
          className={cn(
            "p-0.5 rounded transition-all duration-150",
            hasChildren
              ? "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
              : "invisible"
          )}
        >
          <div className={cn(
            "transition-transform duration-150",
            isExpanded && "rotate-90"
          )}>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Icon */}
        <span className="text-base shrink-0 select-none">
          {item.icon || (
            <FileText className={cn(
              "h-4 w-4",
              isSelected ? "text-primary-400" : "text-muted-foreground"
            )} />
          )}
        </span>

        {/* Title */}
        <span className={cn(
          "flex-1 text-sm truncate font-medium",
          isSelected && "text-foreground"
        )}>
          {highlightMatch(item.title || "Untitled")}
        </span>

        {/* Actions */}
        <div className={cn(
          "relative transition-opacity duration-150",
          showMenu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-44 bg-muted border border-border rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateChild(item.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                >
                  <FolderPlus className="h-4 w-4 text-muted-foreground" />
                  Add subpage
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(item.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                >
                  <Copy className="h-4 w-4 text-muted-foreground" />
                  Duplicate
                </button>
                <div className="border-t border-border my-1.5" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="relative">
          {/* Indent line */}
          <div
            className="absolute left-0 top-0 bottom-0 w-px bg-muted"
            style={{ left: `${level * 16 + 18}px` }}
          />
          {item.children.map((child) => (
            <DocumentTreeNode
              key={child.id}
              item={child}
              level={level + 1}
              expandedIds={expandedIds}
              selectedId={selectedId}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}
