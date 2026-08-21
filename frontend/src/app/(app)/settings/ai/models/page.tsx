"use client";

/**
 * One place to answer "which model does this run on?"
 *
 * Before this page there were four live answers in the product and one dead one:
 * the gateway honoured the workspace's settings, agents built their own from the
 * environment, Ask did the same again with different defaults, and a haiku/sonnet
 * dropdown under code insights had never been read by anything at all.
 *
 * So the design rule here is that nothing on this screen may be decorative.
 * Every row shows the model it will *actually* resolve to and a badge saying
 * where that came from, and a stored choice that no longer applies renders as
 * ignored rather than as live. A picker you cannot verify is how the dead
 * dropdown survived for as long as it did.
 *
 * Category first, feature second. Fifty pickers is a wall nobody reads, while
 * "the cheap model for analysis, the strong one for contracts" is two decisions.
 */

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  PowerOff,
} from "lucide-react";

import {
  SettingsAutosaveHint,
  SettingsPage,
  SettingsSection,
  SettingsSkeleton,
} from "@/components/settings/SettingsPrimitives";
import { useAiModels, useSetAiModel } from "@/hooks/useAiModels";
import type {
  CategoryModels,
  FeatureModel,
  ModelOption,
  ModelSource,
  OverrideScope,
} from "@/lib/ai-models-api";

/** Sentinel for the "type an id yourself" option. Not a valid model id. */
const OTHER = "__other__";
/** Sentinel for "inherit", which clears the override rather than pinning it. */
const INHERIT = "";

export default function AIModelsPage() {
  const t = useTranslations("settingsAiModels");

  const { data, isLoading } = useAiModels();
  const save = useSetAiModel();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (isLoading || !data) return <SettingsSkeleton rows={4} />;

  if (!data.workspace_default) {
    return (
      <SettingsPage title={t("title")} description={t("description")}>
        <SettingsSection>
          <p className="text-sm text-muted-foreground" data-testid="ai-models-unset">
            {t("notConfigured")}{" "}
            <Link href="/settings/ai" className="underline">
              {t("aiSettingsLink")}
            </Link>
          </p>
        </SettingsSection>
      </SettingsPage>
    );
  }

  const readOnly = !data.can_manage || save.isPending;
  const { workspace_default: fallback, catalog } = data;

  const commit = (scope: OverrideScope, key: string, value: string) => {
    // An empty value means inherit, which DELETES the row rather than writing
    // whatever is currently effective — so the target keeps following its
    // default when an admin changes that later.
    save.mutate({ scope, key, model: value === INHERIT ? null : value });
  };

  return (
    <SettingsPage
      title={t("title")}
      description={t("description")}
      width="wide"
      breadcrumbs={[
        { label: t("breadcrumbSettings"), href: "/settings" },
        { label: t("breadcrumbAi"), href: "/settings/ai" },
        { label: t("breadcrumbModels") },
      ]}
    >
      {!data.can_manage && (
        <p
          data-testid="ai-models-read-only"
          className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted-foreground"
        >
          {t("readOnly")}
        </p>
      )}

      {data.ai_disabled && (
        <p
          data-testid="ai-models-disabled"
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t("aiDisabled")}{" "}
            <Link href="/settings/ai" className="underline">
              {t("aiSettingsLink")}
            </Link>
          </span>
        </p>
      )}

      {/* Everything below is relative to this, so it goes first. */}
      <SettingsSection title={t("defaultTitle")}>
        <p className="text-sm text-foreground" data-testid="ai-models-default">
          {t("defaultValue", {
            provider: fallback.provider,
            model: fallback.model,
          })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {fallback.source === "workspace"
            ? t("defaultFromWorkspace")
            : t("defaultFromPlatform")}{" "}
          <Link href="/settings/ai" className="underline">
            {t("changeDefault")}
          </Link>
        </p>
      </SettingsSection>

      {data.categories.map((category) => (
        <CategoryCard
          key={category.id}
          category={category}
          catalog={catalog}
          fallbackLabel={fallback.model}
          readOnly={readOnly}
          expanded={Boolean(open[category.id])}
          onToggle={() =>
            setOpen((prev) => ({ ...prev, [category.id]: !prev[category.id] }))
          }
          onCommit={commit}
        />
      ))}

      <p className="text-xs text-muted-foreground">
        <SettingsAutosaveHint>{t("autosave")}</SettingsAutosaveHint>
      </p>
    </SettingsPage>
  );
}

