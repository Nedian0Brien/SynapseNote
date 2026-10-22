export interface DatabaseAgentScope {
  databaseId: string;
  sourceId: string;
  viewId?: string | null;
  recordId?: string | null;
  recordIds?: readonly string[];
  propertyIds?: readonly string[];
}

function safe(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f ? ' ' : character;
    })
    .join('')
    .trim();
}

function values(values: readonly string[] | undefined): string[] {
  return (values ?? []).map(safe).filter(Boolean);
}

export function databaseAgentScopeSummary(scope: DatabaseAgentScope): string {
  const recordCount = new Set([
    ...(scope.recordId ? [scope.recordId] : []),
    ...values(scope.recordIds),
  ]).size;
  const propertyCount = new Set(values(scope.propertyIds)).size;
  return [
    'database',
    'source',
    scope.viewId ? 'view' : null,
    recordCount > 0 ? `${recordCount} record${recordCount === 1 ? '' : 's'}` : null,
    propertyCount > 0 ? `${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/**
 * Stable-ID scope block appended to the external agent prompt. The visible
 * composer only shows the human scope summary; this exact block is what lets
 * the agent resolve the same database objects through SynapseNote MCP.
 */
export function databaseAgentScopeInstruction(scope: DatabaseAgentScope): string {
  const recordIds = new Set([
    ...(scope.recordId ? [scope.recordId] : []),
    ...values(scope.recordIds),
  ]);
  const propertyIds = [...new Set(values(scope.propertyIds))];
  const lines = [
    'Database scope (use SynapseNote MCP; do not widen this scope without asking):',
    `- database_id: ${safe(scope.databaseId)}`,
    `- source_id: ${safe(scope.sourceId)}`,
  ];
  if (scope.viewId) lines.push(`- view_id: ${safe(scope.viewId)}`);
  if (recordIds.size > 0) lines.push(`- record_ids: ${[...recordIds].map(safe).join(', ')}`);
  if (propertyIds.length > 0) lines.push(`- property_ids: ${propertyIds.join(', ')}`);
  return lines.join('\n');
}
