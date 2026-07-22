import {
  type DatabaseCommentAnchor,
  type DatabaseRecordActor,
  type DatabaseRecordComments,
  DatabaseRecordCommentsSchema,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';

const SnapshotSchema = z
  .object({
    revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    document: DatabaseRecordCommentsSchema,
  })
  .strict();

export interface DatabaseCommentSnapshot {
  revision: string;
  document: DatabaseRecordComments;
}

type Base = { databaseId: string; recordId: string; actor: DatabaseRecordActor };
export type DatabaseCommentRequest =
  | (Base & { action: 'read' })
  | (Base & {
      action: 'add_thread';
      expectedRevision: string;
      anchor: DatabaseCommentAnchor;
      body: string;
      mentionedPersonIds?: string[];
    })
  | (Base & {
      action: 'reply';
      expectedRevision: string;
      threadId: string;
      body: string;
      mentionedPersonIds?: string[];
    })
  | (Base & {
      action: 'set_resolved';
      expectedRevision: string;
      threadId: string;
      resolved: boolean;
    })
  | (Base & {
      action: 'edit_comment';
      expectedRevision: string;
      threadId: string;
      commentId: string;
      body: string;
      mentionedPersonIds?: string[];
    });

export class DatabaseCommentsClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problem?: unknown,
  ) {
    super(message);
    this.name = 'DatabaseCommentsClientError';
  }
}

export async function databaseComments(
  request: DatabaseCommentRequest,
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<DatabaseCommentSnapshot> {
  const response = await (options.fetch ?? globalThis.fetch)('/api/databases/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(request),
    signal: options.signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string'
        ? body.detail
        : `Database comments failed with HTTP ${response.status}`;
    throw new DatabaseCommentsClientError(detail, response.status, body);
  }
  const parsed = SnapshotSchema.safeParse(body);
  if (!parsed.success) {
    throw new DatabaseCommentsClientError('Database comments returned an invalid response', 502, {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}