function CategoryCard({
  category,
  catalog,
  fallbackLabel,
  readOnly,
  expanded,
  onToggle,
  onCommit,
}: {
  category: CategoryModels;
  catalog: ModelOption[];
  fallbackLabel: string;
  readOnly: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCommit: (scope: OverrideScope, key: string, value: string) => void;
}) {
  const t = useTranslations("settingsAiModels");

  // A feature is "following" this category when its model came from anywhere
  // above it. Counted rather than assumed: it is the one number that tells an
  // admin whether changing this card will do anything.
  const inheriting = category.features.filter(
    (feature) => feature.source !== "feature"
  ).length;

  return (
    <SettingsSection title={category.name} description={category.description}>
      {/* The test hook lives on an element this page owns. `SettingsSection` is
          a shared primitive with an explicit prop list and does not forward
          unknown attributes, so a `data-testid` passed to it renders nothing —
          which is worse than no hook at all, because it looks like one. */}
      <div data-testid={`ai-category-${category.id}`}>
      <ModelPicker
        id={`category-${category.id}`}
        label={t("categoryModelLabel")}
        value={category.override?.model ?? INHERIT}
        inheritLabel={t("inheritDefault", { model: fallbackLabel })}
        catalog={catalog}
        disabled={readOnly}
        onCommit={(value) => onCommit("category", category.id, value)}
      />

      {category.ignored_reason && <Ignored reason={category.ignored_reason} />}

      <p className="mt-2 text-xs text-muted-foreground">
        {t("inheritingCount", {
          count: inheriting,
          total: category.features.length,
        })}
      </p>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={`ai-category-toggle-${category.id}`}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        {expanded ? t("hideFeatures") : t("showFeatures")}
      </button>

      {expanded && (
        <ul className="mt-3 divide-y divide-border/60">
          {category.features.map((feature) => (
            <li key={feature.id} data-testid={`ai-feature-${feature.id}`} className="py-3">
              <FeatureRow
                feature={feature}
                catalog={catalog}
                categoryLabel={category.override?.model ?? fallbackLabel}
                readOnly={readOnly}
                onCommit={(value) => onCommit("feature", feature.id, value)}
              />
            </li>
          ))}
        </ul>
      )}
      </div>
    </SettingsSection>
  );
}

function FeatureRow({
  feature,
  catalog,
  categoryLabel,
  readOnly,
  onCommit,
}: {
  feature: FeatureModel;
  catalog: ModelOption[];
  categoryLabel: string;
  readOnly: boolean;
  onCommit: (value: string) => void;
}) {
  const t = useTranslations("settingsAiModels");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:flex-1">
        <p className="text-sm text-foreground">{feature.name}</p>
        <p className="text-xs text-muted-foreground">{feature.description}</p>

        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">
            {t("runsOn", { model: feature.effective_model })}
          </span>
          <SourceBadge source={feature.source} />
        </p>

        {feature.ignored_reason && <Ignored reason={feature.ignored_reason} />}

        {feature.dormant_reason && (
          <p
            data-testid="ai-model-dormant"
            className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground"
          >
            <PowerOff className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              <span className="font-medium">{t("dormantLabel")}</span>{" "}
              {feature.dormant_reason}
            </span>
          </p>
        )}

        {!feature.configurable && feature.reason_fixed && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {feature.reason_fixed}
          </p>
        )}
      </div>

      {feature.configurable && (
        <ModelPicker
          id={`feature-${feature.id}`}
          label={t("featureModelLabel")}
          hideLabel
          value={feature.override?.model ?? INHERIT}
          inheritLabel={t("inheritCategory", { model: categoryLabel })}
          catalog={catalog}
          disabled={readOnly}
          onCommit={onCommit}
        />
      )}
    </div>
  );
}

