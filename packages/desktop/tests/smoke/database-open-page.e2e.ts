/**
 * Packaged database navigation smoke.
 *
 * This is intentionally opt-in (the same contract as the other desktop
 * smokes) because it launches a real signed/unpacked Electron bundle. Unlike
 * the browser-only suites it starts the installed renderer, reads a real
 * `.ok/databases` manifest, opens an inline DatabaseView, and follows the
 * production Open → peek → full-page route.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';
import { expect, test } from './_helpers/smoke-test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const PACKAGED_EXECUTABLE = resolve(
  __dirname,
  '..',
  '..',
  'dist-desktop-local',
  'mac-arm64',
  'SynapseNote.app',
  'Contents',
  'MacOS',
  'SynapseNote',
);
const FIXTURE_ROOT = resolve(REPO_ROOT, 'packages/core/src/database/fixtures/v1');
const SMOKE_ENABLED =
  process.env.OK_DESKTOP_E2E_SMOKE === '1' && process.env.OK_DESKTOP_DATABASE_SMOKE === '1';

function userDataDirFor(home: string): string {
  return join(home, 'electron-userdata');
}

function seedProject(): { tmpHome: string; projectDir: string; userDataDir: string } {
  const tmpHome = mkdtempSync(join(tmpdir(), 'synapsenote-database-smoke-home-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-smoke-project-'));
  const databaseDir = join(projectDir, '.ok', 'databases');
  const recordsDir = join(projectDir, 'records', 'feedback');
  mkdirSync(databaseDir, { recursive: true });
  mkdirSync(recordsDir, { recursive: true });
  const projectRecordsDir = join(projectDir, 'records', 'projects');
  mkdirSync(projectRecordsDir, { recursive: true });
  writeFileSync(join(projectDir, '.ok', 'config.yml'), "content:\n  dir: '.'\n");
  writeFileSync(
    join(databaseDir, 'fixture.yml'),
    readFileSync(join(FIXTURE_ROOT, 'database.yml'), 'utf8'),
  );
  writeFileSync(
    join(recordsDir, 'report.md'),
    readFileSync(join(FIXTURE_ROOT, 'records/feedback/report.md'), 'utf8'),
  );
  writeFileSync(
    join(projectRecordsDir, 'mobile.md'),
    readFileSync(join(FIXTURE_ROOT, 'records/projects/mobile.md'), 'utf8'),
  );
  writeFileSync(
    join(projectDir, 'database-smoke.md'),
    '# Database smoke\n\n<DatabaseView databaseId="db_fixture" sourceId="ds_feedback" viewId="view_feedback_table" />\n',
  );
  return { tmpHome, projectDir, userDataDir: userDataDirFor(tmpHome) };
}

test.describe('packaged database open-page smoke', () => {
  test.skip(!SMOKE_ENABLED, 'Set OK_DESKTOP_DATABASE_SMOKE=1 to run packaged database smoke.');
  test.skip(process.platform !== 'darwin', 'Packaged database smoke is macOS-only.');
  test.skip(
    !existsSync(PACKAGED_EXECUTABLE),
    `Packaged desktop build missing at ${PACKAGED_EXECUTABLE} — run the local bundle build first.`,
  );

  test('opens an inline record, shows peek, and reaches the canonical page route', async ({
    captureStderrFor,
  }) => {
    const seed = seedProject();
    const app = await electron.launch({
      executablePath: PACKAGED_EXECUTABLE,
      args: [
        `--user-data-dir=${seed.userDataDir}`,
        `synapsenote://open?project=${encodeURIComponent(seed.projectDir)}&doc=database-smoke`,
      ],
      timeout: 30_000,
      env: {
        ...process.env,
        HOME: seed.tmpHome,
        OK_DESKTOP_E2E_SMOKE: '1',
        OK_RECLAIM_DISABLE: '1',
        NODE_ENV: 'production',
      },
    });
    captureStderrFor(app, {
      cleanupDirs: [seed.tmpHome, seed.projectDir],
      cleanupServerRoots: [seed.projectDir],
    });

    await expect(async () => {
      for (const page of app.windows()) {
        const hash = await page.evaluate(() => window.location.hash).catch(() => '');
        if (hash.endsWith('#/database-smoke')) return;
      }
      throw new Error('database smoke document did not open');
    }).toPass({ timeout: 30_000 });

    const page = app.windows().find((candidate) => candidate.url().includes('#/database-smoke'));
    if (!page) throw new Error('database smoke editor window vanished');
    const inline = page.getByRole('region', { name: /Linked database view:/ });
    await expect(inline.getByRole('grid')).toBeVisible({ timeout: 30_000 });

    await inline.getByRole('button', { name: 'Open page Mobile navigation feedback' }).click();
    const peek = page.locator('[data-slot="sheet-content"]');
    await expect(peek).toBeVisible({ timeout: 10_000 });
    await expect(peek.getByRole('heading', { name: 'Mobile navigation feedback' })).toBeVisible();

    // The peek intentionally exposes the same action in the compact toolbar
    // and the footer. Target the footer action for this route assertion so
    // Playwright does not treat the two equally-labelled controls as an
    // accidental ambiguity.
    await peek.getByRole('button', { name: 'Open full page' }).last().click();
    await expect
      .poll(() => page.evaluate(() => window.location.hash), { timeout: 15_000 })
      .toBe('#/records/feedback/report');

    // The mutation path is part of the packaged contract as well: add a
    // visible property, edit its empty cell, then reload the document. A
    // successful reload proves that the canonical commit—not only the
    // optimistic row—contains the value.
    await page.goBack();
    await expect(page).toHaveURL(/#\/database-smoke/);
    const reloadedInline = page.getByRole('region', { name: /Linked database view:/ });
    await expect(reloadedInline.getByRole('grid')).toBeVisible({ timeout: 30_000 });
    await reloadedInline.getByRole('button', { name: 'Add property', exact: true }).click();
    await page.getByRole('textbox', { name: 'New property name' }).fill('Priority');
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await page.getByRole('button', { name: 'Add property', exact: true }).last().click();
    await expect(reloadedInline.getByText('Priority', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const priorityCell = reloadedInline.getByLabel(
      'Edit Priority for page Mobile navigation feedback',
    );
    await priorityCell.click();
    const priorityEditor = page.getByRole('textbox', { name: 'Edit Priority' });
    await priorityEditor.fill('High');
    await priorityEditor.press('Enter');
    await expect(reloadedInline.getByText('High', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('inline-save-feedback')).toBeVisible({ timeout: 30_000 });

    await page.reload();
    const persistedInline = page.getByRole('region', { name: /Linked database view:/ });
    await expect(persistedInline.getByRole('grid')).toBeVisible({ timeout: 30_000 });
    await expect(persistedInline.getByText('Priority', { exact: true })).toBeVisible();
    await expect(persistedInline.getByText('High', { exact: true })).toBeVisible();
  });
});
