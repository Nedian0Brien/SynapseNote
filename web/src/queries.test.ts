import { describe, expect, it } from 'vitest';
import { applyCommand } from '../vendor/morrow/src/core/commands';
import type { Command } from '../vendor/morrow/src/core/commands';
import { emptyWorkspace } from '../vendor/morrow/src/core/model';
import type { DocNode, WorkspaceState } from '../vendor/morrow/src/core/model';
import { backlinks, counts, graph, home, mentions, outline, recent, search, tagPages, tags, tasks, templates } from './queries';
import { tagColor } from '../vendor/morrow/src/core/tags';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 19, 10);

function run(state: WorkspaceState, ...commands: Command[]): WorkspaceState {
  return commands.reduce((current, command) => {
    const result = applyCommand(current, command);
    if (!result.ok) throw new Error(result.error);
    return result.value.state;
  }, state);
}

const text = (value: string): DocNode => ({ type: 'text', text: value });
const paragraph = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });
const heading = (level: number, value: string): DocNode => ({
  type: 'heading',
  attrs: { level },
  content: value ? [text(value)] : [],
});
const task = (value: string, checked: boolean): DocNode => ({
  type: 'taskList',
  content: [{ type: 'taskItem', attrs: { checked }, content: [paragraph(text(value))] }],
});
const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content });

function workspace(): WorkspaceState {
  const old = NOW.getTime() - 60 * DAY;
  return run(
    emptyWorkspace(),
    { type: 'page.create', id: 'garden', parentId: null, now: old, title: 'Garden' },
    { type: 'page.create', id: 'tomatoes', parentId: 'garden', now: old, title: 'Tomatoes' },
    { type: 'page.create', id: 'journal', parentId: null, now: old, title: 'Journal', kind: 'journal' },
    {
      type: 'page.setDoc',
      id: 'garden',
      now: old,
      doc: doc(
        heading(1, 'Beds'),
        heading(2, ''),
        heading(2, 'Watering'),
        paragraph(text('Water the '), { type: 'pageLink', attrs: { id: 'tomatoes', label: 'Tomatoes' } }, text(' daily')),
        task('Buy stakes', false),
        task('Plant seeds', true),
      ),
    },
    {
      type: 'page.setDoc',
      id: 'journal',
      now: old,
      doc: doc(paragraph(text('Picked the first tomatoes today, the garden looks great'))),
    },
    { type: 'page.markOpened', id: 'tomatoes', now: NOW.getTime() - DAY },
    { type: 'page.markOpened', id: 'journal', now: NOW.getTime() - 2 * DAY },
  );
}

describe('search', () => {
  it('finds pages by title and text, with the path and the matched words', () => {
    const hits = search(workspace(), 'stakes', 30);
    expect(hits).toEqual([
      {
        id: 'garden',
        path: [],
        titleMatch: false,
        snippet: { before: 'Buy ', match: 'stakes', after: '' },
        firstMatch: 'stakes',
      },
    ]);
    const titled = search(workspace(), 'toma', 30);
    expect(titled[0]).toMatchObject({ id: 'tomatoes', path: ['Garden'], titleMatch: true });
  });

  it('finds nothing for an empty query', () => {
    expect(search(workspace(), '   ', 30)).toEqual([]);
  });
});

describe('recent', () => {
  it('lists opened pages, the latest first', () => {
    expect(recent(workspace(), 6)).toEqual(['tomatoes', 'journal']);
    expect(recent(workspace(), 1)).toEqual(['tomatoes']);
  });
});

describe('home', () => {
  it('gathers morrow home figures', () => {
    const facts = home(workspace(), { '2026-10-19': 2, '2026-10-18': 1 }, NOW);
    expect(facts.streak).toBe(2);
    expect(facts.pages).toBe(3);
    expect(facts.words).toBeGreaterThan(10);
    expect(facts.openTasks).toBe(1);
    expect(facts.tasks).toEqual([{ pageId: 'garden', index: 0, text: 'Buy stakes', checked: false }]);
    // journals are left out of jump back in
    expect(facts.recent).toEqual(['tomatoes', 'garden']);
    expect(facts.weeks).toHaveLength(53);
    expect(facts.weeks.every((week) => week.length === 7)).toBe(true);
    expect(facts.weeks.flat().find((day) => day.key === '2026-10-19')).toEqual({
      key: '2026-10-19',
      count: 2,
      future: false,
    });
    expect(facts.onThisDay).toEqual([]);
  });

  it('suggests an older page with something in it', () => {
    const facts = home(workspace(), {}, NOW);
    expect(facts.rediscover).toBeNull();
    const longer = run(workspace(), {
      type: 'page.setDoc',
      id: 'tomatoes',
      now: NOW.getTime() - 90 * DAY,
      doc: doc(paragraph(text('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen'))),
    });
    // markOpened a day ago keeps it recent, so the page is not old enough
    expect(home(longer, {}, NOW).rediscover).toBeNull();
    const later = new Date(NOW.getTime() + 40 * DAY);
    expect(home(longer, {}, later).rediscover).toEqual({
      id: 'tomatoes',
      excerpt: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen',
    });
  });
});

