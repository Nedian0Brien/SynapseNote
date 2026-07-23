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
    await page.getByRole('button', { name: 'New database', exact: true }).click();

    await expect(page).toHaveURL(/#database\//, { timeout: 20_000 });
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('columnheader', { name: 'Title' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New database view' })).toBeVisible();

    const newPageTitle = page.getByRole('textbox', { name: 'New page title' });
    await expect(newPageTitle).toBeVisible();
    await newPageTitle.fill('New-page first record');
    await newPageTitle.press('Enter');
    await expect(
      page.getByRole('button', { name: 'New-page first record', exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test('New file → Database keeps the page-first table experience', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New file', exact: true }).click();

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
    await title.fill('Inline first record');
    await title.press('Enter');
    await expect(
      inline.getByRole('button', { name: 'Inline first record', exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });

    await inline.getByRole('heading').getByRole('button').click();
    const inlineDatabaseTitle = inline.getByRole('textbox', { name: 'Inline database title' });
    await inlineDatabaseTitle.fill('Inline journey database');
    await inlineDatabaseTitle.press('Enter');
    await expect(inline.getByRole('heading', { name: 'Inline journey database' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(inline.getByText('Inline database change saved', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await inline.getByRole('button', { name: /^Open full database:/ }).click();
    await expect(page).toHaveURL(/#database\//, { timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: 'Inline first record', exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/${docName}$`), { timeout: 10_000 });
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: 'Inline first record', exact: true }),
    ).toBeVisible({
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
    await picker.getByRole('button', { name: 'Tasks', exact: true }).click();

    const savedView = picker.getByRole('button', { name: /All tasks table/ });
    await expect(savedView).toBeVisible({ timeout: 10_000 });
    await savedView.click();

    const inline = page.getByRole('region', { name: /^Linked database view:/ });
    await expect(inline).toHaveAttribute('data-view-mode', 'inline', { timeout: 15_000 });
    await expect(
      inline.getByRole('button', { name: 'Shared linked task', exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });

    await inline.getByRole('button', { name: 'Shared linked task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open full page' })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Open full page' }).click();
    await expect(page).toHaveURL(/#\/[^/]+\/rec_[a-z0-9]+$/, { timeout: 10_000 });

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/${docName}$`), { timeout: 10_000 });
    const returnedInline = page.getByRole('region', { name: /^Linked database view:/ });
    await expect(
      returnedInline.getByRole('button', { name: 'Shared linked task', exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });
});
