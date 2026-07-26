import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const productionDatabaseSurfaces = [
  '../editor/components/InlineDatabaseBlock.tsx',
  '../editor/components/InlineDatabaseOverlayHost.tsx',
  '../components/DatabaseWorkspaceViewRenderer.tsx',
  '../components/DatabaseWorkspaceOverlayHost.tsx',
  '../components/DatabaseRecordPageChrome.tsx',
];

describe('database render identity', () => {
  test('never derives React keys from mutable revision tokens', () => {
    for (const relativePath of productionDatabaseSurfaces) {
      const source = readFileSync(resolve(import.meta.dir, relativePath), 'utf8');
      const keyExpressions = [...source.matchAll(/key\s*=\s*\{[\s\S]{0,320}?\}/g)].map(
        ([expression]) => expression,
      );
      expect(
        keyExpressions.filter((expression) =>
          /(schema|snapshot|index|manifest)Revision/.test(expression),
        ),
      ).toEqual([]);
    }
  });

  test('does not key inline renderers by saved view identity', () => {
    const source = readFileSync(
      resolve(import.meta.dir, '../editor/components/InlineDatabaseBlock.tsx'),
      'utf8',
    );
    const keyExpressions = [...source.matchAll(/key\s*=\s*\{[\s\S]{0,320}?\}/g)].map(
      ([expression]) => expression,
    );
    expect(
      keyExpressions.filter((expression) =>
        /activeLinkedView\.id|reference\.data\.viewId/.test(expression),
      ),
    ).toEqual([]);
    expect(source).not.toContain('Loading linked view');
    expect(source).not.toContain('Loading table renderer');
  });
});
