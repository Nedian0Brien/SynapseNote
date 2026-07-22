import { stripFrontmatter, unwrapFrontmatterFences } from '../extensions/frontmatter.ts';
import { parseFrontmatterYaml } from '../frontmatter/yaml-codec.ts';
import {
  type DatabaseId,
  DatabaseIdSchema,
  type DatabaseRecordId,
  DatabaseRecordIdSchema,
  type DataSourceId,
  DataSourceIdSchema,
  StoredDatabaseRecordMetadataSchema,
} from './schema.ts';

export const DATABASE_RECORD_FRONTMATTER_BYTE_LIMIT = 65_536;
const CLOSING_FENCE_RE = /\r?\n---[ \t]*(?:\r?\n|$)$/;

export interface EnsureDatabaseRecordIdentityInput {
  markdown: string;
  databaseId: DatabaseId;
  sourceId: DataSourceId;
  /** Tests and importers may provide an ID; normal callers should omit it. */
  recordId?: DatabaseRecordId;
  /** Dependency injection for deterministic tests. */
  generateUuid?: () => string;
}

export type EnsureDatabaseRecordIdentityResult =
  | {
      ok: true;
      changed: boolean;
      recordId: DatabaseRecordId;
      markdown: string;
    }
  | {
      ok: false;
      code:
        | 'invalid_database_id'
        | 'invalid_source_id'
        | 'invalid_record_id'
        | 'malformed_frontmatter'
        | 'invalid_existing_metadata'
        | 'database_mismatch'
        | 'source_mismatch'
        | 'frontmatter_too_large';
      message: string;
    };

/** Generate a 128-bit UUID-backed record identity with a file-safe prefix. */
export function createDatabaseRecordId(
  generateUuid: () => string = () => crypto.randomUUID(),
): DatabaseRecordId {
  const compact = generateUuid().replaceAll('-', '').toLowerCase();
  const candidate = `rec_${compact}`;
  const parsed = DatabaseRecordIdSchema.safeParse(candidate);
  if (!parsed.success || compact.length !== 32 || !/^[0-9a-f]{32}$/.test(compact)) {
    throw new Error('UUID generator did not return a valid RFC 4122 UUID');
  }
  return parsed.data;
}

function detectLineEnding(markdown: string): '\n' | '\r\n' {
  return markdown.includes('\r\n') ? '\r\n' : '\n';
}

function metadataBlock(
  databaseId: DatabaseId,
  sourceId: DataSourceId,
  recordId: DatabaseRecordId,
  eol: '\n' | '\r\n',
): string {
  return [
    '_sn:',
    `  database_id: ${databaseId}`,
    `  source_id: ${sourceId}`,
    `  record_id: ${recordId}`,
    '',
  ].join(eol);
}

function validateInputIdentity(
  input: EnsureDatabaseRecordIdentityInput,
): Exclude<EnsureDatabaseRecordIdentityResult, { ok: true }> | null {
  if (!DatabaseIdSchema.safeParse(input.databaseId).success) {
    return {
      ok: false,
      code: 'invalid_database_id',
      message: `Invalid database ID "${input.databaseId}"`,
    };
  }
  if (!DataSourceIdSchema.safeParse(input.sourceId).success) {
    return {
      ok: false,
      code: 'invalid_source_id',
      message: `Invalid data source ID "${input.sourceId}"`,
    };
  }
  if (input.recordId !== undefined && !DatabaseRecordIdSchema.safeParse(input.recordId).success) {
    return {
      ok: false,
      code: 'invalid_record_id',
      message: `Invalid record ID "${input.recordId}"`,
    };
  }
  return null;
}

/**
 * Add database identity to a Markdown record without parsing and reserializing
 * unrelated frontmatter. Existing bytes are copied verbatim and only a new
 * `_sn` mapping is inserted immediately before the closing fence.
 */
export function ensureDatabaseRecordIdentity(
  input: EnsureDatabaseRecordIdentityInput,
): EnsureDatabaseRecordIdentityResult {
  const inputError = validateInputIdentity(input);
  if (inputError) return inputError;

  const { frontmatter, body } = stripFrontmatter(input.markdown);
  if (frontmatter !== '') {
    const parsed = parseFrontmatterYaml(unwrapFrontmatterFences(frontmatter));
    if (parsed.map === null) {
      return {
        ok: false,
        code: 'malformed_frontmatter',
        message: `Cannot assign record identity: ${parsed.parseError}`,
      };
    }

    if (Object.hasOwn(parsed.map, '_sn')) {
      const existing = StoredDatabaseRecordMetadataSchema.safeParse(parsed.map._sn);
      if (!existing.success) {
        return {
          ok: false,
          code: 'invalid_existing_metadata',
          message: 'Cannot assign record identity because the existing _sn metadata is invalid',
        };
      }
      if (existing.data.database_id !== input.databaseId) {
        return {
          ok: false,
          code: 'database_mismatch',
          message: `Record belongs to database "${existing.data.database_id}", not "${input.databaseId}"`,
        };
      }
      if (existing.data.source_id !== input.sourceId) {
        return {
          ok: false,
          code: 'source_mismatch',
          message: `Record belongs to source "${existing.data.source_id}", not "${input.sourceId}"`,
        };
      }
      if (input.recordId !== undefined && existing.data.record_id !== input.recordId) {
        return {
          ok: false,
          code: 'invalid_record_id',
          message: `Record already has identity "${existing.data.record_id}"`,
        };
      }
      return {
        ok: true,
        changed: false,
        recordId: existing.data.record_id,
        markdown: input.markdown,
      };
    }
  }

  const recordId = input.recordId ?? createDatabaseRecordId(input.generateUuid);
  const eol = frontmatter.startsWith('---\r\n') ? '\r\n' : detectLineEnding(input.markdown);
  const block = metadataBlock(input.databaseId, input.sourceId, recordId, eol);

  let nextFrontmatter: string;
  if (frontmatter === '') {
    nextFrontmatter = `---${eol}${block}---${eol}`;
  } else {
    const closingFence = CLOSING_FENCE_RE.exec(frontmatter);
    if (!closingFence) {
      return {
        ok: false,
        code: 'malformed_frontmatter',
        message: 'Cannot locate the closing frontmatter fence',
      };
    }
    const insertAt = closingFence.index + (closingFence[0].startsWith('\r\n') ? 2 : 1);
    nextFrontmatter = `${frontmatter.slice(0, insertAt)}${block}${frontmatter.slice(insertAt)}`;
  }

  if (
    new TextEncoder().encode(nextFrontmatter).byteLength > DATABASE_RECORD_FRONTMATTER_BYTE_LIMIT
  ) {
    return {
      ok: false,
      code: 'frontmatter_too_large',
      message: `Record frontmatter would exceed ${DATABASE_RECORD_FRONTMATTER_BYTE_LIMIT} bytes`,
    };
  }

  return {
    ok: true,
    changed: true,
    recordId,
    markdown: nextFrontmatter + body,
  };
}
