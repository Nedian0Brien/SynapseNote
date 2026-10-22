import { describe, expect, test } from 'bun:test';
import { databaseAgentScopeInstruction, databaseAgentScopeSummary } from './database-agent-scope';

describe('database agent scope', () => {
  test('summarizes the addressed database objects without exposing stable IDs', () => {
    expect(
      databaseAgentScopeSummary({
        databaseId: 'db_tasks',
        sourceId: 'source_tasks',
        viewId: 'view_table',
        recordIds: ['record_a', 'record_a'],
        propertyIds: ['property_status'],
      }),
    ).toBe('database · source · view · 1 record · 1 property');
  });

  test('emits a deduplicated stable-ID boundary for the agent', () => {
    const instruction = databaseAgentScopeInstruction({
      databaseId: 'db_tasks',
      sourceId: 'source_tasks',
      viewId: 'view_table',
      recordId: 'record_a',
      recordIds: ['record_a', 'record_b'],
      propertyIds: ['property_status', 'property_status'],
    });

    expect(instruction).toContain('use SynapseNote MCP');
    expect(instruction).toContain('do not widen this scope without asking');
    expect(instruction).toContain('record_ids: record_a, record_b');
    expect(instruction).toContain('property_ids: property_status');
  });
});
