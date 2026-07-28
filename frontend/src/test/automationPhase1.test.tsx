import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type Edge, type Node } from "@xyflow/react";

import { useWorkflowValidation } from "@/hooks/useWorkflowValidation";
import { getApiErrorMessage, getTestFailureMessage } from "@/lib/utils";

describe("automation Phase 1 feedback", () => {
  it("uses a plain server detail instead of a generic request error", () => {
    const error = {
      message: "Request failed with status code 400",
      response: { data: { detail: "Workflow validation failed" } },
    };

    expect(getApiErrorMessage(error, "Fallback")).toBe("Workflow validation failed");
  });

  it("uses the structured server validation message", () => {
    const error = {
      message: "Request failed with status code 400",
      response: {
        data: {
          detail: {
            message: "Cannot publish invalid workflow",
            errors: [{ message: "Email action requires a template or body" }],
          },
        },
      },
    };

    expect(getApiErrorMessage(error, "Fallback")).toBe("Email action requires a template or body");
  });

  it("falls back cleanly for a network error", () => {
    expect(getApiErrorMessage(new Error("Network Error"), "Fallback")).toBe("Network Error");
    expect(getApiErrorMessage({}, "Fallback")).toBe("Fallback");
  });

  it("explains when a test needs a CRM record to provide the email address", () => {
    expect(getTestFailureMessage("No recipient email address")).toBe(
      "The automation is saved. This test needs a real CRM record with an email address, because the recipient is taken from that record. Enter its Record ID and run the test again."
    );
  });

  it("flags an email action that has a recipient and subject but no body", async () => {
    const nodes: Node[] = [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: { trigger_type: "record.created" },
      },
      {
        id: "email",
        type: "action",
        position: { x: 250, y: 0 },
        data: {
          action_type: "send_email",
          to: "{{record.values.email}}",
          email_subject: "Welcome",
        },
      },
    ];
    const edges: Edge[] = [{ id: "trigger-email", source: "trigger", target: "email" }];

    const { result } = renderHook(() => useWorkflowValidation(nodes, edges));

    await waitFor(() => {
      expect(result.current.validationResult.errors).toContainEqual(
        expect.objectContaining({
          nodeId: "email",
          field: "email_body",
          message: "Email body or template is required",
        })
      );
    });
  });

  it("flags a Notify User action until its specific email is supplied", async () => {
    const nodes: Node[] = [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: { trigger_type: "record.created" },
      },
      {
        id: "notify",
        type: "action",
        position: { x: 250, y: 0 },
        data: { action_type: "notify_user", notify_type: "email" },
      },
    ];
    const edges: Edge[] = [{ id: "trigger-notify", source: "trigger", target: "notify" }];

    const { result } = renderHook(() => useWorkflowValidation(nodes, edges));

    await waitFor(() => {
      expect(result.current.validationResult.errors).toContainEqual(
        expect.objectContaining({
          nodeId: "notify",
          field: "notify_email",
          message: "Email address is required",
        })
      );
    });
  });
});
