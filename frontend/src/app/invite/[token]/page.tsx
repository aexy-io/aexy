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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

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
    // Redirect to login
    window.location.href = `${API_BASE_URL}/auth/google/login?redirect=/invite/${token}`;
  };

  const goToWorkspace = () => {
    if (acceptedWorkspace) {
      router.push(`/dashboard?workspace=${acceptedWorkspace.slug}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading invite...</p>
        </div>
      </div>
    );
  }

  if (error && !inviteInfo) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Invalid Invite</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  if (success && acceptedWorkspace) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">
            Welcome to {acceptedWorkspace.name}!
          </h1>
          <p className="text-slate-400 mb-6">
            You&apos;ve successfully joined the workspace. You can now collaborate with your team.
          </p>
          <button
            onClick={goToWorkspace}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-lg transition-all font-medium"
          >
            Go to Workspace
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (!inviteInfo) {
    return null;
  }

  const emailMatches = currentUserEmail?.toLowerCase() === inviteInfo.email.toLowerCase();

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            You&apos;re invited to join
          </h1>
          <p className="text-3xl font-bold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">
            {inviteInfo.workspace_name}
          </p>
        </div>

        {/* Invite Details */}
        <div className="space-y-4 mb-8">
          {inviteInfo.invited_by_name && (
            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {inviteInfo.invited_by_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm text-slate-400">Invited by</p>
                <p className="text-white font-medium">{inviteInfo.invited_by_name}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
              <Mail className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Invite sent to</p>
              <p className="text-white font-medium">{inviteInfo.email}</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
            <span className="text-slate-400">Role</span>
            <span className="px-3 py-1 bg-primary-500/10 text-primary-400 rounded-full text-sm font-medium capitalize">
              {inviteInfo.role}
            </span>
          </div>
        </div>

        {/* Expired Warning */}
        {inviteInfo.is_expired && (
          <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-6">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-500 font-medium">Invite Expired</p>
              <p className="text-yellow-500/70 text-sm">
                This invite has expired. Please ask for a new invitation.
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-6">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Email Mismatch Warning */}
        {isLoggedIn && !emailMatches && (
          <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-6">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-500 font-medium">Different Email</p>
              <p className="text-yellow-500/70 text-sm">
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
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all font-medium"
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
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-lg transition-all font-medium"
                >
                  Sign in to Accept
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-center text-sm text-slate-500">
                  Sign in with {inviteInfo.email} to accept this invite
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
