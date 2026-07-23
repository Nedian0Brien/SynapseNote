import { Database, Loader2, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createBlankDatabaseDesiredState } from '@/lib/database-creation';
import { executeDatabaseUiMutation } from '@/lib/database-mutation-client';
import { databaseUiMutationReviewMode } from '@/lib/database-mutation-policy';

export interface NotionDatabaseTarget {
  databaseId: string;
  sourceId: string;
  viewId: string;
}

/**
 * Human blank-database entry point. The database is created directly into a
 * page-shaped canvas so the first useful thing a person sees is the table,
 * not the database administration/import wizard. Higher-risk creation
 * methods remain available from the secondary administration surface.
 */
export function NotionDatabaseCreationPage({
  open,
  onCreated,
  onCancel,
}: {
  open: boolean;
  onCreated: (target: NotionDatabaseTarget) => void;
  onCancel: () => void;
}) {
  const startedRef = useRef(false);
  const [status, setStatus] = useState<'creating' | 'error'>('creating');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;

    const desiredState = createBlankDatabaseDesiredState({ name: 'Untitled database' });
    const policy = {
      operation: 'blank-database-create' as const,
      actor: 'human' as const,
      principalId: 'user:local',
    };

    void executeDatabaseUiMutation({
      desiredState,
      actor: { principalId: policy.principalId },
      idempotencyKey: `ui-notion-database-${crypto.randomUUID()}`,
      assertions: {
        databaseAbsent: true,
        createdRecords: desiredState.sampleRecords?.length ?? 0,
      },
      review: () => databaseUiMutationReviewMode(policy) === 'automatic',
    })
      .then((outcome) => {
        if (outcome.status !== 'committed') {
          setStatus('error');
          setError('The blank database could not be created.');
          return;
        }
        const definition = outcome.draft.normalized.definition;
        const source = definition.sources[0];
        const view = definition.views?.find((candidate) => candidate.sourceId === source?.id);
        if (!source || !view) {
          setStatus('error');
          setError('The created database has no editable table view.');
          return;
        }
        onCreated({ databaseId: definition.id, sourceId: source.id, viewId: view.id });
      })
      .catch((cause: unknown) => {
        setStatus('error');
        setError(cause instanceof Error ? cause.message : 'Unable to create the blank database.');
      });
  }, [onCreated, open]);

  if (!open) return null;

  return (
    <main
      className="fixed inset-0 z-40 overflow-y-auto bg-background text-foreground"
      aria-label="New database page"
      data-notion-database-creation-page
      data-database-creation-state={status}
    >
      <header className="border-b px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Database className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <div className="truncate font-semibold text-lg">Untitled database</div>
              <div className="text-muted-foreground text-xs">Table</div>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-10">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Untitled database</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Add pages, properties, and views directly in this page.
          </p>
        </div>

        <section className="overflow-hidden rounded-lg border" aria-label="Database table">
          <div className="flex items-center gap-1 border-b px-3 py-2">
            <Button type="button" size="sm" variant="secondary" aria-current="page">
              Table
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Add database view">
              <Plus aria-hidden="true" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="border-b px-4 py-3 font-medium">Title</th>
                  <th className="w-12 border-b px-2 py-2 text-right">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Add property">
                      <Plus aria-hidden="true" />
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-3" colSpan={2}>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {status === 'creating' ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      <Input
                        aria-label="New page title"
                        placeholder="New page"
                        disabled={status === 'creating'}
                        className="max-w-md border-0 bg-transparent px-1 shadow-none focus-visible:ring-1"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {status === 'creating' ? (
          <p className="mt-3 text-muted-foreground text-xs" role="status">
            Preparing your editable table
          </p>
        ) : (
          <div
            className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
            role="alert"
          >
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
