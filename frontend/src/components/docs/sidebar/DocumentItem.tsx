"use client";

import { useState, ReactNode } from "react";
import Link from "next/link";
import {
  ChevronRight,
  File,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
  Copy,
} from "lucide-react";
import { DocumentTreeItem } from "@/lib/api";

interface DocumentItemProps {
  document: DocumentTreeItem;
  level?: number;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onAddChild?: (parentId: string) => void;
}

export function DocumentItem({
  document,
  level = 0,
  isSelected = false,
  onSelect,
  onToggleFavorite,
  onDelete,
  onDuplicate,
  onAddChild,
}: DocumentItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const hasChildren = document.has_children || document.children.length > 0;
  const paddingLeft = 12 + level * 16;

  return (
    <div>
      {/* Document Row */}
      <div
        className={`group relative flex items-center py-1 px-2 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? "bg-primary-500/20 text-foreground"
            : "hover:bg-white/5 text-foreground"
        }`}
        style={{ paddingLeft }}
      >
        {/* Expand/Collapse Button */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-white/10 rounded mr-1"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
          </button>
        ) : (
          <div className="w-5" />
        )}

        {/* Document Icon */}
        <span className="mr-2 flex-shrink-0">
          {document.icon ? (
            <span className="text-base">{document.icon}</span>
          ) : (
            <File className="h-4 w-4 text-muted-foreground" />
          )}
        </span>

        {/* Document Title */}
        <Link
          href={`/docs/${document.id}`}
          onClick={() => onSelect?.(document.id)}
          className="flex-1 truncate text-sm"
        >
          {document.title || "Untitled"}
        </Link>

        {/* Action Buttons (visible on hover) */}
        <div className="absolute right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Favorite Button */}
          {onToggleFavorite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(document.id);
              }}
              className="p-1 hover:bg-white/10 rounded"
              title={document.is_favorited ? "Remove from favorites" : "Add to favorites"}
            >
              <Star
                className={`h-3.5 w-3.5 ${
                  document.is_favorited
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-muted-foreground"
                }`}
              />
            </button>
          )}

          {/* Add Child Button */}
          {onAddChild && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(document.id);
              }}
              className="p-1 hover:bg-white/10 rounded"
              title="Add subpage"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}

          {/* More Menu Button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 hover:bg-white/10 rounded"
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-40 bg-muted border border-border rounded-lg shadow-xl z-20 py-1">
                  {onDuplicate && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(document.id);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                    >
                      <Copy className="h-4 w-4" />
                      Duplicate
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(document.id);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-accent"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {document.children.map((child) => (
            <DocumentItem
              key={child.id}
              document={child}
              level={level + 1}
              isSelected={isSelected}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}
