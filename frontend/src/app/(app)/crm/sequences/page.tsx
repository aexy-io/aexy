"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Repeat, Play, Pause, Trash2, Users, X } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCRMObjects, useCRMSequences } from "@/hooks/useCRM";
import { CRMSequence } from "@/lib/api";
import { formatRelative } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function SequenceCard({
  sequence,
  objectName,
  onToggle,
  onDelete,
}: {
  sequence: CRMSequence;
  objectName: string;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <Link
      href={`/crm/sequences/${sequence.id}`}
      className="bg-muted/50 border border-border rounded-xl p-5 hover:border-blue-500/50 transition-colors cursor-pointer group block"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              sequence.is_active
                ? "bg-green-500/20 text-green-700 dark:text-green-400"
                : "bg-accent text-muted-foreground"
            }`}
          >
            <Repeat className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-foreground font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {sequence.name}
            </h3>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-1 rounded-full text-xs font-medium bg-muted-foreground/20 text-muted-foreground">
              {objectName}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
            title={sequence.is_active ? "Pause sequence" : "Activate sequence"}
          >
            {sequence.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-accent transition-colors"
            title="Delete sequence"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {sequence.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{sequence.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {sequence.active_enrollments} active
        </span>
        <span>{sequence.total_enrollments} enrolled all-time</span>
        <span>{sequence.completed_enrollments} completed</span>
        <span className="ml-auto">Updated {formatRelative(sequence.updated_at)}</span>
      </div>
    </Link>
  );
}

export default function CRMSequencesPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const { objects } = useCRMObjects(workspaceId);
  const {
    sequences,
    isLoading,
    createSequence,
    deleteSequence,
    toggleSequence,
    isCreating,
  } = useCRMSequences(workspaceId);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [objectId, setObjectId] = useState("");
  const [description, setDescription] = useState("");
  const [pendingDelete, setPendingDelete] = useState<CRMSequence | null>(null);

  const objectName = (id: string) => objects.find((o) => o.id === id)?.name || "Unknown object";

  const handleCreate = async () => {
    if (!name.trim() || !objectId) return;
    await createSequence({ name: name.trim(), object_id: objectId, description: description.trim() || undefined });
    setShowCreate(false);
    setName("");
    setObjectId("");
    setDescription("");
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">Sequences</h1>
            <p className="text-muted-foreground">
              Multi-step follow-ups that records are enrolled into, manually or by an automation
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
          >
            <Plus className="h-4 w-4" />
            New Sequence
          </button>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground text-sm">Loading sequences…</div>
        ) : sequences.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="No sequences yet"
            description="Create a sequence, then enrol records into it by hand or from an automation."
            actions={[{ label: "Create sequence", onClick: () => setShowCreate(true), icon: Plus }]}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sequences.map((sequence) => (
              <SequenceCard
                key={sequence.id}
                sequence={sequence}
                objectName={objectName(sequence.object_id)}
                onToggle={() => toggleSequence(sequence.id)}
                onDelete={() => setPendingDelete(sequence)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">New Sequence</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Onboarding follow-up"
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Applies to *</label>
                <select
                  value={objectId}
                  onChange={(e) => setObjectId(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="">Select an object…</option>
                  {objects.map((object) => (
                    <option key={object.id} value={object.id}>
                      {object.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Only records of this type can be enrolled.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || !objectId || isCreating}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm"
              >
                {isCreating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete sequence"
        description={`Delete "${pendingDelete?.name}"? Enrolled records will stop receiving its steps.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          if (pendingDelete) await deleteSequence(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
