import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { stripFrontmatter, unwrapFrontmatterFences } from '../extensions/frontmatter.ts';
import { parseFrontmatterYaml } from '../frontmatter/yaml-codec.ts';
import { isValidDatabaseEmail, isValidDatabasePhone, isValidDatabaseUrl } from './schema.ts';

export const DATABASE_PORTABLE_BUNDLE_SCHEMA = 'synapsenote.database-bundle' as const;
export const DATABASE_PORTABLE_BUNDLE_VERSION = 1 as const;
export const DATABASE_INTERCHANGE_MAX_FILES = 100_000;
export const DATABASE_INTERCHANGE_MAX_TEXT_BYTES = 512 * 1024 * 1024;

export interface DatabaseMarkdownImportFile {
  path: string;
  markdown: string;
}

export type DatabaseInferredPropertyType =
  | 'title'
  | 'text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'multi_select'
  | 'url'
  | 'email'
  | 'phone';

export interface DatabaseMarkdownImportPropertyDraft {
  key: string;
  name: string;
  type: DatabaseInferredPropertyType;
  sourceKeys: readonly string[];
  present: number;
  empty: number;
  confidence: 'exact' | 'mixed';
  ownership: 'proposed';
  options?: readonly { key: string; name: string }[];
}

export interface DatabaseMarkdownImportRecordDraft {
  path: string;
  title: string;
  titleSource: 'frontmatter' | 'filename';
  values: Readonly<Record<string, unknown>>;
  body: string;
  retainedMetadata: Readonly<Record<string, unknown>>;
}

export interface DatabaseMarkdownImportIssue {
  path: string;
  code: 'malformed_frontmatter' | 'mixed_property_types' | 'key_collision';
  severity: 'warning' | 'blocking';
  propertyKey?: string;
  message: string;
}

export interface DatabaseMarkdownImportDraft {
  version: 1;
  kind: 'markdown-folder';
  requiresConfirmation: true;
  complete: true;
  properties: readonly DatabaseMarkdownImportPropertyDraft[];
  records: readonly DatabaseMarkdownImportRecordDraft[];
  issues: readonly DatabaseMarkdownImportIssue[];
  summary: {
    files: number;
    proposedProperties: number;
    retainedMetadataValues: number;
    blockingIssues: number;
  };
}

function safeRelativePath(value: string): boolean {
  if (!value || value.includes('\0') || value.includes('\\') || value.startsWith('/')) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function stableKey(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[a-z]/.test(normalized) ? normalized.slice(0, 128) : `field_${normalized || 'value'}`;
}

function displayName(value: string): string {
  const trimmed = value.replace(/[_-]+/g, ' ').trim();
  return trimmed ? `${trimmed[0]?.toLocaleUpperCase()}${trimmed.slice(1)}` : 'Value';
}

function inferScalar(value: unknown): Exclude<DatabaseInferredPropertyType, 'title'> {
  if (Array.isArray(value)) return 'multi_select';
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value !== 'string') return 'text';
  if (
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
      value,
    )
  )
    return 'date';
  if (isValidDatabaseUrl(value)) return 'url';
  if (isValidDatabaseEmail(value)) return 'email';
  if (isValidDatabasePhone(value)) return 'phone';
  return 'text';
}

function titleFromPath(path: string): string {
  const name = posix.basename(path).replace(/\.(?:md|mdx)$/i, '');
  return name || 'Untitled';
}

/**
 * Produces a non-mutating schema/record draft. Every discovered metadata key
 * remains retained until the caller explicitly confirms its proposed ownership.
 */
