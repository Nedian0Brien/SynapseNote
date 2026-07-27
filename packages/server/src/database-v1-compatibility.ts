import type { DatabaseDefinition } from '@nedian0brien/synapsenote-core';

/**
 * Compatibility boundary for the record-per-file format.
 *
 * The reader and the migration/import writer remain intentionally available so
 * an existing workspace can be opened and recovered. Product mutations must
 * opt into v2 instead; keeping this decision in one small module prevents a
 * new surface from accidentally reviving the old generated-file path.
 */
export const DATABASE_V1_COMPATIBILITY_POLICY = Object.freeze({
  defaultWriteVersion: 2,
  read: true,
  export: true,
  migrationWriter: true,
  importWriter: true,
  productWriter: false,
} as const);

export type DatabaseV1WriteContext = 'product' | 'migration' | 'import';

export function isV1Database(definition: DatabaseDefinition): boolean {
  return definition.version === 1;
}

export function v1MutationIsBlocked(context: DatabaseV1WriteContext): boolean {
  return context === 'product';
}

export function v1MigrationRequiredMessage(subject = 'This database'): string {
  return `${subject} is using legacy record-file storage. Preview and approve the v1→v2 Markdown table migration before editing it.`;
}
