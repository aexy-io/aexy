"use client";

/**
 * The consent screen for remote MCP clients.
 *
 * This is the only place a person actually grants a client access, and it is
 * the reason open client registration is safe: registering gets a client a name
 * and a redirect URI, nothing more. Everything it can reach is decided here.
 *
 * Two things are deliberately not taken from the query string:
 *
 *   * the client's name, which is re-fetched from the server — the browser
 *     arrived here via a redirect the client controls, so a name in the URL is
 *     a name the client chose to show you;
 *   * which workspace to expose, which the person picks. A grant is scoped to
 *     one, so the tools the client sees are that workspace's access model
 *     rather than a union across everything they can reach.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, Loader2, Plug, ShieldCheck } from "lucide-react";

import { useWorkspace } from "@/hooks/useWorkspace";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
/** The OAuth endpoints live at the origin, not under /api/v1 — see api/mcp_oauth.py. */
const OAUTH_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

interface ConsentPrompt {
  client_id: string;
  client_name: string;
  client_uri: string | null;
  logo_uri: string | null;
  redirect_uri: string;
}

export default function OAuthConsentPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { workspaces, workspacesLoading } = useWorkspace();

  const request = useMemo(
    () => ({
      clientId: params.get("client_id") ?? "",
      redirectUri: params.get("redirect_uri") ?? "",
      codeChallenge: params.get("code_challenge") ?? "",
      codeChallengeMethod: params.get("code_challenge_method") ?? "S256",
      scope: params.get("scope") ?? "mcp",
      state: params.get("state"),
    }),
    [params]
  );

  const [prompt, setPrompt] = useState<ConsentPrompt | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      // Come back here afterwards, so the client's flow is not lost to a login.
      router.replace(`/auth/login?next=${encodeURIComponent(window.location.href)}`);
      return;
    }
    if (!request.clientId || !request.redirectUri) {
      setError("This authorization link is incomplete. Start again from the client.");
      return;
    }

    const query = new URLSearchParams({
      client_id: request.clientId,
      redirect_uri: request.redirectUri,
    });
    fetch(`${OAUTH_ORIGIN}/oauth/authorize/prompt?${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).detail ?? "Unknown client");
        return res.json();
      })
      .then(setPrompt)
      .catch((e) => setError(e.message));
  }, [request, router]);

  useEffect(() => {
    if (!workspaceId && workspaces.length > 0) setWorkspaceId(workspaces[0].id);
  }, [workspaces, workspaceId]);

  const approve = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${OAUTH_ORIGIN}/oauth/authorize/grant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          client_id: request.clientId,
          redirect_uri: request.redirectUri,
          code_challenge: request.codeChallenge,
          code_challenge_method: request.codeChallengeMethod,
          workspace_id: workspaceId,
          scope: request.scope,
          state: request.state,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error_description ?? "Authorization failed");
      window.location.href = body.redirect_to;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authorization failed");
      setSubmitting(false);
    }
  };

  const deny = () => {
    // Tell the client rather than leaving it hanging: OAuth defines this exact
    // error, and a client that receives it can say "you declined" instead of
    // timing out on a window that never came back.
    const url = new URL(request.redirectUri);
    url.searchParams.set("error", "access_denied");
    if (request.state) url.searchParams.set("state", request.state);
    window.location.href = url.toString();
  };

  if (error && !prompt) {
    return (
      <Shell>
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-foreground">Can&apos;t authorize this app</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (!prompt) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking this request…
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
          <Plug className="h-5 w-5 text-primary" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground">
            {prompt.client_name}
          </h1>
          <p className="text-sm text-muted-foreground">wants to connect to your workspace</p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <label className="block text-sm font-medium text-foreground" htmlFor="workspace">
          Workspace to share
        </label>
        <select
          id="workspace"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          disabled={workspacesLoading || workspaces.length === 0}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          The app gets exactly what you can reach in this workspace — no more. If your
          access changes later, so does the app&apos;s.
        </p>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          You can revoke this at any time from Settings → API Tokens. Approving sends
          you to <span className="break-all font-mono">{new URL(prompt.redirect_uri).host}</span>.
        </p>
      </div>

      {error && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={deny}
          disabled={submitting}
          className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={approve}
          disabled={submitting || !workspaceId}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Allow access
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        {children}
      </div>
    </main>
  );
}
