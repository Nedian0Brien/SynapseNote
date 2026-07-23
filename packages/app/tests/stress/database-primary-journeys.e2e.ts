/**
 * Focused browser coverage for R-005.
 *
 * Component DOM tests cover each renderer in isolation. These tests cover the
 * real app shell, catalog, query, plan/commit, refresh, and canonical record
 * journey for the primary Table mutations and saved-view management path.
 * Seeding uses the same database plan/commit HTTP contract as an agent so the
 * browser assertions exercise the production surface rather than fixtures.
 */

import type { Page } from '@playwright/test';
import { expect, test } from './_helpers';

async function openDatabasesDialog(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Workspace Command Palette' });
  const paletteInput = palette.getByRole('combobox');
  await expect(paletteInput).toBeVisible({ timeout: 5_000 });
  await paletteInput.fill('databases');
  await page.getByRole('option', { name: 'Open databases' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Database breadcrumbs' }).getByRole('button', {
      name: 'Databases',
      exact: true,
    }),
  ).toBeVisible({
    timeout: 15_000,
  });
}

async function openDatabase(
  page: Page,
  name: string,
  target?: { databaseId: string; sourceId: string },
) {
  await page.goto('/');
  if (target) {
    await page.goto(
      `/#database/${encodeURIComponent(target.databaseId)}/${encodeURIComponent(target.sourceId)}`,
    );
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 20_000 });
    return;
  }
  await openDatabasesDialog(page);
  const databaseNav = page.getByRole('navigation', { name: 'Databases' });
  const databaseSection = databaseNav.locator('section').filter({ hasText: name });
  await expect(databaseSection.getByText(name, { exact: true })).toBeVisible({ timeout: 10_000 });
  await databaseSection.getByRole('button', { name: /^Tasks\b/ }).click();
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 10_000 });
}

function taskDatabase(name: string, key: string) {
  return {
    database: {
      key,
      name,
      contract: {
        purpose: 'Focused browser journey coverage',
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
        properties: [
          { key: 'title', name: 'Title', type: 'title' },
          {
            key: 'status',
            name: 'Status',
            type: 'select',
            options: [
              { key: 'todo', name: 'Todo' },
              { key: 'done', name: 'Done' },
            ],
          },
        ],
      },
    ],
    views: [
      {
        key: 'all-tasks',
        name: 'All tasks',
        sourceKey: 'tasks',
        openBehavior: 'side_peek',
        layout: { type: 'table', configuration: { rowHeight: 'compact' } },
      },
    ],
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 20 },
  };
}

