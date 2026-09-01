import { describe, it, expect, beforeEach } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { api } from "@/lib/api";
import { serviceDeskApi } from "@/lib/service-desk-api";

/**
 * The shared axios client defaults to `Content-Type: application/json`, and
 * axios decides how to serialise the body from that header *before* it inspects
 * the body itself. A FormData posted under a JSON content type is quietly run
 * through `formDataToJSON` — the files vanish and the body leaves as
 * `{"files":{}}`, which the multipart endpoint answers with a 422.
 *
 * Tested here rather than through the ticket page: that suite mocks
 * `useServiceDesk` wholesale, so the request never reaches axios and the bug
 * survived it. This drives the real client with only the adapter stubbed.
 */
describe("serviceDeskApi.uploadFiles", () => {
  let sent: InternalAxiosRequestConfig;

  beforeEach(() => {
    const adapter: AxiosAdapter = async (config) => {
      sent = config as InternalAxiosRequestConfig;
      return { data: [], status: 201, statusText: "Created", headers: {}, config };
    };
    api.defaults.adapter = adapter;
  });

  const upload = () =>
    serviceDeskApi.uploadFiles("ws-1", "ticket-1", [
      new File(["hello"], "note.txt", { type: "text/plain" }),
    ]);

  it("sends the body as multipart, not JSON", async () => {
    await upload();
    const contentType =
      sent.headers["Content-Type"] ?? sent.headers["content-type"];
    expect(String(contentType)).toContain("multipart/form-data");
  });

  it("keeps the file on the body instead of serialising it away", async () => {
    await upload();
    expect(sent.data).toBeInstanceOf(FormData);
    const file = (sent.data as FormData).get("files");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("note.txt");
  });
});

/**
 * The call sites are no longer the only thing standing between a FormData and a
 * 422 — the client itself strips the JSON default off any multipart body. These
 * cover the interceptor directly, including the two ways it could regress: by
 * failing to leave an explicit multipart header alone, or by stripping the
 * content type off the ordinary JSON calls that make up most of the client.
 */
describe("api client FormData handling", () => {
  let sent: InternalAxiosRequestConfig;

  beforeEach(() => {
    const adapter: AxiosAdapter = async (config) => {
      sent = config as InternalAxiosRequestConfig;
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };
    api.defaults.adapter = adapter;
  });

  const form = () => {
    const fd = new FormData();
    fd.append("files", new File(["hello"], "note.txt", { type: "text/plain" }));
    return fd;
  };
  const contentType = () =>
    sent.headers["Content-Type"] ?? sent.headers["content-type"];

  it("keeps a FormData intact even when no header is named", async () => {
    await api.post("/anything", form());
    expect(sent.data).toBeInstanceOf(FormData);
    expect(String(contentType() ?? "")).not.toContain("application/json");
  });

  it("leaves an explicitly named multipart body alone", async () => {
    await api.post("/anything", form(), {
      headers: { "Content-Type": "multipart/form-data" },
    });
    expect(sent.data).toBeInstanceOf(FormData);
  });

  it("still sends ordinary payloads as JSON", async () => {
    await api.post("/anything", { hello: "world" });
    expect(String(contentType())).toContain("application/json");
    expect(sent.data).toBe(JSON.stringify({ hello: "world" }));
  });
});
