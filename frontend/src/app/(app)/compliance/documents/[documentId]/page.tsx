"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Download,
  Archive,
  Trash2,
  Clock,
  Tag,
  Loader2,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useComplianceDocument,
  useComplianceDocuments,
  useComplianceDocumentLinks,
} from "@/hooks/useComplianceDocuments";
import { DocumentLinkPanel } from "@/components/compliance-documents/DocumentLinkPanel";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.documentId as string;

  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { document: doc, isLoading, error } = useComplianceDocument(workspaceId, documentId);
  const { archiveDocument, deleteDocument } = useComplianceDocuments(workspaceId);
  const { links, isLoading: linksLoading, linkDocument, unlinkDocument } =
    useComplianceDocumentLinks(workspaceId, documentId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Document not found
          </h2>
          <Link
            href="/compliance/documents"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            Back to Document Center
          </Link>
        </div>
      </div>
    );
  }

  const handleArchive = async () => {
    if (window.confirm(`Archive "${doc.name}"?`)) {
      await archiveDocument(doc.id);
      router.push("/compliance/documents");
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Delete "${doc.name}"? This action cannot be undone.`)) {
      await deleteDocument(doc.id);
      router.push("/compliance/documents");
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back Link */}
      <Link
        href="/compliance/documents"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Document Center
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <FileText className="h-8 w-8 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{doc.name}</h1>
              {doc.description && (
                <p className="text-gray-500 dark:text-gray-400 mt-1">{doc.description}</p>
              )}
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(doc.created_at).toLocaleDateString()}
                </span>
                <span>{formatFileSize(doc.file_size)}</span>
                <span>{doc.mime_type}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  doc.status === "active"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : doc.status === "archived"
                    ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}>
                  {doc.status}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {doc.download_url && (
              <a
                href={doc.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
            )}
            {doc.status === "active" && (
              <button
                onClick={handleArchive}
                className="px-3 py-2 text-sm text-amber-600 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2"
              >
                <Archive className="h-4 w-4" />
                Archive
              </button>
            )}
            <button
              onClick={handleDelete}
              className="px-3 py-2 text-sm text-red-600 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Tags */}
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Tag className="h-4 w-4 text-gray-400 mt-0.5" />
            {doc.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Linked Entities */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <DocumentLinkPanel
          links={links}
          isLoading={linksLoading}
          onLink={linkDocument}
          onUnlink={unlinkDocument}
        />
      </div>
    </div>
  );
}
