import { describe, expect, test } from 'bun:test';
import {
  databaseDocumentReferenceMarkup,
  databasePersonMentionMarkup,
  databaseRecordReferenceMarkup,
  projectDatabaseRichText,
} from './rich-text.ts';
import { validateDatabasePropertyConstraints } from './schema.ts';

describe('database Text rich markup', () => {
  test('projects multiline markup deterministically and extracts stable references', () => {
    const markup = [
      `Owner: ${databasePersonMentionMarkup('person_alice', 'Alice')}`,
      `Task: ${databaseRecordReferenceMarkup('rec_task', 'Launch **task**')}`,
      `Doc: ${databaseDocumentReferenceMarkup('notes/Launch Plan.md', 'Launch plan')}`,
      'Legacy: [[rec_other|Other task]] and [site](https://example.com).',
      'Inline `code` &amp; escaped \\*text\\*.',
    ].join('\r\n');
    const first = projectDatabaseRichText(markup);
    const second = projectDatabaseRichText(markup);
    expect(second).toEqual(first);
    expect(first.markup).not.toContain('\r');
    expect(first.plainText).toBe(
      [
        'Owner: @Alice',
        'Task: Launch task',
        'Doc: Launch plan',
        'Legacy: Other task and site.',
        'Inline code & escaped *text*.',
      ].join('\n'),
    );
    expect(first.references).toMatchObject([
      { kind: 'person', target: 'person_alice', label: '@Alice' },
      { kind: 'record', target: 'rec_task', label: 'Launch **task**' },
      {
        kind: 'document',
        target: 'notes/Launch Plan.md',
        label: 'Launch plan',
      },
      { kind: 'record', target: 'rec_other', label: 'Other task' },
      { kind: 'url', target: 'https://example.com', label: 'site' },
    ]);
  });

  test('leaves malformed or unknown links visible instead of inventing references', () => {
    const projected = projectDatabaseRichText(
      '[Unknown](synapsenote://person/not-stable) and [broken](relative/path)',
    );
    expect(projected.plainText).toBe('Unknown and broken');
    expect(projected.references).toEqual([]);
  });

  test('round-trips escaped labels, Unicode, and all input without silent truncation', () => {
    const label = '검토 ] \\ 경로 🚀';
    const markup = databaseRecordReferenceMarkup('rec_target', label);
    const longTail = 'x'.repeat(1_000_001);
    const projection = projectDatabaseRichText(`${markup}\r\n${longTail}`);

    expect(projection.markup).toHaveLength(markup.length + 1 + longTail.length);
    expect(projection.markup).not.toContain('\r');
    expect(projection.plainText).toBe(`${label}\n${longTail}`);
    expect(projection.references).toEqual([
      expect.objectContaining({ kind: 'record', target: 'rec_target', label }),
    ]);
  });
  test('applies user-visible Text constraints to the plain projection', () => {
    const property = {
      id: 'prop_notes',
      key: 'notes',
      name: 'Notes',
      type: 'text',
      semantics: { constraints: { unique: false, maxLength: 6, pattern: '^@Alice$' } },
    } as const;
    const markup = databasePersonMentionMarkup('person_alice', 'Alice');
    expect(validateDatabasePropertyConstraints(property as never, markup)).toBeNull();
    expect(validateDatabasePropertyConstraints(property as never, `${markup}!`)).toContain(
      'at most 6',
    );
  });
});
