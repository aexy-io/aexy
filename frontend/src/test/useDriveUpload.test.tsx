/**
 * Regression cover for the duplicate-upload bug.
 *
 * `useDriveUpload` drains its queue in a `while (inFlight < MAX_CONCURRENT)`
 * loop that read the queue through a ref. Because `setQueue` is async, the
 * item marked "uploading" inside the loop still read as "pending" on the
 * next iteration, so a single picked file was POSTed once per free
 * concurrency slot — three drive rows and three AI summaries for one upload.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadFile = vi.fn();

vi.mock("@/lib/api", () => ({
  driveApi: {
    uploadFile: (...args: unknown[]) => uploadFile(...args),
  },
  workspaceSearchApi: { search: vi.fn() },
}));

import { useDriveUpload } from "@/hooks/useDrive";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function fileNamed(name: string, size = 8) {
  return new File(["x".repeat(size)], name, { type: "text/plain" });
}

describe("useDriveUpload", () => {
  beforeEach(() => {
    uploadFile.mockReset();
    uploadFile.mockImplementation((_ws, file: File) =>
      Promise.resolve({ id: `df-${file.name}`, file_name: file.name }),
    );
  });

  it("POSTs a single picked file exactly once", async () => {
    const { result } = renderHook(() => useDriveUpload("ws-1", null), { wrapper });

    act(() => {
      result.current.enqueue([fileNamed("alpha.txt")]);
    });

    await waitFor(() => {
      expect(result.current.queue[0]?.status).toBe("done");
    });

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(result.current.queue).toHaveLength(1);
  });

  it("POSTs each file in a multi-file batch exactly once", async () => {
    const { result } = renderHook(() => useDriveUpload("ws-1", null), { wrapper });
    const names = ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"];

    act(() => {
      result.current.enqueue(names.map((n) => fileNamed(n)));
    });

    await waitFor(() => {
      expect(result.current.queue.every((q) => q.status === "done")).toBe(true);
    });

    expect(uploadFile).toHaveBeenCalledTimes(names.length);
    const uploaded = uploadFile.mock.calls.map((c) => (c[1] as File).name).sort();
    expect(uploaded).toEqual([...names].sort());
  });

  it("marks a failed upload and retries it once on demand", async () => {
    uploadFile.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useDriveUpload("ws-1", null), { wrapper });

    act(() => {
      result.current.enqueue([fileNamed("alpha.txt")]);
    });

    await waitFor(() => {
      expect(result.current.queue[0]?.status).toBe("failed");
    });
    expect(uploadFile).toHaveBeenCalledTimes(1);

    const id = result.current.queue[0].id;
    act(() => {
      result.current.retry(id);
    });

    await waitFor(() => {
      expect(result.current.queue[0]?.status).toBe("done");
    });
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });
});
