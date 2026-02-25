import { CRMAttributeType } from "@/lib/api";
import { FieldTypeDefinition } from "./types";

const registry = new Map<string, FieldTypeDefinition>();

export function registerFieldType(def: FieldTypeDefinition) {
  registry.set(def.type, def);
}

export function getFieldType(type: CRMAttributeType | string): FieldTypeDefinition | undefined {
  return registry.get(type);
}

export function getFieldTypeOrFallback(type: CRMAttributeType | string): FieldTypeDefinition {
  return registry.get(type) ?? registry.get("text")!;
}

export function getAllFieldTypes(): FieldTypeDefinition[] {
  return Array.from(registry.values());
}