export function inferDatabaseFromMarkdown(
  files: readonly DatabaseMarkdownImportFile[],
): DatabaseMarkdownImportDraft {
  if (files.length > DATABASE_INTERCHANGE_MAX_FILES)
    throw new Error('Markdown import file limit exceeded');
  const seenPaths = new Set<string>();
  let bytes = 0;
  const records: DatabaseMarkdownImportRecordDraft[] = [];
  const issues: DatabaseMarkdownImportIssue[] = [];
  const observations = new Map<
    string,
    { sourceKeys: Set<string>; values: unknown[]; present: number; empty: number }
  >();
  let retainedMetadataValues = 0;

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    if (!safeRelativePath(file.path) || !/\.(?:md|mdx)$/i.test(file.path))
      throw new Error(`Unsafe Markdown import path: ${file.path}`);
    if (seenPaths.has(file.path)) throw new Error(`Duplicate Markdown import path: ${file.path}`);
    seenPaths.add(file.path);
    bytes += Buffer.byteLength(file.markdown, 'utf8');
    if (bytes > DATABASE_INTERCHANGE_MAX_TEXT_BYTES)
      throw new Error('Markdown import byte limit exceeded');
    const { frontmatter, body } = stripFrontmatter(file.markdown);
    let metadata: Record<string, unknown> = {};
    if (frontmatter) {
      try {
        const parsed = parseFrontmatterYaml(unwrapFrontmatterFences(frontmatter)).map;
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Frontmatter root is not a mapping');
        }
        metadata = parsed;
      } catch {
        issues.push({
          path: file.path,
          code: 'malformed_frontmatter',
          severity: 'blocking',
          message: 'Frontmatter could not be parsed; the source file remains untouched.',
        });
      }
    }
    const retainedMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([key]) => key !== '_sn'),
    );
    retainedMetadataValues += Object.keys(retainedMetadata).length;
    const rawTitle = metadata.title ?? metadata.name;
    const title =
      typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : titleFromPath(file.path);
    const titleSource =
      typeof rawTitle === 'string' && rawTitle.trim() ? 'frontmatter' : 'filename';
    const values: Record<string, unknown> = { title };
    for (const [sourceKey, value] of Object.entries(retainedMetadata)) {
      if (sourceKey === 'title' || sourceKey === 'name') continue;
      const key = stableKey(sourceKey);
      const current = observations.get(key) ?? {
        sourceKeys: new Set(),
        values: [],
        present: 0,
        empty: 0,
      };
      current.sourceKeys.add(sourceKey);
      current.values.push(value);
      current.present += 1;
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0))
        current.empty += 1;
      observations.set(key, current);
      values[key] = value;
    }
    records.push({ path: file.path, title, titleSource, values, body, retainedMetadata });
  }

  const properties: DatabaseMarkdownImportPropertyDraft[] = [
    {
      key: 'title',
      name: 'Title',
      type: 'title',
      sourceKeys: ['title', 'name'],
      present: records.filter((record) => record.titleSource === 'frontmatter').length,
      empty: 0,
      confidence: 'exact',
      ownership: 'proposed',
    },
  ];
  for (const [key, observation] of [...observations].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const sourceKeys = [...observation.sourceKeys].sort();
    if (sourceKeys.length > 1) {
      issues.push({
        path: '<schema>',
        propertyKey: key,
        code: 'key_collision',
        severity: 'blocking',
        message: `Metadata keys ${sourceKeys.join(', ')} normalize to the same property key.`,
      });
    }
    const types = new Set(
      observation.values.filter((value) => value !== null && value !== '').map(inferScalar),
    );
    const type = types.size === 1 ? ([...types][0] ?? 'text') : 'text';
    const mixed = types.size > 1;
    if (mixed) {
      issues.push({
        path: '<schema>',
        propertyKey: key,
        code: 'mixed_property_types',
        severity: 'warning',
        message: `Property "${key}" has mixed value types and is proposed as text.`,
      });
    }
    const options =
      type === 'multi_select'
        ? [
            ...new Set(
              observation.values.flatMap((value) =>
                Array.isArray(value)
                  ? value.filter((item): item is string => typeof item === 'string')
                  : [],
              ),
            ),
          ]
            .sort((left, right) => left.localeCompare(right))
            .map((name) => ({ key: stableKey(name), name }))
        : undefined;
    properties.push({
      key,
      name: displayName(sourceKeys[0] ?? key),
      type,
      sourceKeys,
      present: observation.present,
      empty: observation.empty,
      confidence: mixed ? 'mixed' : 'exact',
      ownership: 'proposed',
      ...(options ? { options } : {}),
    });
  }
  return {
    version: 1,
    kind: 'markdown-folder',
    requiresConfirmation: true,
    complete: true,
    properties,
    records,
    issues,
    summary: {
      files: records.length,
      proposedProperties: properties.length,
      retainedMetadataValues,
      blockingIssues: issues.filter((issue) => issue.severity === 'blocking').length,
    },
  };
}

export interface DatabasePortableBundleTextEntry {
  path: string;
  sha256: string;
  content: string;
}

