import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type DatabaseCommentAnchor,
  type DatabaseCommentAttachment,
  type DatabaseDefinition,
  DatabaseIdSchema,
  type DatabasePerson,
  type DatabaseRecord,
  type DatabaseRecordActor,
  type DatabaseRecordComments,
  DatabaseRecordCommentsSchema,
  DatabaseRecordIdSchema,
  type DatabaseSource,
  databaseCommentActorKey,
  databasePropertyCommentProblem,
} from '@nedian0brien/synapsenote-core';

const EMPTY_REVISION = `sha256:${'0'.repeat(64)}`;

export type DatabaseCommentAction = 'read' | 'comment' | 'resolve' | 'moderate';

export interface DatabaseCommentRecordContext {
  definition: DatabaseDefinition;
  source: DatabaseSource;
  record: DatabaseRecord;
  people: readonly DatabasePerson[];
}

export class DatabaseCommentStoreError extends Error {
  constructor(
    readonly code:
      | 'permission_denied'
      | 'record_not_found'
      | 'revision_changed'
      | 'thread_not_found'
      | 'comment_not_found'
      | 'thread_resolved'
      | 'invalid_anchor'
      | 'invalid_mention'
      | 'not_comment_author'
      | 'invalid_storage',
    message: string,
  ) {
    super(message);
    this.name = 'DatabaseCommentStoreError';
  }
}

export interface DatabaseCommentSnapshot {
  revision: string;
  document: DatabaseRecordComments;
}

export interface CreateDatabaseCommentStoreOptions {
  projectDir: string;
  resolveRecord: (
    databaseId: string,
    recordId: string,
  ) => Promise<DatabaseCommentRecordContext | null> | DatabaseCommentRecordContext | null;
  authorize: (input: {
    action: DatabaseCommentAction;
    actor: DatabaseRecordActor;
    context: DatabaseCommentRecordContext;
  }) => Promise<boolean> | boolean;
  now?: () => Date;
  generateUuid?: () => string;
}

