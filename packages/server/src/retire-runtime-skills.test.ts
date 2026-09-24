import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { retireRuntimeSkills } from './retire-runtime-skills.ts';

const roots: string[] = [];
const root = () => {
  const path = mkdtempSync(join(tmpdir(), 'runtime-retirement-'));
  roots.push(path);
  return path;
};
const owned =
  '---\nname: synapsenote\nmetadata:\n  author: SynapseNote\n  repository: https://github.com/Nedian0Brien/SynapseNote\n---\nUser edits preserved.\n';
function write(path: string, content = owned) {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'SKILL.md'), content);
}
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('app runtime skill retirement', () => {
  test('archives all product copies and custom reference files, remains idempotent', () => {
    const project = root();
    for (const host of ['.codex', '.claude', '.cursor', '.agents', '.opencode', '.pi']) {
      const path = join(project, host, 'skills/synapsenote');
      write(path);
      writeFileSync(join(path, 'custom.md'), 'user additions');
    }
    const result = retireRuntimeSkills(project);
    expect(result).toHaveLength(6);
    for (const item of result) {
      expect(item.status).toBe('archived');
      expect(existsSync(item.path)).toBe(false);
      expect(readFileSync(join(item.archivePath ?? 'missing-archive', 'SKILL.md'), 'utf8')).toBe(
        owned,
      );
      expect(readFileSync(join(item.archivePath ?? 'missing-archive', 'custom.md'), 'utf8')).toBe(
        'user additions',
      );
    }
    expect(retireRuntimeSkills(project)).toEqual([]);
  });

  test('preserves a same-named foreign skill and ordinary authored skills', () => {
    const project = root();
    const path = join(project, '.codex/skills/synapsenote');
    write(path, '---\nname: synapsenote\n---\nmy independent skill');
    write(join(project, '.codex/skills/my-workflow'), 'user workflow');
    expect(retireRuntimeSkills(project)[0]?.status).toBe('preserved');
    expect(existsSync(join(path, 'SKILL.md'))).toBe(true);
    expect(readFileSync(join(project, '.codex/skills/my-workflow/SKILL.md'), 'utf8')).toBe(
      'user workflow',
    );
  });

  test('does not traverse an escaping host or archive parent and continues other hosts', () => {
    const project = root();
    const outside = root();
    write(join(outside, 'skills/synapsenote'));
    symlinkSync(outside, join(project, '.claude'));
    write(join(project, '.codex/skills/synapsenote'));
    const result = retireRuntimeSkills(project);
    expect(result.some((item) => item.status === 'failed')).toBe(true);
    expect(result.some((item) => item.status === 'archived')).toBe(true);
    expect(readFileSync(join(outside, 'skills/synapsenote/SKILL.md'), 'utf8')).toBe(owned);
    const second = root();
    write(join(second, '.codex/skills/synapsenote'));
    symlinkSync(outside, join(second, '.ok'));
    expect(retireRuntimeSkills(second)[0]?.status).toBe('failed');
    expect(existsSync(join(second, '.codex/skills/synapsenote/SKILL.md'))).toBe(true);
  });

  test('keeps relative projections readable when their central source is also archived', () => {
    const project = root();
    const source = join(project, '.agents/skills/synapsenote');
    const projection = join(project, '.codex/skills/synapsenote');
    write(source);
    mkdirSync(dirname(projection), { recursive: true });
    symlinkSync('../../.agents/skills/synapsenote', projection);
    const result = retireRuntimeSkills(project);
    expect(result).toHaveLength(2);
    for (const item of result)
      expect(readFileSync(join(item.archivePath ?? 'missing-archive', 'SKILL.md'), 'utf8')).toBe(
        owned,
      );
    expect(existsSync(join(projection, 'SKILL.md'))).toBe(false);
  });
});
