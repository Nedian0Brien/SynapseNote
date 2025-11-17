import { testLog } from '../test-helpers';
/**
 * Page management utility functions for Cypress E2E tests
 * Contains functions for interacting with pages in the sidebar
 */

import { PageSelectors, waitForReactUpdate } from '../selectors';

/**
 * Gets a page element by its name
 * Used in more-page-action.cy.ts for finding specific pages
 * @param pageName - The name of the page to find
 * @returns Cypress chainable element
 */
export function getPageByName(pageName: string) {
    testLog.info( `Getting page by name: ${pageName}`);
    return PageSelectors.itemByName(pageName);
}

/**
 * Gets the page title input element for the currently open page
 * Used in more-page-action.cy.ts for renaming pages
 * @returns Cypress chainable element
 */
export function getPageTitleInput() {
    testLog.info( 'Getting page title input element');
    return PageSelectors.titleInput().first();
}

/**
 * Saves the current page title by pressing Enter
 * Used in more-page-action.cy.ts after editing page titles
 */
export function savePageTitle() {
    testLog.info( 'Saving page title');
    cy.focused().type('{enter}');
    waitForReactUpdate(1000); // Wait for save to complete
}

/**
 * Opens the more actions menu for a specific page
 * Referenced in page-utils.ts
 * @param pageName - The name of the page
 */
export function openPageMoreActions(pageName: string) {
    testLog.info( `Opening more actions for page: ${pageName}`);
    
    // Find the page and trigger hover to show actions
    PageSelectors.nameContaining(pageName)
        .parent()
        .parent()
        .trigger('mouseenter', { force: true });
    
    // Wait for the button to appear
    waitForReactUpdate(500);
    
    // Click the more actions button
    PageSelectors.moreActionsButton(pageName)
        .should('exist')
        .click({ force: true });
}