function revision(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function canonical(document: DatabaseRecordComments): string {
  return `${JSON.stringify(DatabaseRecordCommentsSchema.parse(document), null, 2)}\n`;
}

function compactUuid(generateUuid: () => string): string {
  return generateUuid().replaceAll('-', '');
}

export class DatabaseCommentStore {
  readonly #projectDir: string;
  readonly #resolveRecord: CreateDatabaseCommentStoreOptions['resolveRecord'];
  readonly #authorize: CreateDatabaseCommentStoreOptions['authorize'];
  readonly #now: () => Date;
  readonly #generateUuid: () => string;
  readonly #locks = new Map<string, Promise<void>>();

  constructor(options: CreateDatabaseCommentStoreOptions) {
    this.#projectDir = resolve(options.projectDir);
    this.#resolveRecord = options.resolveRecord;
    this.#authorize = options.authorize;
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
  }

  #path(databaseId: string, recordId: string): string {
    DatabaseIdSchema.parse(databaseId);
    DatabaseRecordIdSchema.parse(recordId);
    return resolve(
      this.#projectDir,
      '.ok',
      'comments',
      'databases',
      databaseId,
      `${recordId}.json`,
    );
  }

  async #context(
    databaseId: string,
    recordId: string,
    actor: DatabaseRecordActor,
    action: DatabaseCommentAction,
  ): Promise<DatabaseCommentRecordContext> {
    const context = await this.#resolveRecord(databaseId, recordId);
    if (!context || context.definition.id !== databaseId || context.record.id !== recordId) {
      throw new DatabaseCommentStoreError('record_not_found', 'The comment record was not found');
    }
    if (!(await this.#authorize({ action, actor, context }))) {
      throw new DatabaseCommentStoreError(
        'permission_denied',
        `Actor "${databaseCommentActorKey(actor)}" cannot ${action} this record`,
      );
    }
    return context;
  }

  async #read(databaseId: string, recordId: string): Promise<DatabaseCommentSnapshot> {
    const path = this.#path(databaseId, recordId);
    try {
      const stats = await lstat(path);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new DatabaseCommentStoreError(
          'invalid_storage',
          'The comment artifact is not a regular file',
        );
      }
      const content = await readFile(path, 'utf8');
      return {
        revision: revision(content),
        document: DatabaseRecordCommentsSchema.parse(JSON.parse(content)),
      };
    } catch (cause) {
      if (cause instanceof DatabaseCommentStoreError) throw cause;
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new DatabaseCommentStoreError(
          'invalid_storage',
          cause instanceof Error ? cause.message : 'Could not read comments',
        );
      }
      return {
        revision: EMPTY_REVISION,
        document: { version: 1, databaseId, recordId, threads: [] },
      };
    }
  }

  async read(input: {
    databaseId: string;
    recordId: string;
    actor: DatabaseRecordActor;
  }): Promise<DatabaseCommentSnapshot> {
    await this.#context(input.databaseId, input.recordId, input.actor, 'read');
    return this.#read(input.databaseId, input.recordId);
  }

  async #ensureDirectory(databaseId: string): Promise<string> {
    const segments = [
      resolve(this.#projectDir, '.ok'),
      resolve(this.#projectDir, '.ok', 'comments'),
      resolve(this.#projectDir, '.ok', 'comments', 'databases'),
      resolve(this.#projectDir, '.ok', 'comments', 'databases', databaseId),
    ];
    for (const segment of segments) {
      await mkdir(segment, { recursive: false }).catch((cause: NodeJS.ErrnoException) => {
        if (cause.code !== 'EEXIST') throw cause;
      });
      const stats = await lstat(segment);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new DatabaseCommentStoreError(
          'invalid_storage',
          'Comment storage contains a non-directory or symbolic link',
        );
      }
    }
    return segments.at(-1) as string;
  }

  async #write(snapshot: DatabaseCommentSnapshot): Promise<DatabaseCommentSnapshot> {
    const directory = await this.#ensureDirectory(snapshot.document.databaseId);
    const path = this.#path(snapshot.document.databaseId, snapshot.document.recordId);
    const content = canonical(snapshot.document);
    const temporary = resolve(
      directory,
      `.${snapshot.document.recordId}.${compactUuid(this.#generateUuid)}.tmp`,
    );
    try {
      await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
      await rename(temporary, path);
    } catch (cause) {
      await unlink(temporary).catch(() => {});
      throw new DatabaseCommentStoreError(
        'invalid_storage',
        cause instanceof Error ? cause.message : 'Could not persist comments',
      );
    }
    return {
      revision: revision(content),
      document: DatabaseRecordCommentsSchema.parse(snapshot.document),
    };
  }

  async #exclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#locks.get(key) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolveLock) => {
      release = resolveLock;
    });
    const queued = previous.then(() => current);
    this.#locks.set(key, queued);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.#locks.get(key) === queued) this.#locks.delete(key);
    }
  }

  #mentions(context: DatabaseCommentRecordContext, personIds: readonly string[]): string[] {
    const unique = [...new Set(personIds)];
    for (const personId of unique) {
      const person = context.people.find((candidate) => candidate.id === personId);
      if (!person?.active) {
        throw new DatabaseCommentStoreError(
          'invalid_mention',
          `Mentioned person "${personId}" is missing or inactive`,
        );
      }
    }
    return unique;
  }

  async #mutate(input: {
    databaseId: string;
    recordId: string;
    actor: DatabaseRecordActor;
    action: DatabaseCommentAction;
    expectedRevision: string;
    apply: (
      document: DatabaseRecordComments,
      context: DatabaseCommentRecordContext,
    ) => DatabaseRecordComments;
  }): Promise<DatabaseCommentSnapshot> {
    const key = `${input.databaseId}:${input.recordId}`;
    return this.#exclusive(key, async () => {
      const context = await this.#context(
        input.databaseId,
        input.recordId,
        input.actor,
        input.action,
      );
      const current = await this.#read(input.databaseId, input.recordId);
      if (current.revision !== input.expectedRevision) {
        throw new DatabaseCommentStoreError(
          'revision_changed',
          'Comments changed after they were loaded',
        );
      }
      return this.#write({
        ...current,
        document: input.apply(structuredClone(current.document), context),
      });
    });
  }

  addThread(input: {
    databaseId: string;
    recordId: string;
    actor: DatabaseRecordActor;
    expectedRevision: string;
    anchor: DatabaseCommentAnchor;
    body: string;
    attachments?: readonly DatabaseCommentAttachment[];
    mentionedPersonIds?: readonly string[];
  }): Promise<DatabaseCommentSnapshot> {
    return this.#mutate({
      ...input,
      action: 'comment',
      apply: (document, context) => {
        if (input.anchor.type === 'property') {
          const problem = databasePropertyCommentProblem({
            properties: context.source.properties,
            values: context.record.values,
            propertyId: input.anchor.propertyId,
          });
          if (problem) {
            throw new DatabaseCommentStoreError('invalid_anchor', problem);
          }
        }
        const now = this.#now().toISOString();
        document.threads.push({
          id: `cth_${compactUuid(this.#generateUuid)}`,
          anchor: structuredClone(input.anchor),
          comments: [
            {
              id: `cmt_${compactUuid(this.#generateUuid)}`,
              author: structuredClone(input.actor),
              body: input.body,
              attachments: structuredClone([...(input.attachments ?? [])]),
              mentionedPersonIds: this.#mentions(context, input.mentionedPersonIds ?? []),
              createdAt: now,
            },
          ],
        });
        return DatabaseRecordCommentsSchema.parse(document);
      },
    });
  }

  reply(input: {
    databaseId: string;
    recordId: string;
    actor: DatabaseRecordActor;
    expectedRevision: string;
    threadId: string;
    body: string;
    attachments?: readonly DatabaseCommentAttachment[];
    mentionedPersonIds?: readonly string[];
  }): Promise<DatabaseCommentSnapshot> {
    return this.#mutate({
      ...input,
      action: 'comment',
      apply: (document, context) => {
        const thread = document.threads.find((candidate) => candidate.id === input.threadId);
        if (!thread) throw new DatabaseCommentStoreError('thread_not_found', 'Thread not found');
        if (thread.resolvedAt) {
          throw new DatabaseCommentStoreError(
            'thread_resolved',
            'Reopen the thread before replying',
          );
        }
        thread.comments.push({
          id: `cmt_${compactUuid(this.#generateUuid)}`,
          author: structuredClone(input.actor),
          body: input.body,
          attachments: structuredClone([...(input.attachments ?? [])]),
          mentionedPersonIds: this.#mentions(context, input.mentionedPersonIds ?? []),
          createdAt: this.#now().toISOString(),
        });
        return DatabaseRecordCommentsSchema.parse(document);
      },
    });
  }

  setResolved(input: {
    databaseId: string;
    recordId: string;
    actor: DatabaseRecordActor;
    expectedRevision: string;
    threadId: string;
    resolved: boolean;
  }): Promise<DatabaseCommentSnapshot> {
    return this.#mutate({
      ...input,
      action: 'resolve',
      apply: (document) => {
        const thread = document.threads.find((candidate) => candidate.id === input.threadId);
        if (!thread) throw new DatabaseCommentStoreError('thread_not_found', 'Thread not found');
        if (input.resolved) {
          thread.resolvedAt = this.#now().toISOString();
          thread.resolvedBy = structuredClone(input.actor);
        } else {
          delete thread.resolvedAt;
          delete thread.resolvedBy;
        }
        return DatabaseRecordCommentsSchema.parse(document);
      },
    });
  }

  editComment(input: {
    databaseId: string;
    recordId: string;
    actor: DatabaseRecordActor;
    expectedRevision: string;
    threadId: string;
    commentId: string;
    body: string;
    attachments?: readonly DatabaseCommentAttachment[];
    mentionedPersonIds?: readonly string[];
  }): Promise<DatabaseCommentSnapshot> {
    return this.#mutate({
      ...input,
      action: 'comment',
      apply: (document, context) => {
        const thread = document.threads.find((candidate) => candidate.id === input.threadId);
        const comment = thread?.comments.find((candidate) => candidate.id === input.commentId);
        if (!comment) throw new DatabaseCommentStoreError('comment_not_found', 'Comment not found');
        if (databaseCommentActorKey(comment.author) !== databaseCommentActorKey(input.actor)) {
          throw new DatabaseCommentStoreError(
            'not_comment_author',
            'Only the author can edit a comment',
          );
        }
        comment.body = input.body;
        comment.attachments = structuredClone([...(input.attachments ?? comment.attachments)]);
        comment.mentionedPersonIds = this.#mentions(context, input.mentionedPersonIds ?? []);
        comment.editedAt = this.#now().toISOString();
        return DatabaseRecordCommentsSchema.parse(document);
      },
    });
  }
}

export function createDatabaseCommentStore(
  options: CreateDatabaseCommentStoreOptions,
): DatabaseCommentStore {
  return new DatabaseCommentStore(options);
}
