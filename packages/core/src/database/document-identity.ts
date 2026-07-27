import { sha256 } from '@noble/hashes/sha256';
import { stripFrontmatter, unwrapFrontmatterFences } from '../extensions/frontmatter.ts';
import { parseFrontmatterYaml } from '../frontmatter/yaml-codec.ts';
import {
  DatabaseDocumentIdSchema,
  DatabaseRecordIdSchema,
  type DatabaseDocumentId,
  type DatabaseRecordId,
  type DataSourceId,
} from './stable-ids.ts';

export const DATABASE_DOCUMENT_ID_KEY = 'document_id' as const;

export type ParseDatabaseDocumentIdentityResult =
  | { ok: true; documentId: DatabaseDocumentId }
  | {
      ok: false;
      code:
        | 'missing_frontmatter'
        | 'malformed_frontmatter'
        | 'missing_document_id'
        | 'invalid_document_id';
      message: string;
    };

export type EnsureDatabaseDocumentIdentityResult =
  | { ok: true; changed: boolean; documentId: DatabaseDocumentId; markdown: string }
  | {
      ok: false;
      code: 'malformed_frontmatter' | 'invalid_existing_document_id' | 'frontmatter_too_large';
      message: string;
    };

/** Read the generic document identity without requiring database-specific metadata. */
export function parseDatabaseDocumentIdentity(
  markdown: string,
): ParseDatabaseDocumentIdentityResult {
  const { frontmatter } = stripFrontmatter(markdown);
  if (frontmatter === '') {
    return {
      ok: false,
      code: 'missing_frontmatter',
      message: 'A v2 linked document must declare _sn.document_id in frontmatter',
    };
  }
  const parsed = parseFrontmatterYaml(unwrapFrontmatterFences(frontmatter));
  if (parsed.map === null) {
    return {
      ok: false,
      code: 'malformed_frontmatter',
      message: parsed.parseError ?? 'Document frontmatter is malformed',
    };
  }
  const metadata = parsed.map._sn;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {
      ok: false,
      code: 'missing_document_id',
      message: 'Document frontmatter does not contain an _sn mapping',
    };
  }
  const documentId = (metadata as Record<string, unknown>)[DATABASE_DOCUMENT_ID_KEY];
  if (typeof documentId !== 'string') {
    return {
      ok: false,
      code: 'missing_document_id',
      message: 'Document frontmatter does not contain _sn.document_id',
    };
  }
  if (!DatabaseDocumentIdSchema.safeParse(documentId).success) {
    return {
      ok: false,
      code: 'invalid_document_id',
      message: `Document identity "${documentId}" is invalid`,
    };
  }
  return { ok: true, documentId: documentId as DatabaseDocumentId };
}

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32(bytes: Uint8Array): string {
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

/** Derive the v2 row identity from source and generic document identity. */
export function createDatabaseMarkdownRecordId(
  sourceId: DataSourceId,
  documentId: DatabaseDocumentId,
): DatabaseRecordId {
  const input = new TextEncoder().encode(`${sourceId}\0${documentId}`);
  const digest = sha256(input);
  return DatabaseRecordIdSchema.parse(`rec_${base32(digest)}`);
}

export function createDatabaseDocumentId(
  generateUuid: () => string = () => crypto.randomUUID(),
): DatabaseDocumentId {
  const compact = generateUuid().replaceAll('-', '').toLowerCase();
  return DatabaseDocumentIdSchema.parse(`doc_${compact}`);
}

/** Stable migration identity derived from a legacy v1 record ID. */
export function createDatabaseDocumentIdFromLegacyRecordId(
  recordId: string,
): DatabaseDocumentId {
  const parsed = DatabaseRecordIdSchema.parse(recordId);
  return DatabaseDocumentIdSchema.parse(`doc_${parsed.slice('rec_'.length)}`);
}

/** Add only `_sn.document_id` to generic Markdown frontmatter, preserving all other bytes. */
export function ensureDatabaseDocumentIdentity(input: {
  markdown: string;
  documentId: DatabaseDocumentId;
}): EnsureDatabaseDocumentIdentityResult {
  if (!DatabaseDocumentIdSchema.safeParse(input.documentId).success) {
    return {
      ok: false,
      code: 'invalid_existing_document_id',
      message: `Document identity "${input.documentId}" is invalid`,
    };
  }
  const { frontmatter } = stripFrontmatter(input.markdown);
  const eol = frontmatter.includes('\r\n') ? '\r\n' : '\n';
  if (frontmatter === '') {
    const next = `---${eol}_sn:${eol}  document_id: ${input.documentId}${eol}---${eol}${input.markdown}`;
    return { ok: true, changed: true, documentId: input.documentId, markdown: next };
  }
  const parsed = parseFrontmatterYaml(unwrapFrontmatterFences(frontmatter));
  if (parsed.map === null) {
    return {
      ok: false,
      code: 'malformed_frontmatter',
      message: `Document frontmatter is malformed: ${parsed.parseError}`,
    };
  }
  const existing = parseDatabaseDocumentIdentity(input.markdown);
  if (existing.ok) {
    return { ok: true, changed: false, documentId: existing.documentId, markdown: input.markdown };
  }
  if (existing.code === 'invalid_document_id') {
    return {
      ok: false,
      code: 'invalid_existing_document_id',
      message: existing.message,
    };
  }
  const closing = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(frontmatter);
  if (!closing) {
    return { ok: false, code: 'malformed_frontmatter', message: 'Cannot locate the closing frontmatter fence' };
  }
  const frontmatterBody = unwrapFrontmatterFences(frontmatter);
  const bodyOffset = frontmatter.indexOf(frontmatterBody);
  if (bodyOffset < 0) {
    return { ok: false, code: 'malformed_frontmatter', message: 'Cannot locate the frontmatter body' };
  }
  let insertion: number;
  const snLine = /^_sn:[ \t]*\r?\n/m.exec(frontmatterBody);
  if (snLine?.index !== undefined) {
    const start = snLine.index + snLine[0].length;
    const remainder = frontmatterBody.slice(start);
    const nextTopLevel = remainder.search(/^[^ \t\r\n][^\r\n]*$/m);
    insertion = start + (nextTopLevel === -1 ? remainder.length : nextTopLevel);
  } else {
    insertion = frontmatterBody.length;
    const prefix = frontmatterBody.endsWith(eol) || frontmatterBody === '' ? '' : eol;
    const tail = frontmatter.slice(bodyOffset + frontmatterBody.length);
    const ending = tail.startsWith(eol) ? '' : eol;
    const addition = `${prefix}_sn:${eol}  document_id: ${input.documentId}${ending}`;
    const bodyWithAddition = frontmatterBody.slice(0, insertion) + addition + frontmatterBody.slice(insertion);
    const nextFrontmatter =
      frontmatter.slice(0, bodyOffset) +
      bodyWithAddition +
      frontmatter.slice(bodyOffset + frontmatterBody.length);
    return {
      ok: true,
      changed: true,
      documentId: input.documentId,
      markdown: nextFrontmatter + input.markdown.slice(frontmatter.length),
    };
  }
  const insertionText = `  document_id: ${input.documentId}${eol}`;
  const nextBody = frontmatterBody.slice(0, insertion) + insertionText + frontmatterBody.slice(insertion);
  const nextFrontmatter =
    frontmatter.slice(0, bodyOffset) +
    nextBody +
    frontmatter.slice(bodyOffset + frontmatterBody.length);
  return {
    ok: true,
    changed: true,
    documentId: input.documentId,
    markdown: nextFrontmatter + input.markdown.slice(frontmatter.length),
  };
}
