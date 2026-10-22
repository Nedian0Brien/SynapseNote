import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewMarkdownFolderDatabase } from './database-markdown-import.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-markdown-import-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(contentDir, 'notes', 'nested'), { recursive: true });
  tempDirs.push(projectDir);
  writeFileSync(join(contentDir, 'notes', 'one.md'), '---\ntitle: One\nscore: 1\n---\nOne body\n');
  writeFileSync(
    join(contentDir, 'notes', 'nested', 'two.mdx'),
    '---\ntitle: Two\nscore: 2\n---\nTwo body\n',
  );
  writeFileSync(join(contentDir, 'notes', 'asset.png'), 'asset');
  return { projectDir, contentDir };
}

describe('previewMarkdownFolderDatabase', () => {
  test('returns a complete confirmation draft without changing source files', async () => {
    const { contentDir } = fixture();
    const preview = await previewMarkdownFolderDatabase(contentDir, {
      folder: 'notes',
      includeSubfolders: true,
    });
    expect(preview).toMatchObject({
      folder: 'notes',
      requiresConfirmation: true,
      complete: true,
      summary: { files: 2, proposedProperties: 2, blockingIssues: 0 },
    });
    expect(preview.records.map((record) => record.path)).toEqual([
      'notes/nested/two.mdx',
      'notes/one.md',
    ]);
    expect(preview.properties).toContainEqual(
      expect.objectContaining({ key: 'score', type: 'number', ownership: 'proposed' }),
    );
  });

  test('honors subfolder scope and refuses traversal, symlinks, and oversized scans', async () => {
    const { projectDir, contentDir } = fixture();
    expect(
      (
        await previewMarkdownFolderDatabase(contentDir, {
          folder: 'notes',
          includeSubfolders: false,
        })
      ).records.map((record) => record.path),
    ).toEqual(['notes/one.md']);
    await expect(
      previewMarkdownFolderDatabase(contentDir, { folder: '../outside' }),
    ).rejects.toThrow('escapes');
    symlinkSync(projectDir, join(contentDir, 'notes', 'linked'));
    await expect(previewMarkdownFolderDatabase(contentDir, { folder: 'notes' })).rejects.toThrow(
      'symbolic links',
    );
    await expect(
      previewMarkdownFolderDatabase(contentDir, { folder: 'notes', maxEntries: 1 }),
    ).rejects.toThrow('entry limit');
  });
});
