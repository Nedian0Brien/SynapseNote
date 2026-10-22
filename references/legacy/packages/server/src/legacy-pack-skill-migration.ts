/**
 * One-time compatibility migration for starter-pack skills created before the
 * OpenKnowledge -> SynapseNote rename.
 *
 * Old projects own editable forks at
 * `.ok/skills/open-knowledge-pack-<pack>/`. The rebrand changed newly seeded
 * identities to `synapsenote-pack-<pack>`, but left those forks under the old
 * identity. Besides stale branding, that excludes them from pack update
 * detection. Migrate before createServer opens any CRDT docs so a live old-name
 * document cannot persist back into the retired path.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROJECT_SKILL_EDITOR_IDS,
  stripFrontmatter,
  unwrapFrontmatterFences,
} from '@nedian0brien/synapsenote-core';
import { isScalar, parseDocument } from 'yaml';
import { tracedRenameSync, tracedRmSync, tracedWriteFileSync } from './fs-traced.ts';
import {
  moveSkillInstall,
  readInstalledSkills,
  recordSkillInstall,
} from './installed-skills-marker.ts';
import { resolvePackSkillSource } from './seed/install-pack-skill.ts';
import {
  PACK_SKILL_PREFIX,
  projectSkill,
  resolvedHosts,
  reverseProjectSkill,
  skillHostDir,
} from './skill-projection.ts';

const LEGACY_PACK_SKILL_PREFIX = 'open-knowledge-pack-';

export interface LegacyPackSkillMigrationResult {
  migrated: Array<{ fromName: string; toName: string; hosts: string[] }>;
  collisions: Array<{ fromName: string; toName: string }>;
  skipped: Array<{ name: string; reason: 'unknown-pack' | 'invalid-source' }>;
  failures: Array<{ name: string; error: string }>;
}

/** Rewrite only the YAML scalar bytes for `name`, preserving every other byte. */
export function rewriteLegacyPackSkillName(
  raw: string,
  fromName: string,
  toName: string,
): string | null {
  const { frontmatter, body } = stripFrontmatter(raw);
  if (frontmatter === '') return null;
  const yaml = unwrapFrontmatterFences(frontmatter);
  const doc = parseDocument(yaml);
  if (doc.errors.length > 0) return null;
  const node = doc.get('name', true);
  if (!isScalar(node) || node.value !== fromName || node.range == null) return null;

  const yamlOffset = frontmatter.indexOf(yaml);
  if (yamlOffset < 0) return null;
  const start = yamlOffset + node.range[0];
  const end = yamlOffset + node.range[1];
  return `${frontmatter.slice(0, start)}${toName}${frontmatter.slice(end)}${body}`;
}

function projectedEditors(projectDir: string, name: string): string[] {
  const editors: string[] = [];
  for (const editor of PROJECT_SKILL_EDITOR_IDS) {
    const path = skillHostDir(projectDir, editor, name);
    if (path === null) continue;
    try {
      lstatSync(path);
      editors.push(editor);
    } catch {
      // Missing projection is normal.
    }
  }
  return editors;
}

/**
 * Migrate all recognized legacy pack forks under one project's skills root.
 * Existing destinations (source or install marker) are collision boundaries:
 * neither side is changed. Unknown/retired pack ids are left untouched.
 */
export async function migrateLegacyPackSkills(opts: {
  projectDir: string;
  skillsRoot: string;
}): Promise<LegacyPackSkillMigrationResult> {
  const result: LegacyPackSkillMigrationResult = {
    migrated: [],
    collisions: [],
    skipped: [],
    failures: [],
  };
  if (!existsSync(opts.skillsRoot)) return result;

  let names: string[];
  try {
    names = readdirSync(opts.skillsRoot).filter((name) =>
      name.startsWith(LEGACY_PACK_SKILL_PREFIX),
    );
  } catch (err) {
    result.failures.push({
      name: LEGACY_PACK_SKILL_PREFIX,
      error: err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  for (const fromName of names) {
    const packId = fromName.slice(LEGACY_PACK_SKILL_PREFIX.length);
    const bundled = resolvePackSkillSource(packId);
    if (bundled === null || bundled.name !== `${PACK_SKILL_PREFIX}${packId}`) {
      result.skipped.push({ name: fromName, reason: 'unknown-pack' });
      continue;
    }
    const toName = bundled.name;
    const fromDir = join(opts.skillsRoot, fromName);
    const toDir = join(opts.skillsRoot, toName);
    const marker = readInstalledSkills(opts.projectDir);
    if (existsSync(toDir) || marker.skills[toName] !== undefined) {
      result.collisions.push({ fromName, toName });
      continue;
    }

    const fromSkillMd = join(fromDir, 'SKILL.md');
    let rewritten: string;
    try {
      const raw = readFileSync(fromSkillMd, 'utf-8');
      const next = rewriteLegacyPackSkillName(raw, fromName, toName);
      if (next === null) {
        result.skipped.push({ name: fromName, reason: 'invalid-source' });
        continue;
      }
      rewritten = next;
    } catch (err) {
      result.failures.push({
        name: fromName,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // Resolve intended hosts from both the marker and disk. The disk probe
    // preserves installs when an old/corrupt marker omitted a real projection.
    const intendedHosts = resolvedHosts(
      Array.from(
        new Set([
          ...(marker.skills[fromName]?.hosts ?? []),
          ...projectedEditors(opts.projectDir, fromName),
        ]),
      ),
    );

    try {
      tracedRenameSync(fromDir, toDir);
      const movedSkillMd = join(toDir, 'SKILL.md');
      const tmp = `${movedSkillMd}.migrate.${process.pid}.${Date.now()}`;
      try {
        tracedWriteFileSync(tmp, rewritten, 'utf-8');
        tracedRenameSync(tmp, movedSkillMd);
      } catch (err) {
        tracedRmSync(tmp, { force: true });
        // The original SKILL.md is still intact at the renamed directory until
        // the final temp rename succeeds, so rolling the directory back is safe.
        tracedRenameSync(toDir, fromDir);
        throw err;
      }

      const migratedHosts: typeof intendedHosts = [];
      for (const editor of intendedHosts) {
        try {
          if (projectSkill(toDir, toName, opts.projectDir, [editor]).length === 1) {
            // Create the new projection first; only then remove the old one.
            reverseProjectSkill(fromName, opts.projectDir, [editor]);
            migratedHosts.push(editor);
          }
        } catch (err) {
          result.failures.push({
            name: `${fromName}:${editor}`,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const prior = marker.skills[fromName];
      if (prior !== undefined) {
        const markerMove = await moveSkillInstall(opts.projectDir, fromName, toName, {
          ...prior,
          hosts: migratedHosts,
        });
        if (markerMove.status === 'collision') {
          throw new Error(`Install marker destination already exists for ${toName}.`);
        }
      } else if (migratedHosts.length > 0) {
        await recordSkillInstall(opts.projectDir, toName, {
          hosts: migratedHosts,
          scope: 'project',
          scripts: existsSync(join(toDir, 'scripts')),
          installedAt: new Date().toISOString(),
        });
      }

      result.migrated.push({ fromName, toName, hosts: migratedHosts });
    } catch (err) {
      result.failures.push({
        name: fromName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
