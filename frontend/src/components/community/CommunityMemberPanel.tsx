"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { communityMemberApi } from "@/lib/api";
import { InternalThreadsList } from "./InternalThreadsList";
import { NewThreadDialog } from "./NewThreadDialog";
import { StartCommunityCta } from "./StartCommunityCta";

/**
 * Client "member layer" for a community page. The page itself is anonymously
 * ISR-rendered and cached across all visitors, so auth-aware content can't live
 * there — this island hydrates after load, reads the token from localStorage
 * (same approach as CommunityAuthButton), and calls the authenticated
 * /community/{slug}/me endpoint.
 *
 * Signed-in members see their internal (non web-public) threads inline; everyone
 * else sees a "start your own community" CTA. No member data ever touches the
 * server-rendered, cached shell.
 */
export function CommunityMemberPanel({ communitySlug }: { communitySlug: string }) {
  const t = useTranslations("community");
  const [mounted, setMounted] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setSignedIn(!!localStorage.getItem("token"));
    }
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["community-member-context", communitySlug],
    queryFn: () => communityMemberApi.getContext(communitySlug),
    enabled: mounted && signedIn,
    retry: false,
  });

  // Avoid hydration mismatch: render nothing until the client has mounted and
  // read the token.
  if (!mounted) return null;

  // Signed-out visitors: growth CTA only.
  if (!signedIn) {
    return <StartCommunityCta signedIn={false} />;
  }

  if (isLoading) {
    return (
      <div className="mt-10 flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // A stale/invalid token (401) or a transient error — fall back to the CTA
  // rather than showing a broken state.
  if (isError || !data) {
    return <StartCommunityCta signedIn={true} />;
  }

  // Signed in but not a member of this community.
  if (!data.is_member) {
    return <StartCommunityCta signedIn={true} />;
  }

  return (
    <section className="mt-10 border-t border-gray-200 dark:border-gray-800 pt-8">
      <div className="mb-4 flex items-center gap-2">
        <Lock className="h-4 w-4 text-gray-400" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("internal.title")}
          </h2>
          <p className="text-sm text-gray-500">{t("internal.subtitle")}</p>
        </div>
        {data.can_create_thread && data.workspace_id && (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            {t("compose.newThread")}
          </button>
        )}
      </div>
      <InternalThreadsList channels={data.internal_channels} />

      {data.workspace_id && (
        <NewThreadDialog
          workspaceId={data.workspace_id}
          channels={data.internal_channels}
          canPostPublic={data.can_post_public}
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          onCreated={() => refetch()}
        />
      )}
    </section>
  );
}
