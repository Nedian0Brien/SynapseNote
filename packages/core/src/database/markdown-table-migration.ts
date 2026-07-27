import {
  createDatabaseDocumentIdFromLegacyRecordId,
  createDatabaseMarkdownRecordId,
  ensureDatabaseDocumentIdentity,
} from './document-identity.ts';
import { stripFrontmatter, unwrapFrontmatterFences } from '../extensions/frontmatter.ts';
import {
  normalizeDatabaseDocumentTitle,
  replaceDatabaseDocumentTitle,
  resolveDatabaseDocumentTitle,
} from './markdown-table-document.ts';
import {
  encodeDatabaseMarkdownCell,
  encodeDatabaseMarkdownCellText,
  DATABASE_MARKDOWN_LIMITS,
  serializeDatabaseMarkdownOwnerMarker,
  type DatabaseMarkdownDocumentLink,
} from './markdown-table.ts';
import { DATABASE_MANIFEST_MAX_BYTES, serializeDatabaseManifestYaml } from './manifest.ts';
import { materializeDatabaseRecord, type DatabaseRecord } from './record.ts';
import {
  type DatabaseDefinition,
  type DatabaseProperty,
  type DatabaseRecordId,
  type DatabaseSource,
  type DatabaseRecordActor,
  DatabaseDefinitionSchema,
  parseDatabaseRecordActorKey,
} from './schema.ts';

export interface DatabaseMarkdownV1MigrationRecordInput {
  databaseId: string;
  sourceId: string;
  path: string;
  markdown: string;
}

export interface DatabaseMarkdownV2MigrationOwnerInput {
  sourceId: string;
  path: string;
  blockId: string;
}

/** Explicit resolution for a v1 record title/document title conflict. */
export type DatabaseMarkdownV2MigrationTitleChoice =
  | { kind: 'keep_document_title' }
  | { kind: 'use_record_title' }
  | { kind: 'custom_title'; title: string };

export interface DatabaseMarkdownV2MigrationAlias {
  legacyRecordId: DatabaseRecordId;
  sourceId: string;
  documentId: string;
  canonicalRecordId: DatabaseRecordId;
  archivedAt?: string | null;
  createdAt?: string;
  lastEditedAt?: string;
  createdBy?: DatabaseRecordActor;
  lastEditedBy?: DatabaseRecordActor;
  pageLayoutOverride?: DatabaseRecord['pageLayoutOverride'];
}

export type DatabaseMarkdownV2MigrationBlockCode =
  | 'unsupported_manifest_version'
  | 'unknown_source'
  | 'duplicate_record_id'
  | 'record_materialization_failed'
  | 'invalid_document_identity'
  | 'title_conflict'
  | 'title_choice_invalid'
  | 'owner_path_collision'
  | 'unsafe_owner_path'
  | 'relation_target_missing'
  | 'unsupported_property_value'
  | 'invalid_generated_manifest'
  | 'alias_limit_exceeded'
  | 'resource_limit';

export interface DatabaseMarkdownV2MigrationBlocker {
  code: DatabaseMarkdownV2MigrationBlockCode;
  sourceId?: string;
  path?: string;
  propertyId?: string;
  message: string;
}

export interface DatabaseMarkdownV2MigrationPlan {
  status: 'ready' | 'blocked';
  definition: DatabaseDefinition | null;
  ownerDocuments: Readonly<Record<string, string>>;
  linkedDocuments: Readonly<Record<string, string>>;
  aliases: readonly DatabaseMarkdownV2MigrationAlias[];
  blockers: readonly DatabaseMarkdownV2MigrationBlocker[];
}

const DERIVED_PROPERTY_TYPES = new Set<DatabaseProperty['type']>([
  'formula',
  'rollup',
  'created_time',
  'last_edited_time',
  'created_by',
  'last_edited_by',
  'verification',
  'button',
]);

