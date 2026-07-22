import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseIndexChangeEvent } from '../../database-index-coordinator.ts';
import type { ServerInstance } from '../tools/shared.ts';
import {
  DATABASE_CATALOG_RESOURCE_TEMPLATE,
  DATABASE_SCHEMA_RESOURCE_TEMPLATE,
  DATABASE_SNAPSHOT_RESOURCE_TEMPLATE,
  registerDatabaseResources,
} from './database.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface RegisteredResource {
  name: string;
  template: { uriTemplate: { toString(): string } };
  callback: (
    uri: URL,
    variables: Record<string, string>,
  ) => Promise<{
    contents: Array<{ uri: string; mimeType?: string; text?: string }>;
  }>;
}

function harness(subscribe = false) {
  const resources: RegisteredResource[] = [];
  const requestHandlers: Array<(request: { params: { uri: string } }) => Promise<unknown>> = [];
  const notifications: string[] = [];
  let changeListener: ((event: DatabaseIndexChangeEvent) => void) | undefined;
  let unsubscribed = false;
  const server = {
    registerResource(
      name: string,
      template: RegisteredResource['template'],
      _metadata: unknown,
      callback: RegisteredResource['callback'],
    ) {
      resources.push({ name, template, callback });
    },
    server: {
      registerCapabilities() {},
      setRequestHandler(
        _schema: unknown,
        handler: (request: { params: { uri: string } }) => Promise<unknown>,
      ) {
        requestHandlers.push(handler);
      },
      async sendResourceUpdated({ uri }: { uri: string }) {
        notifications.push(uri);
      },
    },
  } as unknown as ServerInstance;
  const handle = registerDatabaseResources(server, {
    resolveCwd: async () => '/project',
    config: { content: { dir: 'content' } } as never,
    serverUrl: 'http://localhost:7777',
    ...(subscribe
      ? {
          subscribeDatabaseChanges: (listener: (event: DatabaseIndexChangeEvent) => void) => {
            changeListener = listener;
            return () => {
              unsubscribed = true;
            };
          },
        }
      : {}),
  });
  return {
    resources,
    requestHandlers,
    notifications,
    change: (event: DatabaseIndexChangeEvent) => changeListener?.(event),
    handle,
    unsubscribed: () => unsubscribed,
  };
}

describe('database MCP resources', () => {
  test('registers optional catalog, schema, and content-free snapshot templates', async () => {
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/catalog')) return Response.json({ candidates: [], manifestRevision: 'm' });
      if (url.includes('/describe')) return Response.json({ database: { id: 'db_tasks' } });
      return Response.json({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        snapshotRevision: 'snapshot:1',
        indexRevision: 'index:1',
        matched: 2,
        records: [{ id: 'rec_secret', values: { prop_title: 'secret' } }],
        recordRevisions: { rec_secret: 'revision' },
        trace: { projection: { returnedPropertyIds: ['prop_title'] } },
      });
    }) as typeof fetch;
    const registered = harness();
    expect(
      registered.resources.map((resource) => resource.template.uriTemplate.toString()),
    ).toEqual([
      DATABASE_CATALOG_RESOURCE_TEMPLATE,
      DATABASE_SCHEMA_RESOURCE_TEMPLATE,
      DATABASE_SNAPSHOT_RESOURCE_TEMPLATE,
    ]);

    const catalog = await registered.resources[0]?.callback(
      new URL('synapsenote://database/catalog?q=task'),
      {},
    );
    expect(JSON.parse(catalog?.contents[0]?.text ?? '{}')).toMatchObject({ candidates: [] });
    const schema = await registered.resources[1]?.callback(
      new URL('synapsenote://database/db_tasks/schema?sourceId=ds_tasks'),
      { databaseId: 'db_tasks' },
    );
    expect(JSON.parse(schema?.contents[0]?.text ?? '{}')).toMatchObject({
      database: { id: 'db_tasks' },
    });
    const snapshot = await registered.resources[2]?.callback(
      new URL('synapsenote://database/db_tasks/source/ds_tasks/snapshot'),
      { databaseId: 'db_tasks', sourceId: 'ds_tasks' },
    );
    const snapshotJson = snapshot?.contents[0]?.text ?? '';
    expect(JSON.parse(snapshotJson)).toMatchObject({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      matched: 2,
    });
    expect(snapshotJson).not.toContain('rec_secret');
    expect(snapshotJson).not.toContain('prop_title');
    expect(registered.requestHandlers).toHaveLength(0);
  });

  test('notifies only subscribed matching resources and disposes the coordinator listener', async () => {
    const registered = harness(true);
    expect(registered.requestHandlers).toHaveLength(2);
    const uri = 'synapsenote://database/db_tasks/source/ds_tasks/snapshot';
    await expect(
      registered.requestHandlers[0]?.({
        params: { uri: 'synapsenote://database/db_tasks/unknown' },
      }),
    ).rejects.toThrow('Only SynapseNote database resources are subscribable');
    await registered.requestHandlers[0]?.({ params: { uri } });
    registered.change({
      kind: 'records',
      reasons: ['record-update'],
      databaseIds: ['db_other'],
      sourceIds: ['ds_other'],
      recordIds: ['rec_other'],
    });
    registered.change({
      kind: 'records',
      reasons: ['record-update'],
      databaseIds: ['db_tasks'],
      sourceIds: ['ds_tasks'],
      recordIds: ['rec_task'],
    });
    await Promise.resolve();
    expect(registered.notifications).toEqual([uri]);

    const sourceSchemaUri = 'synapsenote://database/db_tasks/schema?sourceId=ds_other';
    await registered.requestHandlers[0]?.({ params: { uri: sourceSchemaUri } });
    registered.change({
      kind: 'records',
      reasons: ['record-update'],
      databaseIds: ['db_tasks'],
      sourceIds: ['ds_tasks'],
      recordIds: ['rec_task'],
    });
    await Promise.resolve();
    expect(registered.notifications).toEqual([uri, uri]);

    await registered.requestHandlers[1]?.({ params: { uri } });
    registered.change({ kind: 'index', phase: 'ready', reasons: ['schema-change'] });
    await Promise.resolve();
    expect(registered.notifications).toEqual([uri, uri, sourceSchemaUri]);
    registered.handle.close();
    expect(registered.unsubscribed()).toBe(true);
  });
});
