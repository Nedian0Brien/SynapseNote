import type { DatabaseFormValue } from '@nedian0brien/synapsenote-core';
import { z } from 'zod';

export const DatabaseFormSubmitResponseSchema = z
  .object({
    status: z.literal('created'),
    recordId: z.string().startsWith('rec_'),
    submittedAt: z.string().datetime({ offset: true }),
    idempotentReplay: z.boolean(),
    confirmation: z
      .object({
        title: z.string().min(1),
        message: z.string(),
        allowAnotherResponse: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type DatabaseFormSubmitResult = z.infer<typeof DatabaseFormSubmitResponseSchema>;

export class DatabaseFormSubmitError extends Error {
  readonly status: number;
  readonly problem: unknown;

  constructor(message: string, status: number, problem: unknown) {
    super(message);
    this.name = 'DatabaseFormSubmitError';
    this.status = status;
    this.problem = problem;
  }
}

export async function submitDatabaseForm(
  input: {
    databaseId: string;
    sourceId: string;
    viewId: string;
    submissionId: string;
    startedAt: string;
    answers: Readonly<Record<string, DatabaseFormValue>>;
    honeypot?: string;
  },
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<DatabaseFormSubmitResult> {
  const response = await (options.fetch ?? globalThis.fetch)('/api/databases/forms/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String(payload.detail)
        : 'Unable to submit this response.';
    throw new DatabaseFormSubmitError(detail, response.status, payload);
  }
  return DatabaseFormSubmitResponseSchema.parse(payload);
}
