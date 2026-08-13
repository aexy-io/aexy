/**
 * Tests for `useAgentChatStream` (UX-CHAT-001/002/003/009).
 *
 * Contract under test:
 *
 *   1. send() inserts an optimistic user + assistant pair into
 *      `pendingMessages` immediately.
 *   2. `user_message` SSE swaps the optimistic user id for the
 *      canonical server id.
 *   3. `text_delta` events accumulate into the optimistic assistant
 *      message's content.
 *   4. `usage` events surface as `currentTokens` + `currentCostUsd`
 *      and stamp the optimistic assistant message.
 *   5. `done` invalidates the React Query cache, clears pending after
 *      a short delay, and flips isStreaming false.
 *   6. stop() aborts the in-flight fetch — service catches the abort,
 *      pending clears, no error surfaces.
 *   7. `error` events flag the hook state without crashing.
 *
 * The fetch is mocked with a ReadableStream so we can drive the SSE
 * sequence deterministically without spinning a real server.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAgentChatStream } from "@/hooks/useAgentChatStream";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


/** Build a Response with a ReadableStream body that yields the given
 *  SSE-formatted frames in sequence. Resolves after the last frame
 *  unless `dangling` is true (simulates a stream that never closes). */
function sseResponse(frames: string[], opts: { dangling?: boolean } = {}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
        // Yield so other microtasks can run between frames.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!opts.dangling) controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** Pack a JSON payload into the SSE frame format the hook parses. */
function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Like sseResponse but enqueues arbitrary string chunks — used to
 *  simulate a real network where a single SSE frame can be split
 *  across two TCP reads (the `\n\n` separator landing in the second
 *  chunk, or even the JSON body itself being torn in half). */
function rawChunkResponse(chunks: string[], opts: { dangling?: boolean } = {}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!opts.dangling) controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

const WORKSPACE = "ws-1";
const AGENT = "agent-1";
const CONVERSATION = "convo-1";


beforeEach(() => {
  // localStorage shim so api.ts's `streamMessage` can read its token.
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => "test-token"),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  });
});


afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});


// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------


