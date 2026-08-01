import { createHash } from 'node:crypto';
import {
  type DatabaseAccessPrincipal,
  type DatabaseDefinition,
  type DatabasePermissionAction,
  DatabaseQuerySchema,
  type DatabaseSource,
  type DatabaseView,
} from '@nedian0brien/synapsenote-core';

export type DatabaseCatalogMatchField =
  | 'database_key'
  | 'database_name'
  | 'database_alias'
  | 'purpose'
  | 'vocabulary'
  | 'source_key'
  | 'source_name'
  | 'record_meaning'
  | 'relation_key'
  | 'relation_name'
  | 'relation_target';

export interface DatabaseCatalogSourceCard {
  id: string;
  key: string;
  name: string;
  recordMeaning: string;
  propertyCount: number;
}

export interface DatabaseCatalogEntry {
  id: string;
  key: string;
  name: string;
  schemaRevision: string;
  purpose: string;
  canonicality: DatabaseDefinition['contract']['canonicality'];
  vocabulary: readonly string[];
  freshness: DatabaseDefinition['contract']['freshness'];
  sensitivity: DatabaseDefinition['contract']['sensitivity'];
  sources: readonly DatabaseCatalogSourceCard[];
  viewCount: number;
  relationCount: number;
  score: number;
  matchedBy: readonly DatabaseCatalogMatchField[];
}

export interface DatabaseCatalogResult {
  query: string | null;
  manifestRevision: string;
  catalogRevision: string;
  complete: true;
  candidates: readonly DatabaseCatalogEntry[];
}

export interface DatabaseCatalogNotModifiedResult {
  notModified: true;
  query: string | null;
  manifestRevision: string;
  catalogRevision: string;
}

interface AccessDecision {
  allowed?: boolean;
  policyId: string;
  policyRevision: string;
  allowedRecordIds: readonly string[] | null;
  allowedPropertyIds: readonly string[] | null;
  allowBody?: boolean;
}

interface CatalogPort {
  assertReadable(): void;
  snapshot(): { revision: string; databases: readonly DatabaseDefinition[] };
  index: {
    list(databaseId: string, sourceId?: string): readonly { path: string }[];
    status(): { revision: string };
  };
  resolveQueryAccess(input: {
    action: DatabasePermissionAction;
    database: DatabaseDefinition;
    source: DatabaseSource;
    query: ReturnType<typeof DatabaseQuerySchema.parse>;
    view: DatabaseView | null;
    principal: DatabaseAccessPrincipal;
  }): AccessDecision;
  currentAccessPrincipal(): DatabaseAccessPrincipal;
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}

