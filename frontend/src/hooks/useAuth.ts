"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { developerApi, repositoriesApi, Developer } from "@/lib/api";

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    error,
  } = useQuery<Developer>({
    queryKey: ["currentUser"],
    queryFn: developerApi.getMe,
    retry: false,
    enabled: typeof window !== "undefined" && !!localStorage.getItem("token"),
  });

  const logout = () => {
    localStorage.removeItem("token");
    queryClient.clear();
    router.push("/");
  };

  const isAuthenticated = !!user && !error;

  return {
    user,
    isLoading,
    isAuthenticated,
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
