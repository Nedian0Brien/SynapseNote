/**
 * Focused browser coverage for R-005.
 *
 * Component DOM tests cover each renderer in isolation. These tests cover the
 * real app shell, catalog, query, plan/commit, refresh, and canonical record
 * journey for the primary Table mutations and saved-view management path.
 * Seeding uses the same database plan/commit HTTP contract as an agent so the
 * browser assertions exercise the production surface rather than fixtures.
 */

import type { Locator, Page } from '@playwright/test';
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

/**
 * Assert the workspace finished saving.
 *
 * The indicator unmounts once a commit settles, so asserting that it is present
 * with `saved` races the unmount. Gate on the in-flight and failed states being
 * absent instead: that holds whether or not the badge is still mounted.
 */
async function expectSaved(page: Page) {
  await expect(
    page.locator('[data-database-save-indicator][data-database-save-state="saving"]'),
  ).toHaveCount(0, { timeout: 15_000 });
  await expect(
    page.locator('[data-database-save-indicator][data-database-save-state="failed"]'),
  ).toHaveCount(0);
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

/**
 * Separate schema for the typed-editor journey.
 *
 * The shared `taskDatabase` shape is asserted positionally by the other tests
 * in this file, so the extra columns live in their own fixture rather than
 * widening that one. Property order here fixes the `aria-colindex` values the
 * test uses to address non-Title cells: Title 1, Status 2, Estimate 3, Due 4,
 * Shipped 5 (the notion surface offsets the index by one).
 */
function typedTaskDatabase(name: string, key: string) {
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
          { key: 'estimate', name: 'Estimate', type: 'number' },
          { key: 'due', name: 'Due', type: 'date' },
          { key: 'shipped', name: 'Shipped', type: 'checkbox' },
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
    // The inline scalar editor keeps Save/Cancel as `sr-only` controls and
    // commits on Enter (DatabaseTableCellEditingContent), so drive the same
    // keystroke a user would rather than clicking a visually hidden button.
    await page.getByRole('textbox', { name: 'Edit Title' }).press('Enter');
    await expect(
      page.locator('[role="gridcell"][data-property-id][title="Renamed task"]'),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expectSaved(page);

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
    await expectSaved(page);

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
    await renamedRow.getByRole('button', { name: 'Open page Renamed task' }).click();
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
    // The row selection checkbox lives in DatabaseTableInteractionLayer — a
    // single floating handle appended to the table host and positioned over the
    // hovered row, not a child of the <tr>. Scoping the locator to the row can
    // never resolve it; hover the row to reveal the handle, then click it.
    const selectRow = page.getByRole('checkbox', { name: /^Select page checkbox / });
    await rows.nth(0).hover();
    await selectRow.click();
    await rows.nth(1).hover();
    await selectRow.click();
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
    await expectSaved(page);

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
    await expectSaved(page);

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
    await expectSaved(page);

    await page.getByRole('button', { name: 'View options for Renamed list copy' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('tab', { name: 'Renamed list copy', exact: true })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test('configures a saved Table filter and layout through the visible view actions', async ({
    page,
    api,
  }) => {
    const name = 'E2E Saved Table Configuration Journey';
    const target = await api.createDatabase({
      ...taskDatabase(name, 'e2e-saved-table-configuration'),
      sampleRecords: [{ sourceKey: 'tasks', values: { title: 'Filter task', status: 'todo' } }],
    });

    await openDatabase(page, name, target);
    await page.getByRole('tab', { name: 'All tasks', exact: true }).click();

    await page.getByRole('button', { name: 'View options for All tasks' }).click();
    await page.getByRole('menuitem', { name: 'View settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Saved view settings' });
    await settings.getByRole('combobox', { name: 'Saved view row height' }).click();
    await page.getByRole('option', { name: 'Tall' }).click();
    await settings.getByRole('checkbox', { name: 'Wrap saved view cells' }).click();
    await settings.getByRole('button', { name: 'Review view settings' }).click();
    await expect(settings).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('table')).toHaveAttribute('data-row-height', 'tall', {
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'View options for All tasks' }).click();
    await page.getByRole('menuitem', { name: 'Filters' }).click();
    const filters = page.getByRole('dialog', { name: 'Advanced saved filters' });
    await filters.getByRole('combobox', { name: 'Filter property' }).click();
    await page.getByRole('option', { name: 'Status', exact: true }).click();
    await filters.getByRole('combobox', { name: 'Filter operator' }).click();
    await page.getByRole('option', { name: 'eq', exact: true }).click();
    // Select filters compare against the option id, so the dialog offers the
    // options themselves rather than a free-text box.
    await filters.getByRole('combobox', { name: 'Filter value for Status' }).click();
    await page.getByRole('option', { name: 'Todo', exact: true }).click();
    await filters.getByRole('button', { name: 'Review filter change' }).click();
    await expect(filters).toHaveCount(0, { timeout: 10_000 });
    await expect(
      // The summary resolves the stored option id back to the option's name.
      page.getByRole('button', { name: 'Filters: Status is Todo', exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // UX-1104 typed editors. Each type gets its own database and commits exactly
  // one value: a canonical commit blocks reads while its transaction verifies,
  // so chaining several cell commits in one journey leaves the grid showing the
  // recoverable "Database is still updating" snapshot instead of the new rows.
  // Splitting them keeps each assertion about the editor under test.
  for (const scenario of [
    {
      label: 'Select',
      key: 'e2e-typed-select',
      async edit(page: Page, row: Locator) {
        await row.locator('[role="gridcell"][aria-colindex="2"]').press('Enter');
        await page.getByRole('combobox', { name: 'Edit Status' }).fill('Done');
        await page.getByRole('option', { name: 'Done', exact: true }).click();
      },
      async expectValue(page: Page, row: Locator) {
        void row;
        await expect(
          page.getByRole('button', { name: 'Edit Status for page Typed task: Done', exact: true }),
        ).toBeVisible({ timeout: 15_000 });
      },
    },
    {
      label: 'Number',
      key: 'e2e-typed-number',
      async edit(page: Page, row: Locator) {
        await row.locator('[role="gridcell"][aria-colindex="3"]').press('Enter');
        // The inline scalar editor keeps Save/Cancel `sr-only` and commits on
        // Enter, so drive the same keystroke the Title editor uses.
        await page.getByRole('spinbutton', { name: 'Edit Estimate' }).fill('5');
        await page.getByRole('spinbutton', { name: 'Edit Estimate' }).press('Enter');
      },
      async expectValue(page: Page, row: Locator) {
        void page;
        await expect(row.locator('[role="gridcell"][aria-colindex="3"]')).toHaveAttribute(
          'title',
          '5',
          { timeout: 15_000 },
        );
      },
    },
    {
      label: 'Date',
      key: 'e2e-typed-date',
      async edit(page: Page, row: Locator) {
        await row.locator('[role="gridcell"][aria-colindex="4"]').press('Enter');
        const start = page.getByLabel('Start Due', { exact: true });
        await page.getByLabel('Include time for Due', { exact: true }).click();
        // Enabling time swaps the control from `date` to `datetime-local`;
        // filling before that swap lands writes into the old input and is lost.
        await expect(start).toHaveAttribute('type', 'datetime-local');
        await start.fill('2026-09-01T09:00');
        await expect(start).toHaveValue('2026-09-01T09:00');
        // A composite editor rather than a scalar input, so Save is a real
        // visible control here.
        await page.getByRole('button', { name: 'Save cell edit' }).click();
      },
      async expectValue(page: Page, row: Locator) {
        void page;
        // The cell projects the stored ISO value through the display format.
        await expect(row.locator('[role="gridcell"][aria-colindex="4"]')).toHaveAttribute(
          'title',
          /Sep 1, 2026/,
          { timeout: 15_000 },
        );
      },
    },
    {
      label: 'Checkbox',
      key: 'e2e-typed-checkbox',
      async edit(page: Page, row: Locator) {
        void row;
        // The notion surface commits straight from the display control without
        // opening a cell editor at all.
        await page.getByRole('checkbox', { name: 'Toggle Shipped for page Typed task' }).click();
      },
      async expectValue(page: Page, row: Locator) {
        void row;
        await expect(
          page.getByRole('checkbox', { name: 'Toggle Shipped for page Typed task' }),
        ).toBeChecked({ timeout: 15_000 });
      },
    },
  ]) {
    test(`edits a typed ${scenario.label} cell and persists it across reload`, async ({
      page,
      api,
    }) => {
      const name = `E2E Primary Typed ${scenario.label} Journey`;
      const target = await api.createDatabase({
        ...typedTaskDatabase(name, scenario.key),
        sampleRecords: [
          {
            sourceKey: 'tasks',
            // Only Title and Status are seeded, so every other editor is
            // exercised from an empty value.
            values: { title: 'Typed task', status: 'todo' },
          },
        ],
      });

      await openDatabase(page, name, target);
      const row = page.locator('tr[data-record-id]').filter({ hasText: 'Typed task' });
      await expect(row).toBeVisible({ timeout: 10_000 });

      await scenario.edit(page, row);
      await scenario.expectValue(page, row);

      // The value must survive a reload from canonical Markdown, not just the
      // optimistic render.
      await page.reload();
      await expect(page.getByRole('grid')).toBeVisible({ timeout: 20_000 });
      const reloadedRow = page.locator('tr[data-record-id]').filter({ hasText: 'Typed task' });
      await expect(reloadedRow).toBeVisible({ timeout: 10_000 });
      await scenario.expectValue(page, reloadedRow);
    });
  }
});
