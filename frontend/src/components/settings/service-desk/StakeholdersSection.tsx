"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  useServiceDeskMutations,
  useServiceDeskSettings,
  useServiceDeskTaxonomy,
} from "@/hooks/useServiceDesk";
import { useDepartments } from "@/hooks/useOrganization";
import { Stakeholder, StakeholderSemantics } from "@/lib/service-desk-api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

/**
 * Edit the buckets a ticket can be pending with.
 *
 * The backend has had full CRUD on this table since the `PendingWith` enum was
 * replaced, and nothing rendered it — so a workspace was stuck with whatever its
 * industry template seeded. A desk set up from the insurance template has KAM,
 * Insurer, Partner, Sales, Finance and Marketing, and no amount of clicking
 * could add Tech or Product. Which is also why converting a ticket to a task on
 * an engineering board had nowhere to move the ticket *to*.
 *
 * The server holds the invariants — one terminal bucket, the terminal bucket
 * cannot be retired or deleted, one claimant per master-data table, no deleting
 * a slug that tickets or TAT history still reference — and phrases each refusal
 * as a sentence. They surface as toasts rather than being re-implemented here:
 * two copies of a rule is how the copies come to disagree.
 */

/** Which department owns an internal bucket, chosen as a department, not a key.
 *
 * The stored value is a `function_key`, matched against `Department.function_key`
 * — so the two have to agree exactly or the bucket routes nowhere. Offering the
 * workspace's own departments makes that match by construction; a free key field
 * (or the org chart's function picker, which is happy to mint a brand-new key)
 * lets an admin save something no department answers to, and the only symptom is
 * a queue that stays empty.
 */
