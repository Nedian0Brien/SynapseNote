import {
  Document,
  isMap,
  isNode,
  isScalar,
  isSeq,
  LineCounter,
  type Node,
  type Pair,
  type ParsedNode,
  parseDocument,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';
import {
  DATABASE_PROPERTY_TYPES,
  DATABASE_MANIFEST_SUPPORTED_VERSIONS,
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
} from './schema.ts';

export type DatabaseManifestDiagnosticCode =
  | 'manifest_too_large'
  | 'manifest_structure_limit'
  | 'yaml_parse_error'
  | 'yaml_conversion_error'
  | 'unknown_manifest_version'
  | 'schema_validation_error';

export interface DatabaseManifestDiagnostic {
  code: DatabaseManifestDiagnosticCode;
  message: string;
  path: readonly (string | number)[];
  line: number | null;
  column: number | null;
}

export interface UnsupportedDatabaseObject {
  kind: 'property' | 'view';
  type: string;
  path: readonly (string | number)[];
  raw: Readonly<Record<string, unknown>>;
}

export type ParsedDatabaseManifest =
  | { ok: true; definition: DatabaseDefinition }
  | {
      ok: false;
      error: string;
      diagnostics: readonly DatabaseManifestDiagnostic[];
      unsupportedObjects: readonly UnsupportedDatabaseObject[];
    };

/** Hard parsing boundary for one canonical `.ok/databases/*.yml` file. */
export const DATABASE_MANIFEST_MAX_BYTES = 1_048_576;

/** Explicit YAML expansion ceiling; never rely on a library-default change. */
export const DATABASE_MANIFEST_MAX_ALIAS_COUNT = 100;
export const DATABASE_MANIFEST_MAX_DEPTH = 128;
export const DATABASE_MANIFEST_MAX_NODES = 50_000;

export function databaseManifestByteLength(yaml: string): number {
  return new TextEncoder().encode(yaml).byteLength;
}

function databaseManifestStructureProblem(document: Document): string | null {
  if (!isNode(document.contents)) return null;
  const pending: { node: Node; depth: number }[] = [{ node: document.contents, depth: 1 }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > DATABASE_MANIFEST_MAX_NODES) {
      return `Database manifest exceeds ${DATABASE_MANIFEST_MAX_NODES} YAML nodes`;
    }
    if (current.depth > DATABASE_MANIFEST_MAX_DEPTH) {
      return `Database manifest exceeds YAML depth ${DATABASE_MANIFEST_MAX_DEPTH}`;
    }
    if (isMap(current.node)) {
      for (const pair of current.node.items) {
        if (isNode(pair.key)) pending.push({ node: pair.key, depth: current.depth + 1 });
        if (isNode(pair.value)) pending.push({ node: pair.value, depth: current.depth + 1 });
      }
    } else if (isSeq(current.node)) {
      for (const item of current.node.items) {
        if (isNode(item)) pending.push({ node: item, depth: current.depth + 1 });
      }
    }
  }
  return null;
}

function inspectUnsupportedObjects(value: unknown): UnsupportedDatabaseObject[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  const root = value as Record<string, unknown>;
  const unsupported: UnsupportedDatabaseObject[] = [];
  if (Array.isArray(root.sources)) {
    for (const [sourceIndex, sourceValue] of root.sources.entries()) {
      if (sourceValue === null || typeof sourceValue !== 'object' || Array.isArray(sourceValue)) {
        continue;
      }
      const properties = (sourceValue as Record<string, unknown>).properties;
      if (!Array.isArray(properties)) continue;
      for (const [propertyIndex, propertyValue] of properties.entries()) {
        if (
          propertyValue === null ||
          typeof propertyValue !== 'object' ||
          Array.isArray(propertyValue)
        ) {
          continue;
        }
        const raw = propertyValue as Record<string, unknown>;
        if (
          typeof raw.type === 'string' &&
          !DATABASE_PROPERTY_TYPES.includes(raw.type as (typeof DATABASE_PROPERTY_TYPES)[number])
        ) {
          unsupported.push({
            kind: 'property',
            type: raw.type,
            path: ['sources', sourceIndex, 'properties', propertyIndex],
            raw: structuredClone(raw),
          });
        }
      }
    }
  }
  if (Array.isArray(root.views)) {
    for (const [viewIndex, viewValue] of root.views.entries()) {
      if (viewValue === null || typeof viewValue !== 'object' || Array.isArray(viewValue)) continue;
      const raw = viewValue as Record<string, unknown>;
      if (typeof raw.type === 'string') {
        unsupported.push({
          kind: 'view',
          type: raw.type,
          path: ['views', viewIndex],
          raw: structuredClone(raw),
        });
      }
    }
  }
  return unsupported;
}