describe('links', () => {
  it('lists pages that link here with the line they link from', () => {
    expect(backlinks(workspace(), 'tomatoes')).toEqual([{ id: 'garden', context: 'Water the Tomatoes daily' }]);
    expect(backlinks(workspace(), 'garden')).toEqual([]);
  });

  it('lists pages that name a page without linking it', () => {
    expect(mentions(workspace(), 'garden')).toEqual([
      { id: 'journal', context: 'Picked the first tomatoes today, the garden looks great' },
    ]);
    // the garden links tomatoes, so only the journal is a mention
    expect(mentions(workspace(), 'tomatoes')).toEqual([
      { id: 'journal', context: 'Picked the first tomatoes today, the garden looks great' },
    ]);
  });
});

describe('outline', () => {
  it('lists headings with their place among all top level headings', () => {
    expect(outline(workspace().docs.garden)).toEqual([
      { index: 0, level: 1, text: 'Beds' },
      { index: 2, level: 2, text: 'Watering' },
    ]);
    expect(outline(undefined)).toEqual([]);
  });
});

describe('tags', () => {
  const tagged = () =>
    run(
      workspace(),
      { type: 'page.setTags', id: 'tomatoes', tags: ['project/garden'], now: NOW.getTime() - 3 * DAY },
      { type: 'page.setTags', id: 'garden', tags: ['project'], now: NOW.getTime() - DAY },
    );

  it('lists every tag with its pages and colour', () => {
    expect(tags(tagged())).toEqual([
      { tag: 'project', pages: 1, color: tagColor('project') },
      { tag: 'project/garden', pages: 1, color: tagColor('project/garden') },
    ]);
  });

  it('counts a nested tag for its parent, newest edit first', () => {
    expect(tagPages(tagged(), 'project')).toEqual(['garden', 'tomatoes']);
    expect(tagPages(tagged(), 'project/garden')).toEqual(['tomatoes']);
  });
});

describe('tasks and counts', () => {
  it('lists every checklist item and counts the open ones', () => {
    expect(tasks(workspace())).toEqual([
      { pageId: 'garden', index: 0, text: 'Buy stakes', checked: false },
      { pageId: 'garden', index: 1, text: 'Plant seeds', checked: true },
    ]);
    expect(counts(workspace())).toEqual({ openTasks: 1, tags: 0 });
  });
});

describe('templates', () => {
  it('names the templates page and the templates in it', () => {
    expect(templates(workspace())).toEqual({ container: null, templates: [] });
    const withTemplates = run(
      workspace(),
      { type: 'page.create', id: 'tpl', parentId: null, now: 1, title: 'Templates', kind: 'templates' },
      { type: 'page.create', id: 'daily', parentId: 'tpl', now: 2, title: 'Daily note' },
    );
    expect(templates(withTemplates)).toEqual({ container: 'tpl', templates: ['daily'] });
  });
});

describe('graph', () => {
  const all = { tags: false, hierarchy: false, orphans: true, focus: null, depth: 1 };

  it('joins pages by their links, grouped under their top page', () => {
    const result = graph(workspace(), all);
    expect(result.nodes.map((node) => node.id).sort()).toEqual(['garden', 'journal', 'tomatoes']);
    expect(result.links).toEqual([{ source: 'garden', target: 'tomatoes', kind: 'link' }]);
    expect(result.nodes.find((node) => node.id === 'tomatoes')).toMatchObject({ degree: 1, group: 'garden' });
  });

  it('leaves out unlinked pages, adds subpages, or keeps only the pages near one', () => {
    expect(graph(workspace(), { ...all, orphans: false }).nodes.map((node) => node.id).sort()).toEqual(['garden', 'tomatoes']);
    expect(graph(workspace(), { ...all, hierarchy: true }).links).toEqual([
      { source: 'garden', target: 'tomatoes', kind: 'link' },
    ]);
    expect(graph(workspace(), { ...all, focus: 'journal' }).nodes.map((node) => node.id)).toEqual(['journal']);
  });
});
