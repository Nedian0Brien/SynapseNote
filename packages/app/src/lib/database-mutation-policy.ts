/**
 * Human database editing policy shared by the browser surfaces.
 *
 * Direct-safe is intentionally a small allow-list. Everything not explicitly
 * listed (including agent-authored work) stays behind the exact plan/ghost /
 * commit review seam. This is a UI convenience policy only; the server still
 * validates every plan, permission, revision, and approval token.
 */
export type DatabaseUiMutationOperation =
  | 'cell'
  | 'title'
  | 'record-create'
  | 'blank-database-create'
  | 'view'
  | 'schema'
  | 'bulk'
  | 'destructive'
  | 'permission'
  | 'external'
  | 'migration'
  | 'agent'
  | 'verification';

export interface DatabaseUiMutationPolicyInput {
  operation: DatabaseUiMutationOperation;
  actor: 'human' | 'agent';
  principalId: string;
}

export type DatabaseUiMutationReviewMode = 'automatic' | 'required';

const DIRECT_SAFE_HUMAN_OPERATIONS = new Set<DatabaseUiMutationOperation>([
  'cell',
  'title',
  'record-create',
  'blank-database-create',
  'view',
]);

/**
 * Return the only review mode a UI caller may use for this mutation context.
 * A principal prefix check prevents an agent transport from inheriting the
 * human direct-manipulation shortcut accidentally.
 */
export function databaseUiMutationReviewMode(
  input: DatabaseUiMutationPolicyInput,
): DatabaseUiMutationReviewMode {
  if (
    input.actor === 'human' &&
    input.principalId.startsWith('user:') &&
    DIRECT_SAFE_HUMAN_OPERATIONS.has(input.operation)
  ) {
    return 'automatic';
  }
  return 'required';
}

export function isDatabaseUiMutationDirectSafe(input: DatabaseUiMutationPolicyInput): boolean {
  return databaseUiMutationReviewMode(input) === 'automatic';
}
