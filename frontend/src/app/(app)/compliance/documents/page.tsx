"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileStack,
  Plus,
  FolderPlus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useComplianceDocuments,
  useComplianceFolders,
  useComplianceTags,
} from "@/hooks/useComplianceDocuments";
import { ComplianceDocument, ComplianceDocumentStatus } from "@/lib/api";
import { FolderTree } from "@/components/compliance-documents/FolderTree";
import { DocumentCard } from "@/components/compliance-documents/DocumentCard";
import { DocumentFilters } from "@/components/compliance-documents/DocumentFilters";
import { UploadModal } from "@/components/compliance-documents/UploadModal";
import { CreateFolderModal } from "@/components/compliance-documents/CreateFolderModal";

export default function DocumentCenterPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  // State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplianceDocumentStatus | undefined>(undefined);
  const [tagFilter, setTagFilter] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | undefined>(undefined);

  // Data
  const {
    documents,
    total,
    pageSize,
    isLoading: docsLoading,
    archiveDocument,
    deleteDocument,
  } = useComplianceDocuments(workspaceId, {
    folder_id: selectedFolderId || undefined,
    status: statusFilter,
    tags: tagFilter,
    search: search || undefined,
    page,
    page_size: 20,
    sort_by: sortBy,
    sort_order: sortOrder,
  });

  const { tree, treeLoading, createFolder, isCreating } = useComplianceFolders(workspaceId);
  const { tags: availableTags } = useComplianceTags(workspaceId);

  const totalPages = Math.ceil(total / pageSize);

  const handleCreateFolder = (parentId?: string) => {
    setCreateFolderParentId(parentId);
    setShowCreateFolder(true);
  };

  const handleArchive = async (doc: ComplianceDocument) => {
    if (window.confirm(`Archive "${doc.name}"?`)) {
      await archiveDocument(doc.id);
    }
  };

  const handleDelete = async (doc: ComplianceDocument) => {
    if (window.confirm(`Delete "${doc.name}"? This action cannot be undone.`)) {
      await deleteDocument(doc.id);
    }
  };

  const isLoading = docsLoading || treeLoading;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Document Center</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Upload, organize, and link compliance documents as evidence
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => handleCreateFolder()}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <FolderPlus className="h-4 w-4" />
            New Folder
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Upload Document
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <DocumentFilters
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          status={statusFilter}
          onStatusChange={(v) => { setStatusFilter(v); setPage(1); }}
          selectedTag={tagFilter}
          onTagChange={(v) => { setTagFilter(v); setPage(1); }}
          availableTags={availableTags}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(by, order) => { setSortBy(by); setSortOrder(order); setPage(1); }}
        />
      </div>

      {/* Main Layout */}
      <div className="flex gap-6">
        {/* Sidebar: Folder Tree */}
        <div className="w-56 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sticky top-6">
            <h3 className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 mb-2 px-2">
              Folders
            </h3>
            {treeLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
              </div>
            ) : (
              <FolderTree
                tree={tree}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                onCreateFolder={handleCreateFolder}
              />
            )}
          </div>
        </div>

        {/* Document Grid */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : documents.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
              <FileStack className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {search || statusFilter || tagFilter
                  ? "No documents match your filters"
                  : selectedFolderId
                  ? "This folder is empty"
                  : "No documents yet"}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
                {search || statusFilter || tagFilter
                  ? "Try adjusting your search or filters."
                  : "Upload your first compliance document to get started."}
              </p>
              {!search && !statusFilter && !tagFilter && (
                <button
                  onClick={() => setShowUpload(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Upload Document
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {documents.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    onClick={(d) => router.push(`/compliance/documents/${d.id}`)}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 text-sm text-gray-500 dark:text-gray-400">
                  <span>
                    Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page <= 1}
                      className="p-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span>
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages}
                      className="p-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showUpload && workspaceId && (
        <UploadModal
          workspaceId={workspaceId}
          folderId={selectedFolderId}
          onClose={() => setShowUpload(false)}
        />
      )}

      {showCreateFolder && (
        <CreateFolderModal
          parentId={createFolderParentId}
          onClose={() => setShowCreateFolder(false)}
          onSubmit={async (data) => {
            await createFolder(data);
          }}
          isSubmitting={isCreating}
        />
      )}
    </div>
  );
}
