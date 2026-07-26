import type { Page } from '@playwright/test';
import {
  expect,
  test,
  waitForActiveProviderSynced,
  waitForSlashMenuOpen,
} from '../stress/_helpers';

async function createTwoPropertyInlineFixture(
  page: Page,
  api: {
    createDatabase: (state: Record<string, unknown>) => Promise<unknown>;
    createPage: (name: string) => Promise<void>;
  },
) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const databaseName = `Two property geometry ${suffix}`;
  await api.createDatabase({
    database: {
      key: `two-property-geometry-${suffix}`,
      name: databaseName,
      contract: {
        purpose: 'Under-filled database table geometry regression',
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
        folder: `two-property-geometry-${suffix}`,
        properties: [
          { key: 'title', name: 'Title', type: 'title' },
          { key: 'status', name: 'Status', type: 'text' },
        ],
      },
    ],
    views: [
      {
        key: 'all-tasks',
        name: 'All tasks',
        sourceKey: 'tasks',
        layout: { type: 'table', configuration: { rowHeight: 'standard' } },
      },
    ],
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 20 },
    sampleRecords: [
      {
        sourceKey: 'tasks',
        values: {
          title: 'A title that must stay inside the configured track',
          status: 'Open',
        },
        body: 'Two-property geometry regression.\n',
      },
    ],
  });
  const docName = `two-property-geometry-${suffix}`;
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
  return inline;
}

async function measureGeometry(inline: ReturnType<Page['locator']>) {
  return inline.evaluate((region) => {
    const owner = region.querySelector<HTMLElement>('[data-database-table-scroll-owner]');
    const table = region.querySelector<HTMLTableElement>('[data-slot="table"]');
    const propertyHeaders = region.querySelectorAll<HTMLElement>('thead th[data-property-id]');
    const title = propertyHeaders[0];
    const filler = region.querySelector<HTMLElement>('thead th[data-database-table-filler]');
    const actions = region.querySelector<HTMLElement>('thead th[data-database-actions-column]');
    const status = propertyHeaders[1];
    const titleContent = title?.querySelector<HTMLElement>('[data-database-property-name]');
    if (!owner || !table || !title || !filler || !actions || !status || !titleContent) {
      throw new Error('database table geometry fixture is incomplete');
    }
    const tableRect = table.getBoundingClientRect();
    const ownerRect = owner.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();
    const fillerRect = filler.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const contentRect = titleContent.getBoundingClientRect();
    const interactionLayer = region.querySelector<HTMLElement>(
      '[data-database-table-interaction-layer]',
    );
    return {
      ownerWidth: owner.clientWidth,
      contentViewportWidth: owner.clientWidth,
      tableWidth: tableRect.width,
      scrollWidth: owner.scrollWidth,
      titleLeft: titleRect.left,
      tableLeft: tableRect.left,
      ownerLeft: ownerRect.left,
      titleStartsAtOwner: Math.abs(titleRect.left - ownerRect.left) <= 1,
      tableStartsAtOwner: Math.abs(tableRect.left - ownerRect.left) <= 1,
      titleWidth: titleRect.width,
      statusWidth: statusRect.width,
      fillerWidth: fillerRect.width,
      fixedContentWidth: titleRect.width + statusRect.width + actionsRect.width,
      actionsLeft: actionsRect.left,
      statusRight: statusRect.right,
      fillerRight: fillerRect.right,
      actionsRight: actionsRect.right,
      tableRight: tableRect.right,
      contentInsideTitle:
        contentRect.left >= titleRect.left - 1 && contentRect.right <= titleRect.right + 1,
      interactionLayerPresent: Boolean(interactionLayer),
    };
  });
}

