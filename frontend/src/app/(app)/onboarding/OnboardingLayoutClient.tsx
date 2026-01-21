"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { OnboardingProvider } from "./OnboardingContext";
import { repositoriesApi } from "@/lib/api";

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Skip check for the complete page (user is finishing onboarding)
    if (pathname === "/onboarding/complete") {
      setIsChecking(false);
      return;
    }

    const checkOnboardingStatus = async () => {
      try {
        const status = await repositoriesApi.getOnboardingStatus();
        if (status.completed) {
          router.replace("/dashboard");
          return;
        }
      } catch (err) {
        // If we can't check, allow access to onboarding
        console.error("Failed to check onboarding status:", err);
      }
      setIsChecking(false);
    };
    checkOnboardingStatus();
  }, [router, pathname]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function OnboardingLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OnboardingProvider>
      <OnboardingGuard>
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          {/* Header */}
          <header className="border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-white">Aexy</h1>
                  <p className="text-xs text-slate-500">Setup your workspace</p>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </OnboardingGuard>
    </OnboardingProvider>
  );
}
