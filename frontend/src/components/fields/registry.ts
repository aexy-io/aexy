import { CRMAttributeType, WorkspaceFieldType } from "@/lib/api";
import { FieldTypeDefinition } from "./types";

const registry = new Map<string, FieldTypeDefinition>();

/** Cache of workspace custom field types, keyed by `custom:{slug}` */
const customTypeCache = new Map<string, WorkspaceFieldType>();

export function registerFieldType(def: FieldTypeDefinition) {
  registry.set(def.type, def);
}

/**
 * Register workspace custom field types so they can be resolved via `custom:slug`.
 * Call this when custom field types are loaded from the API.
 */
export function registerCustomFieldTypes(types: WorkspaceFieldType[]) {
  customTypeCache.clear();
  for (const t of types) {
    customTypeCache.set(`custom:${t.slug}`, t);
  }
}

/**
 * Resolve a custom field type key like `custom:priority_score` to its
 * WorkspaceFieldType definition, or undefined if not found.
 */
export function getCustomFieldType(type: string): WorkspaceFieldType | undefined {
  return customTypeCache.get(type);
}

export function getFieldType(type: CRMAttributeType | string): FieldTypeDefinition | undefined {
  // Direct match for built-in types
  const direct = registry.get(type);
  if (direct) return direct;

  // Resolve custom:slug → base type
  if (type.startsWith("custom:")) {
    const custom = customTypeCache.get(type);
    if (custom) return registry.get(custom.base_type);
  }

  return undefined;
}

export function getFieldTypeOrFallback(type: CRMAttributeType | string): FieldTypeDefinition {
  return getFieldType(type) ?? registry.get("text")!;
}

export function getAllFieldTypes(): FieldTypeDefinition[] {
  return Array.from(registry.values());
}

/** Get all registered custom field types */
export function getAllCustomFieldTypes(): WorkspaceFieldType[] {
  return Array.from(customTypeCache.values());
}
