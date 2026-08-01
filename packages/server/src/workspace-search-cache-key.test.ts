import { expect, test } from 'bun:test';
import { createWorkspaceSearchCacheKey } from './workspace-search-cache-key.ts';

test('separates workspace-search content and project paths with exactly one NUL character', () => {
  const key = createWorkspaceSearchCacheKey('/workspace/content', '/workspace/project');

  expect(key).toBe('/workspace/content\u0000/workspace/project');
  expect([...key].filter((character) => character === '\u0000')).toHaveLength(1);
  expect(createWorkspaceSearchCacheKey('/workspace/content/', 'project')).not.toBe(key);
});
