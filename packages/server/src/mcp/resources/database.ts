import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ErrorCode,
  McpError,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { DatabaseIndexChangeEvent } from '../../database-index-coordinator.ts';
import {
  type ConfigOrResolver,
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  httpPost,
  resolveProjectServerContext,
  type ServerInstance,
  type ServerUrlOrResolver,
} from '../tools/shared.ts';

export const DATABASE_CATALOG_RESOURCE_TEMPLATE = 'synapsenote://database/catalog{?cwd,q}' as const;
export const DATABASE_SCHEMA_RESOURCE_TEMPLATE =
  'synapsenote://database/{databaseId}/schema{?cwd,sourceId}' as const;
export const DATABASE_SNAPSHOT_RESOURCE_TEMPLATE =
  'synapsenote://database/{databaseId}/source/{sourceId}/snapshot{?cwd}' as const;

interface DatabaseResourceDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  subscribeDatabaseChanges?: (listener: (event: DatabaseIndexChangeEvent) => void) => () => void;
}

function variable(value: string | string[] | undefined, name: string): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) throw new McpError(ErrorCode.InvalidParams, `${name} is required`);
  return candidate;
}

function jsonResource(uri: URL, value: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(value),
      },
    ],
  };
}

async function context(deps: DatabaseResourceDeps, uri: URL) {
  const explicitCwd = uri.searchParams.get('cwd') ?? undefined;
  const resolved = await resolveProjectServerContext(
    deps.resolveCwd,
    deps.config,
    deps.serverUrl,
    explicitCwd,
  );
  if (!resolved.ok) throw new McpError(ErrorCode.InvalidRequest, resolved.error);
  if (!resolved.url) throw new McpError(ErrorCode.InvalidRequest, HOCUSPOCUS_NOT_RUNNING_ERROR);
  return { ...resolved, url: resolved.url };
}

function payload(result: { ok: boolean; [key: string]: unknown }): Record<string, unknown> {
  if (!result.ok) {
    throw new McpError(
      ErrorCode.InternalError,
      typeof result.error === 'string' ? result.error : 'Database resource read failed',
    );
  }
  const { ok: _ok, httpStatus: _status, ...data } = result;
  return data;
}

type DatabaseResourceAddress =
  | { kind: 'catalog' }
  | { kind: 'schema'; databaseId: string; sourceId?: string }
  | { kind: 'snapshot'; databaseId: string; sourceId: string };

function hasOnlyQueryParams(url: URL, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return [...url.searchParams.keys()].every((key) => allowedSet.has(key));
}

function parseDatabaseResourceUri(uri: string): DatabaseResourceAddress | null {
  try {
    const parsed = new URL(uri);
    if (
      parsed.protocol !== 'synapsenote:' ||
      parsed.hostname !== 'database' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.port !== '' ||
      parsed.hash !== ''
    ) {
      return null;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 1 && segments[0] === 'catalog') {
      return hasOnlyQueryParams(parsed, ['cwd', 'q']) ? { kind: 'catalog' } : null;
    }
    const databaseId = segments[0];
    if (!databaseId) return null;
    if (segments.length === 2 && segments[1] === 'schema') {
      if (!hasOnlyQueryParams(parsed, ['cwd', 'sourceId'])) return null;
      const sourceId = parsed.searchParams.get('sourceId') || undefined;
      return { kind: 'schema', databaseId, ...(sourceId ? { sourceId } : {}) };
    }
    const sourceId = segments[2];
    if (
      segments.length === 4 &&
      segments[1] === 'source' &&
      sourceId &&
      segments[3] === 'snapshot' &&
      hasOnlyQueryParams(parsed, ['cwd'])
    ) {
      return { kind: 'snapshot', databaseId, sourceId };
    }
    return null;
  } catch {
    return null;
  }
}

function resourceMatchesChange(uri: string, event: DatabaseIndexChangeEvent): boolean {
  const resource = parseDatabaseResourceUri(uri);
  if (!resource) return false;
  if (event.kind === 'index') return true;
  if (resource.kind === 'catalog') return false;
  return (
    (event.databaseIds.length === 0 || event.databaseIds.includes(resource.databaseId)) &&
    (event.sourceIds.length === 0 ||
      resource.sourceId === undefined ||
      event.sourceIds.includes(resource.sourceId))
  );
}

export function registerDatabaseResources(
  server: ServerInstance,
  deps: DatabaseResourceDeps,
): { close: () => void } {
  server.registerResource(
    'database-catalog',
    new ResourceTemplate(DATABASE_CATALOG_RESOURCE_TEMPLATE, { list: undefined }),
    {
      title: 'Database catalog',
      description: 'Compact revision-bearing database discovery cards.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const resolved = await context(deps, uri);
      const q = uri.searchParams.get('q');
      const result = await httpGet(
        resolved.url,
        `/api/databases/catalog${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      );
      return jsonResource(uri, payload(result));
    },
  );

  server.registerResource(
    'database-schema',
    new ResourceTemplate(DATABASE_SCHEMA_RESOURCE_TEMPLATE, { list: undefined }),
    {
      title: 'Database schema',
      description: 'Exact schema, source, view, property, option, and index metadata by stable ID.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const resolved = await context(deps, uri);
      const result = await httpPost(resolved.url, '/api/databases/describe', {
        databaseId: variable(variables.databaseId, 'databaseId'),
        ...(uri.searchParams.get('sourceId')
          ? { sourceId: uri.searchParams.get('sourceId') ?? undefined }
          : {}),
      });
      return jsonResource(uri, payload(result));
    },
  );

  server.registerResource(
    'database-snapshot',
    new ResourceTemplate(DATABASE_SNAPSHOT_RESOURCE_TEMPLATE, { list: undefined }),
    {
      title: 'Database source snapshot',
      description:
        'Content-free current query/index snapshot, counts, permissions, and result state by stable source ID.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const resolved = await context(deps, uri);
      const result = payload(
        await httpPost(resolved.url, '/api/databases/query', {
          databaseId: variable(variables.databaseId, 'databaseId'),
          sourceId: variable(variables.sourceId, 'sourceId'),
          query: { select: [], page: { limit: 1 } },
        }),
      );
      const {
        records: _records,
        trace: _trace,
        recordRevisions: _recordRevisions,
        ...snapshot
      } = result;
      return jsonResource(uri, snapshot);
    },
  );

  if (!deps.subscribeDatabaseChanges) return { close: () => {} };

  const subscriptions = new Set<string>();
  server.server.registerCapabilities({ resources: { subscribe: true, listChanged: true } });
  server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    if (!parseDatabaseResourceUri(request.params.uri)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Only SynapseNote database resources are subscribable',
      );
    }
    subscriptions.add(request.params.uri);
    return {};
  });
  server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    subscriptions.delete(request.params.uri);
    return {};
  });
  const unsubscribe = deps.subscribeDatabaseChanges((event) => {
    for (const uri of subscriptions) {
      if (!resourceMatchesChange(uri, event)) continue;
      void server.server.sendResourceUpdated({ uri }).catch(() => {});
    }
  });
  return {
    close: () => {
      subscriptions.clear();
      unsubscribe();
    },
  };
}
