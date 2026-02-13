"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  MessageSquare,
  Plus,
  ThumbsUp,
  Trash2,
  User,
  AlertCircle,
  Smile,
  Frown,
  Meh,
  Heart,
  Save,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSprint, useSprintRetrospective } from "@/hooks/useSprints";
import { redirect } from "next/navigation";

const MOOD_OPTIONS = [
  { value: 1, icon: Frown, label: "Frustrated", color: "text-red-400" },
  { value: 2, icon: Frown, label: "Unhappy", color: "text-orange-400" },
  { value: 3, icon: Meh, label: "Neutral", color: "text-yellow-400" },
  { value: 4, icon: Smile, label: "Happy", color: "text-lime-400" },
  { value: 5, icon: Heart, label: "Amazing", color: "text-green-400" },
];

interface RetroItem {
  id: string;
  content: string;
  author_id?: string;
  votes: number;
}

interface ActionItem {
  id: string;
  item: string;
  assignee_id?: string;
  status: "pending" | "in_progress" | "done";
  due_date?: string;
}

interface RetroColumnProps {
  title: string;
  icon: React.ReactNode;
  color: string;
  items: RetroItem[];
  onAdd: (content: string) => void;
  onVote: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

function RetroColumn({ title, icon, color, items, onAdd, onVote, onDelete }: RetroColumnProps) {
  const [newItem, setNewItem] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = () => {
    if (newItem.trim()) {
      onAdd(newItem.trim());
      setNewItem("");
      setIsAdding(false);
    }
  };

  const sortedItems = [...items].sort((a, b) => b.votes - a.votes);

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <h3 className={`font-semibold flex items-center gap-2 ${color}`}>
          {icon}
          {title}
        </h3>
        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>

      <div className="space-y-3 min-h-[200px]">
        {sortedItems.map((item) => (
          <div
            key={item.id}
            className="bg-slate-700/50 rounded-lg p-3 border border-slate-600"
          >
            <p className="text-white text-sm mb-2">{item.content}</p>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <button
                onClick={() => onVote(item.id)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary-400 transition"
              >
                <ThumbsUp className="h-3 w-3" />
                <span>{item.votes}</span>
              </button>
              <button
                onClick={() => onDelete(item.id)}
                className="text-slate-500 hover:text-red-400 transition"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}

        {isAdding ? (
          <div className="bg-slate-700/50 rounded-lg p-3 border border-primary-500">
            <textarea
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add your thought..."
              rows={3}
              autoFocus
              className="w-full bg-transparent text-white text-sm placeholder-slate-400 focus:outline-none resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAdd}
                disabled={!newItem.trim()}
                className="px-3 py-1 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded transition disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewItem("");
                }}
                className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full py-3 border-2 border-dashed border-slate-600 hover:border-slate-500 rounded-lg text-slate-400 hover:text-slate-300 transition flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        )}
      </div>
    </div>
  );
}

interface ActionItemsColumnProps {
  items: ActionItem[];
  onAdd: (item: string) => void;
  onUpdateStatus: (itemId: string, status: "pending" | "in_progress" | "done") => void;
  onDelete: (itemId: string) => void;
}

function ActionItemsColumn({ items, onAdd, onUpdateStatus, onDelete }: ActionItemsColumnProps) {
  const [newItem, setNewItem] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = () => {
    if (newItem.trim()) {
      onAdd(newItem.trim());
      setNewItem("");
      setIsAdding(false);
    }
  };

  const statusColors = {
    pending: "bg-slate-600 text-slate-300",
    in_progress: "bg-amber-900/50 text-amber-400",
    done: "bg-green-900/50 text-green-400",
  };

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <h3 className="font-semibold flex items-center gap-2 text-purple-400">
          <CheckCircle className="h-5 w-5" />
          Action Items
        </h3>
        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>

      <div className="space-y-3 min-h-[200px]">
        {items.map((item) => (
          <div
            key={item.id}
            className={`rounded-lg p-3 border border-slate-600 ${
              item.status === "done" ? "bg-green-900/10" : "bg-slate-700/50"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <p className={`text-sm flex-1 ${item.status === "done" ? "text-slate-400 line-through" : "text-white"}`}>
                {item.item}
              </p>
              <button
                onClick={() => onDelete(item.id)}
                className="text-slate-500 hover:text-red-400 transition ml-2"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={item.status}
                onChange={(e) => onUpdateStatus(item.id, e.target.value as "pending" | "in_progress" | "done")}
                className={`text-xs px-2 py-1 rounded ${statusColors[item.status]} border-0 focus:outline-none cursor-pointer`}
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>
        ))}

        {isAdding ? (
          <div className="bg-slate-700/50 rounded-lg p-3 border border-primary-500">
            <textarea
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="What action should be taken?"
              rows={2}
              autoFocus
              className="w-full bg-transparent text-white text-sm placeholder-slate-400 focus:outline-none resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAdd}
                disabled={!newItem.trim()}
                className="px-3 py-1 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded transition disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewItem("");
                }}
                className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full py-3 border-2 border-dashed border-slate-600 hover:border-slate-500 rounded-lg text-slate-400 hover:text-slate-300 transition flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Action Item
          </button>
        )}
      </div>
    </div>
  );
}

export default function RetrospectivePage({
  params,
}: {
  params: { projectId: string; sprintId: string };
}) {
  const { projectId, sprintId } = params;

  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const { sprint, isLoading: sprintLoading } = useSprint(currentWorkspaceId, projectId, sprintId);
  const {
    retrospective,
    isLoading: retroLoading,
    saveRetrospective,
    addItem,
    updateItem,
    deleteItem,
    voteItem,
    isSaving,
  } = useSprintRetrospective(sprintId);

  const [teamMood, setTeamMood] = useState<number | null>(retrospective?.team_mood_score || null);
  const [notes, setNotes] = useState(retrospective?.notes || "");

  // Local state for optimistic updates
  const [localWentWell, setLocalWentWell] = useState<RetroItem[]>([]);
  const [localToImprove, setLocalToImprove] = useState<RetroItem[]>([]);
  const [localActionItems, setLocalActionItems] = useState<ActionItem[]>([]);

  // Sync with server data when it loads
  useState(() => {
    if (retrospective) {
      setLocalWentWell(retrospective.went_well as RetroItem[] || []);
      setLocalToImprove(retrospective.to_improve as RetroItem[] || []);
      setLocalActionItems(retrospective.action_items as ActionItem[] || []);
      setTeamMood(retrospective.team_mood_score || null);
      setNotes(retrospective.notes || "");
    }
  });

  const handleAddWentWell = async (content: string) => {
    try {
      await addItem({ category: "went_well", content });
    } catch (error) {
      console.error("Failed to add item:", error);
    }
  };

  const handleAddToImprove = async (content: string) => {
    try {
      await addItem({ category: "to_improve", content });
    } catch (error) {
      console.error("Failed to add item:", error);
    }
  };

  const handleAddActionItem = async (content: string) => {
    try {
      await addItem({ category: "action_item", content });
    } catch (error) {
      console.error("Failed to add item:", error);
    }
  };

  const handleVote = async (itemId: string) => {
    try {
      await voteItem(itemId);
    } catch (error) {
      console.error("Failed to vote:", error);
    }
  };

  const handleUpdateActionStatus = async (itemId: string, status: "pending" | "in_progress" | "done") => {
    try {
      await updateItem({ itemId, data: { status } });
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteItem(itemId);
    } catch (error) {
      console.error("Failed to delete item:", error);
    }
  };

  const handleSave = async () => {
    try {
      await saveRetrospective({
        went_well: (retrospective?.went_well || []) as Array<{ id?: string; content: string; author_id?: string; votes?: number }>,
        to_improve: (retrospective?.to_improve || []) as Array<{ id?: string; content: string; author_id?: string; votes?: number }>,
        action_items: (retrospective?.action_items || []) as Array<{ id?: string; item: string; assignee_id?: string; status?: "pending" | "in_progress" | "done"; due_date?: string }>,
        team_mood_score: teamMood || undefined,
        notes: notes || undefined,
      });
    } catch (error) {
      console.error("Failed to save retrospective:", error);
    }
  };

  if (authLoading || currentWorkspaceLoading || sprintLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading retrospective...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const wentWell = (retrospective?.went_well || []) as RetroItem[];
  const toImprove = (retrospective?.to_improve || []) as RetroItem[];
  const actionItems = (retrospective?.action_items || []) as ActionItem[];

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                href={`/sprints/${projectId}/${sprintId}`}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-700 rounded-lg">
                  <MessageSquare className="h-5 w-5 text-slate-300" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-white">Sprint Retrospective</h1>
                  <p className="text-slate-400 text-sm">{sprint?.name}</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Team Mood */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">Team Mood</h3>
          <div className="flex items-center justify-center gap-4">
            {MOOD_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = teamMood === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setTeamMood(option.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl transition ${
                    isSelected
                      ? "bg-slate-700 ring-2 ring-primary-500"
                      : "bg-slate-700/30 hover:bg-slate-700/50"
                  }`}
                >
                  <Icon className={`h-8 w-8 ${option.color}`} />
                  <span className="text-sm text-slate-300">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Retro Columns */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <RetroColumn
            title="What Went Well"
            icon={<ThumbsUp className="h-5 w-5" />}
            color="text-green-400"
            items={wentWell}
            onAdd={handleAddWentWell}
            onVote={handleVote}
            onDelete={handleDeleteItem}
          />
          <RetroColumn
            title="What Could Improve"
            icon={<AlertCircle className="h-5 w-5" />}
            color="text-amber-400"
            items={toImprove}
            onAdd={handleAddToImprove}
            onVote={handleVote}
            onDelete={handleDeleteItem}
          />
          <ActionItemsColumn
            items={actionItems}
            onAdd={handleAddActionItem}
            onUpdateStatus={handleUpdateActionStatus}
            onDelete={handleDeleteItem}
          />
        </div>

        {/* Notes */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Additional Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any other thoughts or observations from the sprint..."
            rows={4}
            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500 resize-none"
          />
        </div>
      </main>
    </div>
  );
}
