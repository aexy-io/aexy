"use client";

import { useState } from "react";
import { ChevronRight, Plus, Settings, MoreHorizontal } from "lucide-react";
import { DocumentSpaceListItem, DocumentTreeItem } from "@/lib/api";
import { DocumentItem } from "./DocumentItem";

interface SpaceFolderProps {
  space: DocumentSpaceListItem;
  documents: DocumentTreeItem[];
  selectedDocumentId?: string;
  isLoading?: boolean;
  defaultExpanded?: boolean;
  onToggleFavorite: (documentId: string) => void;
  onDelete: (documentId: string) => void;
  onDuplicate: (documentId: string) => void;
  onAddDocument: (spaceId: string, parentId?: string) => void;
  onManageSpace?: (spaceId: string) => void;
}

export function SpaceFolder({
  space,
  documents,
  selectedDocumentId,
  isLoading = false,
  defaultExpanded = true,
  onToggleFavorite,
  onDelete,
  onDuplicate,
  onAddDocument,
  onManageSpace,
}: SpaceFolderProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="py-0.5">
      {/* Space Header */}
      <div
        className="flex items-center justify-between px-2 py-1.5 group cursor-pointer hover:bg-white/5 rounded-md mx-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />

          {/* Space Icon */}
          <div
            className="h-5 w-5 rounded flex items-center justify-center flex-shrink-0 text-xs"
            style={{ backgroundColor: space.color || "#6366F1" }}
          >
            {space.icon || "📁"}
          </div>

          {/* Space Name */}
          <span className="text-sm text-foreground truncate">
            {space.name}
          </span>

          {/* Document count */}
          {space.document_count > 0 && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {space.document_count}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddDocument(space.id);
            }}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Add page"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {onManageSpace && !space.is_default && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-1 hover:bg-white/10 rounded transition-colors"
              >
                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                  />
                  <div className="absolute right-0 top-full mt-1 bg-muted border border-border rounded-lg shadow-xl z-20 py-1 min-w-[140px]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onManageSpace(space.id);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 text-left text-sm text-foreground"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Space settings
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Documents */}
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="pl-4">
          {isLoading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Loading...</div>
          ) : documents.length > 0 ? (
            documents.map((doc) => (
              <DocumentItem
                key={doc.id}
                document={doc}
                isSelected={selectedDocumentId === doc.id}
                onToggleFavorite={onToggleFavorite}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onAddChild={(parentId) => onAddDocument(space.id, parentId)}
              />
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No pages yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
