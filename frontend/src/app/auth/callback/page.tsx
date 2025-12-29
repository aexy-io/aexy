"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSetToken } from "@/hooks/useAuth";
import { GitBranch } from "lucide-react";

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const setToken = useSetToken();

  useEffect(() => {
    const handleAuth = async () => {
      const token = searchParams.get("token");
      const error = searchParams.get("error");

      if (error) {
        console.error("Auth error:", error);
        window.location.href = `/?error=${encodeURIComponent(error)}`;
        return;
      }

      if (token) {
        await setToken(token);
      } else {
        window.location.href = "/?error=no_token";
      }
    };

    handleAuth();
  }, [searchParams, setToken]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center">
      <GitBranch className="h-16 w-16 text-primary-500 mb-4" />
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4"></div>
      <p className="text-white text-lg">Completing authentication...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center">
          <GitBranch className="h-16 w-16 text-primary-500 mb-4" />
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4"></div>
          <p className="text-white text-lg">Loading...</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
