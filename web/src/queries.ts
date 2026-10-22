// answers the native screens read from the workspace, worked out by morrow's own core functions; pages are
// sent by id, the app already has every page's title, icon and place from the workspace message
import { docToPlainText, inlineText } from '../vendor/morrow/src/core/doc';
import { buildGraph } from '../vendor/morrow/src/core/graph';
import { collectCards, dueCards } from '../vendor/morrow/src/core/flashcards';
import type { Card, ReviewLog } from '../vendor/morrow/src/core/flashcards';
import type { DocNode, PageId, WorkspaceState } from '../vendor/morrow/src/core/model';
import { activityWeeks, onThisDay, rediscover, streak, totalWords } from '../vendor/morrow/src/core/insights';
import type { Day } from '../vendor/morrow/src/core/insights';
import { backlinksTo, unlinkedMentions } from '../vendor/morrow/src/core/links';
import { searchWorkspace } from '../vendor/morrow/src/core/search';
import type { SearchSnippet } from '../vendor/morrow/src/core/search';
import { collectTags, pagesWithTag, tagColor } from '../vendor/morrow/src/core/tags';
import { collectTasks } from '../vendor/morrow/src/core/tasks';
import { findTemplatesPage, listTemplates } from '../vendor/morrow/src/core/templates';
import type { TaskRef } from '../vendor/morrow/src/core/tasks';
import { livePages } from '../vendor/morrow/src/core/tree';

export interface SearchHit {
  id: PageId;
  path: string[];
  titleMatch: boolean;
  snippet: SearchSnippet | null;
  firstMatch: string | null;
}

export function search(state: WorkspaceState, query: string, limit: number): SearchHit[] {
  return searchWorkspace(state, query, limit).map((result) => ({
    id: result.page.id,
    path: result.path,
    titleMatch: result.titleMatch,
    snippet: result.snippet,
    firstMatch: result.firstMatch,
  }));
}

// the palette's list before anything is typed, as morrow's CommandPalette
export function recent(state: WorkspaceState, limit: number): PageId[] {
  return livePages(state.pages)
    .filter((page) => page.lastOpenedAt !== null)
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    .slice(0, limit)
    .map((page) => page.id);
}

export interface HomeFacts {
  streak: number;
  pages: number;
  words: number;
  openTasks: number;
  tasks: TaskRef[];
  recent: PageId[];
  weeks: Day[][];
  onThisDay: PageId[];
  rediscover: { id: PageId; excerpt: string } | null;
}

// the figures morrow's Home shows, the year of writing is 53 weeks as there
export function home(state: WorkspaceState, activity: Record<string, number>, now: Date): HomeFacts {
  const live = livePages(state.pages);
  const open = collectTasks(state).filter((task) => !task.checked);
  const again = rediscover(state, now);
  return {
    streak: streak(activity, now),
    pages: live.length,
    words: totalWords(state),
    openTasks: open.length,
    tasks: open.slice(0, 6),
    recent: [...live]
      .filter((page) => page.kind !== 'journal' && page.kind !== 'templates')
      .sort((a, b) => Math.max(b.lastOpenedAt ?? 0, b.updatedAt) - Math.max(a.lastOpenedAt ?? 0, a.updatedAt))
      .slice(0, 6)
      .map((page) => page.id),
    weeks: activityWeeks(activity, now, 53),
    onThisDay: onThisDay(state, now).map((page) => page.id),
    rediscover: again
      ? { id: again.id, excerpt: docToPlainText(state.docs[again.id] ?? { type: 'doc' }).slice(0, 180) }
      : null,
  };
}

export function backlinks(state: WorkspaceState, id: PageId): { id: PageId; context: string | null }[] {
  return backlinksTo(state, id).map(({ source, contexts }) => ({ id: source.id, context: contexts[0] || null }));
}

export function mentions(state: WorkspaceState, id: PageId): { id: PageId; context: string }[] {
  return unlinkedMentions(state, id).map(({ source, context }) => ({ id: source.id, context }));
}

export interface Heading {
  // position among the page's top level headings, the same order the editor draws them in
  index: number;
  level: number;
  text: string;
}

// the page's headings as morrow's outline lists them; empty headings are left out of the list but still
// counted, so an index always points at the heading the editor shows
export function outline(doc: DocNode | undefined): Heading[] {
  return (doc?.content ?? [])
    .filter((node) => node.type === 'heading')
    .map((node, index) => ({ index, level: Number(node.attrs?.level ?? 1), text: inlineText(node).trim() }))
    .filter((heading) => heading.text);
}

export interface TagEntry {
  tag: string;
  pages: number;
  // one of morrow's colour names, the same for a tag everywhere
  color: string;
}

// every tag with how many pages carry it, as morrow's tags view
export function tags(state: WorkspaceState): TagEntry[] {
  return collectTags(state).map((entry) => ({ tag: entry.tag, pages: entry.pages.length, color: tagColor(entry.tag) }));
}

export function tagPages(state: WorkspaceState, tag: string): PageId[] {
  return pagesWithTag(state, tag).map((page) => page.id);
}

export function tasks(state: WorkspaceState): TaskRef[] {
  return collectTasks(state);
}

export function templates(state: WorkspaceState): { container: PageId | null; templates: PageId[] } {
  return { container: findTemplatesPage(state)?.id ?? null, templates: listTemplates(state).map((page) => page.id) };
}

// the numbers beside the sidebar's tasks, tags and review
export function counts(
  state: WorkspaceState,
  log: ReviewLog,
  now: Date,
): { openTasks: number; tags: number; dueCards: number } {
  return {
    openTasks: collectTasks(state).filter((task) => !task.checked).length,
    tags: collectTags(state).length,
    dueCards: dueCards(collectCards(state), log, now).length,
  };
}

// every flashcard and the ones due now, the order morrow's review shows them in
export function review(state: WorkspaceState, log: ReviewLog, now: Date): { cards: Card[]; due: string[] } {
  const cards = collectCards(state);
  return { cards, due: dueCards(cards, log, now).map((card) => card.id) };
}

// pages joined by links for the graph view, morrow's buildGraph; the app lays it out
export function graph(
  state: WorkspaceState,
  options: { tags: boolean; hierarchy: boolean; orphans: boolean; focus: PageId | null; depth: number },
): ReturnType<typeof buildGraph> {
  return buildGraph(state, options);
}
