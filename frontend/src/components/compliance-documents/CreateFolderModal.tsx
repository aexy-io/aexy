"use client";

import { useState } from "react";
import { FolderPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface CreateFolderModalProps {
  parentId?: string;
  onClose: () => void;
  onSubmit: (data: { name: string; description?: string; parent_id?: string }) => Promise<void>;
  isSubmitting?: boolean;
}

export function CreateFolderModal({
  parentId,
  onClose,
  onSubmit,
  isSubmitting,
}: CreateFolderModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      parent_id: parentId,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-blue-500" />
            <DialogTitle>{parentId ? "New Subfolder" : "New Folder"}</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Folder Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Policies, Evidence, Audits"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Brief description..."
            />
          </div>

          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground bg-muted border border-border rounded-lg hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderPlus className="h-4 w-4" />
              )}
              Create Folder
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
