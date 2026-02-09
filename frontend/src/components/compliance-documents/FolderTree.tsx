"use client";

import { useState } from "react";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileStack,
  Plus,
} from "lucide-react";
import { ComplianceFolderTreeNode } from "@/lib/api";

interface FolderTreeProps {
  tree: ComplianceFolderTreeNode[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder?: (parentId?: string) => void;
}

function FolderTreeItem({
  node,
  depth,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
}: {
  node: ComplianceFolderTreeNode;
  depth: number;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder?: (parentId?: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedFolderId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-sm group ${
          isSelected
            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
            : "hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelectFolder(node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-[18px]" />
        )}
        {expanded && hasChildren ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-blue-500" />
        ) : (
          <Folder className="h-4 w-4 flex-shrink-0 text-gray-400" />
        )}
        <span className="truncate flex-1">{node.name}</span>
        {node.document_count > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {node.document_count}
          </span>
        )}
        {onCreateFolder && depth < 3 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateFolder(node.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onCreateFolder={onCreateFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  tree,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
}: FolderTreeProps) {
  return (
    <div className="space-y-0.5">
      {/* All Documents */}
      <div
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-sm ${
          selectedFolderId === null
            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
            : "hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300"
        }`}
        onClick={() => onSelectFolder(null)}
      >
        <FileStack className="h-4 w-4 flex-shrink-0" />
        <span className="font-medium">All Documents</span>
      </div>

      {/* Folder Tree */}
      {tree.map((node) => (
        <FolderTreeItem
          key={node.id}
          node={node}
          depth={0}
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
          onCreateFolder={onCreateFolder}
        />
      ))}

      {/* Create Folder Button */}
      {onCreateFolder && (
        <button
          onClick={() => onCreateFolder()}
          className="flex items-center gap-1.5 py-1.5 px-2 rounded-md text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 w-full"
        >
          <Plus className="h-4 w-4" />
          <span>New Folder</span>
        </button>
      )}
    </div>
  );
}
