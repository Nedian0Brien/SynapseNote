import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripFrontmatter, unwrapFrontmatterFences } from '../extensions/frontmatter.ts';
import { parseFrontmatterYaml } from '../frontmatter/yaml-codec.ts';
import { mergeDatabaseManifestGit, mergeDatabaseRecordGit } from './git-merge.ts';
import { parseDatabaseManifestYaml, serializeDatabaseManifestYaml } from './manifest.ts';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/v1/database.yml', import.meta.url)),
  'utf-8',
);

function definition(yaml: string) {
  const parsed = parseDatabaseManifestYaml(yaml);
  if (!parsed.ok) throw new Error(parsed.error);
  return structuredClone(parsed.definition);
}

function record(
  input: {
    title?: string;
    status?: string;
    body?: string;
    editedAt?: string;
    actor?: string;
    recordId?: string;
  } = {},
): string {
  return `---
_sn:
  database_id: db_tasks
  source_id: ds_tasks
  record_id: ${input.recordId ?? 'rec_one'}
  created_at: 2026-07-20T00:00:00.000Z
  last_edited_at: ${input.editedAt ?? '2026-07-20T00:00:00.000Z'}
  created_by:
    kind: human
    principal_id: user:creator
  last_edited_by:
    kind: human
    principal_id: ${input.actor ?? 'user:creator'}
title: ${input.title ?? 'Base title'}
status: ${input.status ?? 'todo'}
---
${input.body ?? 'Base body'}
`;
}

describe('database Git semantic merge', () => {
  test('merges independent manifest fields and stable-ID objects', () => {
    const ours = definition(fixture);
    const theirs = definition(fixture);
    ours.name = 'Feedback workspace';
    const status = theirs.sources[0]?.properties.find((property) => property.type === 'select');
    if (!status || status.type !== 'select') throw new Error('select fixture missing');
    status.name = 'Workflow state';

    const result = mergeDatabaseManifestGit(
      fixture,
      serializeDatabaseManifestYaml(ours),
      serializeDatabaseManifestYaml(theirs),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const merged = definition(result.merged);
    expect(merged.name).toBe('Feedback workspace');
    expect(merged.sources[0]?.properties.find((property) => property.id === status.id)?.name).toBe(
      'Workflow state',
    );
  });

  test('preserves a comment-only side while applying the other semantic change', () => {
    const ours = definition(fixture);
    ours.name = 'Changed name';
    const theirs = fixture.replace('version: 1', '# reviewer note\nversion: 1');

    const result = mergeDatabaseManifestGit(fixture, serializeDatabaseManifestYaml(ours), theirs);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.merged).toContain('# reviewer note');
    expect(definition(result.merged).name).toBe('Changed name');
  });

  test('refuses divergent edits to the same manifest field', () => {
    const ours = definition(fixture);
    const theirs = definition(fixture);
    ours.name = 'Ours';
    theirs.name = 'Theirs';

    const result = mergeDatabaseManifestGit(
      fixture,
      serializeDatabaseManifestYaml(ours),
      serializeDatabaseManifestYaml(theirs),
    );

    expect(result).toMatchObject({
      ok: false,
      conflicts: [{ path: ['name'], reason: 'both_changed' }],
    });
  });

  test('merges independent record properties and keeps the latest matching attribution pair', () => {
    const base = record();
    const ours = record({
      status: 'done',
      editedAt: '2026-07-20T01:00:00.000Z',
      actor: 'user:ours',
    });
    const theirs = record({
      title: 'Their title',
      editedAt: '2026-07-20T02:00:00.000Z',
      actor: 'user:theirs',
    });

    const result = mergeDatabaseRecordGit(base, ours, theirs);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { frontmatter } = stripFrontmatter(result.merged);
    const parsed = parseFrontmatterYaml(unwrapFrontmatterFences(frontmatter));
    expect(parsed.map).toMatchObject({
      title: 'Their title',
      status: 'done',
      _sn: {
        last_edited_at: '2026-07-20T02:00:00.000Z',
        last_edited_by: { principal_id: 'user:theirs' },
      },
    });
  });

  test('merges a body edit with a property edit but refuses same-property divergence', () => {
    const base = record();
    const bodyAndProperty = mergeDatabaseRecordGit(
      base,
      record({ body: 'Ours body', editedAt: '2026-07-20T01:00:00.000Z' }),
      record({ status: 'done', editedAt: '2026-07-20T02:00:00.000Z' }),
    );
    expect(bodyAndProperty.ok).toBe(true);
    if (bodyAndProperty.ok) {
      expect(bodyAndProperty.merged).toEndWith('Ours body\n');
      expect(bodyAndProperty.merged).toContain('status: done');
    }

    const conflict = mergeDatabaseRecordGit(
      base,
      record({ title: 'Ours', editedAt: '2026-07-20T01:00:00.000Z' }),
      record({ title: 'Theirs', editedAt: '2026-07-20T02:00:00.000Z' }),
    );
    expect(conflict).toMatchObject({
      ok: false,
      conflicts: [{ path: ['title'], reason: 'both_changed' }],
    });
  });

  test('refuses record identity drift', () => {
    expect(
      mergeDatabaseRecordGit(record(), record(), record({ recordId: 'rec_other' })),
    ).toMatchObject({ ok: false, conflicts: [{ reason: 'invalid_artifact' }] });
  });
});
