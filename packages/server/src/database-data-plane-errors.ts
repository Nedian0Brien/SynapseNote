export type DatabaseDataPlaneErrorCode =
  | 'database_not_found'
  | 'source_not_found'
  | 'property_not_found'
  | 'record_not_found'
  | 'invalid_computed_property'
  | 'invalid_property_conversion'
  | 'delta_query_mismatch'
  | 'stale_index'
  | 'index_unavailable'
  | 'semantic_index_unavailable'
  | 'resource_limit'
  | 'permission_denied'
  | 'view_not_found'
  | 'view_source_mismatch'
  | 'agent_view_not_found'
  | 'agent_view_source_mismatch'
  | 'agent_view_scope_violation'
  | 'agent_view_budget_exceeded'
  | 'context_inspection_not_found'
  | 'form_not_found'
  | 'form_access_denied'
  | 'form_closed'
  | 'form_invalid_submission'
  | 'form_rate_limited'
  | 'form_duplicate_submission'
  | 'button_plan_expired'
  | 'repair_unavailable'
  | 'transaction_in_progress'
  | 'mutation_unavailable'
  | 'storage_read_only'
  | 'mutation_failed';

export class DatabaseDataPlaneError extends Error {
  readonly code: DatabaseDataPlaneErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseDataPlaneErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'DatabaseDataPlaneError';
    this.code = code;
    this.details = details;
  }
}
