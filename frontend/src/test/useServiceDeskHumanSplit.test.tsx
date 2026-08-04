import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useServiceDeskMutations } from "@/hooks/useServiceDesk";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

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

describe("Service Desk human split mutation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.splitDetectedIssues.mockReset();
    mocks.splitDetectedIssues.mockResolvedValue({
      created_ticket_ids: ["child-1"],
      created_ticket_display_ids: ["BSD-2"],
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("invalidates detail, list, and dashboard queries after splitting", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const detailKey = ["service-desk", "ticket", "workspace-1", "primary-1"];
    const listKey = ["service-desk", "tickets", "workspace-1"];
    const dashboardKey = ["service-desk", "dashboard", "workspace-1"];
    queryClient.setQueryData(detailKey, { ticket_id: "primary-1" });
    queryClient.setQueryData(listKey, []);
    queryClient.setQueryData(dashboardKey, { total_open: 1 });
    let mutations: ReturnType<typeof useServiceDeskMutations> | undefined;
    function Probe() {
      mutations = useServiceDeskMutations();
      return null;
    }
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    expect(mutations).toBeDefined();

    await act(async () => {
      await mutations!.splitDetectedIssues.mutateAsync({
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
