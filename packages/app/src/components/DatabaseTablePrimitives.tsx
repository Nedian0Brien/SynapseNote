import { Trans } from '@lingui/react/macro';
import type {
  DatabaseDefinition,
  DatabaseProperty,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DatabaseGhostState } from '@/lib/database-mutation-client';
import type { DatabaseUiMutationPolicyInput } from '@/lib/database-mutation-policy';
import { queryDatabase } from '@/lib/database-query-client';
import { type DatabaseUiProblem, databaseUiProblemMessage } from '@/lib/database-ui-problem';

export function downloadTextFile(contents: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DatabaseStateNotice({
  problem,
  onAction,
  actionKind = 'recover',
  notionSurface = false,
}: {
  problem: DatabaseUiProblem;
  onAction?: () => void;
  actionKind?: 'recover' | 'reload' | 'back';
  notionSurface?: boolean;
}) {
  const actionAvailable =
    onAction && (problem.retryable || problem.kind === 'conflict' || actionKind === 'back');
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
      role={problem.kind === 'stale_index' && !problem.retryable ? 'status' : 'alert'}
      data-database-state={problem.kind}
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-medium">
            {problem.kind === 'offline' ? (
              <Trans>Database is offline</Trans>
            ) : problem.kind === 'missing' ? (
              <Trans>Database page is unavailable</Trans>
            ) : problem.kind === 'invalid_schema' ? (
              notionSurface ? (
                <Trans>Database setup needs attention</Trans>
              ) : (
                <Trans>Database schema is invalid</Trans>
              )
            ) : problem.kind === 'stale_index' ? (
              notionSurface ? (
                <Trans>Database is still updating</Trans>
              ) : (
                <Trans>Database index is not current</Trans>
              )
            ) : problem.kind === 'conflict' ? (
              <Trans>Database changed elsewhere</Trans>
            ) : problem.kind === 'permission' ? (
              <Trans>Permission required</Trans>
            ) : problem.kind === 'migration_required' ? (
              <Trans>Migration required before editing</Trans>
            ) : (
              <Trans>Database request failed</Trans>
            )}
          </div>
          <p className="mt-0.5 break-words opacity-90">{databaseUiProblemMessage(problem)}</p>
          {problem.kind === 'permission' ? (
            <p className="mt-1 opacity-90">
              <Trans>Request access or use fields available to your current policy.</Trans>
            </p>
          ) : null}
        </div>
      </div>
      {actionAvailable ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionKind === 'back' ? (
            <Trans>Back to databases</Trans>
          ) : actionKind === 'reload' || problem.kind === 'conflict' ? (
            <Trans>Reload latest</Trans>
          ) : problem.kind === 'stale_index' ? (
            notionSurface ? (
              <Trans>Check again</Trans>
            ) : (
              <Trans>Check index again</Trans>
            )
          ) : problem.kind === 'invalid_schema' ? (
            notionSurface ? (
              <Trans>Reload database setup</Trans>
            ) : (
              <Trans>Reload schema</Trans>
            )
          ) : (
            <Trans>Retry</Trans>
          )}
        </Button>
      ) : null}
    </div>
  );
}

export async function searchDatabaseRelationRecords(
  database: DatabaseDefinition,
  property: Extract<DatabaseProperty, { type: 'relation' }>,
  searchText: string,
): Promise<ProjectedDatabaseRelationRecord[]> {
  const targetSource = database.sources.find((source) => source.id === property.targetSourceId);
  const titleProperty = targetSource?.properties.find((candidate) => candidate.type === 'title');
  if (!targetSource || !titleProperty) return [];
  const result = await queryDatabase({
    databaseId: database.id,
    sourceId: targetSource.id,
    query: {
      ...(searchText
        ? {
            where: {
              propertyId: titleProperty.id,
              operator: 'contains' as const,
              value: searchText,
            },
          }
        : {}),
      sort: [{ propertyId: titleProperty.id, direction: 'asc' }],
      select: [titleProperty.id],
      includeArchived: false,
      page: { limit: 100 },
    },
  });
  return result.records.flatMap((record) => {
    const title = record.values[titleProperty.id];
    return typeof title === 'string'
      ? [
          {
            id: record.id,
            sourceId: targetSource.id,
            title,
            ...(record.archivedAt ? { archivedAt: record.archivedAt } : {}),
          },
        ]
      : [];
  });
}

const databaseApprovalLabels: Record<string, string> = {
  create_database: 'Create database',
  delete_database: 'Delete database',
  alter_schema: 'Change schema',
  autonomous_policy: 'Autonomous write policy',
  sample_record_write: 'Write sample records',
  verification_change: 'Change verification',
  delete_record: 'Delete records',
};

export const databaseSchemaMutationPolicy: DatabaseUiMutationPolicyInput = {
  operation: 'schema',
  actor: 'human',
  principalId: 'user:local',
};

export function DatabaseAtomicApprovalScope({
  approvals,
}: {
  approvals: DatabaseGhostState['approvals'];
}) {
  const required = approvals.filter((approval) => approval.required !== false);
  if (required.length === 0) return null;
  return (
    <section
      className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs"
      aria-label="Atomic approval scope"
      data-testid="database-atomic-approval-scope"
    >
      <div className="font-medium">Atomic approval group</div>
      <p className="mt-1 text-muted-foreground">
        These changes share one exact plan and commit together. A partial approval would break
        referential or rollback safety, so all listed scopes are reviewed as one group.
      </p>
      <p className="mt-1 font-medium text-amber-700 text-xs dark:text-amber-300">
        Selective approval is unavailable for this atomic group; approve every required scope
        together.
      </p>
      <p
        className="mt-1 text-muted-foreground text-xs"
        data-testid="database-sensitive-review-policy"
      >
        <Trans>
          Sensitive changes always require review: permission changes, permanent deletion, external
          actions, broad schema migrations, and bulk edits over the review threshold.
        </Trans>
      </p>
      <ul className="mt-1 list-disc pl-5">
        {required.map((approval) => (
          <li key={approval.code}>{databaseApprovalLabels[approval.code] ?? approval.code}</li>
        ))}
      </ul>
    </section>
  );
}
