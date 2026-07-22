import { z } from 'zod';
import { DatabasePersonIdSchema } from './person.ts';
import type { DatabaseValue } from './record.ts';
import type { DatabaseProperty, DatabaseRecordActor } from './schema.ts';
import {
  DatabaseIdSchema,
  DatabasePropertyIdSchema,
  DatabaseRecordActorSchema,
  DatabaseRecordIdSchema,
} from './schema.ts';

export const DatabaseCommentThreadIdSchema = z
  .string()
  .regex(/^cth_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export const DatabaseCommentIdSchema = z.string().regex(/^cmt_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);

export const DatabaseCommentAnchorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('page') }).strict(),
  z.object({ type: z.literal('property'), propertyId: DatabasePropertyIdSchema }).strict(),
]);

export const DatabaseCommentSchema = z
  .object({
    id: DatabaseCommentIdSchema,
    author: DatabaseRecordActorSchema,
    body: z.string().trim().min(1).max(10_000),
    mentionedPersonIds: z.array(DatabasePersonIdSchema).max(100).default([]),
    createdAt: z.string().datetime({ offset: true }),
    editedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((comment, context) => {
    if (new Set(comment.mentionedPersonIds).size !== comment.mentionedPersonIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['mentionedPersonIds'],
        message: 'Comment mentions must be unique',
      });
    }
  });

export const DatabaseCommentThreadSchema = z
  .object({
    id: DatabaseCommentThreadIdSchema,
    anchor: DatabaseCommentAnchorSchema,
    comments: z.array(DatabaseCommentSchema).min(1).max(1_000),
    resolvedAt: z.string().datetime({ offset: true }).optional(),
    resolvedBy: DatabaseRecordActorSchema.optional(),
  })
  .strict()
  .superRefine((thread, context) => {
    if ((thread.resolvedAt === undefined) !== (thread.resolvedBy === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['resolvedAt'],
        message: 'Resolved comment threads require both timestamp and actor',
      });
    }
    const ids = new Set<string>();
    for (const [index, comment] of thread.comments.entries()) {
      if (ids.has(comment.id)) {
        context.addIssue({
          code: 'custom',
          path: ['comments', index, 'id'],
          message: `Comment ID "${comment.id}" is repeated in one thread`,
        });
      }
      ids.add(comment.id);
    }
  });

export const DatabaseRecordCommentsSchema = z
  .object({
    version: z.literal(1),
    databaseId: DatabaseIdSchema,
    recordId: DatabaseRecordIdSchema,
    threads: z.array(DatabaseCommentThreadSchema).max(500).default([]),
  })
  .strict()
  .superRefine((document, context) => {
    const ids = new Set<string>();
    for (const [index, thread] of document.threads.entries()) {
      if (ids.has(thread.id)) {
        context.addIssue({
          code: 'custom',
          path: ['threads', index, 'id'],
          message: `Comment thread ID "${thread.id}" is repeated`,
        });
      }
      ids.add(thread.id);
    }
  });

export type DatabaseCommentAnchor = z.infer<typeof DatabaseCommentAnchorSchema>;
export type DatabaseComment = z.infer<typeof DatabaseCommentSchema>;
export type DatabaseCommentThread = z.infer<typeof DatabaseCommentThreadSchema>;
export type DatabaseRecordComments = z.infer<typeof DatabaseRecordCommentsSchema>;

export type DatabasePropertyCommentProblem =
  | 'property_not_found'
  | 'unsupported_property_type'
  | 'property_value_missing';

const UNSUPPORTED_PROPERTY_COMMENT_TYPES = new Set<DatabaseProperty['type']>([
  'title',
  'formula',
  'rollup',
  'button',
  'unique_id',
]);

/** Shared Notion-parity guard used by browser, HTTP, and agent comment writes. */
export function databasePropertyCommentProblem(input: {
  properties: readonly DatabaseProperty[];
  values: Readonly<Record<string, DatabaseValue>>;
  propertyId: string;
}): DatabasePropertyCommentProblem | null {
  const property = input.properties.find((candidate) => candidate.id === input.propertyId);
  if (!property) return 'property_not_found';
  if (UNSUPPORTED_PROPERTY_COMMENT_TYPES.has(property.type)) {
    return 'unsupported_property_type';
  }
  if (input.values[property.id] === undefined || input.values[property.id] === null) {
    return 'property_value_missing';
  }
  return null;
}

export function databaseCommentActorKey(actor: DatabaseRecordActor): string {
  return `${actor.kind}:${actor.principal_id}`;
}
