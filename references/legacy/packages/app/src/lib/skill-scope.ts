import { useLingui } from '@lingui/react/macro';
import type { SkillScope, SkillsListEntry } from '@nedian0brien/synapsenote-core';

/** Scope render order — global above project (broadest reach first). Shared by
 *  the Settings skills list and the sidebar Skills section. */
export const SKILL_SCOPE_ORDER: readonly SkillScope[] = ['global', 'project'] as const;

/**
 * Per-scope sets of existing skill names, used for create-dialog collision
 * validation. One source so the Settings list and the sidebar "+" agree.
 */
export function skillNameSetsByScope(
  skills: readonly SkillsListEntry[],
): Record<SkillScope, Set<string>> {
  return {
    project: new Set(skills.filter((s) => s.scope === 'project').map((s) => s.name)),
    global: new Set(skills.filter((s) => s.scope === 'global').map((s) => s.name)),
  };
}

/** Current + pre-rebrand prefixes for shipped starter-pack skills. */
const PACK_SKILL_DISPLAY_PREFIXES = ['synapsenote-pack-', 'open-knowledge-pack-'] as const;

/**
 * Browse-surface display name for a skill: drops the shared
 * `synapsenote-pack-` prefix so e.g. `synapsenote-pack-software-lifecycle`
 * (the longest shipped default) reads as `software-lifecycle` and fits a normal
 * sidebar width. DISPLAY-ONLY — the full name stays the identity (rename field,
 * doc path, tooltips); user-authored skills (no prefix) are unchanged.
 */
export function skillDisplayName(name: string): string {
  const prefix = PACK_SKILL_DISPLAY_PREFIXES.find((candidate) => name.startsWith(candidate));
  return prefix === undefined ? name : name.slice(prefix.length);
}

/**
 * Short level titles shared by every skills surface. The `global` scope is
 * user-level (available in every project); `project` is this KB's `.ok/skills`,
 * shared via git. User-facing copy drops the word "scope" entirely.
 */
export function useSkillScopeLabels(): Record<SkillScope, string> {
  const { t } = useLingui();
  return { project: t`Project`, global: t`Global` };
}

/**
 * Full "<level> Skill" labels for the property-panel level pill — the prominent,
 * color-coded switch affordance ("Global Skill" / "Project Skill").
 */
export function useSkillScopePillLabels(): Record<SkillScope, string> {
  const { t } = useLingui();
  return { project: t`Project Skill`, global: t`Global Skill` };
}
