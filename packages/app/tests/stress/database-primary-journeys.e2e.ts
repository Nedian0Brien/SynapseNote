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
  const paletteInput = page.getByPlaceholder('Search files, folders, or commands');
  await expect(paletteInput).toBeVisible({ timeout: 2_000 });
  await paletteInput.fill('databases');
  await page.getByRole('option', { name: 'Open databases' }).click();
  await expect(page.getByRole('heading', { name: 'Databases' })).toBeVisible({
    timeout: 5_000,
  });
}

async function openDatabase(page: Page, name: string) {
  await page.goto('/');
  await openDatabasesDialog(page);
  await page.getByText(name, { exact: true }).click();
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
    views: [],
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 20 },
  };
}

test.describe('database primary browser journeys', () => {
  test('creates, edits, opens, and undoes a canonical record in Table View', async ({
    page,
    api,
  }) => {
    const name = 'E2E Primary Record Journey';
    await api.createDatabase({
      ...taskDatabase(name, 'e2e-primary-record'),
      sampleRecords: [
        {
          sourceKey: 'tasks',
          values: { title: 'Seeded task', status: 'todo' },
        },
      ],
    });

    await openDatabase(page, name);
    await expect(page.getByRole('gridcell', { name: 'Seeded task' })).toBeVisible();

    await page.getByRole('button', { name: 'New record' }).click();
    await page.getByLabel('New record title').fill('Created task');
    await page.getByRole('button', { name: 'Plan new record' }).click();
    await expect(page.getByRole('gridcell', { name: 'Created task' })).toBeVisible({
      timeout: 10_000,
    });

    const createdTitle = page.getByRole('gridcell', { name: 'Created task' });
    await createdTitle.press('Enter');
    await page.getByLabel('Edit Title').fill('Renamed task');
    await page.getByRole('button', { name: 'Save cell edit' }).click();
    await expect(page.getByRole('gridcell', { name: 'Renamed task' })).toBeVisible({
      timeout: 10_000,
    });

    const renamedRow = page.locator('tr[data-record-id]').filter({ hasText: 'Renamed task' });
    await renamedRow.getByRole('button', { name: /Open record/ }).click();
    await expect(page).toHaveURL(/#\/.*\.md/, { timeout: 10_000 });

    await page.goBack();
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'More database actions' }).click();
    await page.getByRole('menuitem', { name: 'Undo last change' }).click();
    await expect(page.getByRole('gridcell', { name: 'Created task' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('gridcell', { name: 'Renamed task' })).toHaveCount(0);
    await page.getByRole('button', { name: 'More database actions' }).click();
    await page.getByRole('menuitem', { name: 'Redo last change' }).click();
    await expect(page.getByRole('gridcell', { name: 'Renamed task' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('applies a reviewed bulk property change and exposes undo', async ({ page, api }) => {
    const name = 'E2E Primary Bulk Journey';
    await api.createDatabase({
      ...taskDatabase(name, 'e2e-primary-bulk'),
      sampleRecords: [
        { sourceKey: 'tasks', values: { title: 'First task', status: 'todo' } },
        {
          sourceKey: 'tasks',
          values: { title: 'Second task', status: 'todo' },
        },
      ],
    });

    await openDatabase(page, name);
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
    await expect(page.getByRole('gridcell', { name: 'Done' })).toHaveCount(2, {
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'More database actions' }).click();
    await page.getByRole('menuitem', { name: 'Undo last change' }).click();
    await expect(page.getByRole('gridcell', { name: 'Todo' })).toHaveCount(2, {
      timeout: 10_000,
    });
  });

  test('creates and renames a saved view through the reviewed view manager', async ({
    page,
    api,
  }) => {
    const name = 'E2E Primary View Journey';
    await api.createDatabase({
      ...taskDatabase(name, 'e2e-primary-view'),
      sampleRecords: [{ sourceKey: 'tasks', values: { title: 'View task', status: 'todo' } }],
    });

    await openDatabase(page, name);
    await page.getByRole('button', { name: /View options for/ }).click();
    await page.getByRole('menuitem', { name: 'Manage views' }).click();
    await expect(page.getByRole('heading', { name: 'Manage saved views' })).toBeVisible();
    await page.getByLabel('New saved view name').fill('List of tasks');
    await page.getByRole('combobox', { name: 'New saved view layout' }).click();
    await page.getByRole('option', { name: 'List' }).click();
    await page.getByRole('button', { name: 'Review create' }).click();
    await expect(page.getByText('Proposed · not saved')).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole('button', { name: 'Commit change' }).click();
    await expect(page.getByRole('heading', { name: 'Manage saved views' })).toBeHidden({
      timeout: 10_000,
    });

    await page.getByRole('combobox', { name: 'Saved database view' }).click();
    await page.getByRole('option', { name: 'List of tasks' }).click();
    await expect(page.getByText('View task')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /View options for/ }).click();
    await page.getByRole('menuitem', { name: 'Manage views' }).click();
    await page.getByLabel('Name for List of tasks').fill('Renamed list');
    await page.getByRole('button', { name: 'Review rename List of tasks' }).click();
    await expect(page.getByText('Proposed · not saved')).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole('button', { name: 'Commit change' }).click();
    await expect(page.getByRole('combobox', { name: 'Saved database view' })).toContainText(
      'Renamed list',
      { timeout: 10_000 },
    );
  });
});
