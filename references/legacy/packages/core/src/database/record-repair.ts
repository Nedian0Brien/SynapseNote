import { stripFrontmatter, unwrapFrontmatterFences } from '../extensions/frontmatter.ts';
import { parseFrontmatterYaml } from '../frontmatter/yaml-codec.ts';
import { isRecordPathInSource, materializeDatabaseRecord } from './record.ts';
import { createDatabaseRecordId } from './record-identity.ts';
import {
  type DatabaseDefinition,
  type DatabaseRecordId,
  DatabaseRecordIdSchema,
} from './schema.ts';

export type DatabaseRecordRepairChange =
  | {
      kind: 'set_identity';
      before: unknown;
      after: { database_id: string; source_id: string; record_id: string };
    }
  | {
      kind: 'set_default';
      propertyId: string;
      propertyKey: string;
      before: unknown;
      after: unknown;
    }
  | {
      kind: 'deduplicate';
      propertyId: string;
      propertyKey: string;
      before: unknown;
      after: unknown;
    }
  | {
      kind: 'unset_invalid_optional';
      propertyId: string;
      propertyKey: string;
      before: unknown;
      after: null;
    }
  | {
      kind: 'allocate_unique_id';
      propertyId: string;
      propertyKey: string;
      before: unknown;
      after: number;
    };

export interface RepairDatabaseRecordInput {
  definition: DatabaseDefinition;
  sourceId: string;
  path: string;
  markdown: string;
  /** Exact replacement used for duplicate IDs; otherwise a valid existing ID is preserved. */
  recordId?: DatabaseRecordId;
  generateUuid?: () => string;
  /** Trusted workspace repair allocations keyed by stable Unique ID property ID. */
  uniqueIdValues?: Readonly<Record<string, number>>;
}

export type RepairDatabaseRecordResult =
  | {
      ok: true;
      changed: boolean;
      recordId: DatabaseRecordId;
      markdown: string;
      changes: readonly DatabaseRecordRepairChange[];
    }
  | {
      ok: false;
      code:
        | 'unknown_source'
        | 'outside_source'
        | 'malformed_frontmatter'
        | 'required_value_needs_input'
        | 'unrepairable_record';
      message: string;
      propertyId?: string;
      propertyKey?: string;
    };

function lineEnding(markdown: string): '\n' | '\r\n' {
  return markdown.includes('\r\n') ? '\r\n' : '\n';
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Produces a fully materializable record while preserving unrelated YAML nodes,
 * comments, ordering, and Markdown body bytes. Lossy changes are limited to
 * invalid optional values and are returned explicitly for approval.
 */
export function repairDatabaseRecord(input: RepairDatabaseRecordInput): RepairDatabaseRecordResult {
  const source = input.definition.sources.find((candidate) => candidate.id === input.sourceId);
  if (!source) {
    return {
      ok: false,
      code: 'unknown_source',
      message: `Data source "${input.sourceId}" is not defined`,
    };
  }
  if (!isRecordPathInSource(input.path, source)) {
    return {
      ok: false,
      code: 'outside_source',
      message: `Record "${input.path}" is outside source "${source.id}"`,
    };
  }

  const { frontmatter, body } = stripFrontmatter(input.markdown);
  const parsed = parseFrontmatterYaml(unwrapFrontmatterFences(frontmatter));
  if (parsed.map === null) {
    return {
      ok: false,
      code: 'malformed_frontmatter',
      message: `Record "${input.path}" has malformed frontmatter: ${parsed.parseError}`,
    };
  }

  const rawMetadata = parsed.map._sn;
  const metadataRecordId =
    rawMetadata !== null &&
    typeof rawMetadata === 'object' &&
    !Array.isArray(rawMetadata) &&
    DatabaseRecordIdSchema.safeParse(rawMetadata.record_id).success
      ? DatabaseRecordIdSchema.parse(rawMetadata.record_id)
      : null;
  const recordId = input.recordId ?? metadataRecordId ?? createDatabaseRecordId(input.generateUuid);
  const preservedMetadata =
    rawMetadata !== null && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
      ? rawMetadata
      : {};
  const desiredMetadata = {
    ...preservedMetadata,
    database_id: input.definition.id,
    source_id: source.id,
    record_id: recordId,
  };
  const changes: DatabaseRecordRepairChange[] = [];
  if (!sameValue(rawMetadata, desiredMetadata)) {
    parsed.doc.setIn(['_sn'], desiredMetadata);
    changes.push({
      kind: 'set_identity',
      before: structuredClone(rawMetadata),
      after: desiredMetadata,
    });
  }
  for (const property of source.properties) {
    if (property.type !== 'unique_id') continue;
    const allocated = input.uniqueIdValues?.[property.id];
    if (allocated === undefined) continue;
    if (!Number.isSafeInteger(allocated) || allocated < 1) {
      return {
        ok: false,
        code: 'unrepairable_record',
        message: `Unique ID repair allocation for "${property.key}" is invalid`,
      };
    }
    const before = parsed.map[property.key];
    if (before === allocated) continue;
    parsed.doc.setIn([property.key], allocated);
    changes.push({
      kind: 'allocate_unique_id',
      propertyId: property.id,
      propertyKey: property.key,
      before: structuredClone(before),
      after: allocated,
    });
  }

  const serialize = (): string => {
    const eol = lineEnding(input.markdown);
    const yaml = parsed.doc.toString({ lineWidth: 0 }).replaceAll('\n', eol);
    return `---${eol}${yaml}${yaml.endsWith(eol) ? '' : eol}---${eol}${body}`;
  };

  let candidate = serialize();
  const firstPass = materializeDatabaseRecord({
    definition: input.definition,
    sourceId: source.id,
    path: input.path,
    markdown: candidate,
  });
  if (!firstPass.ok && firstPass.code === 'invalid_record') {
    for (const issue of firstPass.issues ?? []) {
      const property = source.properties.find((entry) => entry.id === issue.propertyId);
      if (!property) continue;
      const before = parsed.map[property.key];
      if (issue.code === 'duplicate_array_value' && Array.isArray(before)) {
        const after = [...new Set(before)];
        parsed.doc.setIn([property.key], after);
        changes.push({
          kind: 'deduplicate',
          propertyId: property.id,
          propertyKey: property.key,
          before: structuredClone(before),
          after,
        });
        continue;
      }
      if (property.semantics.defaultValue !== undefined) {
        const after = structuredClone(property.semantics.defaultValue);
        parsed.doc.setIn([property.key], after);
        changes.push({
          kind: 'set_default',
          propertyId: property.id,
          propertyKey: property.key,
          before: structuredClone(before),
          after,
        });
        continue;
      }
      if (!property.required && property.type !== 'unique_id') {
        parsed.doc.deleteIn([property.key]);
        changes.push({
          kind: 'unset_invalid_optional',
          propertyId: property.id,
          propertyKey: property.key,
          before: structuredClone(before),
          after: null,
        });
        continue;
      }
      return {
        ok: false,
        code: 'required_value_needs_input',
        message: issue.message,
        propertyId: property.id,
        propertyKey: property.key,
      };
    }
    candidate = serialize();
  }

  const verified = materializeDatabaseRecord({
    definition: input.definition,
    sourceId: source.id,
    path: input.path,
    markdown: candidate,
  });
  if (!verified.ok) {
    return {
      ok: false,
      code: 'unrepairable_record',
      message: verified.message,
    };
  }
  return {
    ok: true,
    changed: candidate !== input.markdown,
    recordId,
    markdown: candidate,
    changes,
  };
}
