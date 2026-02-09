"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppAccess } from "@/hooks/useAppAccess";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getAppIdFromPath, APP_CATALOG } from "@/config/appDefinitions";
import { Loader2, Lock, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface AppAccessGuardProps {
  children: React.ReactNode;
  appId?: string; // Optional: explicitly specify the app ID
  moduleId?: string; // Optional: check module-level access
  fallback?: React.ReactNode; // Optional: custom fallback UI
  showAccessDenied?: boolean; // Default: true. If false, renders nothing when access denied
}

/**
 * Guard component that checks app-level access before rendering children.
 * Use this to wrap app layouts or pages that require app access control.
 */
export function AppAccessGuard({
  children,
  appId: explicitAppId,
  moduleId,
  fallback,
  showAccessDenied = true,
}: AppAccessGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user: developer, isLoading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const workspaceId = currentWorkspace?.id || null;
  const developerId = developer?.id || null;

  const {
    hasAppAccess,
    hasModuleAccess,
    isLoading: accessLoading,
    effectiveAccess,
  } = useAppAccess(workspaceId, developerId);

  // Determine the app ID to check
  const appId = explicitAppId || getAppIdFromPath(pathname);

  // Loading state
  if (authLoading || accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If no app ID found, allow access (route not in app catalog)
  if (!appId) {
    return <>{children}</>;
  }

  // Check app-level access
  const hasAccess = moduleId
    ? hasModuleAccess(appId, moduleId)
    : hasAppAccess(appId);

  // Access granted
  if (hasAccess) {
    return <>{children}</>;
  }

  // Access denied
  if (!showAccessDenied) {
    return null;
  }

  // Custom fallback
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default access denied UI
  const appInfo = APP_CATALOG[appId];

  return (
    <AccessDeniedPage
      appName={appInfo?.name || "This app"}
      appDescription={appInfo?.description}
    />
  );
}

interface AccessDeniedPageProps {
  appName?: string;
  appDescription?: string;
}

/**
 * Page shown when a user doesn't have access to an app.
 */
export function AccessDeniedPage({
  appName = "This page",
  appDescription,
}: AccessDeniedPageProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-md">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-6">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold mb-2">Access Restricted</h1>

        {/* Description */}
        <p className="text-muted-foreground mb-6">
          You don&apos;t have access to <strong>{appName}</strong>.
          {appDescription && (
            <span className="block mt-1 text-sm">{appDescription}</span>
          )}
        </p>

        {/* Contact info */}
        <p className="text-sm text-muted-foreground mb-8">
          If you believe you should have access, please contact your workspace
          administrator.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Button asChild>
            <Link href="/dashboard" className="gap-2">
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Higher-order component to wrap a page with app access guard.
 */
export function withAppAccess<P extends object>(
  Component: React.ComponentType<P>,
  appId: string,
  moduleId?: string
) {
  return function WrappedComponent(props: P) {
    return (
      <AppAccessGuard appId={appId} moduleId={moduleId}>
        <Component {...props} />
      </AppAccessGuard>
    );
  };
}

export default AppAccessGuard;