function DepartmentSelect({
  value,
  onChange,
  disabled,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string | null;
  onChange: (functionKey: string) => void;
  disabled?: boolean;
  options: { function_key: string; name: string }[];
  placeholder: string;
  /** The surrounding <label> is not tied to this select, so name it directly. */
  ariaLabel: string;
}) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {/* A bucket saved before its department was renamed can hold a key no
          current department claims. Kept as an option so the row renders what
          it actually holds instead of silently reading as unset. */}
      {value && !options.some((d) => d.function_key === value) && (
        <option value={value}>{value}</option>
      )}
      {options.map((d) => (
        <option key={d.function_key} value={d.function_key}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

function StakeholderRow({
  stakeholder,
  canManage,
  departments,
  onPatch,
  onDelete,
  onMove,
  isFirst,
  isLast,
}: {
  stakeholder: Stakeholder;
  canManage: boolean;
  departments: { function_key: string; name: string }[];
  onPatch: (data: Parameters<ReturnType<typeof useServiceDeskMutations>["updateStakeholder"]["mutate"]>[0]["data"]) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("serviceDesk");
  const [label, setLabel] = useState(stakeholder.label);
  const terminal = stakeholder.semantics === "closed";

  return (
    <div
      className="grid grid-cols-1 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm sm:grid-cols-[1fr_1fr_auto_auto]"
      data-testid={`stakeholder-row-${stakeholder.slug}`}
    >
      <div className="min-w-0">
        <Input
          value={label}
          disabled={!canManage}
          aria-label={t("stakeholders.label")}
          onChange={(event) => setLabel(event.target.value)}
          // Committed on blur, not per keystroke: a PATCH per character would
          // put a partial label in front of everyone reading the queue board.
          onBlur={() => {
            const next = label.trim();
            if (!next || next === stakeholder.label) {
              setLabel(stakeholder.label);
              return;
            }
            onPatch({ label: next });
          }}
          className="h-9"
        />
        {/* The slug, not the label, is what tickets and TAT segments store, so it
            is deliberately not editable — and shown, because it is what appears
            in exports and in the API. */}
        <code className="mt-1 block truncate text-[11px] text-muted-foreground">
          {stakeholder.slug}
        </code>
      </div>

      <div className="min-w-0">
        {terminal ? (
          <Badge variant="secondary" className="text-[10px]">
            {t("stakeholders.terminal")}
          </Badge>
        ) : stakeholder.semantics === "internal" ? (
          <DepartmentSelect
            value={stakeholder.function_key}
            disabled={!canManage}
            options={departments}
            placeholder={t("stakeholders.pickDepartment")}
            ariaLabel={t("stakeholders.department")}
            onChange={(functionKey) =>
              functionKey && onPatch({ function_key: functionKey })
            }
          />
        ) : (
          <select
            value={stakeholder.links_to ?? ""}
            disabled={!canManage}
            aria-label={t("stakeholders.linksTo")}
            onChange={(event) =>
              onPatch({
                links_to: (event.target.value || null) as Stakeholder["links_to"],
              })
            }
            className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
          >
            <option value="">{t("stakeholders.linksToNone")}</option>
            <option value="account">{t("stakeholders.linksToAccount")}</option>
            <option value="vendor">{t("stakeholders.linksToVendor")}</option>
          </select>
        )}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={stakeholder.is_active}
          disabled={!canManage}
          onChange={(event) => onPatch({ is_active: event.target.checked })}
          className="h-3.5 w-3.5"
        />
        {t("stakeholders.active")}
      </label>

      {canManage && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={isFirst}
            aria-label={t("stakeholders.moveUp")}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isLast}
            aria-label={t("stakeholders.moveDown")}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={terminal}
            aria-label={t("stakeholders.delete")}
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** A label turned into a slug, as a starting point the admin can still edit. */
function slugify(label: string): string {
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  // The server's pattern requires a leading letter.
  return /^[a-z]/.test(cleaned) ? cleaned : cleaned && `x_${cleaned}`;
}

export function StakeholdersSection() {
  const t = useTranslations("serviceDesk");
  const { stakeholders, isLoading } = useServiceDeskTaxonomy();
  const settings = useServiceDeskSettings();
  const canManage = settings.data?.can_manage === true;
  const { data: allDepartments } = useDepartments();
  const m = useServiceDeskMutations();

  const [newLabel, setNewLabel] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newSemantics, setNewSemantics] = useState<StakeholderSemantics>("internal");
  const [newFunction, setNewFunction] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  // Only departments carrying a routing key can own a bucket — one without a
  // function has nothing for the resolver to match on.
  const departments = (allDepartments ?? [])
    .filter((d): d is typeof d & { function_key: string } => Boolean(d.function_key))
    .map((d) => ({ function_key: d.function_key, name: d.name }));

  const reset = () => {
    setNewLabel("");
    setNewSlug("");
    setNewFunction("");
    setSlugTouched(false);
  };

  /**
   * Move a bucket, renumbering every row rather than swapping two.
   *
   * Seeded rows can share a position (the template writes them all at 0 in some
   * workspaces), and swapping two equal numbers changes nothing on screen —
   * which reads as a broken button. Renumbering is a handful of requests on an
   * action nobody takes twice a day, and it repairs the ordering as a side
   * effect.
   */
  const move = (index: number, direction: -1 | 1) => {
    const next = [...stakeholders];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((row, i) => {
      if (row.position !== i) {
        m.updateStakeholder.mutate({ id: row.id, data: { position: i } });
      }
    });
  };

  const canAdd =
    newLabel.trim().length > 0 &&
    slugify(newSlug || newLabel).length > 0 &&
    (newSemantics !== "internal" || newFunction.length > 0);

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">{t("stakeholders.title")}</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">{t("stakeholders.hint")}</p>

      {/* Said before the form rather than after a failed save: with no department
          carrying a routing key there is nothing an internal bucket can be
          owned by, and the fix is on a different page. */}
      {canManage && departments.length === 0 && (
        <p className="max-w-2xl text-sm text-amber-700 dark:text-amber-400">
          {t("stakeholders.noDepartments")}{" "}
          <Link href="/organization/departments" className="underline">
            {t("stakeholders.noDepartmentsLink")}
          </Link>
        </p>
      )}

      {canManage && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {t("stakeholders.label")}
            </label>
            <Input
              value={newLabel}
              data-testid="new-stakeholder-label"
              onChange={(event) => {
                setNewLabel(event.target.value);
                if (!slugTouched) setNewSlug(slugify(event.target.value));
              }}
              placeholder={t("stakeholders.labelPlaceholder")}
              className="max-w-[180px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {t("stakeholders.slug")}
            </label>
            <Input
              value={newSlug}
              data-testid="new-stakeholder-slug"
              onChange={(event) => {
                setSlugTouched(true);
                setNewSlug(event.target.value);
              }}
              className="max-w-[160px] font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {t("stakeholders.semantics")}
            </label>
            <select
              value={newSemantics}
              data-testid="new-stakeholder-semantics"
              onChange={(event) => {
                setNewSemantics(event.target.value as StakeholderSemantics);
                setNewFunction("");
              }}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="internal">{t("stakeholders.internal")}</option>
              <option value="external">{t("stakeholders.external")}</option>
            </select>
          </div>
          {newSemantics === "internal" && (
            <div className="min-w-[180px]">
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("stakeholders.department")}
              </label>
              <DepartmentSelect
                value={newFunction || null}
                options={departments}
                placeholder={t("stakeholders.pickDepartment")}
                ariaLabel={t("stakeholders.department")}
                onChange={setNewFunction}
              />
            </div>
          )}
          <Button
            disabled={!canAdd || m.createStakeholder.isPending}
            data-testid="new-stakeholder-add"
            onClick={() =>
              m.createStakeholder.mutate(
                {
                  slug: slugify(newSlug || newLabel),
                  label: newLabel.trim(),
                  semantics: newSemantics,
                  function_key: newSemantics === "internal" ? newFunction : null,
                  position: stakeholders.length,
                },
                { onSuccess: reset },
              )
            }
          >
            {t("settings.add")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <Spinner size="sm" />
      ) : stakeholders.length === 0 ? (
        <p className="max-w-2xl text-sm text-muted-foreground">{t("stakeholders.empty")}</p>
      ) : (
        <div className="space-y-2">
          {stakeholders.map((stakeholder, index) => (
            <StakeholderRow
              key={stakeholder.id}
              stakeholder={stakeholder}
              canManage={canManage}
              departments={departments}
              isFirst={index === 0}
              isLast={index === stakeholders.length - 1}
              onMove={(direction) => move(index, direction)}
              onPatch={(data) => m.updateStakeholder.mutate({ id: stakeholder.id, data })}
              onDelete={() => m.deleteStakeholder.mutate(stakeholder.id)}
            />
          ))}
        </div>
      )}

      {/* Retiring and deleting are not the same act, and the difference is only
          visible once it is too late: a deleted slug leaves closed TAT segments
          pointing at a bucket nothing resolves. The server refuses that, so this
          is here to explain the refusal before it happens. */}
      <p className="max-w-2xl text-xs text-muted-foreground">{t("stakeholders.retireHint")}</p>
    </Card>
  );
}
