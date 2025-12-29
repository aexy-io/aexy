"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { developerApi, Developer } from "@/lib/api";

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

  return (token: string) => {
    localStorage.setItem("token", token);
    queryClient.invalidateQueries({ queryKey: ["currentUser"] });
    router.push("/dashboard");
  };
}
