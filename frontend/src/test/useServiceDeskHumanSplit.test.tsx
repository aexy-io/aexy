import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useServiceDeskMutations } from "@/hooks/useServiceDesk";

const mocks = vi.hoisted(() => ({
  splitDetectedIssues: vi.fn(),
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ currentWorkspace: { id: "workspace-1" } }),
}));

vi.mock("@/lib/service-desk-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/service-desk-api")>();
  return {
    ...actual,
    serviceDeskApi: {
      ...actual.serviceDeskApi,
      splitDetectedIssues: mocks.splitDetectedIssues,
    },
  };
});

/**
 * A client whose cache the test can inspect, plus the provider `renderHook`
 * needs. Returned together because the assertions are about what the mutation
 * did to *this* client's cache.
 */
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

describe("Service Desk human split mutation", () => {
  beforeEach(() => {
    mocks.splitDetectedIssues.mockReset();
    mocks.splitDetectedIssues.mockResolvedValue({
      created_ticket_ids: ["child-1"],
      created_ticket_display_ids: ["BSD-2"],
    });
  });

  it("invalidates detail, list, and dashboard queries after splitting", async () => {
    const { client: queryClient, Wrapper } = makeWrapper();
    const detailKey = ["service-desk", "ticket", "workspace-1", "primary-1"];
    const listKey = ["service-desk", "tickets", "workspace-1"];
    const dashboardKey = ["service-desk", "dashboard", "workspace-1"];
    queryClient.setQueryData(detailKey, { ticket_id: "primary-1" });
    queryClient.setQueryData(listKey, []);
    queryClient.setQueryData(dashboardKey, { total_open: 1 });

    // `renderHook` rather than a probe component assigning the hook's return
    // value to an outer variable: that assignment happens during render, which
    // is a side effect the React Compiler ruleset rejects outright — and it is
    // what every other hook test here already does.
    const { result } = renderHook(() => useServiceDeskMutations(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.splitDetectedIssues.mutateAsync({
        id: "primary-1",
        issue_indexes: [2],
      });
    });

    expect(mocks.splitDetectedIssues).toHaveBeenCalledWith(
      "workspace-1",
      "primary-1",
      [2],
    );
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(dashboardKey)?.isInvalidated).toBe(true);
  });
});
