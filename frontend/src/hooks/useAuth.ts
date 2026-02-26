"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { developerApi, repositoriesApi, Developer } from "@/lib/api";

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Read token synchronously — on SSR this is always false.
  const hasToken =
    typeof window !== "undefined" && !!localStorage.getItem("token");

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

  // Auth state is definitively known when:
  //  - No token exists (definitely not authed), OR
  //  - The query has completed at least once (success or failure)
  // This eliminates the one-render gap where mounted=true but query hasn't started.
  const isResolved = !hasToken || isFetched;

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
