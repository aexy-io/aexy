"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
      <div className="min-h-screen bg-background flex items-center justify-center">
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
        <div className="min-h-screen bg-background">
          {/* Main Content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </OnboardingGuard>
    </OnboardingProvider>
  );
}
