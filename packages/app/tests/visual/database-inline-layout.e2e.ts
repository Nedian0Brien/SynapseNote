import type { Page } from '@playwright/test';
import {
  expect,
  test,
  waitForActiveProviderSynced,
  waitForSlashMenuOpen,
} from '../stress/_helpers';

const themes = ['light', 'dark'] as const;
const viewports = [768, 1280, 1440] as const;
const offsets = ['start', 'middle', 'end'] as const;

async function setTheme(page: Page, theme: (typeof themes)[number]) {
  await page.evaluate((nextTheme) => {
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    localStorage.setItem('ok-theme-v1', nextTheme);
  }, theme);
}

async function createInlineFixture(
  page: Page,
  api: {
    createDatabase: (state: Record<string, unknown>) => Promise<unknown>;
    createPage: (name: string) => Promise<void>;
  },
) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const databaseName = `Visual inline database ${suffix}`;
  await api.createDatabase({
    database: {
      key: `visual-inline-${suffix}`,
      name: databaseName,
      contract: {
        purpose: 'Visual coverage for document-native table geometry',
        canonicality: 'canonical',
        vocabulary: ['task'],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
    },
    sources: [
      {
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One task',
        folder: `visual-inline-${suffix}`,
        properties: [
          { key: 'title', name: 'Title', type: 'title' },
          { key: 'status', name: 'Status', type: 'text' },
          { key: 'long_name', name: 'New property with a long name', type: 'text' },
          { key: 'owner', name: 'Owner and review contact', type: 'text' },
          { key: 'notes', name: 'Notes and context', type: 'text' },
          { key: 'priority', name: 'Priority', type: 'text' },
        ],
      },
    ],
    views: [
      {
        key: 'all-tasks',
        name: 'All tasks',
        sourceKey: 'tasks',
        layout: { type: 'table', configuration: { rowHeight: 'compact' } },
      },
    ],
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 20 },
    sampleRecords: [
      {
        sourceKey: 'tasks',
        values: {
          title: 'A long title remains readable at every scroll position',
          status: 'Open',
          long_name: 'Property value',
          owner: 'Review contact',
          notes: 'A row with enough content to keep the grid measurable.',
          priority: 'High',
        },
        body: 'Visual layout fixture.\n',
      },
      {
        sourceKey: 'tasks',
        values: { title: 'Second row', status: 'Done', long_name: 'Another value' },
        body: 'Second visual row.\n',
      },
    ],
  });
  const docName = `visual-inline-document-${suffix}`;
  await api.createPage(`${docName}.md`);
  await page.goto(`/#/${docName}`);
  await waitForActiveProviderSynced(page);
  const editor = page.locator('.ProseMirror:not(.composer-prosemirror)').first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.type('/database');
  await waitForSlashMenuOpen(page);
  await page
    .getByRole('listbox', { name: 'Slash commands' })
    .getByRole('option', { name: 'Linked view of database', exact: true })
    .click();
  const picker = page.getByRole('region', { name: 'Choose a database view' });
  await expect(picker.getByText(databaseName, { exact: true })).toBeVisible({ timeout: 15_000 });
  await picker.getByRole('button', { name: 'Tasks', exact: true }).first().click();
  await picker.getByRole('button', { name: /All tasks table/ }).click();
  const inline = page.getByRole('region', { name: /^Linked database view:/ });
  await expect(inline.getByRole('grid')).toBeVisible({ timeout: 20_000 });
  await expect(inline.getByRole('button', { name: 'New page' })).toBeVisible({
    timeout: 10_000,
  });
  return inline;
}

test('inline table geometry stays stable across the visual matrix', async ({ page, api }) => {
  // One canonical fixture is intentionally reused for the matrix. Creating 18
  // databases in one worker makes the local commit service occasionally emit
  // a transient 503, which is unrelated to pixel stability and would make the
  // visual gate nondeterministic.
  await page.setViewportSize({ width: 1280, height: 900 });
  const inline = await createInlineFixture(page, api);
  const viewport = inline.locator('[data-slot="table-container"]');
  await expect(viewport).toHaveCount(1);

  // A table with fewer columns than its viewport must preserve the configured
  // title width instead of stretching that first sticky column to fill the
  // remaining space. Widen the scroll owner explicitly so this remains a
  // deterministic geometry regression even if the surrounding editor layout
  // changes.
  await viewport.evaluate((element) => {
    const node = element as HTMLElement;
    node.style.width = '1800px';
    node.style.maxWidth = 'none';
  });
  const titleTrack = inline.locator('col[data-property-id]').first();
  await expect
    .poll(() =>
      titleTrack.evaluate((track) => {
        const configuredWidth = Number.parseFloat((track as HTMLElement).style.width);
        const renderedWidth = track.getBoundingClientRect().width;
        return Math.abs(renderedWidth - configuredWidth);
      }),
    )
    .toBeLessThanOrEqual(1);
  await viewport.evaluate((element) => {
    const node = element as HTMLElement;
    node.style.removeProperty('width');
    node.style.removeProperty('max-width');
  });

  for (const theme of themes) {
    await setTheme(page, theme);
    for (const width of viewports) {
      await page.setViewportSize({ width, height: 900 });
      await expect(inline.getByRole('grid')).toBeVisible();
      for (const offset of offsets) {
        await viewport.evaluate((element, position) => {
          const node = element as HTMLElement;
          const maximum = Math.max(0, node.scrollWidth - node.clientWidth);
          node.scrollLeft =
            position === 'start' ? 0 : position === 'middle' ? Math.round(maximum / 2) : maximum;
          node.dispatchEvent(new Event('scroll', { bubbles: true }));
        }, offset);
        const firstTitleLink = inline.locator('tbody [data-record-title-link]').first();
        const firstTitleCell = firstTitleLink.locator('xpath=ancestor::td[1]');
        await expect(firstTitleCell).toBeVisible();
        await expect
          .poll(() =>
            firstTitleCell.evaluate((cell) => {
              const content = cell.querySelector<HTMLElement>('[data-record-title-link]');
              if (!content) return false;
              const cellBounds = cell.getBoundingClientRect();
              const contentBounds = content.getBoundingClientRect();
              return (
                contentBounds.left >= cellBounds.left && contentBounds.right <= cellBounds.right
              );
            }),
          )
          .toBe(true);
        // The picker click leaves a browser text range/gridcell focus behind on
        // some viewport widths. Clear transient selection/hover state so the
        // baseline represents the table surface, not test-input residue.
        await page.evaluate(() => {
          window.getSelection()?.removeAllRanges();
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
        await page.mouse.move(1, 1);
        await expect(inline).toHaveScreenshot(`database-inline-${theme}-${width}-${offset}.png`, {
          maxDiffPixelRatio: 0.01,
          // Record ordering is intentionally not part of this geometry gate;
          // the server may enumerate Markdown records in filesystem order.
          // Mask body rows while retaining headers, sticky columns, controls,
          // and the scroll viewport that this test owns.
          mask: [inline.locator('tbody')],
        });
      }
    }
  }
});
