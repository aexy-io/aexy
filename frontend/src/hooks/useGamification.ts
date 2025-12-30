"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  gamificationApi,
  GamificationProfile,
  Badge,
  EarnedBadge,
  StreakInfo,
  LevelProgress,
} from "@/lib/api";

// Query keys
const gamificationKeys = {
  all: ["gamification"] as const,
  profile: () => [...gamificationKeys.all, "profile"] as const,
  badges: () => [...gamificationKeys.all, "badges"] as const,
  earnedBadges: () => [...gamificationKeys.all, "earnedBadges"] as const,
  streak: () => [...gamificationKeys.all, "streak"] as const,
  levelProgress: () => [...gamificationKeys.all, "levelProgress"] as const,
};

// Get gamification profile
export function useGamificationProfile() {
  return useQuery<GamificationProfile>({
    queryKey: gamificationKeys.profile(),
    queryFn: gamificationApi.getProfile,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Get all available badges
export function useAllBadges() {
  return useQuery<Badge[]>({
    queryKey: gamificationKeys.badges(),
    queryFn: gamificationApi.getAllBadges,
    staleTime: 1000 * 60 * 30, // 30 minutes - badges don't change often
  });
}

// Get earned badges
export function useEarnedBadges() {
  return useQuery<EarnedBadge[]>({
    queryKey: gamificationKeys.earnedBadges(),
    queryFn: gamificationApi.getEarnedBadges,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Get streak info
export function useStreakInfo() {
  return useQuery<StreakInfo>({
    queryKey: gamificationKeys.streak(),
    queryFn: gamificationApi.getStreak,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Get level progress
export function useLevelProgress() {
  return useQuery<LevelProgress>({
    queryKey: gamificationKeys.levelProgress(),
    queryFn: gamificationApi.getLevelProgress,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Check and award badges
export function useCheckBadges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: gamificationApi.checkBadges,
    onSuccess: (newBadges) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: gamificationKeys.profile() });
      queryClient.invalidateQueries({ queryKey: gamificationKeys.earnedBadges() });

      return newBadges;
    },
  });
}

// Seed badges (admin)
export function useSeedBadges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: gamificationApi.seedBadges,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gamificationKeys.badges() });
    },
  });
}

// Combined hook for gamification data
export function useGamification() {
  const profileQuery = useGamificationProfile();
  const streakQuery = useStreakInfo();
  const levelProgressQuery = useLevelProgress();
  const allBadgesQuery = useAllBadges();

  return {
    profile: profileQuery.data,
    streak: streakQuery.data,
    levelProgress: levelProgressQuery.data,
    allBadges: allBadgesQuery.data,
    isLoading:
      profileQuery.isLoading ||
      streakQuery.isLoading ||
      levelProgressQuery.isLoading ||
      allBadgesQuery.isLoading,
    isError:
      profileQuery.isError ||
      streakQuery.isError ||
      levelProgressQuery.isError ||
      allBadgesQuery.isError,
    refetch: () => {
      profileQuery.refetch();
      streakQuery.refetch();
      levelProgressQuery.refetch();
    },
  };
}

// Helper function to get badge rarity color
export function getBadgeRarityColor(rarity: string): string {
  switch (rarity) {
    case "common":
      return "text-gray-500 bg-gray-100";
    case "rare":
      return "text-blue-600 bg-blue-100";
    case "epic":
      return "text-purple-600 bg-purple-100";
    case "legendary":
      return "text-amber-600 bg-amber-100";
    default:
      return "text-gray-500 bg-gray-100";
  }
}

// Helper function to get badge icon component name
export function getBadgeIcon(iconName: string): string {
  const iconMap: Record<string, string> = {
    footprints: "Footprints",
    rocket: "Rocket",
    "book-open": "BookOpen",
    trophy: "Trophy",
    flame: "Flame",
    fire: "Flame",
    crown: "Crown",
    map: "Map",
    clock: "Clock",
    hourglass: "Hourglass",
    star: "Star",
    medal: "Medal",
  };
  return iconMap[iconName] || "Award";
}

// Helper function to format points
export function formatPoints(points: number): string {
  if (points >= 1000000) {
    return `${(points / 1000000).toFixed(1)}M`;
  }
  if (points >= 1000) {
    return `${(points / 1000).toFixed(1)}K`;
  }
  return points.toString();
}

// Helper function to format time
export function formatLearningTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}
