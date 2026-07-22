import {
  type DatabaseRecordActor,
  type DatabaseSource,
  HistorySuccessSchema,
  HistoryVersionSuccessSchema,
  readFmRegionWithError,
  StoredDatabaseRecordMetadataSchema,
  stripFrontmatter,
} from '@nedian0brien/synapsenote-core';

export interface DatabaseRecordHistoryChange {
  kind: 'property' | 'body';
  propertyId?: string;
  label: string;
}

export interface DatabaseRecordHistoryEvent {
  sha: string;
  timestamp: string;
  actor: DatabaseRecordActor;
  origin: 'database' | 'git' | 'filesystem';
  message: string;
  changes: DatabaseRecordHistoryChange[];
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function databaseRecordVersionChanges(
  source: DatabaseSource,
  newerContent: string,
  olderContent: string | null,
): DatabaseRecordHistoryChange[] {
  const newer = readFmRegionWithError(newerContent).map;
  const older = olderContent ? readFmRegionWithError(olderContent).map : {};
  const changes = source.properties.flatMap<DatabaseRecordHistoryChange>((property) =>
    same(newer[property.key], older[property.key])
      ? []
      : [{ kind: 'property', propertyId: property.id, label: property.name }],
  );
  if (
    !olderContent ||
    stripFrontmatter(newerContent).body !== stripFrontmatter(olderContent).body
  ) {
    changes.push({ kind: 'body', label: 'Page body' });
  }
  return changes;
}

function inferAttribution(
  entry: ReturnType<typeof HistorySuccessSchema.parse>['entries'][number],
  content: string,
  docName: string,
): Pick<DatabaseRecordHistoryEvent, 'actor' | 'origin'> {
  const contributor = entry.contributors.find((candidate) => candidate.docs.includes(docName));
  if (entry.type === 'upstream') {
    return {
      actor: {
        kind: 'sync',
        principal_id: contributor?.id ?? (entry.authorEmail || 'git:upstream'),
      },
      origin: 'git',
    };
  }
  if (contributor?.id === 'file-system' || contributor?.id.startsWith('filesystem')) {
    return { actor: { kind: 'filesystem', principal_id: 'local' }, origin: 'filesystem' };
  }
  const metadata = StoredDatabaseRecordMetadataSchema.safeParse(
    readFmRegionWithError(content).map._sn,
  );
  if (metadata.success && metadata.data.last_edited_by) {
    return { actor: metadata.data.last_edited_by, origin: 'database' };
  }
  if (contributor?.id.startsWith('agent-')) {
    return { actor: { kind: 'agent', principal_id: contributor.id }, origin: 'database' };
  }
  if (contributor?.id.startsWith('principal-')) {
    return { actor: { kind: 'human', principal_id: contributor.id }, origin: 'database' };
  }
  return {
    actor: {
      kind: 'system',
      principal_id: contributor?.id ?? (entry.authorEmail || entry.author),
    },
    origin: 'database',
  };
}

export async function fetchDatabaseRecordHistory(input: {
  docName: string;
  source: DatabaseSource;
  limit?: number;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}): Promise<DatabaseRecordHistoryEvent[]> {
  const fetchImplementation = input.fetch ?? globalThis.fetch;
  const limit = Math.min(50, Math.max(1, input.limit ?? 25));
  const historyResponse = await fetchImplementation(
    `/api/history?docName=${encodeURIComponent(input.docName)}&limit=${limit}`,
    { signal: input.signal },
  );
  const historyBody: unknown = await historyResponse.json().catch(() => null);
  if (!historyResponse.ok) throw new Error('Could not load record history');
  const history = HistorySuccessSchema.parse(historyBody);
  const versions = await Promise.all(
    history.entries.map(async (entry) => {
      const response = await fetchImplementation(
        `/api/history/${entry.sha}?docName=${encodeURIComponent(input.docName)}`,
        { signal: input.signal },
      );
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Could not load record version ${entry.sha}`);
      return HistoryVersionSuccessSchema.parse(body).content;
    }),
  );
  return history.entries.flatMap((entry, index) =>
    entry.type === 'checkpoint'
      ? []
      : [
          {
            sha: entry.sha,
            timestamp: entry.timestamp,
            message: entry.message,
            ...inferAttribution(entry, versions[index] ?? '', input.docName),
            changes: databaseRecordVersionChanges(
              input.source,
              versions[index] ?? '',
              versions[index + 1] ?? null,
            ),
          },
        ],
  );
}
