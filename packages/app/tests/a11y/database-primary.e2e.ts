/**
 * Accessibility gate for the canonical Notion-style database workspace.
 *
 * This deliberately scopes axe to the database surface instead of the whole
 * editor shell. The shell has its own accessibility suite; this check keeps
 * the primary table, record actions, view controls, and mutation controls
 * covered as one user-facing surface.
 */

import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../stress/_helpers';

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

function taskDatabase(name: string, key: string) {
  return {
    database: {
      key,
      name,
      contract: {
        purpose: 'Focused database accessibility coverage',
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

test('DB-A11Y-01: canonical Table workspace has no serious or critical axe violations', async ({
  page,
  api,
}) => {
  const name = `A11y database ${randomUUID().slice(0, 8)}`;
  await api.createDatabase({
    ...taskDatabase(name, `a11y-${randomUUID().slice(0, 8)}`),
    sampleRecords: [
      {
        sourceKey: 'tasks',
        values: { title: 'Accessible task', status: 'todo' },
      },
    ],
  });

  await page.goto('/');
  await openDatabasesDialog(page);
  await page.getByText(name, { exact: true }).click();

  const workspace = page.locator('[data-database-workspace]');
  await expect(workspace).toBeVisible({ timeout: 10_000 });
  await expect(workspace.getByRole('grid')).toBeVisible({ timeout: 10_000 });
  await expect(workspace.getByRole('gridcell', { name: 'Accessible task' })).toBeVisible({
    timeout: 10_000,
  });

  const axeResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('[data-database-workspace]')
    .disableRules(['color-contrast'])
    .analyze();

  expect(
    axeResults.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});
