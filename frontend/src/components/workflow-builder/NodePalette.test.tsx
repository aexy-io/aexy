import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NodePalette } from "./NodePalette";

const registryState = vi.hoisted(() => ({
  loading: false,
  error: null as Error | null,
  triggers: ["record.created"],
  actions: [
    "send_email",
    "send_sms",
    "webhook_call",
    "condition",
    "wait",
    "run_agent",
    "branch",
  ],
}));

vi.mock("@/hooks/useAutomations", () => ({
  useModuleTriggers: () => ({
    triggers: registryState.triggers,
    descriptions: {},
    isLoading: registryState.loading,
    error: registryState.error,
  }),
  useModuleActions: () => ({
    actions: registryState.actions,
    descriptions: {},
    isLoading: registryState.loading,
    error: registryState.error,
  }),
}));

describe("NodePalette capability registry contract", () => {
  beforeEach(() => {
    registryState.loading = false;
    registryState.error = null;
  });

  it("creates structural categories only from registered action identifiers", () => {
    const onAddNode = vi.fn();
    render(
      <NodePalette
        workspaceId="workspace-1"
        module="crm"
        onAddNode={onAddNode}
      />
    );

    expect(screen.getByTestId("palette-category-condition")).toBeInTheDocument();
    expect(screen.getByTestId("palette-category-wait")).toBeInTheDocument();
    expect(screen.getByTestId("palette-category-agent")).toBeInTheDocument();
    expect(screen.getByTestId("palette-category-branch")).toBeInTheDocument();
    expect(
      screen.queryByTestId("palette-subtype-action-run_agent")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("palette-category-agent"));
    expect(onAddNode).toHaveBeenCalledWith("agent", undefined);
  });

  it("does not expose cached capabilities while the registry is loading", () => {
    registryState.loading = true;
    render(
      <NodePalette
        workspaceId="workspace-1"
        module="crm"
        onAddNode={vi.fn()}
      />
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(
      screen.queryByTestId("palette-category-agent")
    ).not.toBeInTheDocument();
  });

  it("does not expose capabilities after a registry error", () => {
    registryState.error = new Error("registry unavailable");
    render(
      <NodePalette
        workspaceId="workspace-1"
        module="crm"
        onAddNode={vi.fn()}
      />
    );

    expect(
      screen.queryByTestId("palette-category-agent")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("palette-category-action")
    ).not.toBeInTheDocument();
  });
});
