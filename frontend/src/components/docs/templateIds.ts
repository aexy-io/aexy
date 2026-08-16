/**
 * Ids the frontend has to know by name, from the backend's template catalogue.
 *
 * System templates are defined in code on the server
 * (`services/document_templates_catalog.py`), so their ids are a contract rather
 * than data — and one that no type checker spans. A backend test asserts the
 * catalogue still produces exactly these, so renaming a slug fails there instead
 * of silently changing what the UI does.
 */

/** Prefix marking a catalogue entry, as opposed to a workspace row's UUID. */
export const SYSTEM_TEMPLATE_PREFIX = "sys:";

/** The empty page. Filtered out of the in-editor empty state, which is already it. */
export const BLANK_TEMPLATE_ID = "sys:blank";

export function isSystemTemplateId(id: string): boolean {
  return id.startsWith(SYSTEM_TEMPLATE_PREFIX);
}
