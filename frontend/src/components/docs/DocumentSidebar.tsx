"use client";

import { useState, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Copy,
  Edit3,
  FolderPlus,
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

  const {
    documentTree,
    isLoadingTree,
    createDocument,
    deleteDocument,
    duplicateDocument,
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
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300">Documents</h2>
          <button
            onClick={() => handleCreateDocument()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="New Document"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Document Tree */}
      <div className="flex-1 overflow-auto p-2">
        {isLoadingTree ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500" />
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-10 w-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No documents yet</p>
            <button
              onClick={() => handleCreateDocument()}
              className="mt-3 text-sm text-primary-400 hover:text-primary-300"
            >
              Create your first document
            </button>
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
              />
            ))}
          </div>
        )}
      </div>
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
}: DocumentTreeNodeProps) {
  const [showMenu, setShowMenu] = useState(false);
  const isExpanded = expandedIds.has(item.id);
  const isSelected = selectedId === item.id;
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition",
          isSelected
            ? "bg-primary-600/20 text-primary-300"
            : "text-slate-400 hover:bg-slate-800 hover:text-white"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
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
            "p-0.5 rounded hover:bg-slate-700/50",
            !hasChildren && "invisible"
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Icon */}
        <span className="text-base shrink-0">
          {item.icon || <FileText className="h-4 w-4" />}
        </span>

        {/* Title */}
        <span className="flex-1 text-sm truncate">{item.title || "Untitled"}</span>

        {/* Actions */}
        <div className="relative opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded hover:bg-slate-700"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateChild(item.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                >
                  <FolderPlus className="h-4 w-4" />
                  Add subpage
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(item.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                >
                  <Copy className="h-4 w-4" />
                  Duplicate
                </button>
                <div className="border-t border-slate-700 my-1" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-slate-700"
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
        <div>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