test('two-property inline table keeps a coherent under-filled and overflowing geometry', async ({
  page,
  api,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const inline = await createTwoPropertyInlineFixture(page, api);
  const owner = inline.locator('[data-database-table-scroll-owner]');
  await expect(owner).toHaveCount(1);
  await expect(inline.locator('[data-slot="table-container"]')).toHaveCount(1);
  await expect(inline.locator('colgroup[data-database-table-colgroup]')).toHaveCount(1);
  await expect(inline.getByRole('grid')).toHaveAttribute('aria-colcount', '4');
  await expect(inline.locator('[data-database-table-selector-track]')).toHaveCount(0);
  const fillerCells = inline.locator(
    'th[data-database-table-filler], td[data-database-table-filler]',
  );
  await expect(fillerCells).toHaveCount(3);
  expect(
    await fillerCells.evaluateAll((cells) =>
      cells.every(
        (cell) =>
          cell.getAttribute('role') === 'presentation' &&
          cell.getAttribute('aria-hidden') === 'true' &&
          !cell.hasAttribute('tabindex'),
      ),
    ),
  ).toBe(true);

  const underFilled = await measureGeometry(inline);
  expect(underFilled.tableWidth).toBeCloseTo(underFilled.contentViewportWidth, 0);
  expect(underFilled.interactionLayerPresent).toBe(true);
  expect(underFilled.titleStartsAtOwner).toBe(true);
  expect(underFilled.tableStartsAtOwner).toBe(true);
  expect(underFilled.titleWidth).toBeCloseTo(280, 0);
  expect(underFilled.statusWidth).toBeCloseTo(180, 0);
  expect(underFilled.fillerWidth).toBeGreaterThan(0);
  expect(Math.abs(underFilled.actionsLeft - underFilled.statusRight)).toBeLessThanOrEqual(1);
  expect(Math.abs(underFilled.fillerRight - underFilled.tableRight)).toBeLessThanOrEqual(1);
  expect(underFilled.contentInsideTitle).toBe(true);
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.mouse.move(1, 1);
  await expect(inline).toHaveScreenshot('database-table-two-property-underfilled.png', {
    maxDiffPixelRatio: 0.01,
  });

  const firstRow = inline.locator('tbody tr[data-record-id]').first();
  await firstRow.hover();
  const selectorOutsideTable = await firstRow.evaluate((row) => {
    const region = row.closest('[data-database-table-surface]');
    const selector = region?.querySelector<HTMLElement>('[data-database-row-drag-handle]');
    const controls = region?.querySelector<HTMLElement>('[data-database-table-interaction-layer]');
    const addButton = controls?.querySelector<HTMLElement>('.ok-add-block-btn');
    const titleCell = row.querySelector<HTMLElement>('td[data-property-id]');
    if (!titleCell || !selector || !controls || !addButton) {
      throw new Error('row interaction controls fixture is incomplete');
    }
    const titleRect = titleCell.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const selectorRect = selector.getBoundingClientRect();
    const selectorIcon = selector.querySelector<SVGElement>('svg');
    const iconRect = selectorIcon?.getBoundingClientRect();
    return {
      outside: selectorRect.right < titleRect.left,
      gap: titleRect.left - selectorRect.right,
      nativeClasses:
        controls.classList.contains('ok-block-controls') &&
        selector.classList.contains('ok-drag-grip') &&
        addButton.classList.contains('ok-add-block-btn'),
      opacity: getComputedStyle(selector).opacity,
      verticallyCentered: Math.abs(
        selectorRect.top + selectorRect.height / 2 - (rowRect.top + rowRect.height / 2),
      ),
      selectorRect: {
        left: selectorRect.left,
        top: selectorRect.top,
        width: selectorRect.width,
        height: selectorRect.height,
      },
      iconRect: iconRect
        ? { left: iconRect.left, top: iconRect.top, width: iconRect.width, height: iconRect.height }
        : null,
      iconColor: selectorIcon ? getComputedStyle(selectorIcon).color : null,
      iconVisibility: selectorIcon ? getComputedStyle(selectorIcon).visibility : null,
    };
  });
  expect(selectorOutsideTable.outside).toBe(true);
  expect(selectorOutsideTable.gap).toBeGreaterThanOrEqual(1);
  expect(selectorOutsideTable.nativeClasses).toBe(true);
  expect(selectorOutsideTable.opacity).toBe('1');
  expect(selectorOutsideTable.verticallyCentered).toBeLessThanOrEqual(1);
  expect(selectorOutsideTable.iconRect?.width).toBeGreaterThan(0);
  expect(selectorOutsideTable.iconRect?.height).toBeGreaterThan(0);
  expect(selectorOutsideTable.iconVisibility).toBe('visible');
  const hovered = await measureGeometry(inline);
  expect(Math.abs(hovered.titleLeft - underFilled.titleLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(hovered.tableLeft - underFilled.tableLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(hovered.tableWidth - underFilled.tableWidth)).toBeLessThanOrEqual(1);
  const inlineBounds = await inline.boundingBox();
  if (!inlineBounds) throw new Error('inline database bounds are unavailable');
  const hoverGutter = 48;
  await expect(page).toHaveScreenshot('database-table-two-property-row-hover.png', {
    clip: {
      x: inlineBounds.x - hoverGutter,
      y: inlineBounds.y,
      width: inlineBounds.width + hoverGutter,
      height: inlineBounds.height,
    },
    maxDiffPixelRatio: 0.01,
  });

  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.5';
  });
  await expect.poll(() => measureGeometry(inline)).toMatchObject({ contentInsideTitle: true });
  const zoomed = await measureGeometry(inline);
  expect(zoomed.titleWidth).toBeCloseTo(280 * 1.5, 0);
  expect(zoomed.statusWidth).toBeCloseTo(180 * 1.5, 0);

  await page.evaluate(() => {
    document.documentElement.style.zoom = '1';
  });
  await page.setViewportSize({ width: 560, height: 900 });
  await expect.poll(() => measureGeometry(inline)).toMatchObject({ contentInsideTitle: true });
  const overflowing = await measureGeometry(inline);
  expect(overflowing.scrollWidth).toBeGreaterThan(overflowing.ownerWidth);
  expect(overflowing.titleWidth).toBeCloseTo(280, 0);
  expect(overflowing.statusWidth).toBeCloseTo(180, 0);

  await owner.evaluate((element) => {
    const node = element as HTMLElement;
    node.scrollLeft = Math.round(node.scrollWidth / 2);
    node.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect.poll(() => measureGeometry(inline)).toMatchObject({ contentInsideTitle: true });
  await expect(inline.locator('[data-database-table-scroll-owner]')).toHaveCount(1);
});
