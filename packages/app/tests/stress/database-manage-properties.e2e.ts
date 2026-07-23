/**
 * E2E coverage for the "Manage properties" schema editor (R-005): add a
 * property and delete one, driven through the real Databases dialog against
 * a real seeded database, not a mocked fetch layer.
 *
 * The database itself is seeded through `api.createDatabase`, which drives
 * the same `/api/databases/plan` (create_draft → create_plan) +
 * `/api/databases/commit` HTTP flow a real agent uses — there is no
 * "create database" UI shortcut, and seeding through the UI would make this
 * test redundant with `database-creation-flow` coverage elsewhere.
 *
 * Deleting a property that still holds a value is two independently
 * reviewed commits (unset the value, then drop the property), never
 * auto-chained — see the comment on `removeSchemaProperty` in
 * DatabaseTableDialog.tsx for why: firing the second commit immediately
 * after the first reproducibly hangs the commit engine for that database.
 * This test's delete case exercises exactly that two-click, two-commit
 * path a real user follows.
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
  ).toBeVisible({ timeout: 5_000 });
}

async function openManageProperties(page: Page) {
  const summary = page.getByText('Table layout and calculations', { exact: true });
  await summary.click();
  await page.getByRole('button', { name: 'Manage properties' }).click();
  await expect(page.getByRole('heading', { name: 'Manage properties' })).toBeVisible({
    timeout: 2_000,
  });
}

test.describe('database schema property management', () => {
  test('adds a property through a reviewed commit and shows it as a new column', async ({
    page,
    api,
  }) => {
    const { databaseId } = await api.createDatabase({
      database: {
        key: 'e2e-manage-properties-add',
        name: 'E2E Manage Properties Add',
        contract: {
          purpose: 'E2E coverage for adding a schema property',
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
          folder: 'e2e-manage-properties-add',
          properties: [{ key: 'title', name: 'Title', type: 'title' }],
        },
      ],
      views: [],
      policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 10 },
      sampleRecords: [
        { sourceKey: 'tasks', values: { title: 'Seeded task' }, body: 'Seeded for E2E.\n' },
      ],
    });
    expect(databaseId).toMatch(/^db_/);

    await page.goto('/');
    await openDatabasesDialog(page);
    const databaseNav = page.getByRole('navigation', { name: 'Databases' });
    await expect(databaseNav.getByText('E2E Manage Properties Add', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await databaseNav.getByText('E2E Manage Properties Add', { exact: true }).click();
    await expect(page.getByRole('gridcell', { name: 'Seeded task' })).toBeVisible({
      timeout: 10_000,
    });

    await openManageProperties(page);
    await page.getByPlaceholder('Property name').fill('Priority');
    await page.getByRole('button', { name: 'Add' }).click();

    // The dialog closes itself and hands off to the generic ghost-review
    // banner in the underlying table — every canonical database mutation
    // in this app reviews before it commits, schema changes included.
    await expect(page.getByText('PROPOSED · NOT SAVED')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Alters an existing canonical database schema')).toBeVisible();
    await page.getByRole('button', { name: 'Commit change' }).click();

    await expect(page.getByRole('columnheader', { name: /Priority/ })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('deletes a valued property in two reviewed commits: unset, then drop from schema', async ({
    page,
    api,
  }) => {
    await api.createDatabase({
      database: {
        key: 'e2e-manage-properties-delete',
        name: 'E2E Manage Properties Delete',
        contract: {
          purpose: 'E2E coverage for deleting a schema property',
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
          folder: 'e2e-manage-properties-delete',
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
      policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 10 },
      sampleRecords: [
        {
          sourceKey: 'tasks',
          values: { title: 'Seeded task', status: 'todo' },
          body: 'Seeded for E2E.\n',
        },
      ],
    });

    await page.goto('/');
    await openDatabasesDialog(page);
    await page
      .getByRole('navigation', { name: 'Databases' })
      .getByText('E2E Manage Properties Delete', { exact: true })
      .click();
    await expect(page.locator('[role="gridcell"] button').filter({ hasText: 'Todo' })).toBeVisible({
      timeout: 10_000,
    });

    // Commit 1: unset the value (record-only patch, property still exists).
    await openManageProperties(page);
    await page.getByRole('button', { name: 'Delete Status' }).click();
    await page.getByRole('button', { name: 'Continue to review' }).click();
    await expect(page.getByText('PROPOSED · NOT SAVED')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Updates 1 canonical record(s)')).toBeVisible();
    await page.getByRole('button', { name: 'Commit change' }).click();
    await expect(page.locator('[role="gridcell"] button').filter({ hasText: 'Todo' })).toHaveCount(
      0,
      {
        timeout: 10_000,
      },
    );
    await page
      .getByRole('dialog', { name: 'Manage properties' })
      .getByRole('button', { name: 'Close' })
      .first()
      .click();

    // Commit 2: a second, separate user action drops the now-unused
    // property from the schema. Zero records are affected, so this is a
    // single reviewed commit with no record-migration step.
    await openManageProperties(page);
    await page.getByRole('button', { name: 'Delete Status' }).click();
    await page.getByRole('button', { name: 'Continue to review' }).click();
    await expect(page.getByText('PROPOSED · NOT SAVED')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Alters an existing canonical database schema')).toBeVisible();
    await page.getByRole('button', { name: 'Commit change' }).click();

    await expect(page.getByRole('columnheader', { name: /Status/ })).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});
