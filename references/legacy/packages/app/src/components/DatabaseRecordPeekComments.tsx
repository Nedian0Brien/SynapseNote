import { Trans } from '@lingui/react/macro';
import {
  type DatabaseCommentAttachment,
  type DatabaseDefinition,
  type DatabaseRecordActor,
  type DatabaseSource,
  databaseCommentActorKey,
  databaseFileDisplayName,
  type ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { ArrowUp, AtSign, File, LoaderCircle, Paperclip, UserRound, X } from 'lucide-react';
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { uploadFile } from '@/editor/image-upload/upload-file';
import {
  type DatabaseCommentRequest,
  type DatabaseCommentSnapshot,
  databaseComments,
} from '@/lib/database-comments-client';
import { filePathToDocName } from '@/lib/doc-hash';
import { cn } from '@/lib/utils';

function actorLabel(
  actor: DatabaseRecordActor,
  currentPrincipalId: string | null | undefined,
  currentPrincipalName: string | null | undefined,
): string {
  if (
    actor.kind === 'human' &&
    (actor.principal_id === 'user:local' || actor.principal_id === currentPrincipalId)
  ) {
    return currentPrincipalName ?? 'You';
  }
  return databaseCommentActorKey(actor);
}

function actorForPrincipalId(principalId: string | null | undefined): DatabaseRecordActor {
  return { kind: 'human', principal_id: principalId ?? 'user:local' };
}

export function DatabaseRecordPeekComments({
  database,
  source,
  record,
  principalId,
  principalName,
  focusRequest = 0,
  request = databaseComments,
}: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  principalId?: string | null;
  principalName?: string | null;
  focusRequest?: number;
  request?: (input: DatabaseCommentRequest) => Promise<DatabaseCommentSnapshot>;
}) {
  const [snapshot, setSnapshot] = useState<DatabaseCommentSnapshot | null>(null);
  const [body, setBody] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<DatabaseCommentAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activePeople = database.people.filter((person) => person.active);

  useEffect(() => {
    let disposed = false;
    const actor = actorForPrincipalId(principalId);
    setSnapshot(null);
    setBody('');
    setMentions([]);
    setAttachments([]);
    setError(null);
    void request({ action: 'read', databaseId: database.id, recordId: record.id, actor })
      .then((nextSnapshot) => {
        if (!disposed) setSnapshot(nextSnapshot);
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : 'Could not load comments');
        }
      });
    return () => {
      disposed = true;
    };
  }, [database.id, principalId, record.id, request]);

  useEffect(() => {
    if (focusRequest === 0) return;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    textareaRef.current?.focus();
  }, [focusRequest]);

  async function addComment(): Promise<void> {
    const trimmedBody = body.trim();
    if (!snapshot || !trimmedBody || busy || uploading) return;
    setBusy(true);
    setError(null);
    const actor = actorForPrincipalId(principalId);
    try {
      const nextSnapshot = await request({
        action: 'add_thread',
        databaseId: database.id,
        recordId: record.id,
        actor,
        expectedRevision: snapshot.revision,
        anchor: { type: 'page' },
        body: trimmedBody,
        attachments,
        mentionedPersonIds: mentions,
      });
      setSnapshot(nextSnapshot);
      setBody('');
      setMentions([]);
      setAttachments([]);
      textareaRef.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add comment');
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

  async function attachFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0 || uploading || busy) return;
    const remaining = Math.max(0, 20 - attachments.length);
    if (remaining === 0) {
      setError('A comment can include up to 20 attachments.');
      return;
    }

    setUploading(true);
    setError(null);
    const uploaded: DatabaseCommentAttachment[] = [];
    try {
      for (const file of files.slice(0, remaining)) {
        const result = await uploadFile(file, [], { docName: filePathToDocName(record.path) });
        uploaded.push({ kind: 'local', path: result.url.replace(/^\/+/, ''), name: file.name });
      }
      setAttachments((current) => [...current, ...uploaded]);
      if (files.length > remaining) {
        setError('A comment can include up to 20 attachments.');
      }
    } catch (cause) {
      if (uploaded.length > 0) setAttachments((current) => [...current, ...uploaded]);
      setError(cause instanceof Error ? cause.message : 'Could not upload attachment');
    }
    setUploading(false);
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void addComment();
  }

  const visibleThreads = snapshot?.document.threads.filter((thread) => !thread.resolvedAt) ?? [];
  const propertyName = (propertyId: string) =>
    source.properties.find((property) => property.id === propertyId)?.name ?? propertyId;

  return (
    <section
      ref={sectionRef}
      className="mt-8"
      aria-labelledby="database-peek-comments-heading"
      data-database-peek-comments
    >
      <h3 id="database-peek-comments-heading" className="mb-3 text-sm font-medium">
        <Trans>Comments</Trans>
      </h3>

      {visibleThreads.length > 0 ? (
        <ol className="mb-3 space-y-3" aria-label="Page comments">
          {visibleThreads.map((thread) => (
            <li key={thread.id} className="flex gap-3" data-comment-thread={thread.id}>
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                {thread.anchor.type === 'property' ? (
                  <p className="mb-0.5 text-muted-foreground text-xs">
                    {propertyName(thread.anchor.propertyId)}
                  </p>
                ) : null}
                {thread.comments.map((comment) => (
                  <div key={comment.id} className="mb-1 last:mb-0">
                    <p className="font-medium leading-5">
                      {actorLabel(comment.author, principalId, principalName)}
                    </p>
                    <p className="whitespace-pre-wrap break-words leading-5">{comment.body}</p>
                    {comment.attachments.length > 0 ? (
                      <ul
                        className="mt-1.5 flex flex-wrap gap-1.5"
                        aria-label="Comment attachments"
                      >
                        {comment.attachments.map((attachment) => (
                          <li key={attachment.path}>
                            <a
                              href={`/${attachment.path}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-full items-center gap-1.5 rounded border border-border/70 bg-muted/40 px-2 py-1 text-xs hover:bg-muted"
                            >
                              <File className="size-3.5 shrink-0" aria-hidden="true" />
                              <span className="max-w-56 truncate">
                                {databaseFileDisplayName(attachment)}
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="flex items-start gap-3 border-b border-border/60 pb-3" data-comment-composer>
        <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <UserRound className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {attachments.length > 0 ? (
            <ul className="mb-1.5 flex flex-wrap gap-1.5" aria-label="Attachments to post">
              {attachments.map((attachment) => (
                <li
                  key={attachment.path}
                  className="flex min-w-0 items-center gap-1 rounded border border-border/70 bg-muted/40 py-1 pr-1 pl-2 text-xs"
                >
                  <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="max-w-48 truncate">{databaseFileDisplayName(attachment)}</span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="size-5 shrink-0"
                    aria-label={`Remove ${databaseFileDisplayName(attachment)}`}
                    disabled={busy}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((candidate) => candidate.path !== attachment.path),
                      )
                    }
                  >
                    <X className="size-3" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-end gap-1">
            <Textarea
              ref={textareaRef}
              rows={1}
              value={body}
              aria-label="Add comment"
              placeholder="Add comment"
              className="min-h-9 resize-none rounded-none border-0 bg-transparent px-0 py-1.5 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
              disabled={busy}
              onChange={(event) => setBody(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
            <Input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              aria-label="Choose comment attachments"
              onChange={(event) => void attachFiles(event)}
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="shrink-0 text-muted-foreground"
              aria-label="Attach file"
              title="Attach file"
              disabled={busy || uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <LoaderCircle className="animate-spin" /> : <Paperclip />}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className={cn(
                    'shrink-0 text-muted-foreground',
                    mentions.length > 0 && 'text-primary',
                  )}
                  aria-label="Mention a person"
                  title="Mention a person"
                >
                  <AtSign />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <p className="px-2 py-1 font-medium text-xs">Mention a person</p>
                {activePeople.length > 0 ? (
                  <div className="mt-1 space-y-0.5">
                    {activePeople.map((person) => (
                      <label
                        key={person.id}
                        htmlFor={`peek-comment-mention-${person.id}`}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          id={`peek-comment-mention-${person.id}`}
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
                  </div>
                ) : (
                  <p className="px-2 py-1.5 text-muted-foreground text-xs">
                    No people are available to mention.
                  </p>
                )}
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              size="icon-sm"
              className="size-7 shrink-0 rounded-full"
              aria-label="Post comment"
              title="Post comment"
              disabled={busy || uploading || !snapshot || !body.trim()}
              onClick={() => void addComment()}
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
