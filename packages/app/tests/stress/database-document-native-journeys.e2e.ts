/**
 * One focused browser pass for the document-native database contract.
 *
 * This file deliberately keeps the expensive real-app journey in one place:
 * normal New-page creation, slash inline creation, linked-view insertion, and
 * row → peek → record-page → return continuity. Component tests cover the
 * individual mutation branches; this suite proves that the production shell
 * composes them without falling back to the administration modal.
 */

import type { Page } from '@playwright/test';
import { expect, test, waitForActiveProviderSynced, waitForSlashMenuOpen } from './_helpers';

function taskDatabase(name: string, key: string) {
  return {
    database: {
      key,
      name,
      contract: {
        purpose: 'Document-native browser journey coverage',
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
        folder: key,
        properties: [{ key: 'title', name: 'Title', type: 'title' as const }],
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
  };
}

async function openEditorDocument(page: Page, docName: string) {
  await page.goto(`/#/${docName}`);
  const editor = page.locator('.ProseMirror:not(.composer-prosemirror)').first();
  await expect(editor).toBeVisible({ timeout: 10_000 });
  await waitForActiveProviderSynced(page);
  await editor.click();
  return editor;
}

async function chooseSlashBlock(page: Page, query: string, label: string) {
  await page.keyboard.type(`/${query}`);
  await waitForSlashMenuOpen(page);
  const menu = page.getByRole('listbox', { name: 'Slash commands' });
  await expect(menu).toBeVisible();
  await menu.getByRole('option', { name: label, exact: true }).click();
}

test.describe('document-native database browser journeys', () => {
  test('sidebar New database lands on an editable table and creates a page row', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByTestId('sidebar-toolbar')
      .getByRole('button', { name: 'New database', exact: true })
      .click();

    await expect(page).toHaveURL(/#database\//, { timeout: 20_000 });
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('columnheader', { name: 'Title' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New database view' })).toBeVisible();

    const newPageTitle = page.getByRole('textbox', { name: 'New page title' });
    await expect(newPageTitle).toBeVisible();
    await newPageTitle.fill('New-page first record');
    await newPageTitle.press('Enter');
    await expect(page.getByRole('button', { name: /Open page New-page first record/ })).toBeVisible(
      {
        timeout: 15_000,
      },
    );
  });

  test('New file → Database keeps the page-first table experience', async ({ page }) => {
    await page.goto('/');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.waitForFunction(
      () => document.activeElement === null || document.activeElement === document.body,
      null,
      { timeout: 1_000 },
    );
    const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modKey}+Alt+KeyN`);

    const newFile = page.getByRole('dialog', { name: 'New file' });
    await expect(newFile).toBeVisible({ timeout: 5_000 });
    await newFile.getByTestId('new-item-dialog-new-database').click();

    await expect(newFile).toBeHidden({ timeout: 5_000 });
    await expect(page).toHaveURL(/#database\//, { timeout: 20_000 });
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('columnheader', { name: 'Title' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'New page title' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New database view' })).toBeVisible();
  });

  test('slash Inline database stays in the document and hands off to the canonical page', async ({
    page,
    api,
  }) => {
    const docName = `e2e-inline-database-${crypto.randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);
    const editor = await openEditorDocument(page, docName);

    await chooseSlashBlock(page, 'database', 'Inline database');
    const inline = page.getByRole('region', { name: /^Linked database view:/ });
    await expect(inline).toHaveAttribute('data-view-mode', 'inline', { timeout: 20_000 });
    await expect(inline.getByRole('grid')).toBeVisible({ timeout: 20_000 });

    const title = inline.getByRole('textbox', { name: 'New page title' });
    await expect(title).toBeVisible();
    const newPageButton = inline.getByRole('button', { name: 'New page' });
    await newPageButton.click();
    await expect(title).toBeFocused();
    await newPageButton.click();
    await expect(title).toBeFocused();
    await title.fill('Inline first record');
    await title.press('Enter');
    await expect(inline.getByRole('button', { name: /Open page Inline first record/ })).toBeVisible(
      {
        timeout: 15_000,
      },
    );

    await inline.getByRole('heading').getByRole('button').click();
    const inlineDatabaseTitle = inline.getByRole('textbox', { name: 'Inline database title' });
    await inlineDatabaseTitle.fill('Inline journey database');
    await inlineDatabaseTitle.press('Enter');
    await expect(inline.getByRole('heading', { name: 'Inline journey database' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(inline.getByText('Saved', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // The primary inline toolbar owns its controls in the document surface;
    // opening one must not select the enclosing JSX node or mount the full
    // administration workspace. This is intentionally a real Chromium check
    // because the NodeView/portal event path is not represented by DOM tests.
    await inline.getByRole('button', { name: 'Filters' }).click();
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible();
    await expect(page.locator('[data-database-workspace]')).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__activeEditor?.state.selection.constructor.name),
    ).not.toBe('NodeSelection');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeHidden();

    await inline.getByRole('button', { name: 'Sort' }).click();
    await expect(page.getByRole('heading', { name: 'Sort' })).toBeVisible();
    await expect(page.locator('[data-database-workspace]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Sort' })).toBeHidden();

    await inline.getByRole('button', { name: 'Properties' }).click();
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
    await expect(page.locator('[data-database-workspace]')).toHaveCount(0);
    await inline.getByRole('button', { name: 'Properties' }).click();

    await inline.getByRole('button', { name: /^Open full database:/ }).click();
    await expect(page).toHaveURL(/#database\//, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Open page Inline first record/ })).toBeVisible({
      timeout: 15_000,
    });

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/${docName}$`), { timeout: 10_000 });
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Open page Inline first record/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('linked view preserves shared rows through peek, full page, and return', async ({
    page,
    api,
  }) => {
    const databaseName = `E2E Linked Database ${crypto.randomUUID().slice(0, 8)}`;
    await api.createDatabase({
      ...taskDatabase(databaseName, `e2e-linked-${crypto.randomUUID().slice(0, 8)}`),
      sampleRecords: [
        {
          sourceKey: 'tasks',
          values: { title: 'Shared linked task' },
          body: 'Canonical body for the linked-view journey.\n',
        },
      ],
    });
    const docName = `e2e-linked-view-${crypto.randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);
    await openEditorDocument(page, docName);

    await chooseSlashBlock(page, 'database', 'Linked view of database');
    const picker = page.getByRole('region', { name: 'Choose a database view' });
    await expect(picker).toBeVisible({ timeout: 10_000 });
    await expect(picker.getByText(databaseName, { exact: true })).toBeVisible({ timeout: 15_000 });
    await picker.getByRole('button', { name: 'Tasks', exact: true }).first().click();

    const savedView = picker.getByRole('button', { name: /All tasks table/ });
    await expect(savedView).toBeVisible({ timeout: 10_000 });
    await savedView.click();

    const inline = page.getByRole('region', { name: /^Linked database view:/ });
    await expect(inline).toHaveAttribute('data-view-mode', 'inline', { timeout: 15_000 });
    await expect(inline.getByRole('button', { name: /Open page Shared linked task/ })).toBeVisible({
      timeout: 15_000,
    });

    await inline.getByRole('button', { name: /Open page Shared linked task/ }).click();
    await expect(page.getByRole('button', { name: 'Open full page' })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Open full page' }).click();
    await expect(page).toHaveURL(/#\/[^/]+\/rec_[a-z0-9]+$/, { timeout: 10_000 });

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/${docName}$`), { timeout: 10_000 });
    const returnedInline = page.getByRole('region', { name: /^Linked database view:/ });
    await expect(
      returnedInline.getByRole('button', { name: /Open page Shared linked task/ }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test('inline filters, search, and saved-view lifecycle stay document-native across reload', async ({
    page,
    api,
  }) => {
    const scriptRequests: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scriptRequests.push(request.url());
    });
    const databaseName = `E2E Inline Controls ${crypto.randomUUID().slice(0, 8)}`;
    const inlineControlsDatabase = taskDatabase(
      databaseName,
      `e2e-inline-controls-${crypto.randomUUID().slice(0, 8)}`,
    );
    await api.createDatabase({
      ...inlineControlsDatabase,
      sources: inlineControlsDatabase.sources.map((source) => ({
        ...source,
        properties: [
          ...source.properties,
          { key: 'status', name: 'Status', type: 'text' as const },
        ],
      })),
      sampleRecords: [
        {
          sourceKey: 'tasks',
          values: { title: 'Document-native control task', status: 'Open' },
          body: 'Inline control journey record.\n',
        },
      ],
    });
    const docName = `e2e-inline-controls-${crypto.randomUUID().slice(0, 8)}`;
    await api.createPage(`${docName}.md`);
    await openEditorDocument(page, docName);

    await chooseSlashBlock(page, 'database', 'Linked view of database');
    const picker = page.getByRole('region', { name: 'Choose a database view' });
    await expect(picker.getByText(databaseName, { exact: true })).toBeVisible({ timeout: 15_000 });
    await picker.getByRole('button', { name: 'Tasks', exact: true }).first().click();
    await picker.getByRole('button', { name: /All tasks table/ }).click();

    const inline = page.getByRole('region', { name: /^Linked database view:/ });
    await expect(inline.getByRole('grid')).toBeVisible({ timeout: 20_000 });
    await expect(inline.getByRole('button', { name: 'Filters' })).toBeVisible();
    const databaseNode = page
      .locator('[data-component-name="DatabaseView"]')
      .filter({ has: inline });
    await expect(databaseNode).toHaveAttribute('draggable', 'false');
    await expect(
      databaseNode.locator('.jsx-component-chrome[data-jsx-drag-handle=""]'),
    ).toHaveAttribute('draggable', 'true');
    // Ignore app-shell eager modules that loaded before the inline surface was
    // ready; from this point onward routine inline actions must not request the
    // advanced workspace chunk.
    scriptRequests.length = 0;

    const viewOptionsTrigger = inline.getByRole('button', {
      name: 'View options for All tasks',
    });
    await viewOptionsTrigger.click();
    await expect(page.getByRole('menuitem', { name: 'Filters', exact: true })).toBeVisible();
    await expect(databaseNode).not.toHaveClass(/ProseMirror-selectednode/);
    await page.keyboard.press('Escape');
    await expect(viewOptionsTrigger).toBeFocused();

    const actionsTrigger = inline.getByRole('button', {
      name: 'Database view actions for Tasks · All tasks',
    });
    await actionsTrigger.click();
    await expect(page.getByRole('menuitem', { name: 'Refresh', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(actionsTrigger).toBeFocused();

    const statusPropertyTrigger = inline.getByRole('button', {
      name: 'Property options for Status',
    });
    await statusPropertyTrigger.click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Show column' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(statusPropertyTrigger).toBeFocused();

    const addPropertyTrigger = inline.getByRole('button', { name: 'Add property', exact: true });
    await addPropertyTrigger.click();
    await expect(page.getByRole('heading', { name: 'Add property' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(addPropertyTrigger).toBeFocused();

    const filtersTrigger = inline.getByRole('button', { name: 'Filters', exact: true });
    const grid = inline.getByRole('grid');
    await grid.evaluate((element) => {
      element.setAttribute('data-render-continuity-probe', 'preserved');
    });
    await filtersTrigger.click();
    const filterInput = page.getByRole('textbox', { name: 'Filter value for Title' });
    await expect(filterInput).toBeVisible();
    await filterInput.fill('Document-native control task');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(
      page.getByRole('button', { name: /Open page Document-native control task/ }),
    ).toBeVisible();
    await expect(grid).toHaveAttribute('data-render-continuity-probe', 'preserved');
    await expect(page.locator('[data-database-workspace]')).toHaveCount(0);
    expect(
      scriptRequests.filter((url) => /DatabaseWorkspace|DatabaseTableDialog/i.test(url)),
    ).toEqual([]);

    const searchTrigger = inline.getByRole('button', { name: /Search pages in Tasks/ });
    await searchTrigger.click();
    const searchInput = page.getByRole('textbox', { name: 'Search pages' });
    await searchInput.fill('control task');
    await expect(page.getByText(/1 page in this view/)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');

    const propertiesTrigger = inline.getByRole('button', { name: 'Properties', exact: true });
    await propertiesTrigger.click();
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
    const statusCheckbox = page.getByRole('checkbox', { name: 'Show Status' });
    await expect(statusCheckbox).toBeChecked();
    await statusCheckbox.click();
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
    await expect(inline.getByRole('columnheader', { name: /Status/ })).toBeHidden();
    await statusCheckbox.click();
    await expect(statusCheckbox).toBeChecked();
    await expect(inline.getByRole('columnheader', { name: /Status/ })).toBeVisible();
    await expect(grid).toHaveAttribute('data-render-continuity-probe', 'preserved');
    await expect(page.locator('[data-database-workspace]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(propertiesTrigger).toBeFocused();

    const viewManagerTrigger = inline.getByRole('button', {
      name: 'New database view for Tasks · All tasks',
    });
    await viewManagerTrigger.click();
    const manager = page.getByRole('dialog', { name: 'Manage saved views' });
    await expect(manager).toBeVisible();
    const newViewName = manager.getByRole('textbox', { name: 'New inline saved view name' });
    await newViewName.fill('Control lifecycle view');
    await manager.getByRole('button', { name: 'New view' }).click();
    await expect(inline.getByRole('button', { name: 'Control lifecycle view' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(grid).toHaveAttribute('data-render-continuity-probe', 'preserved');

    await inline.getByRole('button', { name: /Manage saved views/ }).click();
    const reopenedManager = page.getByRole('dialog', { name: 'Manage saved views' });
    await reopenedManager.getByRole('button', { name: 'Rename' }).last().click();
    const renameInput = reopenedManager.getByRole('textbox', {
      name: 'Rename Control lifecycle view',
    });
    await renameInput.fill('Renamed lifecycle view');
    await renameInput.press('Enter');
    await expect(inline.getByRole('button', { name: 'Renamed lifecycle view' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(grid).toHaveAttribute('data-render-continuity-probe', 'preserved');

    await page.reload();
    const reloadedInline = page.getByRole('region', { name: /^Linked database view:/ });
    await expect(reloadedInline.getByRole('grid')).toBeVisible({ timeout: 20_000 });
    await expect(
      reloadedInline.getByRole('button', { name: 'Renamed lifecycle view' }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-database-workspace]')).toHaveCount(0);
  });
});
