"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Network, Sparkles, RefreshCw, Lock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { knowledgeGraphApi } from "@/lib/api";
import { KnowledgeGraphCanvas } from "@/components/knowledge-graph/KnowledgeGraphCanvas";
import { KnowledgeGraphToolbar } from "@/components/knowledge-graph/KnowledgeGraphToolbar";
import { KnowledgeGraphSidebar } from "@/components/knowledge-graph/KnowledgeGraphSidebar";

interface GraphFilters {
  entityTypes: string[];
  relationshipTypes: string[];
  spaceIds: string[];
  dateFrom: string | null;
  dateTo: string | null;
  minConfidence: number;
  includeDocuments: boolean;
  includeEntities: boolean;
  maxNodes: number;
}

const DEFAULT_FILTERS: GraphFilters = {
  entityTypes: [],
  relationshipTypes: [],
  spaceIds: [],
  dateFrom: null,
  dateTo: null,
  minConfidence: 0.5,
  includeDocuments: true,
  includeEntities: true,
  maxNodes: 200,
};

export default function KnowledgeGraphPage() {
  const { currentWorkspace } = useWorkspace();
  const { isEnterprise, isLoading: subscriptionLoading } = useSubscription(
    currentWorkspace?.id || null
  );
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeType, setSelectedNodeType] = useState<"entity" | "document" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch graph data
  const {
    data: graphData,
    isLoading: graphLoading,
    error: graphError,
    refetch: refetchGraph,
  } = useQuery({
    queryKey: ["knowledgeGraph", currentWorkspace?.id, filters],
    queryFn: () =>
      knowledgeGraphApi.getGraph(currentWorkspace!.id, {
        entity_types: filters.entityTypes.length > 0 ? filters.entityTypes : undefined,
        relationship_types: filters.relationshipTypes.length > 0 ? filters.relationshipTypes : undefined,
        space_ids: filters.spaceIds.length > 0 ? filters.spaceIds : undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        min_confidence: filters.minConfidence,
        include_documents: filters.includeDocuments,
        include_entities: filters.includeEntities,
        max_nodes: filters.maxNodes,
      }),
    enabled: !!currentWorkspace?.id && isEnterprise,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch entity details when selected
  const { data: selectedEntityData, isLoading: entityLoading } = useQuery({
    queryKey: ["knowledgeEntity", currentWorkspace?.id, selectedNodeId],
    queryFn: () =>
      knowledgeGraphApi.getEntity(currentWorkspace!.id, selectedNodeId!),
    enabled: !!currentWorkspace?.id && !!selectedNodeId && selectedNodeType === "entity",
  });

  // Fetch document connections when selected
  const { data: selectedDocData, isLoading: docLoading } = useQuery({
    queryKey: ["documentConnections", currentWorkspace?.id, selectedNodeId],
    queryFn: () =>
      knowledgeGraphApi.getDocumentConnections(currentWorkspace!.id, selectedNodeId!),
    enabled: !!currentWorkspace?.id && !!selectedNodeId && selectedNodeType === "document",
  });

  // Trigger extraction mutation
  const triggerExtraction = useMutation({
    mutationFn: (documentId?: string) =>
      knowledgeGraphApi.triggerExtraction(currentWorkspace!.id, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledgeGraph", currentWorkspace?.id] });
    },
  });

  // Search entities mutation
  const searchEntities = useMutation({
    mutationFn: (query: string) =>
      knowledgeGraphApi.searchEntities(currentWorkspace!.id, query),
  });

  const handleNodeSelect = (nodeId: string, nodeType: string) => {
    setSelectedNodeId(nodeId);
    setSelectedNodeType(nodeType === "document" ? "document" : "entity");
  };

  const handleNodeDeselect = () => {
    setSelectedNodeId(null);
    setSelectedNodeType(null);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      searchEntities.mutate(query);
    }
  };

  const handleFilterChange = (newFilters: Partial<GraphFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleTriggerExtraction = () => {
    triggerExtraction.mutate(undefined);
  };

  // Show upgrade prompt for non-Enterprise users
  if (!subscriptionLoading && !isEnterprise) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-indigo-500/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">
            Knowledge Graph
          </h2>
          <p className="text-slate-400 mb-6">
            Visualize relationships between documents and automatically extract
            entities like people, technologies, and concepts. This feature is
            available on the Enterprise plan.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/settings/billing"
              className="inline-flex items-center justify-center px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors"
            >
              <Sparkles className="h-5 w-5 mr-2" />
              Upgrade to Enterprise
            </Link>
            <Link
              href="/docs"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Back to Documents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (subscriptionLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  // Error state
  if (graphError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-3">
            Failed to Load Knowledge Graph
          </h2>
          <p className="text-slate-400 mb-6">
            {(graphError as Error).message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => refetchGraph()}
            className="inline-flex items-center justify-center px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="h-5 w-5 mr-2" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Toolbar */}
      <KnowledgeGraphToolbar
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        searchQuery={searchQuery}
        searchResults={searchEntities.data?.results || []}
        searchLoading={searchEntities.isPending}
        onTriggerExtraction={handleTriggerExtraction}
        extractionLoading={triggerExtraction.isPending}
        statistics={graphData?.statistics}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph Canvas */}
        <div className="flex-1 relative">
          {graphLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin" />
                <p className="text-slate-400">Loading knowledge graph...</p>
              </div>
            </div>
          ) : graphData?.nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
                <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <Network className="h-8 w-8 text-indigo-400" />
                </div>
                <h3 className="text-xl font-semibold text-white">
                  No Knowledge Graph Yet
                </h3>
                <p className="text-slate-400">
                  Your knowledge graph is empty. Create some documents first,
                  then run extraction to automatically discover entities and
                  relationships.
                </p>
                <button
                  onClick={handleTriggerExtraction}
                  disabled={triggerExtraction.isPending}
                  className="inline-flex items-center justify-center px-6 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                >
                  {triggerExtraction.isPending ? (
                    <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-5 w-5 mr-2" />
                  )}
                  Run Extraction
                </button>
              </div>
            </div>
          ) : (
            <KnowledgeGraphCanvas
              nodes={graphData?.nodes || []}
              edges={graphData?.edges || []}
              onNodeSelect={handleNodeSelect}
              onNodeDeselect={handleNodeDeselect}
              selectedNodeId={selectedNodeId}
              temporal={graphData?.temporal}
            />
          )}
        </div>

        {/* Sidebar */}
        {selectedNodeId && (
          <KnowledgeGraphSidebar
            nodeId={selectedNodeId}
            nodeType={selectedNodeType}
            entityData={selectedEntityData}
            documentData={selectedDocData}
            isLoading={entityLoading || docLoading}
            onClose={handleNodeDeselect}
            workspaceId={currentWorkspace?.id || ""}
          />
        )}
      </div>
    </div>
  );
}
