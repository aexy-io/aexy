"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Users,
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { workspaceApi, developerApi, InviteInfo } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { LedgerPage } from "@/components/landing/LedgerPage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const { switchWorkspace } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [acceptedWorkspace, setAcceptedWorkspace] = useState<{
    id: string;
    name: string;
    slug: string;
  } | null>(null);

  // Check if user is logged in
  useEffect(() => {
    const checkAuth = async () => {
      const authToken = localStorage.getItem("token");
      if (authToken) {
        try {
          const user = await developerApi.getMe();
          setIsLoggedIn(true);
          setCurrentUserEmail(user.email);
        } catch {
          // Token invalid, clear it
          localStorage.removeItem("token");
          setIsLoggedIn(false);
        }
      }
    };
    checkAuth();
  }, []);

  // Fetch invite info
  useEffect(() => {
    const fetchInviteInfo = async () => {
      try {
        const info = await workspaceApi.getInviteInfo(token);
        setInviteInfo(info);
      } catch (err: unknown) {
        const error = err as { response?: { data?: { detail?: string } } };
        setError(error.response?.data?.detail || "This invite link is invalid or has expired.");
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchInviteInfo();
    }
  }, [token]);

  const handleAcceptInvite = async () => {
    setAccepting(true);
    setError(null);

    try {
      const result = await workspaceApi.acceptInvite(token);
      setSuccess(true);
      setAcceptedWorkspace({
        id: result.workspace_id,
        name: result.workspace_name,
        slug: result.workspace_slug,
      });
      // Switch to the newly accepted workspace
      switchWorkspace(result.workspace_id);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || "Failed to accept invite. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  const handleLoginAndAccept = () => {
    // Store the invite token to accept after login
    localStorage.setItem("pendingInviteToken", token);
    // Redirect to Google login (will auto-redirect back to this page after login)
    window.location.href = `${API_BASE_URL}/auth/google/login`;
  };

  const goToWorkspace = () => {
    // Workspace is already set via switchWorkspace in handleAcceptInvite
    router.push("/dashboard");
  };

  if (loading) {
    return (
      <LedgerPage chrome={false} className="flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-ledger-green animate-spin mx-auto mb-4" />
          <p className="text-ledger-ink/65">Loading invite...</p>
        </div>
      </LedgerPage>
    );
  }

  if (error && !inviteInfo) {
    return (
      <LedgerPage chrome={false} className="flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-ledger-card border border-ledger-ink/12 rounded-[2px] p-8 text-center">
          <div className="w-16 h-16 rounded-[2px] bg-ledger-red/10 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-ledger-red" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-ledger-ink mb-3">Invalid Invite</h1>
          <p className="text-ledger-ink/65 mb-6">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 border border-ledger-ink/25 hover:border-ledger-ink/50 text-ledger-ink rounded-[2px] transition-colors font-semibold"
          >
            Go to Homepage
          </button>
        </div>
      </LedgerPage>
    );
  }

  if (success && acceptedWorkspace) {
    return (
      <LedgerPage chrome={false} className="flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-ledger-card border border-ledger-ink/12 rounded-[2px] p-8 text-center">
          <div className="w-16 h-16 rounded-[2px] bg-ledger-green/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-ledger-green" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-ledger-ink mb-3">
            Welcome to {acceptedWorkspace.name}!
          </h1>
          <p className="text-ledger-ink/65 mb-6">
            You&apos;ve successfully joined the workspace. You can now collaborate with your team.
          </p>
          <button
            onClick={goToWorkspace}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-ledger-green hover:bg-[#095A31] text-ledger-paper rounded-[2px] transition-colors font-semibold"
          >
            Go to Workspace
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </LedgerPage>
    );
  }

  if (!inviteInfo) {
    return null;
  }

  const emailMatches = currentUserEmail?.toLowerCase() === inviteInfo.email.toLowerCase();

  return (
    <LedgerPage chrome={false} className="flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-ledger-card border border-ledger-ink/12 rounded-[2px] p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-[2px] bg-ledger-ink text-ledger-paper flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-ledger-ink mb-2">
            You&apos;re invited to join
          </h1>
          <p className="font-display text-3xl font-semibold text-ledger-green">
            {inviteInfo.workspace_name}
          </p>
        </div>

        {/* Invite Details */}
        <div className="space-y-4 mb-8">
          {inviteInfo.invited_by_name && (
            <div className="flex items-center gap-3 p-3 bg-ledger-paper border border-ledger-ink/12 rounded-[2px]">
              <div className="w-10 h-10 rounded-[2px] bg-ledger-ink/[0.06] flex items-center justify-center">
                <span className="text-sm font-medium text-ledger-ink">
                  {inviteInfo.invited_by_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm text-ledger-ink/65">Invited by</p>
                <p className="font-medium text-ledger-ink">{inviteInfo.invited_by_name}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 p-3 bg-ledger-paper border border-ledger-ink/12 rounded-[2px]">
            <div className="w-10 h-10 rounded-[2px] bg-ledger-ink/[0.06] flex items-center justify-center">
              <Mail className="w-5 h-5 text-ledger-ink/65" />
            </div>
            <div>
              <p className="text-sm text-ledger-ink/65">Invite sent to</p>
              <p className="font-medium text-ledger-ink">{inviteInfo.email}</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-ledger-paper border border-ledger-ink/12 rounded-[2px]">
            <span className="text-ledger-ink/65">Role</span>
            <span className="px-2.5 py-1 bg-ledger-green/10 text-ledger-green rounded-[2px] font-brand-mono text-xs uppercase tracking-[0.12em]">
              {inviteInfo.role}
            </span>
          </div>
        </div>

        {/* Expired Warning */}
        {inviteInfo.is_expired && (
          <div className="flex items-start gap-3 p-4 bg-ledger-card border border-ledger-ink/20 rounded-[2px] mb-6">
            <AlertTriangle className="w-5 h-5 text-ledger-red flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-ledger-ink">Invite Expired</p>
              <p className="text-sm text-ledger-ink/65">
                This invite has expired. Please ask for a new invitation.
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-ledger-card border border-ledger-ink/20 rounded-[2px] mb-6">
            <XCircle className="w-5 h-5 text-ledger-red flex-shrink-0 mt-0.5" />
            <p className="text-sm text-ledger-ink/75">{error}</p>
          </div>
        )}

        {/* Email Mismatch Warning */}
        {isLoggedIn && !emailMatches && (
          <div className="flex items-start gap-3 p-4 bg-ledger-card border border-ledger-ink/20 rounded-[2px] mb-6">
            <AlertTriangle className="w-5 h-5 text-ledger-red flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-ledger-ink">Different Email</p>
              <p className="text-sm text-ledger-ink/65">
                You&apos;re logged in as {currentUserEmail}, but this invite was sent to{" "}
                {inviteInfo.email}. Please sign in with the correct email.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        {!inviteInfo.is_expired && (
          <div className="space-y-3">
            {isLoggedIn && emailMatches ? (
              <button
                onClick={handleAcceptInvite}
                disabled={accepting}
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-ledger-green hover:bg-[#095A31] disabled:opacity-50 disabled:cursor-not-allowed text-ledger-paper rounded-[2px] transition-colors font-semibold"
              >
                {accepting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Accept Invite
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  onClick={handleLoginAndAccept}
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-ledger-green hover:bg-[#095A31] text-ledger-paper rounded-[2px] transition-colors font-semibold"
                >
                  Sign in to Accept
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-center text-sm text-ledger-ink/65">
                  Sign in with {inviteInfo.email} to accept this invite
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </LedgerPage>
  );
}
