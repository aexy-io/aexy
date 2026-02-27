"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppAccess } from "@/hooks/useAppAccess";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAccessRequests } from "@/hooks/useAccessRequests";
import { getAppIdFromPath, APP_CATALOG } from "@/config/appDefinitions";
import {
  Loader2,
  Lock,
  ArrowLeft,
  Home,
  Send,
  Clock,
  XCircle,
  CheckCircle,
} from "lucide-react";
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
      appId={appId}
      appName={appInfo?.name || "This app"}
      appDescription={appInfo?.description}
      appIcon={appInfo?.icon}
      modules={appInfo?.modules}
      workspaceId={workspaceId}
    />
  );
}

interface AccessDeniedPageProps {
  appId: string;
  appName?: string;
  appDescription?: string;
  appIcon?: React.ComponentType<{ className?: string }>;
  modules?: { id: string; name: string; description: string }[];
  workspaceId: string | null;
}

/**
 * Page shown when a user doesn't have access to an app.
 * Includes a "Request Access" flow for non-admin users.
 */
export function AccessDeniedPage({
  appId,
  appName = "This page",
  appDescription,
  appIcon: AppIcon,
  modules,
  workspaceId,
}: AccessDeniedPageProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [showReasonInput, setShowReasonInput] = useState(false);

  const {
    getRequestForApp,
    getLatestRequestForApp,
    createRequest,
    isCreatingRequest,
    withdrawRequest,
    isWithdrawing,
    isLoadingMyRequests,
  } = useAccessRequests(workspaceId);

  const pendingRequest = getRequestForApp(appId);
  const latestRequest = getLatestRequestForApp(appId);
  const wasRejected =
    !pendingRequest && latestRequest?.status === "rejected";

  const handleSubmitRequest = async () => {
    try {
      await createRequest({
        appId,
        reason: reason.trim() || undefined,
      });
      setReason("");
      setShowReasonInput(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleWithdraw = async () => {
    if (!pendingRequest) return;
    try {
      await withdrawRequest(pendingRequest.id);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-md">
        {/* App icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-6">
          {AppIcon ? (
            <AppIcon className="h-8 w-8 text-muted-foreground" />
          ) : (
            <Lock className="h-8 w-8 text-muted-foreground" />
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold mb-2">
          Access to {appName}
        </h1>

        {/* Description */}
        {appDescription && (
          <p className="text-muted-foreground mb-4">{appDescription}</p>
        )}

        {/* Module pills */}
        {modules && modules.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {modules.map((mod) => (
              <span
                key={mod.id}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"
              >
                {mod.name}
              </span>
            ))}
          </div>
        )}

        {/* Request states */}
        {isLoadingMyRequests ? (
          <div className="flex justify-center mb-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : pendingRequest ? (
          /* Pending request state */
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 text-amber-500 mb-3">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">Request Pending</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Your request has been sent to workspace administrators.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleWithdraw}
              disabled={isWithdrawing}
              className="text-muted-foreground"
            >
              {isWithdrawing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <XCircle className="h-3 w-3 mr-1" />
              )}
              Withdraw Request
            </Button>
          </div>
        ) : wasRejected ? (
          /* Rejected state */
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 mb-3">
              <XCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Request Declined</span>
            </div>
            {latestRequest?.review_notes && (
              <p className="text-sm text-muted-foreground mb-3">
                &ldquo;{latestRequest.review_notes}&rdquo;
              </p>
            )}
            {/* Allow re-request */}
            {!showReasonInput ? (
              <Button
                onClick={() => setShowReasonInput(true)}
                variant="outline"
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Request Again
              </Button>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why do you need access? (optional)"
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={2}
                  maxLength={1000}
                />
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowReasonInput(false);
                      setReason("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmitRequest}
                    disabled={isCreatingRequest}
                    className="gap-2"
                  >
                    {isCreatingRequest && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    Submit Request
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Default: show request button */
          <div className="mb-6">
            {!showReasonInput ? (
              <Button
                onClick={() => setShowReasonInput(true)}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Request Access
              </Button>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why do you need access? (optional)"
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={2}
                  maxLength={1000}
                />
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowReasonInput(false);
                      setReason("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmitRequest}
                    disabled={isCreatingRequest}
                    className="gap-2"
                  >
                    {isCreatingRequest && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    Submit Request
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Secondary actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Button variant="outline" asChild>
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