function safeOwnerPath(path: string): boolean {
  return (
    path.endsWith('.md') &&
    !path.includes('\0') &&
    !path.includes('\\') &&
    !path.startsWith('/') &&
    !/^[A-Za-z]:/.test(path) &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function removeLegacyDatabaseMetadata(markdown: string): string {
  const { frontmatter } = stripFrontmatter(markdown);
  if (frontmatter === '') return markdown;
  const body = unwrapFrontmatterFences(frontmatter);
  const eol = frontmatter.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);
  const output: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!/^_sn:[ \t]*$/.test(line)) {
      output.push(line);
      continue;
    }
    const nested: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length && (/^[ \t]+/.test(lines[cursor] ?? '') || (lines[cursor] ?? '').trim() === '')) {
      const nestedLine = lines[cursor] ?? '';
      const ownedKey = /^\s{2}(?:database_id|source_id|record_id|created_at|last_edited_at|created_by|last_edited_by|archived_at|page_layout_override):\s*/.test(nestedLine);
      if (ownedKey) {
        cursor += 1;
        // page_layout_override is a nested mapping. Drop its indented
        // children together with the owned key instead of leaving orphaned
        // YAML lines in the linked document frontmatter.
        while (
          cursor < lines.length &&
          (/^\s{4,}/.test(lines[cursor] ?? '') || (lines[cursor] ?? '').trim() === '')
        ) {
          cursor += 1;
        }
        continue;
      }
      nested.push(nestedLine);
      cursor += 1;
    }
    if (nested.some((nestedLine) => nestedLine.trim() !== '')) output.push(line, ...nested);
    index = cursor - 1;
  }
  const nextBody = output.join(eol);
  const bodyOffset = frontmatter.indexOf(body);
  if (bodyOffset < 0) return markdown;
  const nextFrontmatter =
    frontmatter.slice(0, bodyOffset) +
    nextBody +
    frontmatter.slice(bodyOffset + body.length);
  return nextFrontmatter + markdown.slice(frontmatter.length);
}

function withoutExtension(path: string): string {
  return path.replace(/\.(?:md|mdx)$/i, '');
}

function link(target: string, alias?: string): DatabaseMarkdownDocumentLink {
  return { kind: 'wikilink', target: withoutExtension(target), ...(alias ? { alias } : {}) };
}

function propertyCellValue(
  property: DatabaseProperty,
  value: unknown,
  record: DatabaseRecord,
  recordsById: ReadonlyMap<string, DatabaseMarkdownV1MigrationRecordInput>,
  people: DatabaseDefinition['people'],
  titleOverride?: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (property.type === 'title') return { ok: true, value: link(record.path, titleOverride ?? String(value ?? '')) };
  if (property.type === 'select' || property.type === 'status') {
    const option = property.options.find((candidate) => candidate.id === value);
    return option
      ? { ok: true, value: option.key }
      : { ok: false, message: `Property "${property.key}" has unknown option ID "${String(value)}"` };
  }
  if (property.type === 'multi_select') {
    if (!Array.isArray(value)) return { ok: false, message: `Property "${property.key}" is not an option array` };
    const keys = value.map((id) => property.options.find((option) => option.id === id)?.key);
    return keys.every((key): key is string => key !== undefined)
      ? { ok: true, value: keys }
      : { ok: false, message: `Property "${property.key}" contains an unknown option ID` };
  }
  if (property.type === 'person') {
    if (!Array.isArray(value)) return { ok: false, message: `Property "${property.key}" is not a person array` };
    const links = value.map((id) => {
      const person = people.find((candidate) => candidate.id === id);
      return person ? link(person.key) : null;
    });
    return links.every((candidate): candidate is DatabaseMarkdownDocumentLink => candidate !== null)
      ? { ok: true, value: links }
      : { ok: false, message: `Property "${property.key}" contains an unknown person ID` };
  }
  if (property.type === 'relation') {
    const ids = Array.isArray(value) ? value : [value];
    const links = ids.map((id) => {
      const target = recordsById.get(String(id));
      return target ? link(target.path) : null;
    });
    if (!links.every((candidate): candidate is DatabaseMarkdownDocumentLink => candidate !== null)) {
      return { ok: false, message: `Property "${property.key}" contains an unresolved relation target` };
    }
    return { ok: true, value: property.cardinality === 'one' ? links[0] : links };
  }
  return { ok: true, value };
}

