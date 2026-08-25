"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Download,
  FileText,
  GitBranch,
  Loader2,
  Mail,
  Paperclip,
  Scissors,
  Send,
  Upload,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { QuotedBody } from "@/components/service-desk/QuotedBody";

import {
  useServiceDeskTicket,
  useServiceDeskMutations,
  useServiceDeskSettings,
  useServiceDeskTaxonomy,
  useAccounts,
  useProducts,
} from "@/hooks/useServiceDesk";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { PendingWith, RequestType, TicketAttachment } from "@/lib/service-desk-api";
import {
  getStatusColor,
  SERVICE_DESK_BREACH_COLORS,
  serviceDeskStakeholderColor,
  TICKET_STATUS_COLORS,
} from "@/lib/statusColors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

// Kept in step with `_ADDRESS_RE` in backend/src/aexy/schemas/service_desk.py —
// the server is the authority, this only spares the sender a round trip.
const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]{2,}$/;

/**
 * The subject as the desk will send it — mirrors `force_ticket_id_into_subject`.
 *
 * The id is prefixed only when this ticket's own is absent, so a sender who
 * already typed "Re: SD-41 …" does not see it doubled in the confirmation.
 */
function subjectWithTicketId(subject: string, displayId: string): string {
  const already = new RegExp(`${displayId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return already.test(subject) ? subject : `[${displayId}] ${subject}`;
}

function fmtDays(seconds: number): string {
  const d = seconds / 86400;
  if (d >= 1) return `${d.toFixed(1)}d`;
  const h = seconds / 3600;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.max(0, Math.round(seconds / 60))}m`;
}

export default function ServiceDeskTicketDetailPage() {
  const t = useTranslations("serviceDesk");
  const router = useRouter();
  const params = useParams();
  const ticketId = params.ticketId as string;

  const { data: ticket, isLoading } = useServiceDeskTicket(ticketId);
  const {
    changePendingWith,
    convertToTask,
    downloadAttachment,
    splitDetectedIssues,
    updateTicket,
    emailStakeholder,
    uploadFiles,
    deleteUpload,
    downloadUpload,
  } = useServiceDeskMutations();
  const { currentWorkspace } = useWorkspace();
  const { projects } = useProjects(currentWorkspace?.id ?? null);
  const { data: settings } = useServiceDeskSettings();
  const { stakeholders, assignableStakeholders, requestTypes, stakeholderLabel, requestTypeLabel } =
    useServiceDeskTaxonomy();
  const terms = settings?.terminology ?? {};
  const { data: products } = useProducts();
  const { data: accounts } = useAccounts();
  const { members } = useWorkspaceMembers(currentWorkspace?.id ?? null);

  const [target, setTarget] = useState<PendingWith | "">("");
  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState("");
  // Who the converted task lands on. The Log-ticket dialog has always asked,
  // and this one didn't — so the same action produced an assigned task from one
  // screen and an unowned one from the other, and the unowned ones sat in the
  // backlog until somebody noticed them.
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  // Where the ticket goes once the work sits on a board. Pre-filled from what the
  // board routes to and overridable — an automatic move nobody saw is how tickets
  // end up somewhere their owner cannot account for. `null` means untouched by
  // the operator, so the board's own answer still applies.
  const [convertPendingWith, setConvertPendingWith] = useState<string | null>(null);
  const [selectedIssueIndexes, setSelectedIssueIndexes] = useState<number[]>([]);
  // Only the fields the KAM has actually touched. Anything absent keeps whatever
  // the ticket already holds, so a background refetch never fights the form.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [mailTo, setMailTo] = useState("");
  // Chips rather than a comma-separated string. The addresses are prefilled from
  // the thread now, so the common act is removing one — and picking a name out of
  // a run-on line to delete exactly its comma is not something to ask of somebody
  // about to send mail to a customer.
  const [mailCc, setMailCc] = useState<string[]>([]);
  const [ccDraft, setCcDraft] = useState("");
  // Whether the Cc currently on screen is the thread's own chain rather than
  // addresses the sender chose. Only the former may be dropped automatically.
  const [ccFromChain, setCcFromChain] = useState(false);
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailFiles, setMailFiles] = useState<string[]>([]);
  const [mailUploadIds, setMailUploadIds] = useState<string[]>([]);
  const [mailMoves, setMailMoves] = useState(true);
  // Which ticket the compose box has been filled in for. Filling it once, rather
  // than whenever the ticket data arrives, is what stops a background refetch
  // overwriting a half-written reply.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  // A send cannot be undone once Gmail accepts it, and the recipient list holds
  // partners and insurers side by side, so the last guard against a misdirected
  // email is showing exactly what is about to leave and to whom.
  const [confirming, setConfirming] = useState(false);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!ticket) return <div className="p-6 text-muted-foreground">Not found.</div>;

  // Reply-all, the way a mail client does it: the box opens addressed to whoever
  // wrote in last, with everyone else on the conversation already copied. Before
  // this, answering from the ticket reached one address out of five and the rest
  // of the chain never saw the reply.
  //
  // Adjusted during render rather than in an effect — React's own answer for
  // "reset state when the thing it describes changes". Remembering which ticket
  // it was done for is what makes it happen once: run it on every render and a
  // background refetch would overwrite a half-written reply.
  if (prefilledFor !== ticketId) {
    setPrefilledFor(ticketId);
    const chain = ticket.reply_all?.cc ?? [];
    setMailTo(ticket.reply_all?.to ?? ticket.requester_email ?? "");
    setMailCc(chain);
    setCcFromChain(chain.length > 0);
    setMailSubject(ticket.subject ?? "");
  }

  // Write authority as the server computed it for this caller — manager, the
  // assigned owner, or a member of the queue the ticket is pending with. The
  // rule lives only in the backend (can_edit_ticket); the UI must not re-derive it.
  const canEdit = ticket.can_edit;

  const mailToClean = mailTo.trim().toLowerCase();
  const mailKnown = ticket.email_recipients.find((r) => r.email.toLowerCase() === mailToClean);
  const mailStageRaw = mailKnown?.stage ?? null;
  // Already there? Then there is nothing to move and no choice to offer.
  const mailStage = mailStageRaw && mailStageRaw !== ticket.pending_with ? mailStageRaw : null;
  // What a reply to this thread would be addressed to, used to tell "the sender
  // redirected this message" from "the sender is answering the thread".
  // Read defensively: a payload cached by React Query from before this shipped
  // has no `reply_all`, and a compose box that throws is worse than one that
  // falls back to answering the requester, which is what it did before.
  const chainTo = (ticket.reply_all?.to ?? ticket.requester_email ?? "").toLowerCase();
  const chainCc = ticket.reply_all?.cc ?? [];
  // Addresses are validated as they are added, so the only thing that can still
  // be wrong is what is left in the box. Split the same way committing does — a
  // list pasted from a mail client arrives as one string and is not one bad
  // address. The send is irreversible and a typo in Cc is silent, so anything
  // still wrong blocks rather than being dropped quietly.
  const ccPending = ccDraft.split(/[,;\s]+/).map((value) => value.trim()).filter(Boolean);
  const ccInvalid = ccPending.some((value) => !EMAIL_RE.test(value));
  // The ticket's files, split by where they came from. A file somebody here
  // uploaded to send did not arrive on the request, and listing it there would
  // tell a later reader the customer had sent it.
  // Same reason for the default: a file from a payload that predates `source`
  // arrived by email, which is the only kind that existed then.
  const emailedFiles = ticket.attachments.filter((file) => file.source !== "upload");
  const uploadedFiles = ticket.attachments.filter((file) => file.source === "upload");
  // Everything that will actually be attached, both kinds together — the panel's
  // job is to show what leaves, not how the desk got hold of it.
  const confirmFiles = [
    ...mailFiles,
    ...uploadedFiles
      .filter((file) => mailUploadIds.includes(file.id ?? ""))
      .map((file) => file.filename),
  ];
  // Offered when the thread has a chain and the box no longer matches it — after
  // a removal, or after the sender redirected the message and came back.
  const canRestoreChain =
    chainCc.length > 0 &&
    (mailTo.trim().toLowerCase() !== chainTo ||
      chainCc.some((address) => !mailCc.includes(address)));
  // The confirmation panel's whole job is showing exactly what will leave, so it
  // has to apply the server's rule rather than assume the prefix is always
  // added: an id the sender already typed is not repeated.
  const mailSubjectSent = ticket.display_id
    ? subjectWithTicketId(mailSubject.trim(), ticket.display_id)
    : mailSubject.trim();

  // What the chosen board resolves to, straight off the project list — the
  // server already computes it there, so the dialog needs no extra request.
  const convertBoard = projects.find((p: { id: string }) => p.id === projectId);
  const boardBucket = convertBoard?.desk_stakeholder_slug ?? "";
  const boardRoutes = Boolean(projectId) && !boardBucket;
  const pendingWithChoice = convertPendingWith ?? boardBucket;

  const currentSh = stakeholders.find((x) => x.slug === ticket.pending_with);
  const pc = serviceDeskStakeholderColor(ticket.pending_with, {
    position: currentSh?.position,
    semantics: currentSh?.semantics,
  });
  const bc = SERVICE_DESK_BREACH_COLORS[ticket.tat.breach_level];
  const sc = getStatusColor(TICKET_STATUS_COLORS, ticket.status ?? "new");
  const detectedIssues = ticket.detected_issues ?? [];
  const splitDoneIndexes = new Set(ticket.split_done_indexes ?? []);

  const apply = async () => {
    if (!target) return;
    await changePendingWith.mutateAsync({ id: ticketId, pending_with: target, note: note || undefined });
    setTarget("");
    setNote("");
  };

  const pick = (key: string, current: string | null | undefined) =>
    draft[key] !== undefined ? draft[key] : current ?? "";

  const saveFields = async () => {
    const payload: Record<string, string | null | boolean> = {};
    Object.entries(draft).forEach(([key, value]) => { payload[key] = value === "" ? null : value; });
    // Saving IS the triage: the KAM has just confirmed the product, the request
    // type and the owner, which is exactly what the flag was asking for.
    if (ticket.needs_triage) payload.needs_triage = false;
    await updateTicket.mutateAsync({ id: ticketId, data: payload });
    setDraft({});
  };

  const sendMail = async () => {
    if (!mailTo || !mailSubject.trim() || !mailBody.trim() || ccInvalid) return;
    const updated = await emailStakeholder.mutateAsync({
      id: ticketId,
      data: {
        to: mailTo.trim(),
        cc: mailCc,
        subject: mailSubject.trim(),
        body: mailBody.trim(),
        attachment_filenames: mailFiles,
        attachment_ids: mailUploadIds,
        move_ticket: mailMoves,
      },
    });
    // Re-seeded from what the send returned, not by asking for a re-prefill: the
    // reply just sent is part of the thread, and anyone the sender added by hand
    // is on it from now on. Waiting for the background refetch instead would
    // re-seed from the copy that predates this very message.
    const chain = updated?.reply_all?.cc ?? [];
    setMailTo(updated?.reply_all?.to ?? updated?.requester_email ?? "");
    setMailCc(chain);
    setCcFromChain(chain.length > 0);
    setCcDraft("");
    setMailSubject(updated?.subject ?? "");
    setMailBody("");
    setMailFiles([]);
    setMailUploadIds([]);
    setConfirming(false);
  };

  /** Add whatever is in the Cc box, however many addresses were pasted in. */
  const commitCcDraft = () => {
    const candidates = ccDraft
      .split(/[,;\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (candidates.length === 0) return;
    // A malformed one is left in the box rather than dropped, where it keeps
    // the error visible and blocks the send until it is fixed.
    if (candidates.some((value) => !EMAIL_RE.test(value))) return;
    setMailCc((current) => [...current, ...candidates.filter((v) => !current.includes(v))]);
    // Anything typed by hand is the sender's own choice, so redirecting the
    // message may no longer drop the list wholesale.
    setCcFromChain(false);
    setCcDraft("");
    setConfirming(false);
  };

  const removeCc = (address: string) => {
    setMailCc((current) => current.filter((value) => value !== address));
    setConfirming(false);
  };

  const restoreChain = () => {
    setMailTo(ticket.reply_all?.to ?? ticket.requester_email ?? "");
    setMailCc((current) => [...current, ...chainCc.filter((v) => !current.includes(v))]);
    setCcFromChain(true);
    setConfirming(false);
  };

  const changeMailTo = (value: string) => {
    setMailTo(value);
    setConfirming(false);
    // Redirecting the reply must not carry the first party's chain along with it.
    // Copying a partner's colleagues onto a message to an insurer is a
    // disclosure, and one the sender never asked for — the confirmation panel
    // would show it only after they had stopped reading.
    if (ccFromChain && value.trim().toLowerCase() !== chainTo) {
      setMailCc([]);
      setCcFromChain(false);
    }
  };

  const toggleMailFile = (name: string, checked: boolean) =>
    setMailFiles((current) =>
      checked ? [...current, name] : current.filter((value) => value !== name),
    );

  const toggleMailUpload = (id: string, checked: boolean) =>
    setMailUploadIds((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );

  const chooseFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    uploadFiles.mutate(
      { id: ticketId, files: Array.from(files) },
      {
        // Uploading one is the act of choosing it — an upload that then had to be
        // ticked would be a file the sender believes is attached and is not.
        onSuccess: (created) =>
          setMailUploadIds((current) => [
            ...current,
            ...created.map((file) => file.id).filter((id): id is string => Boolean(id)),
          ]),
      },
    );
    setConfirming(false);
  };

  const quoteRequest = () => {
    const from = ticket.requester_name || ticket.requester_email || "";
    setMailBody(
      (current) =>
        `${current}${current ? "\n\n" : ""}--- Original request from ${from} ---\n${ticket.body ?? ""}`,
    );
  };

  const toggleIssue = (index: number, checked: boolean) => {
    setSelectedIssueIndexes((current) => (
      checked
        ? [...current, index].sort((a, b) => a - b)
        : current.filter((value) => value !== index)
    ));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <button onClick={() => router.push("/service-desk")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("detail.back")}
      </button>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">{ticket.display_id}</h1>
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${sc.bg} ${sc.text}`}>
            {ticket.status}
          </span>
          {ticket.needs_triage && <Badge variant="outline" className="text-amber-600">{t("detail.needsTriage")}</Badge>}
          {!canEdit && <Badge variant="secondary">{t("detail.readOnly")}</Badge>}
        </div>
        <p className="break-words text-muted-foreground">{ticket.subject ?? "—"}</p>
      </div>

      {/*
        Two columns from `lg` up, one below it. The rail is declared between the
        request and the working surface so that on a phone — where the grid
        collapses to a single column — the fields, the clock and the stage
        controls land directly under the request, rather than below a
        correspondence thread that can run for pages. On a wide screen it moves
        into the third column and spans both rows, keeping those same controls in
        view while the owner reads the request and writes a reply.
      */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* ---------------------------------------------------- the request */}
        <div className="space-y-4 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          {/* Without this an owner cannot see what they are being asked to pass
              on to a vendor, which is the desk's core job. */}
          {/* One thread, oldest first: the request that opened the ticket, then
              every reply either way.

              These were two cards. The request is the first email and each
              reply is another, so splitting them meant reading a conversation
              across two boxes with different shapes — and the request, which
              carries the quoted history and the attachments, looked like
              something other than a message. Same entry shape throughout, so
              the thread reads top to bottom. */}
          {(ticket.body || emailedFiles.length > 0 || ticket.correspondence.length > 0) && (
            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Mail className="h-4 w-4" /> {t("detail.correspondence")}
              </div>
              <ol className="space-y-3">
              {(ticket.body || emailedFiles.length > 0) && (
              <li className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all text-sm font-medium">
                    {ticket.requester_email || ticket.requester_name || t("detail.unknownSender")}
                  </span>
                  <Badge variant="secondary">{t("detail.incoming")}</Badge>
                  {/* Marks which entry opened the ticket — without it the first
                      message is indistinguishable from a later reply. */}
                  <Badge variant="outline" className="text-[10px]">{t("detail.request")}</Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(ticket.created_at).toLocaleString()}
                </div>
              {ticket.body && <QuotedBody body={ticket.body} />}
              {emailedFiles.length > 0 && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" /> {t("detail.attachments")}
                  </div>
                  {/* A row per file, with the bytes one click away. These were
                      plain text before, which told a KAM that a claim register
                      had arrived and gave them no way to open it — the ticket
                      could not be worked without going back to the mailbox. */}
                  <ul className="space-y-2">
                    {emailedFiles.map((file) => (
                      <AttachmentRow
                        key={file.index ?? file.filename}
                        file={file}
                        downloading={
                          downloadAttachment.isPending &&
                          downloadAttachment.variables?.index === file.index
                        }
                        onDownload={() =>
                          downloadAttachment.mutate({
                            id: ticketId,
                            index: file.index ?? 0,
                            filename: file.filename,
                          })
                        }
                        size={fmtBytes(file.size_bytes)}
                        downloadLabel={t("detail.download")}
                        downloadingLabel={t("detail.downloading")}
                        unavailableLabel={t("detail.attachmentUnavailable")}
                      />
                    ))}
                  </ul>
                </div>
              )}
              </li>
              )}

              {/* Replies, in the order they happened. */}
              {ticket.correspondence.map((entry) => (
                <li key={entry.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all text-sm font-medium">{entry.author_email || t("detail.unknownSender")}</span>
                    <Badge variant={entry.direction === "outgoing" ? "default" : "secondary"}>
                      {entry.direction === "outgoing" ? t("detail.outgoing") : t("detail.incoming")}
                    </Badge>
                    {entry.direction === "outgoing" && entry.author_name && (
                      <span className="text-xs text-muted-foreground">
                        {t("detail.sentBy", { name: entry.author_name })}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</div>
                  <QuotedBody body={entry.content} />
                </li>
              ))}
              </ol>
            </Card>
          )}

          {canEdit && detectedIssues.length > 1 && (
            <Card className="space-y-3 p-4">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Scissors className="h-4 w-4" /> {t("detail.detectedIssues")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("detail.detectedIssuesHint")}</p>
              </div>
              <div className="space-y-2">
                {detectedIssues.map((issue, offset) => {
                  const index = offset + 1;
                  const isPrimary = index === 1;
                  const isDone = splitDoneIndexes.has(index);
                  return (
                    <label key={index} className="flex gap-3 rounded-md border border-border p-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        aria-label={`${t("detail.selectIssue")} ${index}`}
                        checked={selectedIssueIndexes.includes(index)}
                        disabled={isPrimary || isDone || splitDetectedIssues.isPending}
                        onChange={(event) => toggleIssue(index, event.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{issue.summary}</span>
                          {isPrimary && <Badge variant="secondary">{t("detail.primaryIssue")}</Badge>}
                          {isDone && <Badge variant="secondary">{t("detail.alreadySplit")}</Badge>}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {requestTypeLabel(issue.request_type)}
                          {issue.product ? ` · ${issue.product}` : ""}
                          {` · ${Math.round(issue.confidence * 100)}% ${t("detail.confidence")}`}
                        </span>
                        {issue.split_reason && (
                          <span className="mt-1 block text-xs text-muted-foreground">{issue.split_reason}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={selectedIssueIndexes.length === 0 || splitDetectedIssues.isPending}
                  onClick={() => splitDetectedIssues.mutate(
                    { id: ticketId, issue_indexes: selectedIssueIndexes },
                    { onSuccess: () => setSelectedIssueIndexes([]) },
                  )}
                >
                  {splitDetectedIssues.isPending ? t("detail.splitting") : t("detail.splitIntoTickets")}
                </Button>
                {splitDetectedIssues.isError && (
                  <span className="text-sm text-destructive">{t("detail.splitFailed")}</span>
                )}
              </div>
              {splitDetectedIssues.data && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{t("detail.createdTickets")}</span>
                  {splitDetectedIssues.data.created_ticket_ids.map((id, index) => (
                    <Button
                      key={id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/service-desk/tickets/${id}`)}
                    >
                      {splitDetectedIssues.data.created_ticket_display_ids[index] ?? id}
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* ------------------------------------- the rail: fields, clock, stage */}
        <aside className="space-y-4 lg:col-start-3 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-6">
          {/* Fields — auto-filled where a rule could, editable everywhere */}
          <Card className="space-y-4 p-4">
            <div className="text-sm font-semibold">{t("detail.details")}</div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
              <Field label={t("detail.requester")} value={ticket.requester_name || ticket.requester_email || "—"} />
              <Field
                label={t("detail.pendingWith")}
                value={<span className={`inline-flex rounded px-1.5 py-0.5 text-xs ${pc?.bg} ${pc?.text}`}>{stakeholderLabel(ticket.pending_with)}</span>}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <Picker
                label={t("detail.requestType")}
                value={pick("request_type", ticket.request_type)}
                onChange={(v) => setDraft((d) => ({ ...d, request_type: v }))}
                disabled={!canEdit}
                options={requestTypes.map((o) => ({ value: o.slug, label: o.label }))}
              />
              <Picker
                label={terms.product ?? t("detail.product")}
                value={pick("product_id", ticket.product_id)}
                onChange={(v) => setDraft((d) => ({ ...d, product_id: v }))}
                placeholder={t("manual.none")}
                disabled={!canEdit}
                options={(products ?? []).map((x) => ({ value: x.id, label: x.name }))}
              />
              <Picker
                label={terms.account ?? t("detail.account")}
                value={pick("account_id", ticket.account_id)}
                onChange={(v) => setDraft((d) => ({ ...d, account_id: v }))}
                placeholder={t("manual.none")}
                disabled={!canEdit}
                options={(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))}
              />
              <Picker
                label={terms.owner ?? t("detail.assignedOwner")}
                value={pick("assigned_owner_id", ticket.assigned_owner_id)}
                onChange={(v) => setDraft((d) => ({ ...d, assigned_owner_id: v }))}
                placeholder={t("manual.none")}
                disabled={!canEdit}
                options={(members ?? [])
                  .filter((m) => m.status === "active")
                  .map((m) => ({
                    value: m.developer_id,
                    label: m.developer_name || m.developer_email || m.developer_id,
                  }))}
              />
            </div>

            {/* Why this ticket has the owner it has. Intake has always recorded
                the reason and nothing ever showed it, so a ticket on the wrong
                KAM looked exactly like a deliberate assignment — and "routing is
                not following our master data" could not be answered from the
                ticket that prompted it. */}
            {ticket.assignment_note && (
              <div className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t("detail.whyThisOwner")}</span>{" "}
                <span className="break-words">{ticket.assignment_note}</span>
              </div>
            )}

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Saving IS the triage, so a flagged ticket must be savable even with
                    nothing edited. When the model already got everything right the owner
                    has nothing to change, and without this there is no way to confirm
                    it and the flag stays on forever. */}
                <Button
                  size="sm"
                  disabled={
                    (Object.keys(draft).length === 0 && !ticket.needs_triage) ||
                    updateTicket.isPending
                  }
                  onClick={saveFields}
                >
                  {updateTicket.isPending
                    ? t("templates.saving")
                    : Object.keys(draft).length === 0 && ticket.needs_triage
                      ? t("detail.confirmTriage")
                      : t("templates.save")}
                </Button>
                {updateTicket.isError && (
                  <span className="text-sm text-destructive">{t("detail.saveFailed")}</span>
                )}
              </div>
            )}
          </Card>

          {/* TAT — the three tiles that used to sit mid-page, where the numbers
              a desk is measured on scrolled past unread. */}
          <Card className="space-y-3 p-4">
            <div className="text-sm font-semibold">{t("detail.turnaround")}</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">{t("detail.overallTat")}</div>
                <div className="text-lg font-semibold">{ticket.tat.overall_days}d</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t("detail.currentStage")}</div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{ticket.tat.current_stage_days}d</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${bc?.dot}`} />
                </div>
              </div>
            </div>
            <div className="space-y-0.5 border-t border-border pt-3">
              <div className="mb-1 text-xs text-muted-foreground">{t("detail.stakeholderTat")}</div>
              {Object.entries(ticket.tat.stakeholder_seconds).map(([k, secs]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span>{stakeholderLabel(k)}</span>
                  <span className="text-muted-foreground">{fmtDays(secs)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Stage and hand-off. Two cards before this, each mostly empty — they
              are the same decision ("this is no longer mine") taken two ways. */}
          {canEdit && (
            <Card className="space-y-4 p-4">
              <div className="text-sm font-semibold">{t("detail.actions")}</div>

              <div className="space-y-2">
                <label className="block text-xs text-muted-foreground">{t("detail.changeTo")}</label>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value as PendingWith)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {assignableStakeholders
                    .filter((o) => o.slug !== ticket.pending_with)
                    .map((o) => (
                      <option key={o.slug} value={o.slug}>{o.label}</option>
                    ))}
                </select>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("detail.note")} />
                <Button className="w-full" onClick={apply} disabled={!target || changePendingWith.isPending}>
                  {t("detail.apply")}
                </Button>
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5" /> {t("detail.convertToTask")}
                </div>
                {ticket.linked_task_id ? (
                  <Badge variant="secondary">{t("detail.linkedToTask")}</Badge>
                ) : (
                  <>
                    <select
                      value={projectId}
                      data-testid="convert-project"
                      onChange={(e) => setProjectId(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">{t("detail.selectProject")}</option>
                      {projects.map((p: { id: string; name: string }) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select
                      value={taskAssigneeId}
                      data-testid="convert-assignee"
                      disabled={!projectId}
                      onChange={(e) => setTaskAssigneeId(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                    >
                      <option value="">{t("manual.taskUnassigned")}</option>
                      {(members ?? [])
                        .filter((m) => m.status === "active")
                        .map((m) => (
                          <option key={m.developer_id} value={m.developer_id}>
                            {m.developer_name || m.developer_email || m.developer_id}
                          </option>
                        ))}
                    </select>
                    <select
                      value={pendingWithChoice}
                      data-testid="convert-pending-with"
                      disabled={!projectId}
                      onChange={(e) => setConvertPendingWith(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                    >
                      <option value="">{t("detail.convertPendingWithNone")}</option>
                      {assignableStakeholders
                        .filter((o) => o.semantics === "internal")
                        .map((o) => (
                          <option key={o.slug} value={o.slug}>
                            {t("detail.convertPendingWith")}: {o.label}
                          </option>
                        ))}
                    </select>
                    {/* Said here rather than discovered afterwards: a board with no
                        department resolves to nothing, and a routing feature that
                        quietly does nothing is the complaint this answers. */}
                    {boardRoutes && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {t("detail.convertNoRouting")}
                      </p>
                    )}
                    <Button
                      className="w-full"
                      disabled={!projectId || convertToTask.isPending}
                      onClick={() =>
                        convertToTask.mutate({
                          id: ticketId,
                          data: {
                            project_id: projectId,
                            assignee_id: taskAssigneeId || undefined,
                            pending_with: pendingWithChoice || undefined,
                          },
                        })
                      }
                    >
                      {convertToTask.isPending ? t("detail.converting") : t("detail.convert")}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )}
        </aside>

        {/* ------------------------------- writing out, and what has been said */}
        <div className="space-y-4 lg:col-span-2 lg:col-start-1 lg:row-start-2">
          {/* Outbound stakeholder email — sent as the watched mailbox, never a KAM's own inbox */}
          {canEdit && (
            <Card className="space-y-3 p-4">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Send className="h-4 w-4" /> {t("detail.emailStakeholder")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("detail.emailStakeholderHint")}</p>
              </div>

              {/* Said before anything is typed, not after a send fails: a ticket
                  logged by phone, or one on a webhook mailbox, has no connected
                  account to send from and the server refuses. */}
              {!ticket.can_send_email && (
                <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs">
                  {t("detail.emailNoMailbox")}
                </p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Free text with the configured addresses as suggestions: a desk
                    often has to loop in someone Master Data has never heard of, and
                    the alternative was answering them from a personal inbox. */}
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("detail.emailTo")}</label>
                  <Input
                    type="email"
                    list="sd-email-recipients"
                    value={mailTo}
                    placeholder={t("detail.emailRecipientPlaceholder")}
                    onChange={(e) => changeMailTo(e.target.value)}
                  />
                  <datalist id="sd-email-recipients">
                    {ticket.email_recipients.map((r) => (
                      <option key={r.email} value={r.email}>{r.label}</option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("detail.emailSubject")}</label>
                  <Input value={mailSubject} onChange={(e) => { setMailSubject(e.target.value); setConfirming(false); }} />
                </div>
              </div>

              {/* One click for the addresses the ticket already knows — the old
                  dropdown's whole job — without shutting out any other address. */}
              {ticket.email_recipients.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{t("detail.emailKnownRecipients")}</span>
                  {ticket.email_recipients.map((r) => (
                    <button
                      key={r.email}
                      type="button"
                      onClick={() => changeMailTo(r.email)}
                      className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                        r.email.toLowerCase() === mailToClean
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {r.label} — {r.email}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("detail.emailCc")}</label>
                {/* Everyone already on the thread, each one removable. This is
                    the whole of "reply all, then take somebody off". */}
                {mailCc.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {mailCc.map((address) => (
                      <span
                        key={address}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs"
                      >
                        <span className="break-all">{address}</span>
                        <button
                          type="button"
                          onClick={() => removeCc(address)}
                          aria-label={t("detail.emailCcRemove", { email: address })}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Input
                  value={ccDraft}
                  placeholder={t("detail.emailCcPlaceholder")}
                  onChange={(e) => { setCcDraft(e.target.value); setConfirming(false); }}
                  // Enter and comma both commit, as they do in a mail client.
                  // Blur too: an address left in the box when somebody moves on
                  // to the message is one they meant to add.
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === ";") {
                      e.preventDefault();
                      commitCcDraft();
                    }
                  }}
                  onBlur={commitCcDraft}
                />
                {ccInvalid && (
                  <p className="mt-1 text-xs text-destructive">{t("detail.emailCcInvalid")}</p>
                )}
                {canRestoreChain && (
                  <button
                    type="button"
                    onClick={restoreChain}
                    className="mt-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    {t("detail.emailReplyAll")}
                  </button>
                )}
              </div>

              {mailToClean && !mailKnown && (
                <p className="text-xs text-muted-foreground">{t("detail.emailCustomRecipient")}</p>
              )}
              <textarea
                value={mailBody}
                onChange={(e) => { setMailBody(e.target.value); setConfirming(false); }}
                rows={5}
                placeholder={t("detail.emailBody")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              {ticket.body && (
                <Button type="button" variant="outline" size="sm" onClick={quoteRequest}>
                  {t("detail.emailQuoteRequest")}
                </Button>
              )}

              {/* Files default to unselected. Forwarding a partner's register to an
                  insurer is a disclosure, so it must be an explicit choice each time. */}
              {emailedFiles.some((f) => f.can_forward) && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" /> {t("detail.emailAttach")}
                  </div>
                  {emailedFiles.filter((f) => f.can_forward).map((file) => (
                    <label key={file.index} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={mailFiles.includes(file.filename)}
                        onChange={(e) => { toggleMailFile(file.filename, e.target.checked); setConfirming(false); }}
                      />
                      <span className="min-w-0 break-all">{file.filename}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmtBytes(file.size_bytes)}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* A file from the sender's own machine. Without this the only file
                  the desk could send was one that had already arrived, so
                  answering with a completed form meant leaving Aexy for a
                  personal mailbox — and that reply left the record entirely. */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Upload className="h-3.5 w-3.5" /> {t("detail.emailUpload")}
                </div>
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={mailUploadIds.includes(file.id ?? "")}
                      onChange={(e) => { toggleMailUpload(file.id ?? "", e.target.checked); setConfirming(false); }}
                    />
                    <button
                      type="button"
                      className="min-w-0 break-all text-left underline underline-offset-2 hover:text-foreground"
                      onClick={() =>
                        downloadUpload.mutate({
                          id: ticketId,
                          attachmentId: file.id ?? "",
                          filename: file.filename,
                        })
                      }
                    >
                      {file.filename}
                    </button>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtBytes(file.size_bytes)}</span>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={t("detail.emailUploadRemove", { filename: file.filename })}
                      disabled={deleteUpload.isPending}
                      onClick={() => {
                        toggleMailUpload(file.id ?? "", false);
                        deleteUpload.mutate({ id: ticketId, attachmentId: file.id ?? "" });
                      }}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    disabled={uploadFiles.isPending}
                    onChange={(e) => { chooseFiles(e.target.files); e.target.value = ""; }}
                  />
                  {uploadFiles.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" aria-hidden />
                  )}
                  <span className="underline underline-offset-2">
                    {uploadFiles.isPending ? t("detail.emailUploading") : t("detail.emailChooseFile")}
                  </span>
                </label>
              </div>

              {/* Sending is usually the hand-off, so the stage follows the recipient.
                  Untick when the mail is an update rather than a request. */}
              {mailStage && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={mailMoves}
                    onChange={(e) => { setMailMoves(e.target.checked); setConfirming(false); }}
                  />
                  <span>
                    {t("detail.emailMoveStage", {
                      stage: stakeholderLabel(mailStage),
                    })}
                  </span>
                </label>
              )}

              {confirming && (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                  <div className="font-medium">{t("detail.emailConfirmTitle")}</div>
                  <div className="mt-1 text-muted-foreground">{t("detail.emailConfirmHint")}</div>
                  <div className="mt-2 space-y-0.5 break-words">
                    <div><span className="text-muted-foreground">{t("detail.emailTo")}: </span>{mailTo.trim()}</div>
                    <div>
                      <span className="text-muted-foreground">{t("detail.emailCc")}: </span>
                      {mailCc.length ? mailCc.join(", ") : t("detail.emailCcNone")}
                    </div>
                    <div><span className="text-muted-foreground">{t("detail.emailSubject")}: </span>{mailSubjectSent}</div>
                    <div>
                      <span className="text-muted-foreground">{t("detail.emailAttach")}: </span>
                      {confirmFiles.length ? confirmFiles.join(", ") : t("detail.emailNoAttachments")}
                    </div>
                    {mailStage && mailMoves && (
                      <div>
                        <span className="text-muted-foreground">{t("detail.changeTo")}: </span>
                        {stakeholderLabel(mailStage)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {confirming ? (
                  <>
                    <Button disabled={emailStakeholder.isPending} onClick={sendMail}>
                      {emailStakeholder.isPending ? t("detail.emailSending") : t("detail.emailConfirmSend")}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                      {t("detail.emailCancel")}
                    </Button>
                  </>
                ) : (
                  <Button
                    disabled={
                      !ticket.can_send_email ||
                      !mailTo.trim() ||
                      !mailSubject.trim() ||
                      !mailBody.trim() ||
                      ccInvalid ||
                      emailStakeholder.isPending
                    }
                    // An address still sitting in the Cc box is one the sender
                    // means to include — committing it here is what stops
                    // "review" showing a message without it.
                    onClick={() => { commitCcDraft(); setConfirming(true); }}
                  >
                    {t("detail.emailReview")}
                  </Button>
                )}
                {emailStakeholder.isError && (
                  <span className="text-sm text-destructive">{t("detail.emailFailed")}</span>
                )}
              </div>
            </Card>
          )}

          {/* Timeline */}
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-4 w-4" /> {t("detail.timeline")}</div>
            <ol className="space-y-3">
              {ticket.segments.map((s) => {
                const sh = stakeholders.find((x) => x.slug === s.pending_with);
                const c = serviceDeskStakeholderColor(s.pending_with, {
                  position: sh?.position,
                  semantics: sh?.semantics,
                });
                return (
                  <li key={s.id} className="flex gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${c?.dot ?? "bg-muted-foreground"}`} />
                    <div className="min-w-0 text-sm">
                      <div className="font-medium">{stakeholderLabel(s.pending_with)}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.entered_at).toLocaleString()}
                        {s.exited_at ? ` → ${new Date(s.exited_at).toLocaleString()}` : ` · ${t("detail.open")}`}
                        {s.duration_seconds != null && ` · ${fmtDays(s.duration_seconds)}`}
                      </div>
                      {s.note && <div className="break-words text-xs text-muted-foreground">{s.note}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function fmtBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * One file that arrived on the ticket, with its bytes one click away.
 *
 * The download label collapses to the icon alone on a narrow screen: a long
 * filename and a full-width button cannot both fit on a phone, and the filename
 * is the part that says which file this is.
 */
function AttachmentRow({
  file,
  size,
  downloading,
  onDownload,
  downloadLabel,
  downloadingLabel,
  unavailableLabel,
}: {
  file: TicketAttachment;
  size: string;
  downloading: boolean;
  onDownload: () => void;
  downloadLabel: string;
  downloadingLabel: string;
  unavailableLabel: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-border p-2.5">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={file.filename}>{file.filename}</div>
        {size && <div className="text-xs text-muted-foreground">{size}</div>}
      </div>
      {/* No provider handle means the bytes cannot be re-fetched at all — the
          same reason the file cannot be forwarded. Say so instead of offering a
          button that would only ever return an error. */}
      {file.can_forward ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={downloading}
          onClick={onDownload}
          aria-label={`${downloadLabel} ${file.filename}`}
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Download className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="ml-1.5 hidden sm:inline">
            {downloading ? downloadingLabel : downloadLabel}
          </span>
        </Button>
      ) : (
        <Badge variant="outline" className="shrink-0">{unavailableLabel}</Badge>
      )}
    </li>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
