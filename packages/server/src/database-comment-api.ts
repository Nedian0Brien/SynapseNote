import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DatabaseCommentAnchorSchema,
  DatabaseCommentIdSchema,
  DatabaseCommentThreadIdSchema,
  DatabaseIdSchema,
  DatabaseRecordActorSchema,
  DatabaseRecordCommentsSchema,
  DatabaseRecordIdSchema,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import { type DatabaseCommentStore, DatabaseCommentStoreError } from './database-comment-store.ts';
import { DatabaseDataPlaneError } from './database-data-plane.ts';
import { errorResponse } from './http/error-response.ts';
import { withValidation } from './http/request-validation.ts';
import { successResponse } from './http/success-response.ts';

const RevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const BaseSchema = z.object({
  databaseId: DatabaseIdSchema,
  recordId: DatabaseRecordIdSchema,
  actor: DatabaseRecordActorSchema,
});
const MutationBaseSchema = BaseSchema.extend({ expectedRevision: RevisionSchema });

export const DatabaseCommentRequestSchema = z.discriminatedUnion('action', [
  BaseSchema.extend({ action: z.literal('read') }).strict(),
  MutationBaseSchema.extend({
    action: z.literal('add_thread'),
    anchor: DatabaseCommentAnchorSchema,
    body: z.string().trim().min(1).max(10_000),
    mentionedPersonIds: z.array(z.string().startsWith('person_')).max(100).optional(),
  }).strict(),
  MutationBaseSchema.extend({
    action: z.literal('reply'),
    threadId: DatabaseCommentThreadIdSchema,
    body: z.string().trim().min(1).max(10_000),
    mentionedPersonIds: z.array(z.string().startsWith('person_')).max(100).optional(),
  }).strict(),
  MutationBaseSchema.extend({
    action: z.literal('set_resolved'),
    threadId: DatabaseCommentThreadIdSchema,
    resolved: z.boolean(),
  }).strict(),
  MutationBaseSchema.extend({
    action: z.literal('edit_comment'),
    threadId: DatabaseCommentThreadIdSchema,
    commentId: DatabaseCommentIdSchema,
    body: z.string().trim().min(1).max(10_000),
    mentionedPersonIds: z.array(z.string().startsWith('person_')).max(100).optional(),
  }).strict(),
]);

export const DatabaseCommentResponseSchema = z
  .object({ revision: RevisionSchema, document: DatabaseRecordCommentsSchema })
  .strict();

function respondCommentError(response: ServerResponse, error: unknown): void {
  if (error instanceof DatabaseDataPlaneError && error.code === 'permission_denied') {
    errorResponse(response, 403, 'urn:ok:error:permission-denied', error.message, {
      handler: 'database-comments',
      extensions: { code: error.code, ...error.details },
    });
    return;
  }
  if (error instanceof DatabaseCommentStoreError) {
    const status =
      error.code === 'permission_denied' || error.code === 'not_comment_author'
        ? 403
        : error.code === 'record_not_found' ||
            error.code === 'thread_not_found' ||
            error.code === 'comment_not_found'
          ? 404
          : error.code === 'revision_changed' || error.code === 'thread_resolved'
            ? 409
            : error.code === 'invalid_storage'
              ? 500
              : 422;
    errorResponse(
      response,
      status,
      status === 403
        ? 'urn:ok:error:permission-denied'
        : status === 404
          ? 'urn:ok:error:not-found'
          : status === 409
            ? 'urn:ok:error:stale-target'
            : status === 422
              ? 'urn:ok:error:invalid-request'
              : 'urn:ok:error:internal-server-error',
      error.message,
      { handler: 'database-comments', cause: error },
    );
    return;
  }
  errorResponse(
    response,
    500,
    'urn:ok:error:internal-server-error',
    'Could not update database comments.',
    { handler: 'database-comments', cause: error },
  );
}

export function createDatabaseCommentApiHandler(
  store?: DatabaseCommentStore,
  flushGitCommit?: () => Promise<void>,
  authorize?: (
    request: IncomingMessage,
    body: z.infer<typeof DatabaseCommentRequestSchema>,
  ) => z.infer<typeof DatabaseRecordActorSchema>,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return withValidation(
    DatabaseCommentRequestSchema,
    async (request, response, body) => {
      if (!store) {
        errorResponse(
          response,
          503,
          'urn:ok:error:internal-server-error',
          'Database comments are unavailable.',
          { handler: 'database-comments' },
        );
        return;
      }
      try {
        const authorizedBody = authorize ? { ...body, actor: authorize(request, body) } : body;
        const snapshot = await (() => {
          switch (authorizedBody.action) {
            case 'read':
              return store.read(authorizedBody);
            case 'add_thread':
              return store.addThread(authorizedBody);
            case 'reply':
              return store.reply(authorizedBody);
            case 'set_resolved':
              return store.setResolved(authorizedBody);
            case 'edit_comment':
              return store.editComment(authorizedBody);
          }
        })();
        if (body.action !== 'read') await flushGitCommit?.();
        successResponse(response, 200, DatabaseCommentResponseSchema, snapshot, {
          handler: 'database-comments',
          extraHeaders: { 'Cache-Control': 'no-store' },
        });
      } catch (error) {
        respondCommentError(response, error);
      }
    },
    { handler: 'database-comments', method: 'POST' },
  );
}
