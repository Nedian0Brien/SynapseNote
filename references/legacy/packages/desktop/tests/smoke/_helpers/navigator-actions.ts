import type { Page } from '@playwright/test';

/**
 * Navigator entry-point clicks that work in both launcher states: a fresh
 * profile (no recent projects) renders the packs-forward first-run launcher,
 * whose secondary-row buttons wire to the same handlers as the returning-user
 * three-card grid (nav-first-run-blank → onCreate, nav-first-run-open →
 * onOpenFolder; see NavigatorApp.tsx). Smoke tests launch with a fresh tmp
 * home, so they land on the first-run view; specs that reopen the Navigator
 * after a project exists get the three-card grid. The two views are mutually
 * exclusive, so the .or() locator resolves to exactly one element.
 */
export async function clickNavCreateNew(navigator: Page): Promise<void> {
  await navigator
    .locator('[data-testid="nav-create-new"]')
    .or(navigator.locator('[data-testid="nav-first-run-blank"]'))
    .click();
}

export async function clickNavOpen(navigator: Page): Promise<void> {
  await navigator
    .locator('[data-testid="nav-open"]')
    .or(navigator.locator('[data-testid="nav-first-run-open"]'))
    .click();
}
