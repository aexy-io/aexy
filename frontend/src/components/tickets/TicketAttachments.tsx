"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Download, Loader2, X, Upload } from "lucide-react";
import { ticketsApi, TicketAttachment } from "@/lib/api";

// Keep in sync with backend TICKET_MAX_ATTACHMENT_MB (default 100).
const MAX_ATTACHMENT_MB = 100;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

function isImage(a: TicketAttachment): boolean {
  return (a.type?.startsWith("image/") ?? false) || IMAGE_EXT.test(a.filename || "");
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(size < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * One attachment. The download endpoint is auth-gated (Bearer token), so a
 * plain <img src> can't reach it — we fetch the blob through the API client
 * and render an object URL instead.
 */
function AttachmentItem({
  workspaceId,
  ticketId,
  attachment,
  onDeleted,
}: {
  workspaceId: string;
  ticketId: string;
  attachment: TicketAttachment;
  onDeleted: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let active = true;
    if (isImage(attachment) && attachment.id) {
      ticketsApi
        .downloadAttachment(workspaceId, ticketId, attachment.id)
        .then((blob) => {
          if (!active) return;
          // Not a download: the `src` of an inline image thumbnail. Released by
          // this effect's cleanup below.
          // eslint-disable-next-line no-restricted-syntax
          url = URL.createObjectURL(blob);
          setObjectUrl(url);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [workspaceId, ticketId, attachment]);

  const open = async () => {
    if (!attachment.id) return;
    const blob = await ticketsApi.downloadAttachment(workspaceId, ticketId, attachment.id);
    // Not a download: this opens the file in a tab for viewing, which `saveBlob`
    // deliberately does not do. Already deferred the revoke, which is the half of
    // the rule that applies here.
    // eslint-disable-next-line no-restricted-syntax
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // Revoke after the tab has had a chance to load it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const remove = async () => {
    if (!attachment.id) return;
    setDeleting(true);
    try {
      await ticketsApi.deleteAttachment(workspaceId, ticketId, attachment.id);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="group relative">
      {isImage(attachment) ? (
        <button
          onClick={open}
          className="block h-28 w-28 overflow-hidden rounded-lg border border-border bg-background"
          title={attachment.filename}
        >
          {objectUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={objectUrl} alt={attachment.filename} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          )}
        </button>
      ) : (
        <button
          onClick={open}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition hover:bg-muted"
        >
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-[12rem] truncate">{attachment.filename || "Attachment"}</span>
          {attachment.size ? (
            <span className="text-xs text-muted-foreground">{formatBytes(attachment.size)}</span>
          ) : null}
          <Download className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      <button
        onClick={remove}
        disabled={deleting}
        className="absolute -right-2 -top-2 hidden rounded-full bg-red-600 p-1 text-white group-hover:block disabled:opacity-50"
        title="Delete attachment"
      >
        {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
      </button>
    </div>
  );
}

export function TicketAttachments({
  workspaceId,
  ticketId,
  attachments,
  onChanged,
}: {
  workspaceId: string;
  ticketId: string;
  attachments: TicketAttachment[];
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const tooBig = files.find((f) => f.size > MAX_ATTACHMENT_MB * 1024 * 1024);
    if (tooBig) {
      setError(`"${tooBig.name}" exceeds the ${MAX_ATTACHMENT_MB} MB limit.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await ticketsApi.uploadAttachments(workspaceId, ticketId, files);
      onChanged();
    } catch {
      setError("Failed to upload. Check that file storage is configured.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="bg-muted rounded-xl border border-border p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Paperclip className="h-5 w-5" />
          Attachments
        </h2>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition hover:bg-background disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={onPick} />
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {attachments.map((a, i) => (
            <AttachmentItem
              key={a.id || i}
              workspaceId={workspaceId}
              ticketId={ticketId}
              attachment={a}
              onDeleted={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}
