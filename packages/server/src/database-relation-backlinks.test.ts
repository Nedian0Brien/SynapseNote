import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BacklinkIndex } from './backlink-index';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('database relations and backlinks', () => {
  test('does not count stable relation IDs as generated document links', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-relation-links-'));
    directories.push(projectDir);
    const contentDir = join(projectDir, 'content');
    mkdirSync(join(contentDir, 'projects'), { recursive: true });
    writeFileSync(join(contentDir, 'projects/alpha.md'), '# Alpha\n');
    writeFileSync(
      join(contentDir, 'task.md'),
      '---\nproject: rec_alpha\nrelated: [rec_alpha, rec_beta]\n---\nRelation values are data, not links.\n',
    );
    writeFileSync(join(contentDir, 'note.md'), 'Explicit reference: [[projects/alpha]]\n');
    const index = new BacklinkIndex({ projectDir, contentDir });
    await index.rebuildFromDisk();
    expect(index.getBacklinks('projects/alpha')).toEqual([
      { source: 'note', anchor: null, snippet: 'Explicit reference: projects/alpha' },
    ]);
    expect(index.getForwardLinks('task')).toEqual([]);
  });
});
