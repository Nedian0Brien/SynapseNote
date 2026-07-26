import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { readInstalledSkills, recordSkillInstall } from './installed-skills-marker.ts';
import {
  migrateLegacyPackSkills,
  rewriteLegacyPackSkillName,
} from './legacy-pack-skill-migration.ts';

let projectDir: string;
let skillsRoot: string;

const oldName = 'open-knowledge-pack-knowledge-base';
const newName = 'synapsenote-pack-knowledge-base';

const skill = (name = oldName) => `---
name: "${name}" # identity
version: "0.18.0"
description: My edited pack guidance.
metadata:
  author: Inkeep
  custom: keep-me
---
# My edited body
`;

function writeLegacySkill(name = oldName): string {
  const dir = join(skillsRoot, name);
  mkdirSync(join(dir, 'references'), { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), skill(name));
  writeFileSync(join(dir, 'references', 'notes.md'), 'preserve me\n');
  return dir;
}

function projectOld(editorDir: string, source: string): void {
  const destination = join(projectDir, editorDir, 'skills', oldName);
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(relative(dirname(destination), source), destination, 'dir');
}

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-pack-migration-'));
  skillsRoot = join(projectDir, '.ok', 'skills');
  mkdirSync(skillsRoot, { recursive: true });
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe('legacy starter-pack skill migration', () => {
  test('rewrites only the name scalar and preserves custom frontmatter + body bytes', () => {
    const raw = skill();
    const rewritten = rewriteLegacyPackSkillName(raw, oldName, newName);
    expect(rewritten).not.toBeNull();
    expect(rewritten).toContain(`name: ${newName} # identity`);
    expect(rewritten).toContain('version: "0.18.0"');
    expect(rewritten).toContain('  custom: keep-me');
    expect(rewritten).toEndWith('# My edited body\n');
  });

  test('moves source, marker, bundle files, and editor projections together', async () => {
    const source = writeLegacySkill();
    projectOld('.claude', source);
    projectOld('.codex', source);
    await recordSkillInstall(projectDir, oldName, {
      hosts: ['claude', 'codex'],
      scope: 'project',
      scripts: false,
      installedAt: '2026-07-15T00:00:00.000Z',
    });

    const result = await migrateLegacyPackSkills({ projectDir, skillsRoot });
    expect(result.failures).toEqual([]);
    expect(result.migrated).toEqual([
      { fromName: oldName, toName: newName, hosts: ['claude', 'codex'] },
    ]);
    expect(existsSync(join(skillsRoot, oldName))).toBe(false);
    expect(readFileSync(join(skillsRoot, newName, 'SKILL.md'), 'utf-8')).toContain(
      `name: ${newName} # identity`,
    );
    expect(readFileSync(join(skillsRoot, newName, 'references', 'notes.md'), 'utf-8')).toBe(
      'preserve me\n',
    );

    for (const editorDir of ['.claude', '.codex']) {
      const oldProjection = join(projectDir, editorDir, 'skills', oldName);
      const newProjection = join(projectDir, editorDir, 'skills', newName);
      expect(existsSync(oldProjection)).toBe(false);
      expect(resolve(dirname(newProjection), readlinkSync(newProjection))).toBe(
        resolve(skillsRoot, newName),
      );
    }
    const marker = readInstalledSkills(projectDir).skills;
    expect(marker[oldName]).toBeUndefined();
    expect(marker[newName]?.hosts).toEqual(['claude', 'codex']);
  });

  test('recovers install state from an on-disk projection when the marker is absent', async () => {
    const source = writeLegacySkill();
    projectOld('.cursor', source);

    const result = await migrateLegacyPackSkills({ projectDir, skillsRoot });
    expect(result.migrated[0]?.hosts).toEqual(['cursor']);
    expect(readInstalledSkills(projectDir).skills[newName]?.hosts).toEqual(['cursor']);
  });

  test('leaves both sides untouched when the SynapseNote destination exists', async () => {
    writeLegacySkill();
    writeLegacySkill(newName);

    const result = await migrateLegacyPackSkills({ projectDir, skillsRoot });
    expect(result.collisions).toEqual([{ fromName: oldName, toName: newName }]);
    expect(existsSync(join(skillsRoot, oldName, 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsRoot, newName, 'SKILL.md'))).toBe(true);
  });

  test('does not migrate an unknown pack or a mismatched skill identity', async () => {
    writeLegacySkill('open-knowledge-pack-no-such-pack');
    writeLegacySkill();
    writeFileSync(join(skillsRoot, oldName, 'SKILL.md'), skill('some-user-skill'));

    const result = await migrateLegacyPackSkills({ projectDir, skillsRoot });
    expect(result.skipped).toContainEqual({
      name: 'open-knowledge-pack-no-such-pack',
      reason: 'unknown-pack',
    });
    expect(result.skipped).toContainEqual({ name: oldName, reason: 'invalid-source' });
    expect(existsSync(join(skillsRoot, oldName, 'SKILL.md'))).toBe(true);
  });
});
