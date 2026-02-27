"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { developerApi, repositoriesApi, Developer } from "@/lib/api";

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Defer localStorage read to after hydration to prevent SSR mismatch.
  // Before mount: mounted=false → isResolved=false → layout shows skeleton.
  // After mount: we read localStorage and proceed with auth check.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasToken = mounted && !!localStorage.getItem("token");

  const {
    data: user,
    isLoading,
    isFetched,
    error,
  } = useQuery<Developer>({
    queryKey: ["currentUser"],
    queryFn: developerApi.getMe,
    retry: false,
    enabled: hasToken,
  });

  const logout = () => {
    localStorage.removeItem("token");
    queryClient.clear();
    router.push("/");
  };

  const isAuthenticated = !!user && !error;

  // Auth state is definitively known only after mount AND either:
  //  - No token exists (definitely not authed), OR
  //  - The query has completed at least once (success or failure)
  const isResolved = mounted && (!hasToken || isFetched);

  return {
    user,
    isLoading,
    isAuthenticated,
    isResolved,
    logout,
  };
}

export function useSetToken() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return async (token: string) => {
    localStorage.setItem("token", token);
    queryClient.invalidateQueries({ queryKey: ["currentUser"] });

    try {
      // Check if onboarding is complete
      const status = await repositoriesApi.getOnboardingStatus();
      if (status.completed) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    } catch (error) {
      // If we can't check onboarding status, assume it's not complete
      console.error("Failed to check onboarding status:", error);
      router.push("/onboarding");
    }
  };
}
