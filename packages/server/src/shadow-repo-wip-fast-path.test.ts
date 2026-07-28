import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import simpleGit from 'simple-git';
import {
  buildWipTree,
  commitWip,
  commitWipFromTree,
  initShadowRepo,
  resetWipIndexCacheForTests,
  type ShadowHandle,
  shadowGit,
  type WriterIdentity,
} from './shadow-repo.ts';

/**
 * `commitWip` spawns a `git` process for each step it takes, and on this class
 * of machine a process costs tens of milliseconds whatever it is asked to do —
 * more than the work for every step but `add`. Two of the six existed only to
 * re-derive a SHA the same process had just written, so they are now read off
 * disk instead.
 *
 * These pin the two things that make that safe: the shortcut is taken only
 * while the ref still holds what we wrote, and the commit it produces is
 * identical either way.
 */
describe('commitWip ref fast path', () => {
  let tmpRoot: string;
  let projectRoot: string;
  let shadow: ShadowHandle;
  let contentDir: string;

  const writer: WriterIdentity = { id: 'human-ada', name: 'Ada', email: 'ada@example.com' };
  const ref = 'refs/wip/main/human-ada';

  beforeEach(async () => {
    resetWipIndexCacheForTests();
    tmpRoot = await mkdtemp(resolve(tmpdir(), 'synapsenote-wip-fast-'));
    projectRoot = resolve(tmpRoot, 'project');
    contentDir = resolve(projectRoot, 'content');
    mkdirSync(contentDir, { recursive: true });
    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    shadow = await initShadowRepo(projectRoot);
  });

  afterEach(async () => {
    resetWipIndexCacheForTests();
    await rm(tmpRoot, { recursive: true, force: true });
  });

  test('keeps advancing the ref across commits', async () => {
    writeFileSync(resolve(contentDir, 'a.md'), '# one\n');
    const first = await commitWip(shadow, writer, '', 'first', 'main');
    writeFileSync(resolve(contentDir, 'a.md'), '# two\n');
    const second = await commitWip(shadow, writer, '', 'second', 'main');

    expect(second).not.toBe(first);
    expect(readFileSync(resolve(shadow.gitDir, ref), 'utf8').trim()).toBe(second);
    const parent = (await shadowGit(shadow).raw('rev-parse', `${second}^`)).trim();
    expect(parent).toBe(first);
    const listed = (await shadowGit(shadow).raw('show', `${second}:content/a.md`)).trim();
    expect(listed).toBe('# two');
  });

  /**
   * The shortcut trusts an in-memory note of what this process last wrote. Any
   * other writer moving the ref must drop it back to asking git, or the next
   * commit would be parented on a commit that is no longer the head.
   */
  test('falls back to git when another writer moved the ref', async () => {
    writeFileSync(resolve(contentDir, 'a.md'), '# one\n');
    const first = await commitWip(shadow, writer, '', 'first', 'main');

    // A different code path advances the same ref, leaving the cache stale.
    writeFileSync(resolve(contentDir, 'a.md'), '# outside\n');
    const outside = await commitWipFromTree(
      shadow,
      writer,
      await buildWipTree(shadow, ''),
      'outside',
      'main',
    );
    expect(outside).not.toBe(first);

    writeFileSync(resolve(contentDir, 'a.md'), '# three\n');
    const third = await commitWip(shadow, writer, '', 'third', 'main');
    const parent = (await shadowGit(shadow).raw('rev-parse', `${third}^`)).trim();
    expect(parent).toBe(outside);
    expect((await shadowGit(shadow).raw('show', `${third}:content/a.md`)).trim()).toBe('# three');
  });

  test('recovers when the ref is deleted underneath it', async () => {
    writeFileSync(resolve(contentDir, 'a.md'), '# one\n');
    await commitWip(shadow, writer, '', 'first', 'main');
    await shadowGit(shadow).raw('update-ref', '-d', ref);

    writeFileSync(resolve(contentDir, 'a.md'), '# two\n');
    const next = await commitWip(shadow, writer, '', 'after delete', 'main');
    expect(next).toHaveLength(40);
    expect((await shadowGit(shadow).raw('show', `${next}:content/a.md`)).trim()).toBe('# two');
  });
});

describe('commitWip reuseUnchanged', () => {
  let tmpRoot: string;
  let projectRoot: string;
  let shadow: ShadowHandle;
  let contentDir: string;

  const writer: WriterIdentity = { id: 'human-ada', name: 'Ada', email: 'ada@example.com' };

  beforeEach(async () => {
    resetWipIndexCacheForTests();
    tmpRoot = await mkdtemp(resolve(tmpdir(), 'synapsenote-wip-reuse-'));
    projectRoot = resolve(tmpRoot, 'project');
    contentDir = resolve(projectRoot, 'content');
    mkdirSync(contentDir, { recursive: true });
    const git = simpleGit(projectRoot);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    shadow = await initShadowRepo(projectRoot);
    writeFileSync(resolve(contentDir, 'a.md'), '# one\n');
    await commitWip(shadow, writer, '', 'seed', 'main');
  });

  afterEach(async () => {
    resetWipIndexCacheForTests();
    await rm(tmpRoot, { recursive: true, force: true });
  });

  test('returns the existing head when the work tree has not moved', async () => {
    const head = readFileSync(resolve(shadow.gitDir, 'refs/wip/main/human-ada'), 'utf8').trim();
    const reused = await commitWip(shadow, writer, '', 'base', 'main', { reuseUnchanged: true });
    expect(reused).toBe(head);
  });

  test('still commits when the work tree moved', async () => {
    const head = readFileSync(resolve(shadow.gitDir, 'refs/wip/main/human-ada'), 'utf8').trim();
    writeFileSync(resolve(contentDir, 'a.md'), '# two\n');
    const next = await commitWip(shadow, writer, '', 'base', 'main', { reuseUnchanged: true });
    expect(next).not.toBe(head);
    expect((await shadowGit(shadow).raw('show', `${next}:content/a.md`)).trim()).toBe('# two');
  });

  /**
   * A checkpoint records an act of saving, so the default has to keep writing
   * one even when the bytes are identical — only callers that want a handle on
   * the current state opt out.
   */
  test('without the opt-in an unchanged tree still writes a commit', async () => {
    const head = readFileSync(resolve(shadow.gitDir, 'refs/wip/main/human-ada'), 'utf8').trim();
    const next = await commitWip(shadow, writer, '', 'checkpoint', 'main');
    expect(next).not.toBe(head);
    const [nextTree, headTree] = await Promise.all([
      shadowGit(shadow).raw('rev-parse', `${next}^{tree}`),
      shadowGit(shadow).raw('rev-parse', `${head}^{tree}`),
    ]);
    expect(nextTree.trim()).toBe(headTree.trim());
  });

  test('the reused head carries the same tree a fresh commit would have', async () => {
    const reused = await commitWip(shadow, writer, '', 'base', 'main', { reuseUnchanged: true });
    const written = await commitWip(shadow, writer, '', 'checkpoint', 'main');
    const [reusedTree, writtenTree] = await Promise.all([
      shadowGit(shadow).raw('rev-parse', `${reused}^{tree}`),
      shadowGit(shadow).raw('rev-parse', `${written}^{tree}`),
    ]);
    expect(reusedTree.trim()).toBe(writtenTree.trim());
  });
});
