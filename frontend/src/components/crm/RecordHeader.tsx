"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Trash2,
  MoreHorizontal,
  Edit2,
  X,
  Star,
  Share2,
  Link,
  Building2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMRecord, CRMObject } from "@/lib/api";

interface RecordHeaderProps {
  record: CRMRecord;
  object?: CRMObject;
  // Navigation
  onBack?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  // Editing
  isEditing?: boolean;
  isUpdating?: boolean;
  isDeleting?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  // Actions
  onStar?: () => void;
  isStarred?: boolean;
  onShare?: () => void;
  className?: string;
}

// Get initials for avatar
function getInitials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Get avatar color based on name
function getAvatarColor(name: string | undefined): string {
  if (!name) return "bg-slate-600";
  const colors = [
    "bg-purple-600",
    "bg-blue-600",
    "bg-green-600",
    "bg-yellow-600",
    "bg-red-600",
    "bg-pink-600",
    "bg-indigo-600",
    "bg-cyan-600",
  ];
  const index = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length];
}

// Get icon for object type
function getObjectIcon(objectSlug: string | undefined) {
  switch (objectSlug) {
    case "companies":
      return Building2;
    case "people":
    case "contacts":
      return User;
    default:
      return Building2;
  }
}

export function RecordHeader({
  record,
  object,
  onBack,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  isEditing = false,
  isUpdating = false,
  isDeleting = false,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onStar,
  isStarred = false,
  onShare,
  className,
}: RecordHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const displayName = record.display_name || "Untitled";
  const Icon = getObjectIcon(object?.slug);

  return (
    <div className={cn("flex items-center gap-4", className)}>
      {/* Back and Navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          title="Back to list"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {/* Prev/Next navigation */}
        <div className="flex items-center border-l border-slate-700 ml-1 pl-1">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              hasPrev
                ? "hover:bg-slate-800 text-slate-400 hover:text-white"
                : "text-slate-600 cursor-not-allowed"
            )}
            title="Previous record"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              hasNext
                ? "hover:bg-slate-800 text-slate-400 hover:text-white"
                : "text-slate-600 cursor-not-allowed"
            )}
            title="Next record"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Avatar */}
      <div
        className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold text-lg",
          getAvatarColor(displayName)
        )}
      >
        {getInitials(displayName)}
      </div>

      {/* Title and breadcrumb */}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold text-white truncate">{displayName}</h1>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Icon className="h-3.5 w-3.5" />
          <span>{object?.name || "Record"}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <button
              onClick={onCancel}
              className="flex items-center gap-2 px-3 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-sm"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={isUpdating}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors text-sm"
            >
              <Save className="h-4 w-4" />
              {isUpdating ? "Saving..." : "Save"}
            </button>
          </>
        ) : (
          <>
            {/* Star/Favorite */}
            {onStar && (
              <button
                onClick={onStar}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  isStarred
                    ? "text-yellow-400 hover:bg-yellow-400/10"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
                title={isStarred ? "Remove from favorites" : "Add to favorites"}
              >
                <Star className={cn("h-5 w-5", isStarred && "fill-current")} />
              </button>
            )}

            {/* Share */}
            {onShare && (
              <button
                onClick={onShare}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Share"
              >
                <Share2 className="h-5 w-5" />
              </button>
            )}

            {/* Edit */}
            <button
              onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors text-sm"
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </button>

            {/* More menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>

              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                    >
                      <Link className="h-4 w-4" />
                      Copy link
                    </button>
                    <hr className="border-slate-700 my-1" />
                    <button
                      onClick={() => {
                        onDelete?.();
                        setShowMenu(false);
                      }}
                      disabled={isDeleting}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      {isDeleting ? "Deleting..." : "Delete record"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
