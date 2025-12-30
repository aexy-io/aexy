"use client";

import { Star, TrendingUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { LevelProgress, GamificationProfile } from "@/lib/api";
import { formatPoints } from "@/hooks/useGamification";
import { MiniProgressRing } from "./ProgressRing";

interface PointsDisplayProps {
  profile: GamificationProfile;
  levelProgress?: LevelProgress;
  size?: "sm" | "md" | "lg";
  showLevel?: boolean;
  showProgress?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: {
    container: "gap-1.5",
    icon: "h-4 w-4",
    points: "text-sm",
    level: "text-xs",
    progress: 16,
  },
  md: {
    container: "gap-2",
    icon: "h-5 w-5",
    points: "text-base",
    level: "text-sm",
    progress: 20,
  },
  lg: {
    container: "gap-2",
    icon: "h-6 w-6",
    points: "text-lg",
    level: "text-base",
    progress: 24,
  },
};

export function PointsDisplay({
  profile,
  levelProgress,
  size = "md",
  showLevel = true,
  showProgress = true,
  className,
}: PointsDisplayProps) {
  const classes = sizeClasses[size];

  return (
    <div className={cn("inline-flex items-center", classes.container, className)}>
      {/* Points */}
      <div className="flex items-center gap-1">
        <Zap className={cn(classes.icon, "text-amber-500")} />
        <span className={cn("font-bold text-gray-900", classes.points)}>
          {formatPoints(profile.total_points)}
        </span>
      </div>

      {/* Level */}
      {showLevel && (
        <div className="flex items-center gap-1">
          <span className="text-gray-400">•</span>
          <Star className={cn(classes.icon, "text-purple-500")} />
          <span className={cn("font-medium text-gray-700", classes.level)}>
            Level {profile.level}
          </span>
          {levelProgress && showProgress && (
            <MiniProgressRing
              progress={levelProgress.progress_percentage}
              size={classes.progress}
              color="purple"
            />
          )}
        </div>
      )}
    </div>
  );
}

// Level card with full details
interface LevelCardProps {
  profile: GamificationProfile;
  levelProgress: LevelProgress;
  className?: string;
}

export function LevelCard({ profile, levelProgress, className }: LevelCardProps) {
  return (
    <div
      className={cn(
        "bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl p-4 text-white",
        className
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-purple-200 text-sm">Level</div>
          <div className="text-3xl font-bold">{profile.level}</div>
          <div className="text-purple-200">{levelProgress.current_level_name}</div>
        </div>
        <div className="text-right">
          <div className="text-purple-200 text-sm">Total Points</div>
          <div className="text-2xl font-bold">{formatPoints(profile.total_points)}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-purple-200">Progress to Level {levelProgress.next_level || "Max"}</span>
          <span className="font-medium">{Math.round(levelProgress.progress_percentage)}%</span>
        </div>
        <div className="h-2 bg-purple-400/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: `${levelProgress.progress_percentage}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-purple-200">
          <span>{levelProgress.points_in_level} pts</span>
          <span>{levelProgress.points_for_next_level} pts needed</span>
        </div>
      </div>
    </div>
  );
}

// Stats overview card
interface StatsCardProps {
  profile: GamificationProfile;
  className?: string;
}

export function StatsCard({ profile, className }: StatsCardProps) {
  const stats = [
    {
      label: "Activities",
      value: profile.activities_completed,
      icon: TrendingUp,
      color: "text-blue-500",
    },
    {
      label: "Paths",
      value: profile.paths_completed,
      icon: Star,
      color: "text-purple-500",
    },
    {
      label: "Learning Time",
      value: `${Math.floor(profile.total_learning_minutes / 60)}h`,
      icon: Zap,
      color: "text-amber-500",
    },
  ];

  return (
    <div className={cn("grid grid-cols-3 gap-4", className)}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white rounded-lg border border-gray-200 p-3 text-center"
        >
          <stat.icon className={cn("h-5 w-5 mx-auto mb-1", stat.color)} />
          <div className="text-xl font-bold text-gray-900">{stat.value}</div>
          <div className="text-xs text-gray-500">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

// Points animation when earning points
interface PointsPopupProps {
  points: number;
  show: boolean;
  onComplete?: () => void;
}

export function PointsPopup({ points, show, onComplete }: PointsPopupProps) {
  if (!show) return null;

  return (
    <div
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none animate-bounce"
      onAnimationEnd={onComplete}
    >
      <div className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-full shadow-lg">
        <Zap className="h-5 w-5" />
        <span className="text-lg font-bold">+{points}</span>
      </div>
    </div>
  );
}
