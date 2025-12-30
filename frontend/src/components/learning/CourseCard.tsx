"use client";

import { useState } from "react";
import {
  ExternalLink,
  Clock,
  Plus,
  Youtube,
  BookOpen,
  GraduationCap,
  User,
  Star,
} from "lucide-react";
import { ExternalCourse } from "@/lib/api";

interface CourseCardProps {
  course: ExternalCourse;
  onImport?: (course: ExternalCourse) => Promise<unknown>;
  isImporting?: boolean;
  compact?: boolean;
}

const providerConfig: Record<string, { icon: typeof Youtube; color: string; label: string }> = {
  youtube: { icon: Youtube, color: "text-red-500", label: "YouTube" },
  coursera: { icon: GraduationCap, color: "text-blue-500", label: "Coursera" },
  udemy: { icon: BookOpen, color: "text-purple-500", label: "Udemy" },
  pluralsight: { icon: BookOpen, color: "text-pink-500", label: "Pluralsight" },
};

const difficultyConfig: Record<string, { color: string; bgColor: string }> = {
  beginner: { color: "text-green-400", bgColor: "bg-green-900/30" },
  intermediate: { color: "text-yellow-400", bgColor: "bg-yellow-900/30" },
  advanced: { color: "text-red-400", bgColor: "bg-red-900/30" },
};

export function CourseCard({
  course,
  onImport,
  isImporting = false,
  compact = false,
}: CourseCardProps) {
  const [importing, setImporting] = useState(false);

  const provider = providerConfig[course.provider] || {
    icon: BookOpen,
    color: "text-slate-400",
    label: course.provider,
  };
  const ProviderIcon = provider.icon;

  const difficulty = course.difficulty
    ? difficultyConfig[course.difficulty] || { color: "text-slate-400", bgColor: "bg-slate-700" }
    : null;

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const handleImport = async () => {
    if (!onImport) return;
    setImporting(true);
    try {
      await onImport(course);
    } finally {
      setImporting(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition">
        {/* Thumbnail */}
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="w-20 h-12 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-20 h-12 rounded bg-slate-700 flex items-center justify-center flex-shrink-0">
            <ProviderIcon className={`h-6 w-6 ${provider.color}`} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{course.title}</p>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ProviderIcon className={`h-3 w-3 ${provider.color}`} />
            <span>{provider.label}</span>
            {course.duration_minutes && (
              <>
                <span>-</span>
                <span>{formatDuration(course.duration_minutes)}</span>
              </>
            )}
          </div>
        </div>

        {onImport && (
          <button
            onClick={handleImport}
            disabled={importing || isImporting}
            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded-lg transition disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden bg-slate-800 hover:border-slate-600 transition">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-slate-700">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ProviderIcon className={`h-12 w-12 ${provider.color}`} />
          </div>
        )}

        {/* Provider badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded bg-black/60 text-white text-xs">
          <ProviderIcon className={`h-3 w-3 ${provider.color}`} />
          <span>{provider.label}</span>
        </div>

        {/* Duration badge */}
        {course.duration_minutes && (
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-xs flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(course.duration_minutes)}
          </div>
        )}

        {/* Free badge */}
        {course.is_free && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded bg-green-600 text-white text-xs font-medium">
            FREE
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-medium text-white line-clamp-2 mb-2">{course.title}</h3>

        {course.description && (
          <p className="text-sm text-slate-400 line-clamp-2 mb-3">{course.description}</p>
        )}

        {/* Metadata row */}
        <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
          {course.instructor && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span className="truncate max-w-24">{course.instructor}</span>
            </div>
          )}
          {course.rating && (
            <div className="flex items-center gap-1 text-yellow-400">
              <Star className="h-3 w-3 fill-current" />
              <span>{course.rating.toFixed(1)}</span>
            </div>
          )}
          {difficulty && course.difficulty && (
            <span className={`px-1.5 py-0.5 rounded ${difficulty.bgColor} ${difficulty.color}`}>
              {course.difficulty}
            </span>
          )}
        </div>

        {/* Skill tags */}
        {course.skill_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {course.skill_tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <a
            href={course.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition"
          >
            <ExternalLink className="h-4 w-4" />
            View Course
          </a>
          {onImport && (
            <button
              onClick={handleImport}
              disabled={importing || isImporting}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {importing ? "Adding..." : "Add"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