/**
 * A select of suggestions plus a free-text escape hatch.
 *
 * Free text is first class, not a fallback: model ids are the provider's to
 * define and they change faster than any list we ship, so an allowlist would
 * refuse a model released last week. The shape is validated server-side and an
 * id that does not exist fails loudly on the first call.
 */
function ModelPicker({
  id,
  label,
  hideLabel = false,
  value,
  inheritLabel,
  catalog,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  hideLabel?: boolean;
  value: string;
  inheritLabel: string;
  catalog: ModelOption[];
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const t = useTranslations("settingsAiModels");
  const known = catalog.some((option) => option.id === value);

  // A stored value the catalogue does not list is a legitimate free-text choice,
  // so the field opens showing it rather than silently resetting to inherit.
  const [freeText, setFreeText] = useState(known ? "" : value);
  const [typing, setTyping] = useState(Boolean(value) && !known);

  const selected = typing ? OTHER : value;

  const commitFreeText = () => {
    const next = freeText.trim();
    if (next && next !== value) onCommit(next);
  };

  return (
    <div className="shrink-0">
      <label
        htmlFor={id}
        className={hideLabel ? "sr-only" : "block text-xs text-muted-foreground"}
      >
        {label}
      </label>
      <select
        id={id}
        data-testid={`ai-model-select-${id}`}
        value={selected}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (next === OTHER) {
            setTyping(true);
            return;
          }
          setTyping(false);
          setFreeText("");
          onCommit(next);
        }}
        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm sm:w-64"
      >
        <option value={INHERIT}>{inheritLabel}</option>
        {catalog.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
            {option.in_use_here ? ` · ${t("inUseHere")}` : ""}
          </option>
        ))}
        <option value={OTHER}>{t("otherModel")}</option>
      </select>

      {typing && (
        <input
          data-testid={`ai-model-input-${id}`}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm sm:w-64"
          placeholder={t("otherPlaceholder")}
          value={freeText}
          disabled={disabled}
          onChange={(event) => setFreeText(event.target.value)}
          // On blur and on Enter, never on change: every keystroke of a model id
          // would otherwise be a request the server rejects until the last one.
          //
          // Enter matters because there is no save button on this page. Somebody
          // who types an id and presses Enter has said they mean it, and losing
          // it silently is the same class of failure as a control that looks
          // live and is not.
          onBlur={() => commitFreeText()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitFreeText();
            }
          }}
        />
      )}

      {!typing && selected !== INHERIT && (
        <p className="mt-1 text-xs text-muted-foreground">
          {catalog.find((option) => option.id === selected)?.note}
        </p>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: ModelSource }) {
  const t = useTranslations("settingsAiModels");
  const tone =
    source === "feature" || source === "instance"
      ? "bg-primary/10 text-primary"
      : source === "category"
        ? "bg-accent text-foreground"
        : "bg-muted text-muted-foreground";

  return (
    <span
      data-testid={`ai-source-${source}`}
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {t(`source.${source}`)}
    </span>
  );
}

/** A stored choice that is not being used, and why. */
function Ignored({ reason }: { reason: string }) {
  const t = useTranslations("settingsAiModels");
  return (
    <p
      data-testid="ai-model-ignored"
      className="mt-1 flex items-start gap-1.5 text-xs text-warning"
    >
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        <span className="font-medium">{t("ignoredLabel")}</span> {reason}
      </span>
    </p>
  );
}
