"use client";

/**
 * What a workspace still has to do before a campaign can actually send.
 *
 * Derived from live rows, never from a stored flag or localStorage — the same
 * approach as `useServiceDesk`'s `isConfigured`. The point is that ticking a step
 * off requires the thing to exist, not for someone to have clicked a link. The
 * old empty state listed these four steps as prose with no `completed` values at
 * all, so they rendered identically whether or not any of them was done.
 */

import { useMemo } from "react";

import {
  useEmailProviders,
  useEmailTemplates,
  useSendingDomains,
  useSubscribers,
} from "@/hooks/useEmailMarketing";
import type { SendingDomain } from "@/lib/api";

/**
 * Domain statuses the backend treats as able to send
 * (`domain_service.SENDABLE_DOMAIN_STATUSES`). `warming` is mid-ramp-up, not
 * unverified, and `active` is a completed warm-up — both send.
 */
export const SENDABLE_DOMAIN_STATUSES = ["verified", "active", "warming"] as const;

export function isSendableDomain(domain: SendingDomain): boolean {
  return (SENDABLE_DOMAIN_STATUSES as readonly string[]).includes(domain.status);
}

export type StepState = "todo" | "pending" | "done";

export interface EmailMarketingSetup {
  isLoading: boolean;
  /** True once a campaign could actually be sent. */
  isReadyToSend: boolean;
  domain: {
    state: StepState;
    /** Domains that can send, in the order they should be offered as senders. */
    sendable: SendingDomain[];
    /** Added but not yet verified — "pending", not "not started". */
    awaitingVerification: SendingDomain[];
  };
  provider: { state: StepState; count: number; activeCount: number };
  template: { state: StepState; count: number };
  audience: { state: StepState; count: number };
}

export function useEmailMarketingSetup(workspaceId: string | null): EmailMarketingSetup {
  const { domains, isLoading: domainsLoading } = useSendingDomains(workspaceId);
  const { providers, isLoading: providersLoading } = useEmailProviders(workspaceId);
  const { templates, isLoading: templatesLoading } = useEmailTemplates(workspaceId);
  // One page is enough to answer "is there anybody?", which is all this asks.
  const { subscribers, isLoading: subscribersLoading } = useSubscribers(workspaceId, { limit: 1 });

  return useMemo(() => {
    const sendable = domains.filter(isSendableDomain);
    const awaitingVerification = domains.filter((d) => !isSendableDomain(d));
    // A provider is `setup` until a successful test promotes it to `active`.
    const activeProviders = providers.filter((p) => p.is_active);

    const domainState: StepState =
      sendable.length > 0 ? "done" : awaitingVerification.length > 0 ? "pending" : "todo";
    const providerState: StepState =
      activeProviders.length > 0 ? "done" : providers.length > 0 ? "pending" : "todo";

    return {
      isLoading: domainsLoading || providersLoading || templatesLoading || subscribersLoading,
      // Deliberately only the domain: the backend refuses a send without a
      // sendable domain, and falls back to the platform mailer when a workspace
      // has configured no provider. Requiring a provider here would block people
      // whose sends would in fact go out.
      isReadyToSend: sendable.length > 0,
      domain: { state: domainState, sendable, awaitingVerification },
      provider: {
        state: providerState,
        count: providers.length,
        activeCount: activeProviders.length,
      },
      template: { state: templates.length > 0 ? "done" : "todo", count: templates.length },
      audience: { state: subscribers.length > 0 ? "done" : "todo", count: subscribers.length },
    };
  }, [
    domains,
    providers,
    templates,
    subscribers,
    domainsLoading,
    providersLoading,
    templatesLoading,
    subscribersLoading,
  ]);
}
