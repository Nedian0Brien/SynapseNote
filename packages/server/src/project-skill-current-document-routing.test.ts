import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_SKILL = readFileSync(
  join(import.meta.dir, '../assets/skills/project/SKILL.md'),
  'utf8',
);

describe('project skill current-document routing', () => {
  test('prefers host context, then live SynapseNote state, over screen-history inference', () => {
    expect(PROJECT_SKILL).toContain('A host-injected `<current_document>` block is authoritative');
    expect(PROJECT_SKILL).toContain('route to `current_document` FIRST');
    expect(PROJECT_SKILL).toContain('내가 지금 보고 있는 문서 뭐야?');
    expect(PROJECT_SKILL).toContain('Never substitute Chronicle');
    expect(PROJECT_SKILL).toContain('If neither source is available');
  });

  test('lists current_document in the complete MCP tool index', () => {
    expect(PROJECT_SKILL).toContain('## Tool index — 24 tools');
    expect(PROJECT_SKILL).toContain(
      '`current_document` (the focused visible SynapseNote document; first fallback',
    );
  });
});
