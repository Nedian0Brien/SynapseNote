import { describe, expect, test } from 'bun:test';
import {
  buildSessionInterruptRecoverySection,
  buildWikiCheckpointTasksSection,
  buildWikiPersistAsYouGoSection,
  hostTaskSystemPhrase,
} from './workflow-persistence.ts';

describe('workflow-persistence — tool-agnostic durability fragments', () => {
  test('hostTaskSystemPhrase names multiple hosts without picking one', () => {
    const phrase = hostTaskSystemPhrase();
    expect(phrase).toContain('Factory');
    expect(phrase).toContain('Cursor');
    expect(phrase).toContain('Claude');
  });

  test('buildWikiPersistAsYouGoSection stresses one-page-at-a-time writes', () => {
    const section = buildWikiPersistAsYouGoSection('content');
    expect(section).toContain('PERSIST AS YOU GO');
    expect(section).toContain('`write` each page immediately after reading its source');
    expect(section).toContain('content/wiki');
  });

  test('buildWikiCheckpointTasksSection lists phased tasks for GENERATE', () => {
    const section = buildWikiCheckpointTasksSection();
    expect(section).toContain('Phase 0');
    expect(section).toContain('Phase 7');
    expect(section).toContain('REFRESH mode');
  });

  test('buildSessionInterruptRecoverySection forbids native write bypass', () => {
    const section = buildSessionInterruptRecoverySection('resume hint here');
    expect(section).toContain('rate-limit');
    expect(section).toContain('Never bypass OK');
    expect(section).toContain('resume hint here');
  });
});
