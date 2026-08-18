import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DocumentImprovements } from "@/components/docs/DocumentImprovements";

const suggestImprovements = vi.fn();
const applySuggestion = vi.fn();

vi.mock("@/lib/api", () => ({
  documentApi: {
    suggestImprovements: (...args: unknown[]) => suggestImprovements(...args),
    applySuggestion: (...args: unknown[]) => applySuggestion(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const messages = JSON.parse(
  readFileSync(resolve(__dirname, "../../messages/en.json"), "utf8")
);

function renderPanel(onProposed = vi.fn(), isOpen = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <DocumentImprovements
          workspaceId="ws-1"
          documentId="doc-1"
          isOpen={isOpen}
          onClose={vi.fn()}
          onProposed={onProposed}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const RESPONSE = {
  status: "success",
  document_id: "doc-1",
  suggestions: {
    quality_score: 6.4,
    overall_assessment: "Accurate but assumes the reader already knows the flow.",
    missing_sections: ["Error handling", "Rate limits"],
    improvements: [
      {
        priority: "low",
        section: "Examples",
        issue: "Only one example",
        suggestion: "Add a failure example",
      },
      {
        priority: "high",
        section: "Overview",
        issue: "No statement of purpose",
        suggestion: "Say what the endpoint is for in the first sentence",
      },
    ],
  },
};

describe("DocumentImprovements", () => {
  beforeEach(() => {
    suggestImprovements.mockReset();
    applySuggestion.mockReset();
  });

  it("spends nothing until asked, then orders the highest priority first", async () => {
    suggestImprovements.mockResolvedValue(RESPONSE);
    renderPanel();

    // The point of the explicit button: opening the panel must not spend a
    // model call. A page that costs money to look at is a page nobody opens.
    expect(suggestImprovements).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("improvements-run"));
    await waitFor(() => expect(screen.getByText("6")).toBeInTheDocument());

    // Declared order is low-then-high; a reader scanning top-down must meet the
    // one that matters first.
    expect(screen.getByTestId("improvement-0")).toHaveTextContent("Overview");
    expect(screen.getByTestId("improvement-1")).toHaveTextContent("Examples");
    expect(screen.getByText(/Error handling, Rate limits/)).toBeInTheDocument();
  });

  it("queues a suggestion as a proposal and says so rather than editing", async () => {
    suggestImprovements.mockResolvedValue(RESPONSE);
    applySuggestion.mockResolvedValue({
      status: "success",
      document_id: "doc-1",
      proposed_edit_id: "pe-1",
    });
    const onProposed = vi.fn();
    renderPanel(onProposed);

    fireEvent.click(screen.getByTestId("improvements-run"));
    await waitFor(() => screen.getByTestId("improvement-apply-0"));

    // The promise the panel makes before you click it.
    expect(
      screen.getByText(/not changed until somebody approves/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("improvement-apply-0"));

    await waitFor(() =>
      expect(applySuggestion).toHaveBeenCalledWith(
        "ws-1",
        "doc-1",
        "Say what the endpoint is for in the first sentence"
      )
    );
    // Without this the queued proposal appears only after a reload, which reads
    // as the Apply having done nothing.
    expect(onProposed).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId("improvement-apply-0")).toBeDisabled()
    );
  });

  it("renders nothing when closed", () => {
    renderPanel(vi.fn(), false);
    expect(screen.queryByTestId("document-improvements")).toBeNull();
    // Guard on the closed case being cheap too.
    expect(suggestImprovements).not.toHaveBeenCalled();
  });
});
