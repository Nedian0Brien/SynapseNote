import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  EDITOR_PROJECT_SKILL_ROOT,
  PROJECT_SKILL_EDITOR_IDS,
} from '@nedian0brien/synapsenote-core';

export interface RetiredRuntimeSkill {
  path: string;
  status: 'archived' | 'preserved' | 'failed';
  archivePath?: string;
  error?: string;
}

function containedAncestors(path: string, root: string): void {
  let parent = dirname(path);
  while (!existsSync(parent)) parent = dirname(parent);
  const rel = relative(realpathSync(root), realpathSync(parent));
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new Error('Runtime skill path escapes its project or user root');
  }
}

/** Move product-owned runtime skills out of every agent discovery directory.
 * Preserve the complete installed tree (including user edits) and unrelated skills.
 * No bundle reads, recursive deletes, or writes through symlinked host directories.
 */
export function retireRuntimeSkills(root: string): RetiredRuntimeSkill[] {
  if (!existsSync(root)) return [];
  const roots = new Set([
    '.agents/skills',
    '.ok/skills',
    ...PROJECT_SKILL_EDITOR_IDS.flatMap((id) => EDITOR_PROJECT_SKILL_ROOT[id] ?? []),
  ]);
  const names = [
    'synapsenote',
    'open-knowledge',
    'open-knowledge-claude',
    'open-knowledge-codex',
    'open-knowledge-cursor',
    'open-knowledge-opencode',
    'open-knowledge-pi',
  ];
  const results: RetiredRuntimeSkill[] = [];
  const archivedLinks: Array<{ path: string; target: string }> = [];
  const candidates = [...roots]
    .flatMap((skillRoot) =>
      names.map((name) => ({ skillRoot, name, path: join(root, skillRoot, name) })),
    )
    .filter(({ path }) => existsSync(join(path, 'SKILL.md')))
    .sort(
      (a, b) =>
        Number(lstatSync(b.path).isSymbolicLink()) - Number(lstatSync(a.path).isSymbolicLink()),
    );
  for (const { skillRoot, name, path } of candidates) {
    if (!existsSync(join(path, 'SKILL.md'))) continue;
    try {
      containedAncestors(path, root);
      const raw = readFileSync(join(path, 'SKILL.md'), 'utf8');
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? '';
      const owned =
        /^name:\s*["']?(synapsenote|open-knowledge)["']?\s*$/m.test(frontmatter) &&
        /^\s*author:\s*["']?(SynapseNote|Inkeep)["']?\s*$/m.test(frontmatter) &&
        /(?:github\.com\/(?:Nedian0Brien\/SynapseNote|inkeep\/open-knowledge)|@inkeep\/open-knowledge)/i.test(
          raw,
        );
      if (!owned) {
        results.push({ path, status: 'preserved' });
        continue;
      }
      const archivePath = join(
        root,
        '.ok',
        'retired-agent-skills',
        `${skillRoot.replaceAll('/', '-')}-${name}-${randomUUID()}`,
      );
      containedAncestors(archivePath, root);
      mkdirSync(dirname(archivePath), { recursive: true });
      if (lstatSync(path).isSymbolicLink()) {
        // Rebase relative links so the archived copy still resolves correctly.
        const target = resolve(dirname(path), readlinkSync(path));
        symlinkSync(target, archivePath, 'dir');
        unlinkSync(path);
        archivedLinks.push({ path: archivePath, target });
      } else {
        renameSync(path, archivePath);
      }
      results.push({ path, status: 'archived', archivePath });
    } catch (err) {
      results.push({
        path,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  for (const link of archivedLinks) {
    const movedTarget = results.find(
      (entry) => resolve(entry.path) === link.target && entry.status === 'archived',
    );
    if (!movedTarget?.archivePath) continue;
    unlinkSync(link.path);
    symlinkSync(movedTarget.archivePath, link.path, 'dir');
  }
  return results;
}