function cloneDefinition(definition: DatabaseDefinition): DatabaseDefinition {
  return structuredClone(definition);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function schemaRevision(definition: DatabaseDefinition): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(definition)).digest('hex')}`;
}

function catalogRevision(
  manifestRevision: string,
  query: string | null,
  permissionFingerprint: unknown,
): string {
  return `sha256:${createHash('sha256')
    .update(stableJson({ manifestRevision, query, permissionFingerprint }))
    .digest('hex')}`;
}

function catalogEntry(database: DatabaseDefinition, needle: string | null): DatabaseCatalogEntry {
  const matched = new Map<DatabaseCatalogMatchField, number>();
  const match = (field: DatabaseCatalogMatchField, value: string, weight: number): void => {
    if (needle !== null && normalized(value).includes(needle)) {
      matched.set(field, Math.max(matched.get(field) ?? 0, weight));
    }
  };
  if (needle !== null) {
    match('database_key', database.key, normalized(database.key) === needle ? 120 : 100);
    match('database_name', database.name, normalized(database.name) === needle ? 110 : 90);
    for (const alias of database.aliases) match('database_alias', alias, 80);
    match('purpose', database.contract.purpose, 70);
    for (const word of database.contract.vocabulary) match('vocabulary', word, 75);
    for (const source of database.sources) {
      match('source_key', source.key, 70);
      match('source_name', source.name, 65);
      match('record_meaning', source.recordMeaning, 60);
      for (const property of source.properties) {
        if (property.type !== 'relation') continue;
        match('relation_key', property.key, 65);
        match('relation_name', property.name, 60);
        const target = database.sources.find(
          (candidate) => candidate.id === property.targetSourceId,
        );
        if (target) {
          match('relation_target', target.key, 55);
          match('relation_target', target.name, 50);
        }
      }
    }
  }
  return {
    id: database.id,
    key: database.key,
    name: database.name,
    schemaRevision: schemaRevision(database),
    purpose: database.contract.purpose,
    canonicality: database.contract.canonicality,
    vocabulary: [...database.contract.vocabulary],
    freshness: structuredClone(database.contract.freshness),
    sensitivity: database.contract.sensitivity,
    sources: database.sources.map((source) => ({
      id: source.id,
      key: source.key,
      name: source.name,
      recordMeaning: source.recordMeaning,
      propertyCount: source.properties.length,
    })),
    viewCount: database.views.length,
    relationCount: database.sources.reduce(
      (count, source) =>
        count + source.properties.filter((property) => property.type === 'relation').length,
      0,
    ),
    score: [...matched.values()].reduce((sum, value) => sum + value, 0),
    matchedBy: [...matched.keys()],
  };
}

export function createDatabaseCatalog(port: CatalogPort) {
  const catalog = (query?: string): DatabaseCatalogResult => {
    port.assertReadable();
    const snapshot = port.snapshot();
    const needle = query === undefined || query.trim() === '' ? null : normalized(query);
    const permissionReceipts: unknown[] = [];
    const candidates = snapshot.databases
      .map((database) => {
        const visibleSources = database.sources.flatMap((source) => {
          const access = port.resolveQueryAccess({
            action: 'catalog',
            database: cloneDefinition(database),
            source: structuredClone(source),
            query: DatabaseQuerySchema.parse({}),
            view: null,
            principal: port.currentAccessPrincipal(),
          });
          permissionReceipts.push({
            databaseId: database.id,
            sourceId: source.id,
            allowed: access.allowed !== false,
            policyId: access.policyId,
            policyRevision: access.policyRevision,
            allowedPropertyIds:
              access.allowedPropertyIds === null ? null : [...access.allowedPropertyIds].sort(),
          });
          if (access.allowed === false) return [];
          const allowedPropertyIds =
            access.allowedPropertyIds === null ? null : new Set(access.allowedPropertyIds);
          return [
            {
              ...structuredClone(source),
              properties:
                allowedPropertyIds === null
                  ? structuredClone(source.properties)
                  : source.properties
                      .filter((property) => allowedPropertyIds.has(property.id))
                      .map((property) => structuredClone(property)),
            },
          ];
        });
        if (visibleSources.length === 0) return null;
        const visibleSourceIds = new Set(visibleSources.map((source) => source.id));
        return catalogEntry(
          {
            ...cloneDefinition(database),
            sources: visibleSources,
            views: database.views
              .filter((view) => visibleSourceIds.has(view.sourceId))
              .map((view) => structuredClone(view)),
          },
          needle,
        );
      })
      .filter((entry): entry is DatabaseCatalogEntry => entry !== null)
      .filter((entry) => needle === null || entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.key.localeCompare(right.key) ||
          left.id.localeCompare(right.id),
      );
    return {
      query: needle,
      manifestRevision: snapshot.revision,
      catalogRevision: catalogRevision(snapshot.revision, needle, permissionReceipts),
      complete: true,
      candidates,
    };
  };
  return {
    catalog,
    workspaceSearchRevision(): string {
      port.assertReadable();
      const snapshot = port.snapshot();
      const query = DatabaseQuerySchema.parse({});
      const policies = snapshot.databases.flatMap((database) =>
        database.sources.map((source) => {
          const access = port.resolveQueryAccess({
            action: 'search',
            database: cloneDefinition(database),
            source: structuredClone(source),
            query: structuredClone(query),
            view: null,
            principal: port.currentAccessPrincipal(),
          });
          return {
            databaseId: database.id,
            sourceId: source.id,
            policyId: access.policyId,
            policyRevision: access.policyRevision,
            allowedRecordIds:
              access.allowedRecordIds === null ? null : [...access.allowedRecordIds].sort(),
            allowedPropertyIds:
              access.allowedPropertyIds === null ? null : [...access.allowedPropertyIds].sort(),
          };
        }),
      );
      return `sha256:${createHash('sha256')
        .update(
          stableJson({
            manifestRevision: snapshot.revision,
            indexRevision: port.index.status().revision,
            policies,
          }),
        )
        .digest('hex')}`;
    },
    workspaceSearchRecordPaths(): readonly string[] {
      return port
        .snapshot()
        .databases.flatMap((database) =>
          database.sources.flatMap((source) =>
            port.index.list(database.id, source.id).map((record) => record.path),
          ),
        )
        .sort();
    },
    catalogIfChanged(
      query?: string,
      ifCatalogRevision?: string,
    ): DatabaseCatalogResult | DatabaseCatalogNotModifiedResult {
      const result = catalog(query);
      if (ifCatalogRevision !== result.catalogRevision) return result;
      return {
        notModified: true,
        query: result.query,
        manifestRevision: result.manifestRevision,
        catalogRevision: result.catalogRevision,
      };
    },
  };
}