function nodePosition(
  document: Document,
  lineCounter: LineCounter,
  path: readonly PropertyKey[],
): { line: number | null; column: number | null } {
  const node = document.getIn(path, true);
  if (!isNode(node) || node.range === null || node.range === undefined) {
    return { line: null, column: null };
  }
  const position = lineCounter.linePos(node.range[0]);
  return { line: position.line || null, column: position.col || null };
}

/** Parse and validate the body of one `.ok/databases/<key>.yml` file. */
export function parseDatabaseManifestYaml(yaml: string): ParsedDatabaseManifest {
  const byteLength = databaseManifestByteLength(yaml);
  if (byteLength > DATABASE_MANIFEST_MAX_BYTES) {
    const message = `Database manifest exceeds ${DATABASE_MANIFEST_MAX_BYTES} bytes`;
    return {
      ok: false,
      error: message,
      diagnostics: [
        {
          code: 'manifest_too_large',
          message,
          path: [],
          line: null,
          column: null,
        },
      ],
      unsupportedObjects: [],
    };
  }
  const lineCounter = new LineCounter();
  let document: Document;
  try {
    document = parseDocument(yaml, { lineCounter });
  } catch (error) {
    const message = `Database manifest YAML parse threw: ${error instanceof Error ? error.message : String(error)}`;
    return {
      ok: false,
      error: message,
      diagnostics: [
        {
          code: 'yaml_parse_error',
          message,
          path: [],
          line: null,
          column: null,
        },
      ],
      unsupportedObjects: [],
    };
  }

  if (document.errors.length > 0) {
    const diagnostics = document.errors.map((error) => ({
      code: 'yaml_parse_error' as const,
      message: error.message,
      path: [],
      line: error.linePos?.[0]?.line ?? null,
      column: error.linePos?.[0]?.col ?? null,
    }));
    return {
      ok: false,
      error: `Database manifest YAML is malformed: ${diagnostics[0]?.message ?? 'unknown error'}`,
      diagnostics,
      unsupportedObjects: [],
    };
  }

  const structureProblem = databaseManifestStructureProblem(document);
  if (structureProblem) {
    return {
      ok: false,
      error: structureProblem,
      diagnostics: [
        {
          code: 'manifest_structure_limit',
          message: structureProblem,
          path: [],
          line: null,
          column: null,
        },
      ],
      unsupportedObjects: [],
    };
  }

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: DATABASE_MANIFEST_MAX_ALIAS_COUNT });
  } catch (error) {
    const message = `Database manifest YAML conversion failed: ${error instanceof Error ? error.message : String(error)}`;
    return {
      ok: false,
      error: message,
      diagnostics: [
        {
          code: 'yaml_conversion_error',
          message,
          path: [],
          line: null,
          column: null,
        },
      ],
      unsupportedObjects: [],
    };
  }

  const parsed = DatabaseDefinitionSchema.safeParse(value);
  if (!parsed.success) {
    const diagnostics = parsed.error.issues.map((issue) => {
      const path = issue.path.filter(
        (segment): segment is string | number =>
          typeof segment === 'string' || typeof segment === 'number',
      );
      const position = nodePosition(document, lineCounter, path);
      const unknownVersion =
        path.length === 1 &&
        path[0] === 'version' &&
        value !== null &&
        typeof value === 'object' &&
        'version' in value &&
        !DATABASE_MANIFEST_SUPPORTED_VERSIONS.some(
          (supported) => supported === Number((value as { version?: unknown }).version),
        );
      return {
        code: unknownVersion
          ? ('unknown_manifest_version' as const)
          : ('schema_validation_error' as const),
        message: issue.message,
        path,
        ...position,
      };
    });
    const issue = diagnostics[0];
    const path = issue?.path.join('.') ?? '';
    const location = path === '' ? '' : ` at "${path}"`;
    return {
      ok: false,
      error: `Invalid database manifest${location}: ${issue?.message ?? 'unknown validation error'}`,
      diagnostics,
      unsupportedObjects: inspectUnsupportedObjects(value),
    };
  }

  return { ok: true, definition: parsed.data };
}

function stripV1SourceStorageFieldsFromV2Document(document: Document): void {
  const version = document.get('version', true);
  if (!isScalar(version) || Number(version.value) !== 2) return;
  const sources = document.get('sources', true);
  if (!isSeq(sources)) return;
  for (const source of sources.items) {
    if (!isMap(source)) continue;
    source.items = source.items.filter((pair) => {
      if (!isScalar(pair.key)) return true;
      const key = String(pair.key.value);
      return key !== 'folder' && key !== 'includeSubfolders';
    });
  }
}

