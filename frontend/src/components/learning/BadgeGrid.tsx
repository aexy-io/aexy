"use client";

import { useState } from "react";
import {
  Award,
  Flame,
  Trophy,
  Star,
  Rocket,
  BookOpen,
  Crown,
  Map as MapIcon,
  Clock,
  Hourglass,
  Medal,
  Lock,
  Footprints,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, EarnedBadge, BadgeRarity } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Icon mapping
const iconMap: Record<string, React.ElementType> = {
  footprints: Footprints,
  rocket: Rocket,
  "book-open": BookOpen,
  trophy: Trophy,
  flame: Flame,
  fire: Flame,
  crown: Crown,
  map: MapIcon,
  clock: Clock,
  hourglass: Hourglass,
  star: Star,
  medal: Medal,
  award: Award,
};

// Rarity styles
const rarityStyles: Record<
  BadgeRarity,
  { bg: string; border: string; text: string; glow: string }
> = {
  common: {
    bg: "bg-gray-100",
    border: "border-gray-300",
    text: "text-gray-600",
    glow: "",
  },
  rare: {
    bg: "bg-blue-50",
    border: "border-blue-300",
    text: "text-blue-600",
    glow: "shadow-blue-200",
  },
  epic: {
    bg: "bg-purple-50",
    border: "border-purple-300",
    text: "text-purple-600",
    glow: "shadow-purple-200",
  },
  legendary: {
    bg: "bg-gradient-to-br from-amber-50 to-orange-50",
    border: "border-amber-400",
    text: "text-amber-600",
    glow: "shadow-amber-200 shadow-lg",
  },
};

interface BadgeCardProps {
  badge: Badge;
  isEarned: boolean;
  earnedAt?: string;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}

function BadgeCard({ badge, isEarned, earnedAt, onClick, size = "md" }: BadgeCardProps) {
  const Icon = iconMap[badge.icon] || Award;
  const rarity = rarityStyles[badge.rarity];

  const sizeClasses = {
    sm: { container: "w-16 h-16", icon: "h-6 w-6" },
    md: { container: "w-20 h-20", icon: "h-8 w-8" },
    lg: { container: "w-24 h-24", icon: "h-10 w-10" },
  };

  const classes = sizeClasses[size];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "relative rounded-xl border-2 flex items-center justify-center transition-all",
              classes.container,
              isEarned
                ? cn(rarity.bg, rarity.border, rarity.glow, "hover:scale-105")
                : "bg-gray-100 border-gray-200 opacity-50",
              onClick && "cursor-pointer"
            )}
          >
            {isEarned ? (
              <Icon className={cn(classes.icon, rarity.text)} />
            ) : (
              <Lock className={cn(classes.icon, "text-gray-400")} />
            )}

            {/* Legendary shimmer effect */}
            {isEarned && badge.rarity === "legendary" && (
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <div className="font-semibold">{badge.name}</div>
            <div className="text-sm text-gray-400">{badge.description}</div>
            <div className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded capitalize",
                  rarity.bg,
                  rarity.text
                )}
              >
                {badge.rarity}
              </span>
              <span className="text-amber-500">+{badge.points_value} pts</span>
            </div>
            {isEarned && earnedAt && (
              <div className="text-xs text-green-400">
                Earned {new Date(earnedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface BadgeGridProps {
  allBadges: Badge[];
  earnedBadges: EarnedBadge[];
  className?: string;
  showAll?: boolean;
  maxDisplay?: number;
}

export function BadgeGrid({
  allBadges,
  earnedBadges,
  className,
  showAll = false,
  maxDisplay = 8,
}: BadgeGridProps) {
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);

  // Create a map of earned badge IDs
  const earnedMap = new Map<string, EarnedBadge>(
    earnedBadges.map((eb): [string, EarnedBadge] => [eb.badge.id, eb])
  );

  // Sort badges: earned first, then by rarity
  const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const sortedBadges = [...allBadges].sort((a, b) => {
    const aEarned = earnedMap.has(a.id) ? 0 : 1;
    const bEarned = earnedMap.has(b.id) ? 0 : 1;
    if (aEarned !== bEarned) return aEarned - bEarned;
    return rarityOrder[a.rarity] - rarityOrder[b.rarity];
  });

  const displayBadges = showAll ? sortedBadges : sortedBadges.slice(0, maxDisplay);
  const hiddenCount = sortedBadges.length - displayBadges.length;

  const selectedEarned = selectedBadge
    ? earnedMap.get(selectedBadge.id)
    : null;

  return (
    <>
      <div className={cn("flex flex-wrap gap-3", className)}>
        {displayBadges.map((badge) => {
          const earned = earnedMap.get(badge.id);
          return (
            <BadgeCard
              key={badge.id}
              badge={badge}
              isEarned={!!earned}
              earnedAt={earned?.earned_at}
              onClick={() => setSelectedBadge(badge)}
            />
          );
        })}

        {hiddenCount > 0 && (
          <button
            onClick={() => {}}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
          >
            +{hiddenCount}
          </button>
        )}
      </div>

      {/* Badge detail modal */}
      <Dialog open={!!selectedBadge} onOpenChange={() => setSelectedBadge(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedBadge && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center",
                      selectedEarned
                        ? rarityStyles[selectedBadge.rarity].bg
                        : "bg-gray-100"
                    )}
                  >
                    {(() => {
                      const Icon = iconMap[selectedBadge.icon] || Award;
                      return (
                        <Icon
                          className={cn(
                            "h-6 w-6",
                            selectedEarned
                              ? rarityStyles[selectedBadge.rarity].text
                              : "text-gray-400"
                          )}
                        />
                      );
                    })()}
                  </div>
                  <div>
                    <div>{selectedBadge.name}</div>
                    <div
                      className={cn(
                        "text-sm font-normal capitalize",
                        rarityStyles[selectedBadge.rarity].text
                      )}
                    >
                      {selectedBadge.rarity}
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-4">
                <p className="text-gray-600">{selectedBadge.description}</p>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Points Value</span>
                  <span className="font-medium text-amber-600">
                    +{selectedBadge.points_value} pts
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Category</span>
                  <span className="font-medium capitalize">
                    {selectedBadge.category}
                  </span>
                </div>

                {selectedEarned ? (
                  <div className="bg-green-50 text-green-700 rounded-lg p-3 text-center">
                    <div className="font-medium">Badge Earned!</div>
                    <div className="text-sm text-green-600">
                      {new Date(selectedEarned.earned_at).toLocaleDateString(
                        undefined,
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 text-gray-600 rounded-lg p-3 text-center">
                    <Lock className="h-5 w-5 mx-auto mb-1" />
                    <div className="font-medium">Locked</div>
                    <div className="text-sm text-gray-500">
                      Complete the requirements to unlock
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Recent badges section
interface RecentBadgesProps {
  badges: EarnedBadge[];
  className?: string;
}

export function RecentBadges({ badges, className }: RecentBadgesProps) {
  if (badges.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-medium text-gray-700">Recent Badges</h3>
      <div className="flex flex-wrap gap-2">
        {badges.slice(0, 5).map((earned) => (
          <BadgeCard
            key={earned.id}
            badge={earned.badge}
            isEarned={true}
            earnedAt={earned.earned_at}
            size="sm"
          />
        ))}
      </div>
    </div>
  );
}
