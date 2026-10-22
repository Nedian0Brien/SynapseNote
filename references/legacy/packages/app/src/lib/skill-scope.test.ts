import { describe, expect, test } from 'bun:test';
import { skillDisplayName } from './skill-scope';

describe('skillDisplayName', () => {
  test('strips current and pre-rebrand starter-pack prefixes', () => {
    expect(skillDisplayName('synapsenote-pack-knowledge-base')).toBe('knowledge-base');
    expect(skillDisplayName('open-knowledge-pack-knowledge-base')).toBe('knowledge-base');
  });

  test('leaves authored skill identities unchanged', () => {
    expect(skillDisplayName('summarize-research-paper')).toBe('summarize-research-paper');
  });
});