test.describe('database primary browser journeys', () => {
  test('creates, edits, opens, and undoes a canonical record in Table View', async ({
    page,
    api,
  }) => {
    const name = 'E2E Primary Record Journey';
    const target = await api.createDatabase({
      ...taskDatabase(name, 'e2e-primary-record'),
      sampleRecords: [
        {
          sourceKey: 'tasks',
          values: { title: 'Seeded task', status: 'todo' },
        },
      ],
    });

    await openDatabase(page, name, target);
    await expect(
      page.locator('[role="gridcell"][data-property-id][title="Seeded task"]'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'New page' }).click();
    await page.getByRole('textbox', { name: 'New page title' }).first().fill('Created task');
    await page.getByRole('button', { name: 'Add page' }).click();
    await expect(
      page.locator('[role="gridcell"][data-property-id][title="Created task"]'),
    ).toBeVisible({
      timeout: 10_000,
    });

    const createdTitle = page.locator('[role="gridcell"][data-property-id][title="Created task"]');
    await createdTitle.press('Enter');
    await page.getByRole('textbox', { name: 'Edit Title' }).fill('Renamed task');
    await page.getByRole('button', { name: 'Save cell edit' }).click();
    await expect(
      page.locator('[role="gridcell"][data-property-id][title="Renamed task"]'),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('database-save-indicator')).toHaveAttribute(
      'data-database-save-state',
      'saved',
      { timeout: 10_000 },
    );

    await page.getByRole('button', { name: 'More database actions' }).click();
    await page.getByRole('menuitem', { name: 'Undo last change' }).click();
    await expect(
      page.locator('[role="gridcell"][data-property-id][title="Created task"]'),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.locator('[role="gridcell"][data-property-id][title="Renamed task"]'),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'More database actions' }).click();
    await page.getByRole('menuitem', { name: 'Redo last change' }).click();
    await expect(
      page.locator('[role="gridcell"][data-property-id][title="Renamed task"]'),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('database-save-indicator')).toHaveAttribute(
      'data-database-save-state',
      'saved',
      { timeout: 10_000 },
    );

    await page.reload();
    await expect(
      page.locator('[role="gridcell"][data-property-id][title="Renamed task"]'),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('tab', { name: 'All tasks', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 20_000 },
    );

    const renamedRow = page.locator('tr[data-record-id]').filter({ hasText: 'Renamed task' });
    await renamedRow.getByRole('button', { name: 'Open record Renamed task' }).click();
    const recordPeek = page.locator('[data-slot="sheet-content"]');
    await expect(recordPeek).toBeVisible({ timeout: 10_000 });
    await recordPeek.getByRole('button', { name: 'Open full page' }).click();
    await expect(page).toHaveURL(/#\/[^/]+\/rec_[a-z0-9]+$/, { timeout: 10_000 });
    await page.goBack();
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tab', { name: 'All tasks', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('applies a reviewed bulk property change and exposes undo', async ({ page, api }) => {
    const name = 'E2E Primary Bulk Journey';
    const target = await api.createDatabase({
      ...taskDatabase(name, 'e2e-primary-bulk'),
      sampleRecords: [
        { sourceKey: 'tasks', values: { title: 'First task', status: 'todo' } },
        {
          sourceKey: 'tasks',
          values: { title: 'Second task', status: 'todo' },
        },
      ],
    });

    await openDatabase(page, name, target);
    const rows = page.locator('tr[data-record-id]');
    await rows
      .nth(0)
      .getByRole('checkbox', { name: /Select record/ })
      .click();
    await rows
      .nth(1)
      .getByRole('checkbox', { name: /Select record/ })
      .click();
    await expect(page.getByTestId('database-bulk-toolbar')).toBeVisible();

    await page.getByRole('combobox', { name: 'Bulk property' }).click();
    await page.getByRole('option', { name: 'Status' }).click();
    await page.getByRole('combobox', { name: 'Bulk value' }).click();
    await page.getByRole('option', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Plan bulk edit' }).click();
    await expect(page.getByText('Proposed · not saved')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(/Updates 2 canonical record/)).toBeVisible();
    await page.getByRole('button', { name: 'Commit change' }).click();
    await expect(page.locator('[role="gridcell"] button').filter({ hasText: 'Done' })).toHaveCount(
      2,
      {
        timeout: 10_000,
      },
    );
    await expect(page.getByTestId('database-save-indicator')).toHaveAttribute(
      'data-database-save-state',
      'saved',
      { timeout: 10_000 },
    );

    await page.getByRole('button', { name: 'More database actions' }).click();
    await page.getByRole('menuitem', { name: 'Undo last change' }).click();
    await expect(page.locator('[role="gridcell"] button').filter({ hasText: 'Todo' })).toHaveCount(
      2,
      {
        timeout: 10_000,
      },
    );
  });

  test('creates and renames a saved view through the view manager', async ({ page, api }) => {
    const name = 'E2E Primary View Journey';
    const target = await api.createDatabase({
      ...taskDatabase(name, 'e2e-primary-view'),
      sampleRecords: [{ sourceKey: 'tasks', values: { title: 'View task', status: 'todo' } }],
    });

    await openDatabase(page, name, target);
    await page.getByRole('tab', { name: 'All tasks', exact: true }).click();
    await page.getByRole('button', { name: 'View options for All tasks' }).click();
    await page.getByRole('menuitem', { name: 'Manage views' }).click();
    await expect(page.getByRole('heading', { name: 'Manage saved views' })).toBeVisible();
    await page.getByLabel('New saved view name').fill('List of tasks');
    await page.getByRole('combobox', { name: 'New saved view layout' }).click();
    await page.getByRole('option', { name: 'List' }).click();
    await page.getByRole('button', { name: 'Review create' }).click();
    const viewManager = page.getByRole('dialog', { name: 'Manage saved views' });
    await expect(viewManager.getByRole('textbox', { name: 'Name for List of tasks' })).toBeVisible({
      timeout: 10_000,
    });
    await viewManager.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('tab', { name: 'List of tasks', exact: true }).click();
    const listView = page.getByRole('tree', { name: 'List of tasks List' });
    await expect(listView.getByRole('button', { name: 'View task', exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'View options for List of tasks' }).click();
    await page.getByRole('menuitem', { name: 'Manage views' }).click();
    await page.getByRole('textbox', { name: 'Name for List of tasks' }).fill('Renamed list');
    await page.getByRole('button', { name: 'Review rename List of tasks' }).click();
    const renamedViewManager = page.getByRole('dialog', { name: 'Manage saved views' });
    await expect(
      renamedViewManager.getByRole('textbox', { name: 'Name for Renamed list' }),
    ).toBeVisible({
      timeout: 10_000,
    });
    await renamedViewManager.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('tab', { name: 'Renamed list', exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'View options for Renamed list' }).click();
    await page.getByRole('menuitem', { name: 'View settings' }).click();
    const savedViewSettings = page.getByRole('dialog', { name: 'Saved view settings' });
    await expect(savedViewSettings).toBeVisible();
    await savedViewSettings.getByRole('button', { name: 'Add sort' }).click();
    await expect(
      savedViewSettings.getByRole('combobox', { name: 'Sort 1 property' }),
    ).toBeVisible();
    await savedViewSettings.getByRole('button', { name: 'Review view settings' }).click();
    await expect(savedViewSettings).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId('database-save-indicator')).toHaveAttribute(
      'data-database-save-state',
      'saved',
      { timeout: 10_000 },
    );

    await page.getByRole('button', { name: 'View options for Renamed list' }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(page.getByRole('tab', { name: 'Renamed list copy', exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('tab', { name: 'Renamed list copy', exact: true }).click();
    await page.getByRole('button', { name: 'View options for Renamed list copy' }).click();
    await page.getByRole('menuitem', { name: 'Move left' }).click();
    const viewTabs = page.getByRole('navigation', { name: 'Database views' }).locator('fieldset');
    await expect(viewTabs.nth(1)).toContainText('Renamed list copy', { timeout: 10_000 });
    await expect(page.getByTestId('database-save-indicator')).toHaveAttribute(
      'data-database-save-state',
      'saved',
      { timeout: 10_000 },
    );

    await page.getByRole('button', { name: 'View options for Renamed list copy' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('tab', { name: 'Renamed list copy', exact: true })).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});
