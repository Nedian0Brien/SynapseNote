import { describe, expect, test } from 'bun:test';
import {
  createDatabasePortableBundle,
  inferDatabaseFromMarkdown,
  parseDatabasePortableBundle,
  parseDatabasePortableBundleJson,
  serializeDatabasePortableBundle,
} from './interchange.ts';

describe('Markdown database import inference', () => {
  test('builds a confirmation-required typed draft without mutating or owning metadata', () => {
    const files = [
      {
        path: 'projects/alpha.md',
        markdown: `---
title: Alpha
done: false
score: 8
due: 2026-07-30
website: https://example.com/alpha
tags: [product, active]
aliases: [Project Alpha]
cssclasses: [wide-page]
plugin-private: keep-me
---
Alpha body
`,
      },
      {
        path: 'projects/beta.md',
        markdown: `---
name: Beta
done: true
score: 13
due: 2026-08-01
website: https://example.com/beta
tags: [product]
aliases: []
cssclasses: [dashboard]
plugin-private: also-keep
---
Beta body
`,
      },
    ] as const;

    const draft = inferDatabaseFromMarkdown(files);

    expect(draft).toMatchObject({
      version: 1,
      kind: 'markdown-folder',
      requiresConfirmation: true,
      complete: true,
      summary: { files: 2, blockingIssues: 0 },
    });
    expect(
      Object.fromEntries(draft.properties.map((property) => [property.key, property.type])),
    ).toMatchObject({
      title: 'title',
      done: 'checkbox',
      score: 'number',
      due: 'date',
      website: 'url',
      tags: 'multi_select',
      aliases: 'multi_select',
    });
    expect(draft.properties.every((property) => property.ownership === 'proposed')).toBe(true);
    expect(draft.records[0]?.retainedMetadata).toMatchObject({
      cssclasses: ['wide-page'],
      'plugin-private': 'keep-me',
    });
    expect(files[0].markdown).toContain('plugin-private: keep-me');
  });

  test('reports collisions, mixed types, malformed YAML, and deterministic filename titles', () => {
    const draft = inferDatabaseFromMarkdown([
      { path: 'notes/one.md', markdown: '---\nFoo Bar: 1\nfoo-bar: text\n---\nBody\n' },
      { path: 'notes/two.md', markdown: '---\nvalue: 1\n---\nBody\n' },
      { path: 'notes/three.md', markdown: '---\nvalue: later\n---\nBody\n' },
      { path: 'notes/broken.md', markdown: '---\ntitle: [\n---\nBody\n' },
    ]);
    expect(draft.records.map((record) => record.title)).toEqual(['broken', 'one', 'three', 'two']);
    expect(draft.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'malformed_frontmatter', severity: 'blocking' }),
        expect.objectContaining({ code: 'key_collision', propertyKey: 'foo_bar' }),
        expect.objectContaining({ code: 'mixed_property_types', propertyKey: 'value' }),
      ]),
    );
  });
});

describe('portable Markdown + manifest database bundle', () => {
  test('round-trips exact canonical bytes and reports every missing media reference', () => {
    const yaml = '# comment\nversion: 1\nid: db_tasks\n';
    const markdown = `---\n_sn:\n  database_id: db_tasks\n---\n![Cover](../assets/cover.png)\n![[../assets/missing.pdf]]\n`;
    const bundle = createDatabasePortableBundle({
      manifests: [{ path: '.ok/databases/tasks.yml', yaml }],
      records: [{ path: 'tasks/one.md', markdown }],
      assets: [
        {
          path: 'assets/cover.png',
          sha256: 'sha256:8f8cbb7dcf46e0bc7d53265749a6c17d116093a6ba95e442764060c76fd4a86c',
          mediaType: 'image/png',
          bytesBase64: 'cG5n',
        },
      ],
    });

    expect(bundle.assetReferences).toEqual([
      { recordPath: 'tasks/one.md', assetPath: 'assets/cover.png', status: 'included' },
      { recordPath: 'tasks/one.md', assetPath: 'assets/missing.pdf', status: 'missing' },
    ]);
    expect(bundle.assets).toContainEqual({
      path: 'assets/missing.pdf',
      sha256: null,
      mediaType: null,
      bytesBase64: null,
      status: 'missing',
    });
    const parsed = parseDatabasePortableBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.manifests[0]?.content).toBe(yaml);
    expect(parsed.records[0]?.content).toBe(markdown);
    expect(parseDatabasePortableBundleJson(serializeDatabasePortableBundle(bundle))).toEqual(
      bundle,
    );
  });

  test('refuses traversal, duplicate ownership, and modified canonical bytes', () => {
    expect(() =>
      createDatabasePortableBundle({
        manifests: [{ path: '../tasks.yml', yaml: 'version: 1\n' }],
        records: [],
      }),
    ).toThrow('Unsafe manifest');
    const bundle = createDatabasePortableBundle({
      manifests: [{ path: '.ok/databases/tasks.yml', yaml: 'version: 1\n' }],
      records: [{ path: 'tasks/one.md', markdown: 'Body\n' }],
    });
    expect(() =>
      parseDatabasePortableBundle({
        ...bundle,
        records: [{ ...bundle.records[0], content: 'changed\n' }],
      }),
    ).toThrow('digest mismatch');
  });
});