export interface DatabasePortableBundleAssetEntry {
  path: string;
  sha256: string | null;
  mediaType: string | null;
  bytesBase64: string | null;
  status: 'included' | 'missing';
}

export interface DatabasePortableBundle {
  schema: typeof DATABASE_PORTABLE_BUNDLE_SCHEMA;
  version: typeof DATABASE_PORTABLE_BUNDLE_VERSION;
  manifests: readonly DatabasePortableBundleTextEntry[];
  records: readonly DatabasePortableBundleTextEntry[];
  assets: readonly DatabasePortableBundleAssetEntry[];
  assetReferences: readonly {
    recordPath: string;
    assetPath: string;
    status: 'included' | 'missing';
  }[];
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256Bytes(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function decodeBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new Error('Portable asset bytes are not canonical base64');
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function localAssetReferences(recordPath: string, markdown: string): string[] {
  const references: string[] = [];
  const candidates = [
    ...markdown.matchAll(/!\[\[[^\]]*?([^\]|]+)(?:\|[^\]]+)?\]\]/g),
    ...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g),
  ];
  for (const match of candidates) {
    const raw = match[1]?.trim();
    if (!raw || /^(?:https?:|data:|#)/i.test(raw)) continue;
    const decoded = (() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })();
    const resolved = posix.normalize(posix.join(posix.dirname(recordPath), decoded));
    if (safeRelativePath(resolved)) references.push(resolved);
  }
  return [...new Set(references)].sort();
}

export function createDatabasePortableBundle(input: {
  manifests: readonly { path: string; yaml: string }[];
  records: readonly DatabaseMarkdownImportFile[];
  assets?: readonly { path: string; sha256: string; mediaType?: string; bytesBase64: string }[];
}): DatabasePortableBundle {
  if (
    input.manifests.length + input.records.length + (input.assets?.length ?? 0) >
    DATABASE_INTERCHANGE_MAX_FILES
  )
    throw new Error('Portable database bundle file limit exceeded');
  const assets = new Map<string, NonNullable<typeof input.assets>[number]>();
  for (const asset of input.assets ?? []) {
    if (!safeRelativePath(asset.path)) throw new Error(`Unsafe asset bundle path: ${asset.path}`);
    if (assets.has(asset.path)) throw new Error(`Duplicate asset bundle path: ${asset.path}`);
    if (!/^sha256:[a-f0-9]{64}$/.test(asset.sha256))
      throw new Error(`Invalid asset digest: ${asset.path}`);
    if (sha256Bytes(decodeBase64(asset.bytesBase64)) !== asset.sha256)
      throw new Error(`Asset digest mismatch: ${asset.path}`);
    assets.set(asset.path, asset);
  }
  const manifestEntries = input.manifests.map(({ path, yaml }) => {
    if (!safeRelativePath(path) || !/^\.ok\/databases\/.+\.ya?ml$/.test(path))
      throw new Error(`Unsafe manifest bundle path: ${path}`);
    return { path, sha256: sha256(yaml), content: yaml };
  });
  const recordEntries = input.records.map(({ path, markdown }) => {
    if (!safeRelativePath(path) || !/\.(?:md|mdx)$/i.test(path))
      throw new Error(`Unsafe record bundle path: ${path}`);
    return { path, sha256: sha256(markdown), content: markdown };
  });
  const references = input.records.flatMap((record) =>
    localAssetReferences(record.path, record.markdown).map((assetPath) => ({
      recordPath: record.path,
      assetPath,
      status: assets.has(assetPath) ? ('included' as const) : ('missing' as const),
    })),
  );
  const referenced = new Set(references.map((reference) => reference.assetPath));
  const assetEntries: DatabasePortableBundleAssetEntry[] = [
    ...[...assets.values()]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((asset) => ({
        path: asset.path,
        sha256: asset.sha256,
        mediaType: asset.mediaType ?? null,
        bytesBase64: asset.bytesBase64,
        status: 'included' as const,
      })),
    ...[...referenced]
      .filter((path) => !assets.has(path))
      .sort()
      .map((path) => ({
        path,
        sha256: null,
        mediaType: null,
        bytesBase64: null,
        status: 'missing' as const,
      })),
  ];
  return {
    schema: DATABASE_PORTABLE_BUNDLE_SCHEMA,
    version: DATABASE_PORTABLE_BUNDLE_VERSION,
    manifests: manifestEntries.sort((left, right) => left.path.localeCompare(right.path)),
    records: recordEntries.sort((left, right) => left.path.localeCompare(right.path)),
    assets: assetEntries,
    assetReferences: references.sort(
      (left, right) =>
        left.recordPath.localeCompare(right.recordPath) ||
        left.assetPath.localeCompare(right.assetPath),
    ),
  };
}