/** Serialize a validated v1 or v2 definition deterministically, without writing it. */
export function serializeDatabaseManifestYaml(input: unknown): string {
  const definition = DatabaseDefinitionSchema.parse(input);
  const document = new Document(definition);
  stripV1SourceStorageFieldsFromV2Document(document);
  return document.toString({ lineWidth: 0 });
}

function mappingKey(pair: Pair<unknown, unknown>): string | null {
  if (typeof pair.key === 'string') return pair.key;
  if (isScalar(pair.key) && typeof pair.key.value === 'string') return pair.key.value;
  return null;
}

function stableSequenceId(value: unknown): string | null {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as { id?: unknown }).id !== 'string'
  ) {
    return null;
  }
  return (value as { id: string }).id;
}

function stableNodeId(node: unknown): string | null {
  if (!isMap(node)) return null;
  const id = node.get('id');
  return typeof id === 'string' ? id : null;
}

function copyNodePresentation(from: Node | null, to: Node): Node {
  if (!from) return to;
  to.comment = from.comment;
  to.commentBefore = from.commentBefore;
  to.spaceBefore = from.spaceBefore;
  return to;
}

/**
 * Reconcile a validated definition into an existing YAML node tree. Mapping
 * pairs retain their original source order, while stable-ID sequence members
 * retain comments and scalar presentation even when intentionally reordered.
 */
function reconcileManifestNode(document: Document, current: Node | null, desired: unknown): Node {
  if (Array.isArray(desired)) {
    if (!isSeq(current)) {
      return copyNodePresentation(current, document.createNode(desired) as Node);
    }
    const sequence = current as YAMLSeq<Node>;
    const desiredIds = desired.map(stableSequenceId);
    const useStableIds =
      desiredIds.length > 0 &&
      desiredIds.every((id): id is string => id !== null) &&
      new Set(desiredIds).size === desiredIds.length;
    if (useStableIds) {
      const existingById = new Map(
        sequence.items
          .map((node) => [stableNodeId(node), node] as const)
          .filter((entry): entry is readonly [string, Node] => entry[0] !== null),
      );
      sequence.items = desired.map((value, index) =>
        reconcileManifestNode(
          document,
          existingById.get(desiredIds[index] as string) ?? null,
          value,
        ),
      );
    } else {
      sequence.items = desired.map((value, index) =>
        reconcileManifestNode(document, sequence.items[index] ?? null, value),
      );
    }
    return sequence;
  }

  if (desired !== null && typeof desired === 'object') {
    if (!isMap(current)) {
      return copyNodePresentation(current, document.createNode(desired) as Node);
    }
    const mapping = current as YAMLMap<Node, Node>;
    const desiredEntries = Object.entries(desired as Record<string, unknown>).filter(
      (entry): entry is [string, unknown] => entry[1] !== undefined,
    );
    const remaining = new Map(desiredEntries);
    const nextPairs: Pair<Node, Node>[] = [];
    for (const pair of mapping.items) {
      const key = mappingKey(pair);
      if (key === null || !remaining.has(key)) continue;
      pair.value = reconcileManifestNode(
        document,
        isNode(pair.value) ? pair.value : null,
        remaining.get(key),
      );
      nextPairs.push(pair);
      remaining.delete(key);
    }
    for (const [key, value] of remaining) {
      const created = document.createNode({ [key]: value }) as YAMLMap<Node, Node>;
      const pair = created.items[0];
      if (pair) nextPairs.push(pair);
    }
    mapping.items = nextPairs;
    return mapping;
  }

  if (isScalar(current) && typeof current.value === typeof desired) {
    current.value = desired;
    current.source = undefined;
    return current;
  }
  return copyNodePresentation(current, document.createNode(desired) as Node);
}

/**
 * Update a valid manifest without discarding its comments, mapping order, or
 * presentation attached to stable-ID source/property/option/view nodes.
 */
export function updateDatabaseManifestYaml(existingYaml: string, input: unknown): string {
  const definition = DatabaseDefinitionSchema.parse(input);
  const existing = parseDatabaseManifestYaml(existingYaml);
  if (!existing.ok) throw new Error(existing.error);

  const document = parseDocument(existingYaml);
  if (document.errors.length > 0 || !isMap(document.contents)) {
    throw new Error(
      `Database manifest YAML cannot be edited: ${document.errors[0]?.message ?? 'root must be a mapping'}`,
    );
  }
  document.contents = reconcileManifestNode(document, document.contents, definition) as ParsedNode;
  stripV1SourceStorageFieldsFromV2Document(document);
  let result = document.toString({ lineWidth: 0 });
  if (existingYaml.includes('\r\n')) result = result.replaceAll('\n', '\r\n');

  const verified = parseDatabaseManifestYaml(result);
  if (!verified.ok) throw new Error(`Edited database manifest is invalid: ${verified.error}`);
  return result;
}