function encodeRow(
  source: DatabaseSource,
  record: DatabaseRecord,
  recordsById: ReadonlyMap<string, DatabaseMarkdownV1MigrationRecordInput>,
  people: DatabaseDefinition['people'],
  titleOverrides?: ReadonlyMap<string, string>,
): { ok: true; values: string[] } | { ok: false; propertyId: string; message: string } {
  const values: string[] = [];
  for (const propertyId of source.storage?.storedPropertyIds ?? []) {
    const property = source.properties.find((candidate) => candidate.id === propertyId);
    if (!property || DERIVED_PROPERTY_TYPES.has(property.type)) {
      return { ok: false, propertyId, message: 'Derived or unknown property cannot be stored in v2' };
    }
    const raw = record.values[property.id];
    if (raw === undefined) {
      const issue = record.issues?.find((candidate) => candidate.propertyId === property.id);
      if (issue) return { ok: false, propertyId, message: issue.message };
      values.push('');
      continue;
    }
    const projected = propertyCellValue(
      property,
      raw,
      record,
      recordsById,
      people,
      property.type === 'title' ? titleOverrides?.get(record.id) : undefined,
    );
    if (!projected.ok) return { ok: false, propertyId, message: projected.message };
    const encoded = encodeDatabaseMarkdownCell(property.type as Parameters<typeof encodeDatabaseMarkdownCell>[0], projected.value);
    if (!encoded.ok) return { ok: false, propertyId, message: encoded.message };
    values.push(encoded.text);
  }
  return { ok: true, values };
}

function ownerMarkdown(
  definition: DatabaseDefinition,
  source: DatabaseSource,
  owner: DatabaseMarkdownV2MigrationOwnerInput,
  rows: readonly string[][],
): string {
  const marker = serializeDatabaseMarkdownOwnerMarker({
    version: 2,
    databaseId: definition.id,
    sourceId: source.id,
    blockId: owner.blockId,
    columns: source.storage?.storedPropertyIds ?? [],
  });
  const headers = source.storage?.storedPropertyIds.map((propertyId) => {
    const name = source.properties.find((property) => property.id === propertyId)?.name ?? propertyId;
    return encodeDatabaseMarkdownCellText(name.replace(/[\r\n]+/gu, ' '));
  }) ?? [];
  const row = (values: readonly string[]) => `| ${values.join(' | ')} |`;
  return [marker, '', row(headers), row(headers.map(() => '---')), ...rows.map(row), ''].join('\n');
}

/**
 * Build a deterministic, non-mutating v1→v2 content plan. The caller owns
 * locking, backup, approval, atomic writes, and rollback; this function only
 * proves that every source value has a lossless v2 representation.
 */
