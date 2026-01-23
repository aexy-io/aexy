"use client";

import Link from "next/link";
import {
  X,
  FileText,
  User,
  Lightbulb,
  Cpu,
  FolderKanban,
  Building2,
  Code2,
  ExternalLink,
  Calendar,
  Hash,
  Link as LinkIcon,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

interface EntityData {
  id: string;
  name: string;
  type: string;
  description?: string;
  aliases: string[];
  confidence_score: number;
  occurrence_count: number;
  first_seen_at?: string;
  last_seen_at?: string;
  documents: Array<{
    id: string;
    title: string;
    updated_at?: string;
  }>;
}

interface DocumentData {
  document: {
    id: string;
    title: string;
  } | null;
  entities: Array<{
    id: string;
    name: string;
    type: string;
    confidence: number;
    context?: string;
  }>;
  related_documents: Array<{
    id: string;
    title: string;
    strength: number;
    updated_at?: string;
  }>;
}

interface KnowledgeGraphSidebarProps {
  nodeId: string;
  nodeType: "entity" | "document" | null;
  entityData?: EntityData;
  documentData?: DocumentData;
  isLoading: boolean;
  onClose: () => void;
  workspaceId: string;
}

const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  person: User,
  concept: Lightbulb,
  technology: Cpu,
  project: FolderKanban,
  organization: Building2,
  code: Code2,
  external: ExternalLink,
};

const ENTITY_COLORS: Record<string, string> = {
  person: "#f472b6",
  concept: "#a78bfa",
  technology: "#34d399",
  project: "#60a5fa",
  organization: "#fbbf24",
  code: "#f97316",
  external: "#94a3b8",
};

function formatDate(dateString?: string): string {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function KnowledgeGraphSidebar({
  nodeId,
  nodeType,
  entityData,
  documentData,
  isLoading,
  onClose,
  workspaceId,
}: KnowledgeGraphSidebarProps) {
  if (isLoading) {
    return (
      <div className="w-80 border-l border-slate-700 bg-slate-800/50 flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-slate-700 bg-slate-800/50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h3 className="font-medium text-white">
          {nodeType === "entity" ? "Entity Details" : "Document Details"}
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
        >
          <X className="h-5 w-5 text-slate-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {nodeType === "entity" && entityData && (
          <EntityDetails data={entityData} workspaceId={workspaceId} />
        )}
        {nodeType === "document" && documentData && (
          <DocumentDetails data={documentData} workspaceId={workspaceId} />
        )}
      </div>
    </div>
  );
}

function EntityDetails({
  data,
  workspaceId,
}: {
  data: EntityData;
  workspaceId: string;
}) {
  const Icon = ENTITY_ICONS[data.type] || Lightbulb;
  const color = ENTITY_COLORS[data.type] || "#94a3b8";

  return (
    <div className="p-4 space-y-6">
      {/* Entity header */}
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="h-6 w-6" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-lg font-semibold text-white truncate" title={data.name}>
            {data.name}
          </h4>
          <p className="text-sm capitalize" style={{ color }}>
            {data.type}
          </p>
        </div>
      </div>

      {/* Description */}
      {data.description && (
        <div>
          <p className="text-sm text-slate-300">{data.description}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <Hash className="h-3.5 w-3.5" />
            Occurrences
          </div>
          <p className="text-xl font-semibold text-white">{data.occurrence_count}</p>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            Confidence
          </div>
          <p className="text-xl font-semibold text-white">
            {Math.round(data.confidence_score * 100)}%
          </p>
        </div>
      </div>

      {/* Aliases */}
      {data.aliases.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Also known as</p>
          <div className="flex flex-wrap gap-2">
            {data.aliases.map((alias, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-slate-700/50 rounded text-sm text-slate-300"
              >
                {alias}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex items-center gap-4 text-sm text-slate-400">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4" />
          <span>First: {formatDate(data.first_seen_at)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>Last: {formatDate(data.last_seen_at)}</span>
        </div>
      </div>

      {/* Documents */}
      {data.documents.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">
            Found in {data.documents.length} documents
          </p>
          <div className="space-y-2">
            {data.documents.slice(0, 5).map((doc) => (
              <Link
                key={doc.id}
                href={`/docs/${doc.id}`}
                className="flex items-center gap-2 p-2 bg-slate-700/30 hover:bg-slate-700/50 rounded-lg transition-colors group"
              >
                <FileText className="h-4 w-4 text-blue-400 flex-shrink-0" />
                <span className="text-sm text-slate-300 truncate flex-1">
                  {doc.title}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
            {data.documents.length > 5 && (
              <p className="text-xs text-slate-500 text-center">
                +{data.documents.length - 5} more documents
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentDetails({
  data,
  workspaceId,
}: {
  data: DocumentData;
  workspaceId: string;
}) {
  if (!data.document) {
    return (
      <div className="p-4 text-center text-slate-400">
        Document not found
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Document header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
          <FileText className="h-6 w-6 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-lg font-semibold text-white truncate" title={data.document.title}>
            {data.document.title}
          </h4>
          <Link
            href={`/docs/${data.document.id}`}
            className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            Open document
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            Entities
          </div>
          <p className="text-xl font-semibold text-white">{data.entities.length}</p>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <LinkIcon className="h-3.5 w-3.5" />
            Related Docs
          </div>
          <p className="text-xl font-semibold text-white">{data.related_documents.length}</p>
        </div>
      </div>

      {/* Entities */}
      {data.entities.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">
            Extracted Entities
          </p>
          <div className="space-y-2">
            {data.entities.slice(0, 8).map((entity) => {
              const Icon = ENTITY_ICONS[entity.type] || Lightbulb;
              const color = ENTITY_COLORS[entity.type] || "#94a3b8";
              return (
                <div
                  key={entity.id}
                  className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-lg"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-300 truncate">{entity.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{entity.type}</p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {Math.round(entity.confidence * 100)}%
                  </span>
                </div>
              );
            })}
            {data.entities.length > 8 && (
              <p className="text-xs text-slate-500 text-center">
                +{data.entities.length - 8} more entities
              </p>
            )}
          </div>
        </div>
      )}

      {/* Related Documents */}
      {data.related_documents.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">
            Related Documents
          </p>
          <div className="space-y-2">
            {data.related_documents.slice(0, 5).map((doc) => (
              <Link
                key={doc.id}
                href={`/docs/${doc.id}`}
                className="flex items-center gap-2 p-2 bg-slate-700/30 hover:bg-slate-700/50 rounded-lg transition-colors group"
              >
                <FileText className="h-4 w-4 text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate">{doc.title}</p>
                  <p className="text-xs text-slate-500">
                    {Math.round(doc.strength * 100)}% match
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
            {data.related_documents.length > 5 && (
              <p className="text-xs text-slate-500 text-center">
                +{data.related_documents.length - 5} more documents
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
