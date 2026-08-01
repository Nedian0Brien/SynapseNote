import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContentFilter } from './content-filter.ts';
import {
  __getShowAllWalkStatsForTesting,
  __resetShowAllWalkStatsForTesting,
  DEFAULT_SHOWALL_MAX_ENTRIES,
  walkContentDirForShowAll,
} from './content-show-all-walk.ts';

describe('content show-all walk', () => {
  let dir: string | undefined;

  afterEach(() => {
    __resetShowAllWalkStatsForTesting();
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  test('counts one real buffered traversal', async () => {
    __resetShowAllWalkStatsForTesting();
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'synapsenote-content-show-all-walk-')));
    writeFileSync(join(dir, 'first.md'), '# First\n');
    writeFileSync(join(dir, 'second.md'), '# Second\n');
    const documents = [];

    await walkContentDirForShowAll({
      contentDir: dir,
      contentFilter: createContentFilter({ projectDir: dir, contentDir: dir }),
      dirFilter: null,
      documents,
      maxEntries: DEFAULT_SHOWALL_MAX_ENTRIES,
    });

    expect(documents).toHaveLength(2);
    expect(__getShowAllWalkStatsForTesting()).toEqual({ invocations: 1, aborts: 0 });
  });
});