export function planDatabaseMarkdownV2Migration(input: {
  definition: DatabaseDefinition;
  records: readonly DatabaseMarkdownV1MigrationRecordInput[];
  owners: readonly DatabaseMarkdownV2MigrationOwnerInput[];
  /** Keep legacy _sn database/source/record fields during additive cutover. */
  preserveLegacyMetadata?: boolean;
  /** Bind the compatibility metadata to the approved migration plan. */
  migrationCommittedAt?: string;
  /** Explicitly resolve each v1 record/document title conflict by record ID. */
  titleChoices?: Readonly<Record<string, DatabaseMarkdownV2MigrationTitleChoice>>;
}): DatabaseMarkdownV2MigrationPlan {
  const blockers: DatabaseMarkdownV2MigrationBlocker[] = [];
  if (input.definition.version !== 1) {
    blockers.push({ code: 'unsupported_manifest_version', message: 'Only a v1 manifest can be migrated to v2' });
    return { status: 'blocked', definition: null, ownerDocuments: {}, linkedDocuments: {}, aliases: [], blockers };
  }
  const ownerBySource = new Map(input.owners.map((owner) => [owner.sourceId, owner]));
  const ownerPaths = new Set<string>();
  for (const owner of input.owners) {
    if (!safeOwnerPath(owner.path)) blockers.push({ code: 'unsafe_owner_path', sourceId: owner.sourceId, path: owner.path, message: `Owner path "${owner.path}" is unsafe` });
    if (ownerPaths.has(owner.path)) blockers.push({ code: 'owner_path_collision', sourceId: owner.sourceId, path: owner.path, message: `Owner path "${owner.path}" is used more than once` });
    ownerPaths.add(owner.path);
  }
  const recordsById = new Map<string, DatabaseMarkdownV1MigrationRecordInput>();
  const materialized = new Map<string, DatabaseRecord>();
  const documentIds = new Map<string, string>();
  const titleOverrides = new Map<string, string>();
  const linkedDocuments: Record<string, string> = {};
  for (const record of input.records) {
    const source = input.definition.sources.find((candidate) => candidate.id === record.sourceId);
    if (!source) {
      blockers.push({ code: 'unknown_source', sourceId: record.sourceId, path: record.path, message: `Source "${record.sourceId}" is not defined by the manifest` });
      continue;
    }
    const result = materializeDatabaseRecord({ definition: input.definition, sourceId: source.id, path: record.path, markdown: record.markdown, preserveInvalidValues: true });
    if (!result.ok) {
      blockers.push({ code: 'record_materialization_failed', sourceId: source.id, path: record.path, message: result.message });
      continue;
    }
    const recordId = result.record.id;
    if (recordsById.has(recordId)) {
      blockers.push({ code: 'duplicate_record_id', sourceId: source.id, path: record.path, message: `Record ID "${recordId}" is duplicated` });
      continue;
    }
    recordsById.set(recordId, record);
    materialized.set(recordId, result.record);
    const titleProperty = source.properties.find((property) => property.type === 'title');
    const recordTitle = titleProperty ? result.record.values[titleProperty.id] : undefined;
    if (typeof recordTitle === 'string') {
      const documentTitle = resolveDatabaseDocumentTitle(record.markdown, record.path).value;
      if (documentTitle !== recordTitle) {
        const choice = input.titleChoices?.[recordId];
        if (!choice) {
          blockers.push({
            code: 'title_conflict',
            sourceId: source.id,
            path: record.path,
            propertyId: titleProperty?.id,
            message: `V1 Title "${recordTitle}" conflicts with document title "${documentTitle}"; choose which title to keep before migration`,
          });
        } else if (choice.kind === 'keep_document_title') {
          titleOverrides.set(recordId, documentTitle);
        } else {
          const selectedTitle = choice.kind === 'use_record_title' ? recordTitle : choice.title;
          const normalized = normalizeDatabaseDocumentTitle(selectedTitle);
          if (!normalized.ok) {
            blockers.push({
              code: 'title_choice_invalid',
              sourceId: source.id,
              path: record.path,
              propertyId: titleProperty?.id,
              message: `Selected migration title is invalid: ${normalized.message}`,
            });
          } else {
            titleOverrides.set(recordId, normalized.value);
          }
        }
      } else {
        titleOverrides.set(recordId, documentTitle);
      }
    }
    const documentId = createDatabaseDocumentIdFromLegacyRecordId(recordId);
    documentIds.set(recordId, documentId);
    const ensured = ensureDatabaseDocumentIdentity({ markdown: record.markdown, documentId });
    if (!ensured.ok) {
      blockers.push({ code: 'invalid_document_identity', sourceId: source.id, path: record.path, message: ensured.message });
      continue;
    }
    if (ensured.documentId !== documentId) {
      blockers.push({
        code: 'invalid_document_identity',
        sourceId: source.id,
        path: record.path,
        message: `Existing document identity "${ensured.documentId}" conflicts with the planned identity "${documentId}"`,
      });
      continue;
    }
    let linkedMarkdown = ensured.markdown;
    const selectedTitle = titleOverrides.get(recordId);
    if (selectedTitle && selectedTitle !== resolveDatabaseDocumentTitle(linkedMarkdown, record.path).value) {
      const replaced = replaceDatabaseDocumentTitle(linkedMarkdown, selectedTitle);
      if (!replaced.ok) {
        blockers.push({
          code: 'title_choice_invalid',
          sourceId: source.id,
          path: record.path,
          message: `Unable to apply the selected document title: ${replaced.message}`,
        });
      } else {
        linkedMarkdown = replaced.markdown;
      }
    }
    linkedDocuments[record.path] = input.preserveLegacyMetadata
      ? linkedMarkdown
      : removeLegacyDatabaseMetadata(linkedMarkdown);
  }

  const ownerDocuments: Record<string, string> = {};
  const aliases: DatabaseMarkdownV2MigrationAlias[] = [];
  for (const source of input.definition.sources) {
    const owner = ownerBySource.get(source.id);
    if (!owner) {
      blockers.push({ code: 'owner_path_collision', sourceId: source.id, message: `Source "${source.id}" has no selected owner path` });
      continue;
    }
    const storedPropertyIds = source.properties
      .filter((property) => !DERIVED_PROPERTY_TYPES.has(property.type))
      .map((property) => property.id);
    const migrationSource: DatabaseSource = {
      ...source,
      storage: {
        kind: 'markdown_table',
        formatVersion: 2,
        owner: { path: owner.path, blockId: owner.blockId },
        titlePropertyId: source.properties.find((property) => property.type === 'title')?.id ?? '',
        storedPropertyIds,
      },
    };
    const rows: string[][] = [];
    for (const recordInput of input.records.filter((record) => record.sourceId === source.id).sort((left, right) => left.path.localeCompare(right.path))) {
      const materializedRecord = [...materialized.values()].find((candidate) => candidate.path === recordInput.path);
      if (!materializedRecord) continue;
      const encoded = encodeRow(
        migrationSource,
        materializedRecord,
        recordsById,
        input.definition.people,
        titleOverrides,
      );
      if (!encoded.ok) {
        blockers.push({ code: 'unsupported_property_value', sourceId: source.id, path: recordInput.path, propertyId: encoded.propertyId, message: encoded.message });
        continue;
      }
      rows.push(encoded.values);
      const alias: DatabaseMarkdownV2MigrationAlias = {
        legacyRecordId: materializedRecord.id,
        sourceId: source.id,
        documentId: documentIds.get(materializedRecord.id)!,
        canonicalRecordId: createDatabaseMarkdownRecordId(
          source.id,
          documentIds.get(materializedRecord.id)!,
        ),
      };
      const createdTime = source.properties.find((property) => property.type === 'created_time');
      const lastEditedTime = source.properties.find((property) => property.type === 'last_edited_time');
      const createdBy = source.properties.find((property) => property.type === 'created_by');
      const lastEditedBy = source.properties.find((property) => property.type === 'last_edited_by');
      const createdAt = createdTime ? materializedRecord.values[createdTime.id] : undefined;
      const lastEditedAt = lastEditedTime ? materializedRecord.values[lastEditedTime.id] : undefined;
      const createdActor = createdBy ? materializedRecord.values[createdBy.id] : undefined;
      const lastEditedActor = lastEditedBy ? materializedRecord.values[lastEditedBy.id] : undefined;
      if (materializedRecord.archivedAt !== null && materializedRecord.archivedAt !== undefined) {
        alias.archivedAt = materializedRecord.archivedAt;
      }
      if (typeof createdAt === 'string') alias.createdAt = createdAt;
      if (typeof lastEditedAt === 'string') alias.lastEditedAt = lastEditedAt;
      if (typeof createdActor === 'string') {
        const parsed = parseDatabaseRecordActorKey(createdActor);
        if (parsed) alias.createdBy = parsed;
      }
      if (typeof lastEditedActor === 'string') {
        const parsed = parseDatabaseRecordActorKey(lastEditedActor);
        if (parsed) alias.lastEditedBy = parsed;
      }
      if (materializedRecord.pageLayoutOverride) {
        alias.pageLayoutOverride = structuredClone(materializedRecord.pageLayoutOverride);
      }
      aliases.push(alias);
      if (aliases.length > 10_000) {
        blockers.push({
          code: 'alias_limit_exceeded',
          sourceId: source.id,
          path: recordInput.path,
          message: 'The migration exceeds the 10000 legacy record alias limit',
        });
      }
    }
    const renderedOwner = ownerMarkdown(input.definition, migrationSource, owner, rows);
    if (new TextEncoder().encode(renderedOwner).byteLength > DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes) {
      blockers.push({
        code: 'resource_limit',
        sourceId: source.id,
        path: owner.path,
        message: `Owner document exceeds the ${DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes}-byte limit`,
      });
    }
    ownerDocuments[owner.path] = renderedOwner;
  }

  const sources = input.definition.sources.map((source) => {
    const owner = ownerBySource.get(source.id);
    const titlePropertyId = source.properties.find((property) => property.type === 'title')?.id ?? '';
    const storedPropertyIds = source.properties.filter((property) => !DERIVED_PROPERTY_TYPES.has(property.type)).map((property) => property.id);
    return {
      ...source,
      storage: owner
        ? { kind: 'markdown_table' as const, formatVersion: 2 as const, owner: { path: owner.path, blockId: owner.blockId }, titlePropertyId, storedPropertyIds }
        : undefined,
    };
  });
  let definition: DatabaseDefinition | null = null;
  if (blockers.length === 0) {
    const migration = input.migrationCommittedAt
      ? {
          fromVersion: 1 as const,
          committedAt: input.migrationCommittedAt,
          sourceFolders: Object.fromEntries(
            input.definition.sources.map((source) => [source.id, source.folder]),
          ),
          legacyRecordIds: Object.fromEntries(
            aliases.map((alias) => [
              alias.legacyRecordId,
              {
                sourceId: alias.sourceId,
                documentId: alias.documentId,
                canonicalRecordId: alias.canonicalRecordId,
                ...(alias.archivedAt !== undefined ? { archivedAt: alias.archivedAt } : {}),
                ...(alias.createdAt !== undefined ? { createdAt: alias.createdAt } : {}),
                ...(alias.lastEditedAt !== undefined ? { lastEditedAt: alias.lastEditedAt } : {}),
                ...(alias.createdBy !== undefined ? { createdBy: alias.createdBy } : {}),
                ...(alias.lastEditedBy !== undefined ? { lastEditedBy: alias.lastEditedBy } : {}),
                ...(alias.pageLayoutOverride !== undefined
                  ? { pageLayoutOverride: alias.pageLayoutOverride }
                  : {}),
              },
            ]),
          ),
        }
      : undefined;
    const parsed = DatabaseDefinitionSchema.safeParse({
      ...input.definition,
      version: 2,
      sources,
      ...(migration ? { migration } : {}),
    });
    if (parsed.success) {
      const yaml = serializeDatabaseManifestYaml(parsed.data);
      if (new TextEncoder().encode(yaml).byteLength > DATABASE_MANIFEST_MAX_BYTES) {
        blockers.push({
          code: 'resource_limit',
          message: `Generated manifest exceeds the ${DATABASE_MANIFEST_MAX_BYTES}-byte limit`,
        });
      } else {
        definition = parsed.data;
      }
    }
    else blockers.push({ code: 'invalid_generated_manifest', message: parsed.error.message });
  }
  return {
    status: blockers.length === 0 ? 'ready' : 'blocked',
    definition,
    ownerDocuments: blockers.length === 0 ? ownerDocuments : {},
    linkedDocuments: blockers.length === 0 ? linkedDocuments : {},
    aliases,
    blockers,
  };
}
