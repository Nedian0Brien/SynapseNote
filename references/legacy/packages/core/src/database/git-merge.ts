import { Document } from 'yaml';
import { stripFrontmatter, unwrapFrontmatterFences } from '../extensions/frontmatter.ts';
import { parseFrontmatterYaml } from '../frontmatter/yaml-codec.ts';
import {
  parseDatabaseManifestYaml,
  serializeDatabaseManifestYaml,
  updateDatabaseManifestYaml,
} from './manifest.ts';

export interface DatabaseGitMergeConflict {
  path: readonly (string | number)[];
  reason: 'both_changed' | 'delete_modify' | 'invalid_artifact' | 'presentation_changed';
  message: string;
}

export type DatabaseGitMergeResult =
  | { ok: true; merged: string }
  | { ok: false; conflicts: readonly DatabaseGitMergeConflict[] };

const MISSING = Symbol('database-git-merge-missing');
type MergeValue = unknown | typeof MISSING;

function stable(value: MergeValue): string {
  if (value === MISSING) return '<missing>';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function same(left: MergeValue, right: MergeValue): boolean {
  return stable(left) === stable(right);
}

function plainObject(value: MergeValue): value is Record<string, unknown> {
  return value !== MISSING && value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableId(value: unknown): string | null {
  return plainObject(value) && typeof value.id === 'string' ? value.id : null;
}

function mergeLastEdited(
  base: Record<string, unknown>,
  ours: Record<string, unknown>,
  theirs: Record<string, unknown>,
  path: readonly (string | number)[],
  conflicts: DatabaseGitMergeConflict[],
): Record<string, unknown> | null {
  const pair = (value: Record<string, unknown>) => ({
    at: value.last_edited_at ?? MISSING,
    by: value.last_edited_by ?? MISSING,
  });
  const basePair = pair(base);
  const ourPair = pair(ours);
  const theirPair = pair(theirs);
  if (same(ourPair, theirPair)) return ours;
  if (same(ourPair, basePair)) return theirs;
  if (same(theirPair, basePair)) return ours;
  const ourTime = typeof ourPair.at === 'string' ? Date.parse(ourPair.at) : Number.NaN;
  const theirTime = typeof theirPair.at === 'string' ? Date.parse(theirPair.at) : Number.NaN;
  if (Number.isFinite(ourTime) && Number.isFinite(theirTime) && ourTime !== theirTime) {
    return ourTime > theirTime ? ours : theirs;
  }
  conflicts.push({
    path: [...path, 'last_edited_at'],
    reason: 'both_changed',
    message: 'Both sides changed record attribution without a unique later timestamp',
  });
  return null;
}

function mergeValue(
  base: MergeValue,
  ours: MergeValue,
  theirs: MergeValue,
  path: readonly (string | number)[],
  conflicts: DatabaseGitMergeConflict[],
): MergeValue {
  if (same(ours, theirs)) return structuredCloneValue(ours);
  if (same(ours, base)) return structuredCloneValue(theirs);
  if (same(theirs, base)) return structuredCloneValue(ours);
  if (ours === MISSING || theirs === MISSING) {
    conflicts.push({
      path,
      reason: 'delete_modify',
      message: 'One side deleted this value while the other side changed it',
    });
    return MISSING;
  }
  if (plainObject(base) && plainObject(ours) && plainObject(theirs)) {
    const result: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
    const isRecordMetadata = path.length === 1 && path[0] === '_sn';
    let lastEdited: Record<string, unknown> | null = null;
    if (isRecordMetadata) {
      lastEdited = mergeLastEdited(base, ours, theirs, path, conflicts);
    }
    for (const key of keys) {
      if (isRecordMetadata && (key === 'last_edited_at' || key === 'last_edited_by')) continue;
      const merged = mergeValue(
        Object.hasOwn(base, key) ? base[key] : MISSING,
        Object.hasOwn(ours, key) ? ours[key] : MISSING,
        Object.hasOwn(theirs, key) ? theirs[key] : MISSING,
        [...path, key],
        conflicts,
      );
      if (merged !== MISSING) result[key] = merged;
    }
    if (lastEdited) {
      if (lastEdited.last_edited_at !== undefined) {
        result.last_edited_at = structuredClone(lastEdited.last_edited_at);
      }
      if (lastEdited.last_edited_by !== undefined) {
        result.last_edited_by = structuredClone(lastEdited.last_edited_by);
      }
    }
    return result;
  }
  if (Array.isArray(base) && Array.isArray(ours) && Array.isArray(theirs)) {
    const all = [...base, ...ours, ...theirs];
    const ids = all.map(stableId);
    if (all.length > 0 && ids.every((id): id is string => id !== null)) {
      const baseMap = new Map(base.map((value) => [stableId(value) as string, value]));
      const ourMap = new Map(ours.map((value) => [stableId(value) as string, value]));
      const theirMap = new Map(theirs.map((value) => [stableId(value) as string, value]));
      const order = [
        ...base.map((value) => stableId(value) as string),
        ...ours.map((value) => stableId(value) as string),
        ...theirs.map((value) => stableId(value) as string),
      ].filter((id, index, values) => values.indexOf(id) === index);
      const result: unknown[] = [];
      for (const id of order) {
        const merged = mergeValue(
          baseMap.get(id) ?? MISSING,
          ourMap.get(id) ?? MISSING,
          theirMap.get(id) ?? MISSING,
          [...path, id],
          conflicts,
        );
        if (merged !== MISSING) result.push(merged);
      }
      return result;
    }
  }
  conflicts.push({
    path,
    reason: 'both_changed',
    message: 'Both sides changed the same scalar or ordered value differently',
  });
  return structuredCloneValue(ours);
}

function structuredCloneValue(value: MergeValue): MergeValue {
  return value === MISSING ? MISSING : structuredClone(value);
}

function invalid(message: string): DatabaseGitMergeResult {
  return {
    ok: false,
    conflicts: [{ path: [], reason: 'invalid_artifact', message }],
  };
}

/** Stable-ID-aware three-way merge for canonical database manifests. */
export function mergeDatabaseManifestGit(
  baseYaml: string,
  ourYaml: string,
  theirYaml: string,
): DatabaseGitMergeResult {
  const base = parseDatabaseManifestYaml(baseYaml);
  const ours = parseDatabaseManifestYaml(ourYaml);
  const theirs = parseDatabaseManifestYaml(theirYaml);
  if (!base.ok || !ours.ok || !theirs.ok) {
    return invalid('All three database manifest versions must be valid before semantic merge');
  }
  const baseStable = stable(base.definition);
  const ourStable = stable(ours.definition);
  const theirStable = stable(theirs.definition);
  if (ourStable === baseStable && theirStable === baseStable) {
    if (ourYaml === theirYaml) return { ok: true, merged: ourYaml };
    if (ourYaml === baseYaml) return { ok: true, merged: theirYaml };
    if (theirYaml === baseYaml) return { ok: true, merged: ourYaml };
    return {
      ok: false,
      conflicts: [
        {
          path: [],
          reason: 'presentation_changed',
          message: 'Both sides changed manifest comments or YAML presentation differently',
        },
      ],
    };
  }
  const conflicts: DatabaseGitMergeConflict[] = [];
  const merged = mergeValue(base.definition, ours.definition, theirs.definition, [], conflicts);
  if (conflicts.length > 0 || !plainObject(merged)) return { ok: false, conflicts };
  try {
    const substrate =
      ourStable === baseStable && ourYaml !== baseYaml
        ? ourYaml
        : theirStable === baseStable && theirYaml !== baseYaml
          ? theirYaml
          : ourYaml;
    return { ok: true, merged: updateDatabaseManifestYaml(substrate, merged) };
  } catch {
    try {
      return { ok: true, merged: serializeDatabaseManifestYaml(merged) };
    } catch {
      return invalid('The merged manifest does not satisfy the canonical schema');
    }
  }
}

function parseRecord(markdown: string): { map: Record<string, unknown>; body: string } | null {
  const { frontmatter, body } = stripFrontmatter(markdown);
  if (!frontmatter) return null;
  const parsed = parseFrontmatterYaml(unwrapFrontmatterFences(frontmatter));
  return parsed.map ? { map: parsed.map as Record<string, unknown>, body } : null;
}

/** Field-aware three-way merge for canonical Markdown database records. */
export function mergeDatabaseRecordGit(
  baseMarkdown: string,
  ourMarkdown: string,
  theirMarkdown: string,
): DatabaseGitMergeResult {
  const base = parseRecord(baseMarkdown);
  const ours = parseRecord(ourMarkdown);
  const theirs = parseRecord(theirMarkdown);
  if (!base || !ours || !theirs) {
    return invalid('All three files must contain valid database record frontmatter');
  }
  const identity = (value: typeof base) => {
    const metadata = value.map._sn;
    return plainObject(metadata)
      ? [metadata.database_id, metadata.source_id, metadata.record_id]
      : [];
  };
  if (!same(identity(base), identity(ours)) || !same(identity(base), identity(theirs))) {
    return invalid('Database record identities differ across merge inputs');
  }
  const conflicts: DatabaseGitMergeConflict[] = [];
  const map = mergeValue(base.map, ours.map, theirs.map, [], conflicts);
  const body = mergeValue(base.body, ours.body, theirs.body, ['body'], conflicts);
  if (conflicts.length > 0 || !plainObject(map) || typeof body !== 'string') {
    return { ok: false, conflicts };
  }
  const yaml = new Document(map).toString({ lineWidth: 0 });
  const lineEnding = ourMarkdown.includes('\r\n') ? '\r\n' : '\n';
  return { ok: true, merged: `---\n${yaml}---\n${body}`.replaceAll('\n', lineEnding) };
}