describe("useAgentChatStream — happy path", () => {
  it("inserts optimistic user+assistant pair immediately on send()", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      // No frames — the stream stays open while we assert.
    ], { dangling: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAgentChatStream(WORKSPACE, AGENT, CONVERSATION),
      { wrapper: Wrapper },
    );

    void act(() => {
      result.current.send("Hello agent");
    });

    await waitFor(() => {
      expect(result.current.pendingMessages.length).toBe(2);
    });
    const [user, assistant] = result.current.pendingMessages;
    expect(user.role).toBe("user");
    expect(user.content).toBe("Hello agent");
    expect(assistant.role).toBe("assistant");
    expect(assistant.content).toBe("");
    expect(result.current.isStreaming).toBe(true);
  });

  it("swaps optimistic user id for canonical when user_message arrives", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      sse({ type: "user_message", id: "real-user-id", content: "Hello", created_at: "2025-01-01T00:00:00Z" }),
    ], { dangling: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAgentChatStream(WORKSPACE, AGENT, CONVERSATION),
      { wrapper: Wrapper },
    );

    void act(() => {
      result.current.send("Hello");
    });

    await waitFor(() => {
      const user = result.current.pendingMessages.find((m) => m.role === "user");
      expect(user?.id).toBe("real-user-id");
    });
  });

  it("accumulates text_delta events into the assistant message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      sse({ type: "user_message", id: "u-1", content: "hi" }),
      sse({ type: "text_delta", text: "Hello" }),
      sse({ type: "text_delta", text: " " }),
      sse({ type: "text_delta", text: "world!" }),
    ], { dangling: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAgentChatStream(WORKSPACE, AGENT, CONVERSATION),
      { wrapper: Wrapper },
    );

    // Don't await send() — when the stream is dangling, send() never
    // resolves, and awaiting would hang the test. Fire-and-forget;
    // the assertions below use waitFor to observe the state changes.
    void act(() => {
      result.current.send("hi");
    });

    await waitFor(() => {
      const assistant = result.current.pendingMessages.find((m) => m.role === "assistant");
      expect(assistant?.content).toBe("Hello world!");
    });
  });

  it("reassembles frames split across stream chunks", async () => {
    // Real-world SSE will frequently split frames mid-payload — TCP
    // gives the reader whatever's in the kernel buffer, not whole
    // events. Tear a text_delta in half (across the JSON body) and a
    // user_message across the trailing "\n\n" separator to make sure
    // the hook's buffer reassembles both correctly.
    const userFrame = sse({ type: "user_message", id: "real-user", content: "hi" });
    const deltaFrame = sse({ type: "text_delta", text: "Hello world!" });
    const userMid = Math.floor(userFrame.length - 1); // split inside the trailing "\n\n"
    const deltaMid = Math.floor(deltaFrame.length / 2); // mid-JSON
    const chunks = [
      userFrame.slice(0, userMid),
      userFrame.slice(userMid) + deltaFrame.slice(0, deltaMid),
      deltaFrame.slice(deltaMid),
    ];
    // Dangling so the stream stays open while we assert mid-flight —
    // a clean close would trigger the "stream closed without done"
    // path which clears pendingMessages.
    const fetchMock = vi.fn().mockResolvedValue(rawChunkResponse(chunks, { dangling: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAgentChatStream(WORKSPACE, AGENT, CONVERSATION),
      { wrapper: Wrapper },
    );

    void act(() => {
      result.current.send("hi");
    });

    // Both halves of the user_message should have re-joined, and the
    // delta should have parsed as a single event.
    await waitFor(() => {
      const assistant = result.current.pendingMessages.find((m) => m.role === "assistant");
      expect(assistant?.content).toBe("Hello world!");
    });
    const user = result.current.pendingMessages.find((m) => m.role === "user");
    expect(user?.id).toBe("real-user");
  });

  it("surfaces usage as currentTokens + currentCostUsd", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      sse({ type: "user_message", id: "u-1", content: "hi" }),
      sse({ type: "text_delta", text: "ok" }),
      sse({ type: "usage", input_tokens: 100, output_tokens: 50, cost_usd: 0.00075 }),
    ], { dangling: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAgentChatStream(WORKSPACE, AGENT, CONVERSATION),
      { wrapper: Wrapper },
    );

    // Don't await send() — when the stream is dangling, send() never
    // resolves, and awaiting would hang the test. Fire-and-forget;
    // the assertions below use waitFor to observe the state changes.
    void act(() => {
      result.current.send("hi");
    });

    await waitFor(() => {
      expect(result.current.currentTokens).toEqual({ input: 100, output: 50 });
      expect(result.current.currentCostUsd).toBe(0.00075);
    });
  });

  it("clears pending + isStreaming on done", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      sse({ type: "user_message", id: "u-1", content: "hi" }),
      sse({ type: "text_delta", text: "Hello" }),
      sse({ type: "done", assistant_message_id: "asst-1", execution_id: "exec-1", duration_ms: 500 }),
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const { client, Wrapper } = makeWrapper();
    // After UX-CHAT-009 hardening the hook awaits a refetch (instead
    // of fire-and-forget invalidate + setTimeout) so the pending and
    // canonical message can't both render for a paint. The spy here
    // tracks that the refetch was awaited before pending cleared.
    const refetchSpy = vi.spyOn(client, "refetchQueries");
    const { result } = renderHook(
      () => useAgentChatStream(WORKSPACE, AGENT, CONVERSATION),
      { wrapper: Wrapper },
    );

    // Don't await send() — when the stream is dangling, send() never
    // resolves, and awaiting would hang the test. Fire-and-forget;
    // the assertions below use waitFor to observe the state changes.
    void act(() => {
      result.current.send("hi");
    });

    // `done` triggers a refetch then clears pending in the same tick
    // (no setTimeout race).
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
    await waitFor(() => {
      expect(result.current.pendingMessages.length).toBe(0);
    });
    expect(refetchSpy).toHaveBeenCalled();
  });
});


// ---------------------------------------------------------------------------
// Stop / abort
// ---------------------------------------------------------------------------


