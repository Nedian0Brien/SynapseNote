/**
 * Page management utility functions for Cypress E2E tests
 * Contains functions for interacting with pages in the sidebar
 */

/**
 * Gets a page element by its name
 * Used in more-page-action.cy.ts for finding specific pages
 * @param pageName - The name of the page to find
 * @returns Cypress chainable element
 */
export function getPageByName(pageName: string) {
    cy.task('log', `Getting page by name: ${pageName}`);
    return cy.get('[data-testid="page-name"]')
        .contains(pageName)
        .closest('[data-testid="page-item"]');
}

/**
 * Gets the page title input element for the currently open page
 * Used in more-page-action.cy.ts for renaming pages
 * @returns Cypress chainable element
 */
export function getPageTitleInput() {
    cy.task('log', 'Getting page title input element');
    return cy.get('[data-testid="page-title-input"]').first();
}

/**
 * Saves the current page title by pressing Enter
 * Used in more-page-action.cy.ts after editing page titles
 */
export function savePageTitle() {
    cy.task('log', 'Saving page title');
    cy.focused().type('{enter}');
    cy.wait(1000); // Wait for save to complete
}