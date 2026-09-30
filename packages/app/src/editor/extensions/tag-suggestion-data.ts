/** Shared tag index and ranking for visual and source editors. */
export interface TagSummaryEntry {
  name: string;
  count: number;
  isLeaf: boolean;
}

export type TagSuggestionItem =
  | { kind: 'tag'; value: string; count: number; isLeaf: boolean }
  | { kind: 'create'; value: string };

const MAX_ITEMS = 8;

/**
 * Mirror of `tag-promotion.ts`'s inline-tag value pattern: starts with a
 * letter, continues with word chars, slashes, or hyphens. Used to gate
 * the "create new tag" affordance — typing `#9foo` or `#-bar` should
 * NOT surface a "Create" row because the parser would reject those
 * inputs on save.
 */
export const TAG_VALID_RE = /^[a-zA-Z][\w/-]*$/;

/**
 * Fetch the workspace tag summary list. Single source of truth for
 * `/api/tags` consumption in the app — both the editor's `#`
 * typeahead (this module) and the command palette's `tag:` filter
 * (`command-palette-tag-search.ts`) call this. Sister to
 * `wiki-link-suggestion.ts`'s `fetchPages` (also exported, also
 * single-source).
 */
export async function fetchTags(): Promise<TagSummaryEntry[]> {
  const r = await fetch('/api/tags');
  if (!r.ok) throw new Error(`/api/tags responded with ${r.status}`);
  const data: { tags?: TagSummaryEntry[] } = await r.json();
  return Array.isArray(data.tags) ? data.tags : [];
}

/**
 * Ranking algorithm used by both the inline `#` typeahead and the
 * command palette's `tag:` picker — exported so the two surfaces
 * share one definition of "best match" instead of drifting.
 *
 * Filter: case-insensitive substring match against the trimmed query
 * (empty query returns every tag).
 *
 * Sort (descending priority):
 *   1. Tags whose name STARTS WITH the query come before substring-
 *      only matches.
 *   2. Within each tier, higher `count` wins.
 *   3. Tiebreak by alphabetical name.
 *
 * Returns a NEW sorted array — input is never mutated.
 */
export function rankTagsByQuery(
  tags: readonly TagSummaryEntry[],
  query: string,
): TagSummaryEntry[] {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  const filtered =
    trimmed === '' ? tags.slice() : tags.filter((t) => t.name.toLowerCase().includes(lower));
  filtered.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
  return filtered;
}

/**
 * Editor-surface presentation: rank tags via the shared
 * `rankTagsByQuery`, cap at MAX_ITEMS for the floating popover's
 * limited vertical space, and append a "create new tag" affordance
 * (below the existing-tag matches) when the query is a valid tag name
 * not yet in the index.
 *
 * The "create" check uses the FULL tag list (case-sensitive equality)
 * — tags themselves are case-sensitive (`Project` and `project` are
 * distinct in the index), so offering "Create #Project" when
 * `project` exists is correct (creates a sibling, which is what the
 * user wants).
 */
export function buildTagSuggestionItems(
  tags: readonly TagSummaryEntry[],
  query: string,
): TagSuggestionItem[] {
  const ranked = rankTagsByQuery(tags, query);
  const items: TagSuggestionItem[] = ranked.slice(0, MAX_ITEMS).map((t) => ({
    kind: 'tag',
    value: t.name,
    count: t.count,
    isLeaf: t.isLeaf,
  }));

  const trimmed = query.trim();
  if (trimmed && TAG_VALID_RE.test(trimmed) && !tags.some((t) => t.name === trimmed)) {
    items.push({ kind: 'create', value: trimmed });
  }

  return items;
}
