import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { savePdfAssetSafely } from '../../src/main/pdf-asset-save.ts';

const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'synapsenote-pdf-save-'));
  roots.push(root);
  const projectPath = join(root, 'project');
  mkdirSync(join(projectPath, 'reading'), { recursive: true });
  const target = join(projectPath, 'reading', 'paper.pdf');
  writeFileSync(target, '%PDF-1.4\noriginal\n%%EOF\n');
  return { root, projectPath, target };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('savePdfAssetSafely', () => {
  test('atomically replaces an existing project PDF', async () => {
    const { projectPath, target } = fixture();
    const updated = new TextEncoder().encode('%PDF-1.7\nannotated\n%%EOF\n');

    expect(
      await savePdfAssetSafely({ projectPath, platform: 'darwin' }, 'reading/paper.pdf', updated),
    ).toEqual({ ok: true });
    expect(readFileSync(target, 'utf-8')).toBe('%PDF-1.7\nannotated\n%%EOF\n');
  });

  test('refuses traversal, non-PDF targets, and malformed bytes without touching the original', async () => {
    const { root, projectPath, target } = fixture();
    const outside = join(root, 'outside.pdf');
    writeFileSync(outside, '%PDF-1.4\noutside\n%%EOF\n');
    const textTarget = join(projectPath, 'reading', 'notes.txt');
    writeFileSync(textTarget, 'notes');
    const valid = new TextEncoder().encode('%PDF-1.7\nupdated\n%%EOF\n');

    expect(
      await savePdfAssetSafely({ projectPath, platform: 'darwin' }, '../outside.pdf', valid),
    ).toEqual({ ok: false, reason: 'invalid-path' });
    expect(
      await savePdfAssetSafely({ projectPath, platform: 'darwin' }, 'reading/notes.txt', valid),
    ).toEqual({ ok: false, reason: 'not-pdf' });
    expect(
      await savePdfAssetSafely(
        { projectPath, platform: 'darwin' },
        'reading/paper.pdf',
        new TextEncoder().encode('not a PDF'),
      ),
    ).toEqual({ ok: false, reason: 'invalid-pdf' });
    expect(readFileSync(target, 'utf-8')).toContain('original');
    expect(readFileSync(outside, 'utf-8')).toContain('outside');
  });

  test('refuses a symlink that escapes the project', async () => {
    const { root, projectPath } = fixture();
    const outside = join(root, 'outside.pdf');
    writeFileSync(outside, '%PDF-1.4\noutside\n%%EOF\n');
    symlinkSync(outside, join(projectPath, 'reading', 'escape.pdf'));

    const result = await savePdfAssetSafely(
      { projectPath, platform: 'darwin' },
      'reading/escape.pdf',
      new TextEncoder().encode('%PDF-1.7\nupdated\n%%EOF\n'),
    );

    expect(result).toEqual({ ok: false, reason: 'invalid-path' });
    expect(readFileSync(outside, 'utf-8')).toContain('outside');
  });
});
