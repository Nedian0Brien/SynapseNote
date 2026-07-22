import { type DatabaseProblemCode, databaseProblemExtensions } from '../../database-problem.ts';
import { z } from 'zod';
import { textPlusStructured } from './shared.ts';

export const DatabaseToolProblemOutputSchema = z.record(z.string(), z.unknown());

export function databaseToolProblemPayload(
  result: Record<string, unknown>,
): Record<string, unknown> {
  const { ok: _ok, httpStatus, error, ...problem } = result;
  const title = typeof error === 'string' ? error : 'Database request failed.';
  if (
    typeof problem.code === 'string' &&
    typeof problem.retryable === 'boolean' &&
    problem.recovery !== undefined
  ) {
    return { ...problem, title };
  }
  let inferred = databaseProblemExtensions('transport_error');
  if (typeof problem.code === 'string') {
    try {
      inferred = databaseProblemExtensions(problem.code as DatabaseProblemCode);
    } catch {
      // Older or non-SynapseNote servers may return an unknown code. Treat it
      // as a transport contract mismatch while preserving the raw fields.
    }
  }
  return {
    ...problem,
    ...inferred,
    title,
    ...(typeof httpStatus === 'number' ? { status: httpStatus } : {}),
  };
}

export function databaseToolHttpError(
  result: Record<string, unknown>,
  structured: Record<string, unknown>,
): ReturnType<typeof textPlusStructured> {
  const code = typeof result.code === 'string' ? ` (${result.code})` : '';
  return textPlusStructured(
    `Error${code}: ${String(result.error)}`,
    { ...structured, problem: databaseToolProblemPayload(result) },
    true,
  );
}

export function databaseToolInputError(
  code: DatabaseProblemCode,
  message: string,
  structured: Record<string, unknown>,
): ReturnType<typeof textPlusStructured> {
  return textPlusStructured(
    `Error (${code}): ${message}`,
    {
      ...structured,
      problem: {
        type: 'urn:ok:error:invalid-request',
        status: 400,
        title: message,
        ...databaseProblemExtensions(code),
      },
    },
    true,
  );
}