describe("useAgentChatStream — stop", () => {
  it("aborts the in-flight fetch + clears pending without surfacing an error", async () => {
    // The fetch mock checks the abort signal — when triggered, throws
    // an AbortError to simulate the browser's behavior.
    const fetchMock = vi.fn((url, init) => {
      const signal = (init as { signal?: AbortSignal })?.signal;
      return new Promise<Response>((_, reject) => {
        signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAgentChatStream(WORKSPACE, AGENT, CONVERSATION),
      { wrapper: Wrapper },
    );

    // Kick off the send but don't await it — it never resolves
    // until we abort.
    void act(() => {
      result.current.send("Hello");
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
    });

    act(() => {
      result.current.stop();
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
    // Error must NOT surface — abort is a user action, not a fault.
    expect(result.current.error).toBe(null);
    expect(result.current.pendingMessages.length).toBe(0);
  });
});


// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------


describe("useAgentChatStream — errors", () => {
  it("surfaces error events without crashing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      sse({ type: "user_message", id: "u-1", content: "hi" }),
      sse({ type: "text_delta", text: "Partial " }),
      sse({ type: "error", message: "LLM rate limit" }),
    ], { dangling: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAgentChatStream(WORKSPACE, AGENT, CONVERSATION),
      { wrapper: Wrapper },
    );

    // Don't await send() — when the stream is dangling, send() never
    // resolves, and awaiting would hang the test. Fire-and-forget;
    // the assertions below use waitFor to observe the state changes.
    void act(() => {
      result.current.send("hi");
    });

    await waitFor(() => {
      expect(result.current.error).toContain("rate limit");
    });
    // The partial text the agent did emit must remain visible — users
    // shouldn't lose context just because the agent died mid-stream.
    const assistant = result.current.pendingMessages.find((m) => m.role === "assistant");
    expect(assistant?.content).toContain("Partial ");
  });

  it("surfaces network-level fetch failure as error state", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAgentChatStream(WORKSPACE, AGENT, CONVERSATION),
      { wrapper: Wrapper },
    );

    // Don't await send() — when the stream is dangling, send() never
    // resolves, and awaiting would hang the test. Fire-and-forget;
    // the assertions below use waitFor to observe the state changes.
    void act(() => {
      result.current.send("hi");
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
      expect(result.current.isStreaming).toBe(false);
    });
  });
});


// ---------------------------------------------------------------------------
// mergeMessages dedupe
// ---------------------------------------------------------------------------


describe("useAgentChatStream — mergeMessages", () => {
  it("dedupes against the canonical list by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([], { dangling: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAgentChatStream(WORKSPACE, AGENT, CONVERSATION),
      { wrapper: Wrapper },
    );

    void act(() => {
      result.current.send("Hello");
    });
    await waitFor(() => expect(result.current.pendingMessages.length).toBe(2));

    // Simulate the canonical query result containing the same
    // assistant message as the pending one. The merger must dedupe
    // by id — no double-render.
    const [, pendingAssistant] = result.current.pendingMessages;
    const canonical = {
      id: "conv-1",
      workspace_id: "ws",
      agent_id: "ag",
      record_id: null,
      title: null,
      status: "active" as const,
      conversation_metadata: {},
      created_at: "",
      updated_at: "",
      ended_at: null,
      message_count: 1,
      messages: [
        { ...pendingAssistant, id: pendingAssistant.id },
      ],
    };
    const merged = result.current.mergeMessages(canonical);
    // No duplicate of the assistant — only one assistant in the merge.
    const assistants = merged.filter((m) => m.role === "assistant");
    expect(assistants.length).toBe(1);
  });

  it("appends pending messages when canonical doesn't have them yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([], { dangling: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useAgentChatStream(WORKSPACE, AGENT, CONVERSATION),
      { wrapper: Wrapper },
    );

    void act(() => {
      result.current.send("Hello");
    });
    await waitFor(() => expect(result.current.pendingMessages.length).toBe(2));

    const canonical = {
      id: "conv-1",
      workspace_id: "ws",
      agent_id: "ag",
      record_id: null,
      title: null,
      status: "active" as const,
      conversation_metadata: {},
      created_at: "",
      updated_at: "",
      ended_at: null,
      message_count: 0,
      messages: [],
    };
    const merged = result.current.mergeMessages(canonical);
    expect(merged.length).toBe(2);
    expect(merged[0].role).toBe("user");
    expect(merged[1].role).toBe("assistant");
  });
});