export function parseDatabasePortableBundle(value: unknown): DatabasePortableBundle {
  if (!value || typeof value !== 'object')
    throw new Error('Portable database bundle must be an object');
  const bundle = value as Partial<DatabasePortableBundle>;
  if (bundle.schema !== DATABASE_PORTABLE_BUNDLE_SCHEMA || bundle.version !== 1)
    throw new Error('Unsupported portable database bundle');
  if (
    !Array.isArray(bundle.manifests) ||
    !Array.isArray(bundle.records) ||
    !Array.isArray(bundle.assets) ||
    !Array.isArray(bundle.assetReferences)
  )
    throw new Error('Portable database bundle is incomplete');
  if (
    bundle.manifests.length + bundle.records.length + bundle.assets.length >
    DATABASE_INTERCHANGE_MAX_FILES
  )
    throw new Error('Portable database bundle file limit exceeded');
  let totalBytes = 0;
  const allPaths = new Set<string>();
  for (const entry of [...bundle.manifests, ...bundle.records]) {
    if (!safeRelativePath(entry.path) || allPaths.has(entry.path))
      throw new Error(`Invalid or duplicate portable bundle path: ${entry.path}`);
    allPaths.add(entry.path);
    totalBytes += Buffer.byteLength(entry.content, 'utf8');
    if (totalBytes > DATABASE_INTERCHANGE_MAX_TEXT_BYTES)
      throw new Error('Portable database bundle byte limit exceeded');
    if (sha256(entry.content) !== entry.sha256)
      throw new Error(`Portable bundle digest mismatch: ${entry.path}`);
  }
  for (const asset of bundle.assets) {
    if (!safeRelativePath(asset.path) || allPaths.has(asset.path))
      throw new Error(`Invalid or duplicate portable bundle path: ${asset.path}`);
    allPaths.add(asset.path);
    if (asset.status === 'included' && (!asset.sha256 || !asset.bytesBase64))
      throw new Error(`Included portable asset is incomplete: ${asset.path}`);
    if (asset.status === 'included') {
      if (!/^sha256:[a-f0-9]{64}$/.test(asset.sha256 as string))
        throw new Error(`Invalid portable asset digest: ${asset.path}`);
      const bytes = decodeBase64(asset.bytesBase64 as string);
      totalBytes += bytes.byteLength;
      if (totalBytes > DATABASE_INTERCHANGE_MAX_TEXT_BYTES)
        throw new Error('Portable database bundle byte limit exceeded');
      if (sha256Bytes(bytes) !== asset.sha256)
        throw new Error(`Portable asset digest mismatch: ${asset.path}`);
    }
    if (asset.status === 'missing' && (asset.sha256 !== null || asset.bytesBase64 !== null))
      throw new Error(`Missing portable asset unexpectedly carries bytes: ${asset.path}`);
  }
  const assetByPath = new Map(bundle.assets.map((asset) => [asset.path, asset] as const));
  for (const reference of bundle.assetReferences) {
    const asset = assetByPath.get(reference.assetPath);
    if (
      !asset ||
      asset.status !== reference.status ||
      !bundle.records.some((record) => record.path === reference.recordPath)
    )
      throw new Error(`Portable asset reference is inconsistent: ${reference.recordPath}`);
  }
  return structuredClone(bundle as DatabasePortableBundle);
}

export function serializeDatabasePortableBundle(bundle: DatabasePortableBundle): string {
  return `${JSON.stringify(parseDatabasePortableBundle(bundle), null, 2)}\n`;
}

export function parseDatabasePortableBundleJson(json: string): DatabasePortableBundle {
  if (Buffer.byteLength(json, 'utf8') > DATABASE_INTERCHANGE_MAX_TEXT_BYTES) {
    throw new Error('Portable database bundle byte limit exceeded');
  }
  return parseDatabasePortableBundle(JSON.parse(json));
}
