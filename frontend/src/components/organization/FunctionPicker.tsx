"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { useFunctionCatalog } from "@/hooks/useOrganization";
import { Input } from "@/components/ui/input";

const CUSTOM = "__custom__";

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  /** The department being edited, so its own claim isn't reported as a clash. */
  currentDepartmentId?: string;
  disabled?: boolean;
}

/**
 * Pick which organisational function a department performs.
 *
 * This replaced a free-text box, and the box was the problem. A function key is
 * a *routing* key: Service Desk row-level visibility resolves it (a stakeholder
 * bucket names the function that owes the next action, and only that
 * department's people can see those tickets), the digest resolves it to find a
 * head, and ticket auto-assignment resolves it to pick an owner. A typo produced
 * no error — just an empty queue for that department's people, which looks
 * exactly like a quiet day.
 *
 * So the picker does three things a text box could not: offer the declared keys,
 * say what each one *does in this workspace* (which buckets route to it), and
 * name the department already holding one rather than failing on save.
 *
 * The set stays open. Anything the registry doesn't cover is entered as a custom
 * key under the server's `x_` prefix, and every consumer treats it identically.
 */
export function FunctionPicker({
  value,
  onChange,
  currentDepartmentId,
  disabled,
}: Props) {
  const t = useTranslations("organization");
  const { data: catalog } = useFunctionCatalog();

  const known = useMemo(
    () => new Set((catalog?.options ?? []).map((o) => o.key)),
    [catalog?.options],
  );

  // Custom mode is *derived*, not frozen at mount. Seeding it from `known` in a
  // useState initialiser looked right and was wrong: the catalogue is fetched, so
  // on first render it is empty, every stored key looks unknown, and the field
  // opened in custom mode with the real key in the text box — one Save away from
  // rewriting `engineering` as `x_engineering`.
  //
  // A stored key the catalogue genuinely doesn't list (a pre-registry value) does
  // still open in custom mode, so it stays editable instead of silently reading
  // as "no function". That only applies once the catalogue has actually arrived.
  const [customChosen, setCustomChosen] = useState(false);
  const [customDraft, setCustomDraft] = useState<string | null>(null);

  const valueIsKnown = !value || known.has(value);
  const isCustom = customChosen || (!!catalog && !valueIsKnown);
  const mode = isCustom ? CUSTOM : valueIsKnown ? value ?? "" : "";
  const custom = customDraft ?? (isCustom ? value ?? "" : "");

  const prefix = catalog?.custom_prefix ?? "x_";
  const selected = (catalog?.options ?? []).find((o) => o.key === mode);
  // Its own claim is not a clash — editing a department must not report it as
  // conflicting with itself.
  const clash =
    selected?.claimed_by_department_id &&
    selected.claimed_by_department_id !== currentDepartmentId
      ? selected
      : null;

  const handleSelect = (next: string) => {
    if (next === CUSTOM) {
      setCustomChosen(true);
      // Deliberately does not carry the previously selected standard key over as
      // a custom draft: `x_sales` alongside `sales` is two keys for one function,
      // which is what the namespace exists to keep apart.
      setCustomDraft("");
      onChange(null);
      return;
    }
    setCustomChosen(false);
    setCustomDraft(null);
    onChange(next || null);
  };

  const handleCustom = (raw: string) => {
    setCustomDraft(raw);
    onChange(raw.trim() ? withPrefix(raw, prefix) : null);
  };

  return (
    <div className="space-y-2">
      <select
        value={mode}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
        aria-label={t("departments.function")}
      >
        <option value="">{t("functions.none")}</option>
        {(catalog?.options ?? []).map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
            {option.claimed_by_department_id &&
            option.claimed_by_department_id !== currentDepartmentId
              ? ` — ${t("functions.takenBy", { department: option.claimed_by_department_name ?? "" })}`
              : ""}
          </option>
        ))}
        <option value={CUSTOM}>{t("functions.custom")}</option>
      </select>

      {mode === CUSTOM && (
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {prefix}
            </span>
            <Input
              value={custom.startsWith(prefix) ? custom.slice(prefix.length) : custom}
              onChange={(e) => handleCustom(e.target.value)}
              placeholder={t("functions.customPlaceholder")}
              className="h-8 text-sm"
              disabled={disabled}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("functions.customHint", { prefix })}</p>
        </div>
      )}

      {/* What this choice actually does here. Empty for a function no desk bucket
          routes to, which is honest: on a workspace without a Service Desk the
          key is documentation and shouldn't claim otherwise. */}
      {selected && selected.description && (
        <p className="text-xs text-muted-foreground">{selected.description}</p>
      )}
      {selected && selected.routes_stakeholders.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("functions.routes", {
            buckets: selected.routes_stakeholders.join(", "),
          })}
        </p>
      )}

      {clash && (
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("functions.takenWarning", { department: clash.claimed_by_department_name ?? "" })}
        </p>
      )}
    </div>
  );
}

function withPrefix(raw: string, prefix: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  return cleaned.startsWith(prefix) ? cleaned : `${prefix}${cleaned}`;
}

/**
 * "Nobody owns this queue" banner.
 *
 * An internal Service Desk bucket routing to a function no department claims is
 * the one failure in this whole mapping with no natural symptom — the tickets
 * exist, the bucket exists, and the people who should see them get an empty list.
 */
export function UnclaimedFunctionsNotice() {
  const t = useTranslations("organization");
  const { data: catalog } = useFunctionCatalog();
  const unclaimed = catalog?.unclaimed_stakeholder_functions ?? [];
  if (unclaimed.length === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
      <div>
        <p className="font-medium">{t("functions.unclaimedTitle")}</p>
        <p className="text-muted-foreground">
          {t("functions.unclaimedBody", { functions: unclaimed.join(", ") })}
        </p>
      </div>
    </div>
  );
}
