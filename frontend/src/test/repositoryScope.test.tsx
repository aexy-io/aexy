/**
 * Whole-repository generation for the customer who has no coding agent.
 *
 * The fan-out belongs in the working tree, so the server never grew one. This
 * runs it from the browser over the existing per-path endpoint — which is what
 * makes the scope screen and per-module retry possible at all.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepositoryScopePanel } from "@/components/docs/RepositoryScopePanel";
import type { Repository } from "@/lib/api";

const getContents = vi.fn();
const createDocument = vi.fn();
const createFromRepository = vi.fn();

vi.mock("@/lib/api", () => ({
  documentApi: {
    create: (...args: unknown[]) => createDocument(...args),
    createDocumentFromRepository: (...args: unknown[]) =>
      createFromRepository(...args),
  },
  repositoriesApi: {
    getContents: (...args: unknown[]) => getContents(...args),
  },
}));

const messages = JSON.parse(
  readFileSync(resolve(__dirname, "../../messages/en.json"), "utf8")
);

const repository = { id: "repo-1", name: "widgets" } as Repository;

const dir = (name: string) => ({
  name,
  path: name,
  type: "dir" as const,
  size: 0,
  sha: name,
});
const file = (name: string) => ({
  name,
  path: name,
  type: "file" as const,
  size: 10,
  sha: name,
});

function renderPanel(onFinished = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <RepositoryScopePanel
          workspaceId="ws-1"
          repository={repository}
          branch="main"
          isOpen
          onClose={vi.fn()}
          onFinished={onFinished}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

/** Top level, then a listing for each module the panel counts. */
function tree(topLevel: ReturnType<typeof dir>[]) {
  getContents.mockImplementation((_repo, options: { path?: string }) =>
    Promise.resolve(
      options?.path ? [file("a.ts"), file("b.ts"), dir("nested")] : topLevel
    )
  );
}

describe("RepositoryScopePanel", () => {
  beforeEach(() => {
    getContents.mockReset();
    createDocument.mockReset();
    createFromRepository.mockReset();
    createDocument.mockResolvedValue({ id: "parent-1" });
  });

  it("leaves build output and tooling out of the scope", async () => {
    tree([dir("src"), dir("node_modules"), dir("dist"), dir(".github")]);
    renderPanel();

    await waitFor(() => screen.getByTestId("scope-module-src"));
    // A directory the sync layer refuses to react to is not one worth a page.
    expect(screen.queryByTestId("scope-module-node_modules")).toBeNull();
    expect(screen.queryByTestId("scope-module-dist")).toBeNull();
    expect(screen.queryByTestId("scope-module-.github")).toBeNull();
  });

  it("says what the run will do in documents and calls, and no more", async () => {
    tree([dir("src"), dir("api")]);
    renderPanel();

    await waitFor(() => screen.getByTestId("scope-module-src"));
    expect(screen.getByText(/Writes 2 documents/)).toBeInTheDocument();
    // Two facts. A currency estimate here would have to be invented, and an
    // invented number people plan against is worse than none.
    expect(screen.queryByText(/\$/)).toBeNull();
    // The size of each module, read from the tree rather than guessed.
    await waitFor(() =>
      expect(screen.getByTestId("scope-module-src")).toHaveTextContent(
        "2 files, 1 dirs"
      )
    );
  });

  it("writes one document per module, each under the same parent", async () => {
    tree([dir("src"), dir("api")]);
    createFromRepository.mockResolvedValue({ document: { id: "doc-x" } });
    const onFinished = vi.fn();
    renderPanel(onFinished);

    await waitFor(() => screen.getByTestId("scope-module-src"));
    fireEvent.click(screen.getByTestId("scope-start"));

    await waitFor(() => expect(createFromRepository).toHaveBeenCalledTimes(2));
    for (const call of createFromRepository.mock.calls) {
      // Under a parent is the whole point: a later change to one directory then
      // revises one page rather than the world.
      expect(call[1].parent_id).toBe("parent-1");
      expect(call[1].link_type).toBe("directory");
    }
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith("parent-1"));
  });

  it("skips a module you deselect", async () => {
    tree([dir("src"), dir("api")]);
    createFromRepository.mockResolvedValue({ document: { id: "doc-x" } });
    renderPanel();

    await waitFor(() => screen.getByTestId("scope-module-api"));
    fireEvent.click(screen.getByLabelText("api"));
    fireEvent.click(screen.getByTestId("scope-start"));

    await waitFor(() => expect(createFromRepository).toHaveBeenCalledTimes(1));
    expect(createFromRepository.mock.calls[0][1].path).toBe("src");
  });

  it("retries the module that failed, not the ones that worked", async () => {
    tree([dir("src"), dir("api")]);
    createFromRepository
      .mockResolvedValueOnce({ document: { id: "doc-src" } })
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({ document: { id: "doc-api" } });
    renderPanel();

    await waitFor(() => screen.getByTestId("scope-module-src"));
    fireEvent.click(screen.getByTestId("scope-start"));

    const retry = await waitFor(() => screen.getByTestId("scope-retry-api"));
    expect(screen.getByTestId("scope-done-src")).toBeInTheDocument();
    expect(screen.queryByTestId("scope-retry-src")).toBeNull();

    fireEvent.click(retry);

    // Three calls total: two modules, one of them twice. Retrying the run would
    // have been four, and would have rewritten a page that was already fine.
    await waitFor(() => expect(createFromRepository).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.getByTestId("scope-done-api")).toBeInTheDocument()
    );
  });

  it("runs the modules one at a time", async () => {
    tree([dir("src"), dir("api"), dir("web")]);
    let inFlight = 0;
    let peak = 0;
    createFromRepository.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { document: { id: "doc-x" } };
    });
    renderPanel();

    await waitFor(() => screen.getByTestId("scope-module-web"));
    fireEvent.click(screen.getByTestId("scope-start"));

    await waitFor(() => expect(createFromRepository).toHaveBeenCalledTimes(3));
    // A dozen concurrent model calls trips the per-minute limit, and then every
    // module fails instead of one.
    expect(peak).toBe(1);
  });

  it("is reachable from the generator", () => {
    const page = readFileSync(
      resolve(__dirname, "../app/(app)/docs/page.tsx"),
      "utf8"
    );
    expect(page).toMatch(/<RepositoryScopePanel/);
    expect(page).toMatch(/data-testid="generate-whole-repository"/);
  });
});
