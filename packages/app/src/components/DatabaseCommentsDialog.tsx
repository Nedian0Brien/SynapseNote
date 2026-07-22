import { Trans } from '@lingui/react/macro';
import {
  type DatabaseCommentAnchor,
  type DatabaseDefinition,
  type DatabaseRecordActor,
  type DatabaseSource,
  databaseCommentActorKey,
  databasePropertyCommentProblem,
  type ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { Check, MessageSquareReply, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  type DatabaseCommentRequest,
  type DatabaseCommentSnapshot,
  databaseComments,
} from '@/lib/database-comments-client';

interface DatabaseCommentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  actor?: DatabaseRecordActor;
  request?: (input: DatabaseCommentRequest) => Promise<DatabaseCommentSnapshot>;
}

const LOCAL_ACTOR: DatabaseRecordActor = { kind: 'human', principal_id: 'user:local' };
type CommentMutation = Exclude<DatabaseCommentRequest, { action: 'read' }>;
type CommentMutationOperation = CommentMutation extends infer Request
  ? Request extends CommentMutation
    ? Omit<Request, 'databaseId' | 'recordId' | 'actor'>
    : never
  : never;

function actorLabel(actor: DatabaseRecordActor): string {
  return actor.kind === 'human' && actor.principal_id === 'user:local'
    ? 'You'
    : databaseCommentActorKey(actor);
}

export function DatabaseCommentsDialog({
  open,
  onOpenChange,
  database,
  source,
  record,
  actor = LOCAL_ACTOR,
  request = databaseComments,
}: DatabaseCommentsDialogProps) {
  const [snapshot, setSnapshot] = useState<DatabaseCommentSnapshot | null>(null);
  const [anchorKey, setAnchorKey] = useState('page');
  const [body, setBody] = useState('');
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [mentions, setMentions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activePeople = database.people.filter((person) => person.active);
  const commentableProperties = source.properties.filter(
    (property) =>
      databasePropertyCommentProblem({
        properties: source.properties,
        values: record.values,
        propertyId: property.id,
      }) === null,
  );

  useEffect(() => {
    if (!open) return;
    const input = { action: 'read' as const, databaseId: database.id, recordId: record.id, actor };
    setSnapshot(null);
    setError(null);
    void request(input)
      .then(setSnapshot)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load comments'),
      );
  }, [actor, database.id, open, record.id, request]);

  async function mutate(operation: CommentMutationOperation): Promise<void> {
    if (!snapshot || busy) return;
    setBusy(true);
    setError(null);
    try {
      setSnapshot(
        await request({
          ...operation,
          databaseId: database.id,
          recordId: record.id,
          actor,
        } as DatabaseCommentRequest),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update comments');
      if (cause && typeof cause === 'object' && 'status' in cause && cause.status === 409) {
        const latest = await request({
          action: 'read',
          databaseId: database.id,
          recordId: record.id,
          actor,
        }).catch(() => null);
        if (latest) setSnapshot(latest);
      }
    }
    setBusy(false);
  }

  async function addThread(): Promise<void> {
    if (!snapshot || !body.trim()) return;
    const anchor: DatabaseCommentAnchor = anchorKey.startsWith('property:')
      ? { type: 'property', propertyId: anchorKey.slice('property:'.length) }
      : { type: 'page' };
    await mutate({
      action: 'add_thread',
      expectedRevision: snapshot.revision,
      anchor,
      body,
      mentionedPersonIds: mentions,
    });
    setBody('');
    setMentions([]);
  }

  const propertyName = (propertyId: string) =>
    source.properties.find((property) => property.id === propertyId)?.name ?? propertyId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Comments</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Discuss this record or a property value without changing the page body.</Trans>
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {!snapshot ? (
          <p className="text-sm text-muted-foreground" role="status">
            <Trans>Loading comments</Trans>
          </p>
        ) : null}

        {snapshot ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-md border p-3">
              <span className="block text-sm font-medium">
                <Trans>Comment on</Trans>
              </span>
              <Select value={anchorKey} onValueChange={setAnchorKey}>
                <SelectTrigger aria-label="Comment on">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">Page</SelectItem>
                  {commentableProperties.map((property) => (
                    <SelectItem key={property.id} value={`property:${property.id}`}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Add a comment"
              />
              {activePeople.length > 0 ? (
                <fieldset className="flex flex-wrap gap-3">
                  <legend className="sr-only">Mention people</legend>
                  {activePeople.map((person) => (
                    <label
                      key={person.id}
                      htmlFor={`database-comment-mention-${person.id}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={`database-comment-mention-${person.id}`}
                        checked={mentions.includes(person.id)}
                        onCheckedChange={(checked) =>
                          setMentions((current) =>
                            checked
                              ? [...new Set([...current, person.id])]
                              : current.filter((id) => id !== person.id),
                          )
                        }
                      />
                      @{person.name}
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <Button
                type="button"
                disabled={busy || !body.trim()}
                onClick={() => void addThread()}
              >
                <Trans>Add comment</Trans>
              </Button>
            </div>

            {snapshot.document.threads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <Trans>No comments yet.</Trans>
              </p>
            ) : (
              snapshot.document.threads.map((thread) => (
                <article
                  key={thread.id}
                  className="space-y-3 rounded-md border p-3"
                  data-comment-thread={thread.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      {thread.anchor.type === 'page'
                        ? 'Page'
                        : propertyName(thread.anchor.propertyId)}
                      {thread.resolvedAt ? (
                        <span className="ml-2 text-muted-foreground">Resolved</span>
                      ) : null}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void mutate({
                          action: 'set_resolved',
                          expectedRevision: snapshot.revision,
                          threadId: thread.id,
                          resolved: !thread.resolvedAt,
                        })
                      }
                    >
                      {thread.resolvedAt ? <RotateCcw /> : <Check />}
                      {thread.resolvedAt ? <Trans>Reopen</Trans> : <Trans>Resolve</Trans>}
                    </Button>
                  </div>
                  {thread.comments.map((comment) => (
                    <div key={comment.id} className="rounded bg-muted/40 p-2 text-sm">
                      <p className="font-medium">{actorLabel(comment.author)}</p>
                      <p className="whitespace-pre-wrap">{comment.body}</p>
                      {comment.mentionedPersonIds.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {comment.mentionedPersonIds
                            .map(
                              (id) =>
                                `@${database.people.find((person) => person.id === id)?.name ?? id}`,
                            )
                            .join(' ')}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {!thread.resolvedAt ? (
                    <div className="flex gap-2">
                      <Textarea
                        className="min-h-10"
                        value={replyBodies[thread.id] ?? ''}
                        onChange={(event) =>
                          setReplyBodies((current) => ({
                            ...current,
                            [thread.id]: event.target.value,
                          }))
                        }
                        placeholder="Reply"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || !(replyBodies[thread.id] ?? '').trim()}
                        onClick={() => {
                          const replyBody = replyBodies[thread.id] ?? '';
                          void mutate({
                            action: 'reply',
                            expectedRevision: snapshot.revision,
                            threadId: thread.id,
                            body: replyBody,
                          }).then(() =>
                            setReplyBodies((current) => ({ ...current, [thread.id]: '' })),
                          );
                        }}
                      >
                        <MessageSquareReply /> <Trans>Reply</Trans>
                      </Button>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
