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

/**
 * Auditable browser policy matrix. Agent-authored work is deliberately
 * required-review for every operation; the human column is the only place
 * where a direct-safe shortcut may be added.
 */
export const DATABASE_UI_MUTATION_POLICY = {
  cell: { human: 'automatic', agent: 'required' },
  title: { human: 'automatic', agent: 'required' },
  'record-create': { human: 'automatic', agent: 'required' },
  'blank-database-create': { human: 'automatic', agent: 'required' },
  view: { human: 'automatic', agent: 'required' },
  schema: { human: 'required', agent: 'required' },
  bulk: { human: 'required', agent: 'required' },
  destructive: { human: 'required', agent: 'required' },
  permission: { human: 'required', agent: 'required' },
  external: { human: 'required', agent: 'required' },
  migration: { human: 'required', agent: 'required' },
  agent: { human: 'required', agent: 'required' },
  verification: { human: 'required', agent: 'required' },
} as const satisfies Record<
  DatabaseUiMutationOperation,
  Record<'human' | 'agent', DatabaseUiMutationReviewMode>
>;

/**
 * Return the only review mode a UI caller may use for this mutation context.
 * A principal prefix check prevents an agent transport from inheriting the
 * human direct-manipulation shortcut accidentally.
 */
export function databaseUiMutationReviewMode(
  input: DatabaseUiMutationPolicyInput,
): DatabaseUiMutationReviewMode {
  const configuredMode = DATABASE_UI_MUTATION_POLICY[input.operation][input.actor];
  return configuredMode === 'automatic' && input.principalId.startsWith('user:')
    ? 'automatic'
    : 'required';
}

export function isDatabaseUiMutationDirectSafe(input: DatabaseUiMutationPolicyInput): boolean {
  return databaseUiMutationReviewMode(input) === 'automatic';
}
